import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';
import { generateBracket } from '../bracket';
import { writeAudit } from '../auditlog';
import { generateTournamentPDF } from '../pdf';
import { publishToChannel } from '../websocket';
import { sendEmail, escapeHtml } from '../email';
import { sanitizeFtsQuery } from '../fts';
import { parsePageParams } from '../pagination';

class Tournament {
    id?: number;
    name: string;
    sport: string;
    start_date?: string;
    end_date?: string;
    status?: string;

    constructor(data: unknown) {
        if (typeof data !== 'object' || !data) throw new Error('Nieprawidłowe dane turnieju');
        const obj = data as Record<string, unknown>;
        if (typeof obj.name !== 'string' || !obj.name.trim()) throw new Error('Pole name jest wymagane');
        if (typeof obj.sport !== 'string' || !obj.sport.trim()) throw new Error('Pole sport jest wymagane');
        this.name = obj.name.trim();
        this.sport = obj.sport.trim();
        if (obj.start_date) this.start_date = String(obj.start_date);
        if (obj.end_date) this.end_date = String(obj.end_date);
        if (obj.status) this.status = String(obj.status);
        if (typeof obj.id === 'number') this.id = obj.id;
    }
}

// `sysDb` holds the `users` table (separate database in production). It defaults
// to `connection` so tests that put everything in one DB keep working.
export function tournamentRouter(connection: DatabaseSync, sysDb: DatabaseSync = connection): Router {
    const router = Router();

    router.get('/', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const { limit, offset } = parsePageParams(req.query as Record<string, unknown>);
        const q = req.query.q ? String(req.query.q).trim() : null;
        const filter = req.query.filter ? String(req.query.filter).trim() : null;

        const total = (connection.prepare('SELECT COUNT(*) AS c FROM tournaments').get() as { c: number }).c;

        let data: unknown[];
        let filtered: number;

        if (q) {
            const safeQ = sanitizeFtsQuery(q);
            if (!safeQ) {
                res.json({ total, filtered: 0, data: [] });
                return;
            }
            const ftsIds = (
                connection
                    .prepare('SELECT rowid FROM tournaments_fts WHERE tournaments_fts MATCH ? ORDER BY rank')
                    .all(safeQ) as { rowid: number }[]
            ).map(r => r.rowid);

            if (!ftsIds.length) {
                res.json({ total, filtered: 0, data: [] });
                return;
            }
            filtered = ftsIds.length;
            // Paginate the rank-ordered ids in JS, then fetch and re-sort the page
            // by that order — an `IN (...)` query alone would lose FTS relevance ranking.
            const pageIds = ftsIds.slice(offset, offset + limit);
            if (!pageIds.length) {
                res.json({ total, filtered, data: [] });
                return;
            }
            const placeholders = pageIds.map(() => '?').join(',');
            const rows = connection
                .prepare(`SELECT * FROM tournaments WHERE id IN (${placeholders})`)
                .all(...(pageIds as (string | number | null)[])) as { id: number }[];
            const byId = new Map(rows.map(r => [r.id, r]));
            data = pageIds.map(id => byId.get(id)).filter(Boolean) as unknown[];
        } else if (filter) {
            const like = `%${filter}%`;
            filtered = (
                connection
                    .prepare('SELECT COUNT(*) AS c FROM tournaments WHERE name LIKE ? OR sport LIKE ?')
                    .get(like, like) as { c: number }
            ).c;
            data = connection
                .prepare('SELECT * FROM tournaments WHERE name LIKE ? OR sport LIKE ? LIMIT ? OFFSET ?')
                .all(like, like, limit, offset);
        } else {
            filtered = total;
            data = connection.prepare('SELECT * FROM tournaments ORDER BY id DESC LIMIT ? OFFSET ?').all(limit, offset);
        }

        res.json({ total, filtered, data });
    });

    router.get('/:id', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const tournament = connection.prepare('SELECT * FROM tournaments WHERE id = ?').get(req.params.id as string);
        if (!tournament) {
            res.status(404).json({ error: 'Nie znaleziono' });
            return;
        }
        res.json(tournament);
    });

    router.post('/', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const t = new Tournament(req.body);
            const created = connection
                .prepare(
                    'INSERT INTO tournaments (name, sport, start_date, end_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
                )
                .get(t.name, t.sport, t.start_date ?? null, t.end_date ?? null, t.status ?? 'draft', req.user!.id);
            writeAudit(connection, 'tournament', (created as { id: number }).id, 'create', null, created, req.user!.id);
            res.json(created);
        } catch (err) {
            next(err);
        }
    });

    const tournamentUpdateHandler = (req: Request, res: Response, next: import('express').NextFunction) => {
        try {
            const t = new Tournament(req.body);
            // id MUST come from URL param when present; never trust body for which row to update
            const idFromParam = req.params.id ? parseInt(req.params.id as string) : undefined;
            const targetId = idFromParam ?? t.id;
            if (!targetId) throw new Error('Brak id');
            const old = connection.prepare('SELECT * FROM tournaments WHERE id = ?').get(targetId) as
                | { id: number; created_by: number | null }
                | undefined;
            if (!old) throw new Error(`Nie znaleziono turnieju o id=${targetId}`);
            // Option A: any admin or organizer (route is requireAuth(0,1)) may manage
            // any tournament — consistent with match/team/player management.
            const updated = connection
                .prepare(
                    'UPDATE tournaments SET name=?, sport=?, start_date=?, end_date=?, status=? WHERE id=? RETURNING *'
                )
                .get(t.name, t.sport, t.start_date ?? null, t.end_date ?? null, t.status ?? 'draft', targetId);
            if (!updated) throw new Error(`Nie znaleziono turnieju o id=${targetId}`);
            writeAudit(connection, 'tournament', targetId, 'update', old, updated, req.user!.id);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    };
    router.put('/', requireAuth(0, 1), tournamentUpdateHandler);
    router.put('/:id', requireAuth(0, 1), tournamentUpdateHandler);

    router.delete('/:id', requireAuth(0), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const old = connection.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
            const deleted = connection.prepare('DELETE FROM tournaments WHERE id = ? RETURNING *').get(id);
            if (!deleted) throw new Error('Nie znaleziono');
            writeAudit(connection, 'tournament', id, 'delete', old, null, req.user!.id);
            res.json(deleted);
        } catch (err) {
            next(err);
        }
    });

    // register team
    router.post('/:id/register-team', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const tournamentId = parseInt(req.params.id as string);
            const { team_id } = req.body as { team_id: number };
            if (!team_id) throw new Error('Brak team_id');
            const count = (
                connection
                    .prepare('SELECT COUNT(*) AS c FROM tournament_teams WHERE tournament_id = ?')
                    .get(tournamentId) as { c: number }
            ).c;
            const created = connection
                .prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?, ?, ?) RETURNING *')
                .get(tournamentId, team_id, count + 1);

            // email captain (best-effort; `users` lives in sysDb)
            try {
                const team = connection.prepare('SELECT captain_id FROM teams WHERE id = ?').get(team_id) as
                    | { captain_id: number | null }
                    | undefined;
                if (team?.captain_id) {
                    const captain = sysDb.prepare('SELECT email FROM users WHERE id = ?').get(team.captain_id) as
                        | { email: string }
                        | undefined;
                    if (captain?.email) {
                        const t = connection.prepare('SELECT name FROM tournaments WHERE id = ?').get(tournamentId) as {
                            name: string;
                        };
                        void sendEmail(
                            captain.email,
                            'Zapis do turnieju',
                            `<p>Twoja drużyna została zapisana do turnieju <b>${escapeHtml(t?.name)}</b>.</p>`
                        );
                    }
                }
            } catch (mailErr) {
                console.error('Powiadomienie e-mail (zapis drużyny) nie powiodło się:', mailErr);
            }

            writeAudit(connection, 'tournament_team', tournamentId, 'create', null, created, req.user!.id);
            res.json(created);
        } catch (err) {
            next(err);
        }
    });

    // unregister team
    router.delete('/:id/team/:teamId', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const tournamentId = parseInt(req.params.id as string);
            const teamId = parseInt(req.params.teamId as string);
            const old = connection
                .prepare('SELECT * FROM tournament_teams WHERE tournament_id = ? AND team_id = ?')
                .get(tournamentId, teamId);
            const deleted = connection
                .prepare('DELETE FROM tournament_teams WHERE tournament_id = ? AND team_id = ? RETURNING *')
                .get(tournamentId, teamId);
            if (!deleted) throw new Error('Nie znaleziono zapisu');
            writeAudit(connection, 'tournament_team', tournamentId, 'delete', old, null, req.user!.id);
            res.json(deleted);
        } catch (err) {
            next(err);
        }
    });

    // generate bracket
    router.post('/:id/generate-bracket', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const tournamentId = parseInt(req.params.id as string);
            // Wrap clear+generate+status flip in a single transaction so a
            // mid-generation failure cannot leave the tournament with partial
            // matches but `status='active'`.
            connection.exec('BEGIN IMMEDIATE');
            try {
                connection.prepare('DELETE FROM matches WHERE tournament_id = ?').run(tournamentId);
                generateBracket(connection, tournamentId);
                connection.prepare("UPDATE tournaments SET status = 'active' WHERE id = ?").run(tournamentId);
                connection.exec('COMMIT');
            } catch (txErr) {
                try {
                    connection.exec('ROLLBACK');
                } catch {
                    /* ignore */
                }
                throw txErr;
            }

            // email all captains (best-effort; `users` lives in sysDb)
            try {
                const caps = connection
                    .prepare(
                        `
                    SELECT t.captain_id FROM teams t
                    JOIN tournament_teams tt ON tt.team_id = t.id
                    WHERE tt.tournament_id = ? AND t.captain_id IS NOT NULL
                `
                    )
                    .all(tournamentId) as { captain_id: number }[];
                if (caps.length) {
                    const ph = caps.map(() => '?').join(',');
                    const captains = sysDb
                        .prepare(`SELECT email, username FROM users WHERE id IN (${ph})`)
                        .all(...caps.map(c => c.captain_id)) as { email: string; username: string }[];
                    const tRow = connection.prepare('SELECT name FROM tournaments WHERE id = ?').get(tournamentId) as {
                        name: string;
                    };
                    for (const c of captains) {
                        if (c.email)
                            void sendEmail(
                                c.email,
                                'Drabinka gotowa',
                                `<p>Drabinka turnieju <b>${escapeHtml(tRow?.name)}</b> została wygenerowana.</p>`
                            );
                    }
                }
            } catch (mailErr) {
                console.error('Powiadomienie e-mail (drabinka) nie powiodło się:', mailErr);
            }

            // writeAudit is best-effort — failure must not 500 the client after bracket is committed
            try {
                writeAudit(
                    connection,
                    'tournament',
                    tournamentId,
                    'update',
                    null,
                    { bracket_generated: true },
                    req.user!.id
                );
            } catch (auditErr) {
                console.error('Audit write failed for generate-bracket:', auditErr);
            }
            publishToChannel(`tournament:${tournamentId}`, { type: 'bracket_generated' });
            res.json({ message: 'Drabinka wygenerowana' });
        } catch (err) {
            next(err);
        }
    });

    // registered teams (read from tournament_teams, not derived from bracket)
    router.get('/:id/teams', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const teams = connection
            .prepare(
                `
            SELECT t.id, t.name, t.shortname, tt.seed
            FROM tournament_teams tt
            JOIN teams t ON t.id = tt.team_id
            WHERE tt.tournament_id = ?
            ORDER BY tt.seed
        `
            )
            .all(parseInt(req.params.id as string));
        res.json(teams);
    });

    // bracket data
    router.get('/:id/bracket', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const tournamentId = parseInt(req.params.id as string);
        const matches = connection
            .prepare(
                `
            SELECT m.*,
                t1.name AS team1_name, t1.shortname AS team1_short,
                t2.name AS team2_name, t2.shortname AS team2_short,
                tw.name AS winner_name
            FROM matches m
            LEFT JOIN teams t1 ON t1.id = m.team1_id
            LEFT JOIN teams t2 ON t2.id = m.team2_id
            LEFT JOIN teams tw ON tw.id = m.winner_id
            WHERE m.tournament_id = ?
            ORDER BY m.round, m.match_number
        `
            )
            .all(tournamentId);
        res.json(matches);
    });

    // standings (who won most matches)
    router.get('/:id/standings', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const tournamentId = parseInt(req.params.id as string);
        const standings = connection
            .prepare(
                `
            SELECT t.id AS team_id, t.name AS team_name, t.shortname,
                SUM(CASE WHEN m.winner_id = t.id THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN m.winner_id != t.id THEN 1 ELSE 0 END) AS losses,
                SUM(CASE WHEN m.winner_id = t.id THEN 3 ELSE 0 END) AS points
            FROM teams t
            JOIN matches m ON (m.team1_id = t.id OR m.team2_id = t.id)
            WHERE m.tournament_id = ? AND m.status = 'finished'
              AND m.team1_id IS NOT NULL AND m.team2_id IS NOT NULL
            GROUP BY t.id
            ORDER BY points DESC, wins DESC
        `
            )
            .all(tournamentId);
        res.json(standings);
    });

    // PDF report
    router.get('/:id/pdf', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        generateTournamentPDF(connection, parseInt(req.params.id as string), res);
    });

    return router;
}
