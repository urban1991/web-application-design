import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';
import { writeAudit } from '../auditlog';
import { sanitizeFtsQuery } from '../fts';
import { parsePageParams } from '../pagination';

class Player {
    id?: number;
    firstname: string;
    lastname: string;
    position?: string;
    team_id?: number;

    constructor(data: unknown) {
        if (typeof data !== 'object' || !data) throw new Error('Nieprawidłowe dane zawodnika');
        const obj = data as Record<string, unknown>;
        if (typeof obj.firstname !== 'string' || !obj.firstname.trim()) throw new Error('Pole firstname jest wymagane');
        if (typeof obj.lastname !== 'string' || !obj.lastname.trim()) throw new Error('Pole lastname jest wymagane');
        this.firstname = obj.firstname.trim();
        this.lastname = obj.lastname.trim();
        if (obj.position) this.position = String(obj.position).trim();
        if (typeof obj.team_id === 'number') this.team_id = obj.team_id;
        if (typeof obj.id === 'number') this.id = obj.id;
    }
}

export function playerRouter(connection: DatabaseSync): Router {
    const router = Router();

    // A captain-only user (role 2, not admin/organizer) may only manage their own
    // team's roster. Returns null for admins/organizers (no extra restriction),
    // otherwise the set of team ids the captain owns.
    function captainOnlyTeams(req: Request): Set<number> | null {
        const roles = req.user!.roles;
        const onlyCaptain = roles.includes(2) && !roles.includes(0) && !roles.includes(1);
        if (!onlyCaptain) return null;
        const rows = connection.prepare('SELECT id FROM teams WHERE captain_id = ?').all(req.user!.id) as { id: number }[];
        return new Set(rows.map(r => r.id));
    }

    router.get('/', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const { limit, offset } = parsePageParams(req.query as Record<string, unknown>);
        const parsedTeamId = req.query.team_id ? parseInt(req.query.team_id as string, 10) : null;
        const teamId = parsedTeamId !== null && Number.isFinite(parsedTeamId) ? parsedTeamId : null;
        const q = req.query.q ? String(req.query.q).trim() : null;

        let baseWhere = teamId ? 'WHERE team_id = ?' : '';
        const baseArgs: unknown[] = teamId ? [teamId] : [];

        const total = (connection.prepare(`SELECT COUNT(*) AS c FROM players ${baseWhere}`).get(...(baseArgs as (string | number | null)[])) as { c: number }).c;
        let data: unknown[], filtered: number;

        if (q) {
            const safeQ = sanitizeFtsQuery(q);
            if (!safeQ) { res.json({ total, filtered: 0, data: [] }); return; }
            const ids = (connection.prepare("SELECT rowid FROM players_fts WHERE players_fts MATCH ? ORDER BY rank").all(safeQ) as { rowid: number }[]).map(r => r.rowid);
            if (!ids.length) { res.json({ total, filtered: 0, data: [] }); return; }
            const ph = ids.map(() => '?').join(',');
            const extra = teamId ? `AND team_id = ?` : '';
            // Fetch all matches (optionally team-filtered), keep FTS rank order, then paginate.
            const matched = connection.prepare(`SELECT * FROM players WHERE id IN (${ph}) ${extra}`)
                .all(...(ids as (string | number | null)[]), ...(teamId ? [teamId] : [])) as { id: number }[];
            const byId = new Map(matched.map(r => [r.id, r]));
            const ordered = ids.map(id => byId.get(id)).filter(Boolean) as { id: number }[];
            filtered = ordered.length;
            data = ordered.slice(offset, offset + limit);
        } else {
            filtered = total;
            data = connection.prepare(`SELECT * FROM players ${baseWhere} ORDER BY lastname LIMIT ? OFFSET ?`).all(...(baseArgs as (string | number | null)[]), limit, offset);
        }
        res.json({ total, filtered, data });
    });

    router.post('/', requireAuth(0, 1, 2), (req: Request, res: Response, next) => {
        try {
            const p = new Player(req.body);
            const own = captainOnlyTeams(req);
            if (own && p.team_id !== undefined && !own.has(p.team_id)) {
                throw Object.assign(new Error('Można dodać zawodnika tylko do własnej drużyny'), { status: 403 });
            }
            const created = connection.prepare(
                'INSERT INTO players (firstname, lastname, position, team_id) VALUES (?, ?, ?, ?) RETURNING *'
            ).get(p.firstname, p.lastname, p.position ?? null, p.team_id ?? null);
            writeAudit(connection, 'player', (created as { id: number }).id, 'create', null, created, req.user!.id);
            res.json(created);
        } catch (err) { next(err); }
    });

    const playerUpdateHandler = (req: Request, res: Response, next: import('express').NextFunction) => {
        try {
            const p = new Player(req.body);
            const idFromParam = req.params.id ? parseInt(req.params.id as string) : undefined;
            const targetId = idFromParam ?? p.id;
            if (!targetId) throw new Error('Brak id');
            const old = connection.prepare('SELECT * FROM players WHERE id = ?').get(targetId);
            if (!old) throw new Error(`Nie znaleziono zawodnika o id=${targetId}`);
            const own = captainOnlyTeams(req);
            if (own) {
                const oldTeamId = (old as { team_id: number | null }).team_id;
                if (oldTeamId !== null && !own.has(oldTeamId)) {
                    throw Object.assign(new Error('Brak uprawnień do tego zawodnika'), { status: 403 });
                }
                if (p.team_id !== undefined && !own.has(p.team_id)) {
                    throw Object.assign(new Error('Można przypisać zawodnika tylko do własnej drużyny'), { status: 403 });
                }
            }
            const updated = connection.prepare(
                'UPDATE players SET firstname=?, lastname=?, position=?, team_id=? WHERE id=? RETURNING *'
            ).get(p.firstname, p.lastname, p.position ?? null, p.team_id ?? null, targetId);
            if (!updated) throw new Error(`Nie znaleziono zawodnika o id=${targetId}`);
            writeAudit(connection, 'player', targetId, 'update', old, updated, req.user!.id);
            res.json(updated);
        } catch (err) { next(err); }
    };
    router.put('/', requireAuth(0, 1, 2), playerUpdateHandler);
    router.put('/:id', requireAuth(0, 1, 2), playerUpdateHandler);

    router.get('/:id', requireAuth(0, 1, 2), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const player = connection.prepare('SELECT * FROM players WHERE id = ?').get(id);
            if (!player) throw Object.assign(new Error('Nie znaleziono zawodnika'), { status: 404 });
            res.json(player);
        } catch (err) { next(err); }
    });

    router.delete('/:id', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const old = connection.prepare('SELECT * FROM players WHERE id = ?').get(id);
            const deleted = connection.prepare('DELETE FROM players WHERE id = ? RETURNING *').get(id);
            if (!deleted) throw new Error('Nie znaleziono');
            writeAudit(connection, 'player', id, 'delete', old, null, req.user!.id);
            res.json(deleted);
        } catch (err) { next(err); }
    });

    return router;
}
