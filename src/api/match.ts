import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';
import { writeAudit } from '../auditlog';
import { advanceWinner } from '../bracket';
import { publishToChannel } from '../websocket';
import { sendEmail, escapeHtml } from '../email';

// `sysDb` holds the `users` table (separate database in production). It defaults
// to `connection` so tests that put everything in one DB keep working.
export function matchRouter(connection: DatabaseSync, sysDb: DatabaseSync = connection): Router {
    const router = Router();

    router.put('/:id/score', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const { score1, score2 } = req.body as { score1: number; score2: number };
            if (typeof score1 !== 'number' || typeof score2 !== 'number') throw new Error('Wymagane score1 i score2');
            if (score1 === score2) throw new Error('Remis niedozwolony w single-elimination');

            // Serialize read-modify-write to prevent concurrent score updates from
            // racing on advanceWinner and overwriting the next-round slot.
            let old:
                | {
                      tournament_id: number;
                      team1_id: number | null;
                      team2_id: number | null;
                      score1: number | null;
                      score2: number | null;
                      status: string;
                  }
                | undefined;
            let updated: unknown;
            let winnerId: number | null;
            connection.exec('BEGIN IMMEDIATE');
            try {
                old = connection.prepare('SELECT * FROM matches WHERE id = ?').get(id) as typeof old;
                if (!old) throw new Error('Mecz nie znaleziony');
                if (old.status === 'finished') {
                    throw Object.assign(new Error('Mecz już zakończony'), { status: 409 });
                }
                if (old.team1_id === null || old.team2_id === null) {
                    throw Object.assign(new Error('Nie można wprowadzić wyniku, dopóki obie drużyny nie są ustalone'), {
                        status: 409,
                    });
                }

                winnerId = score1 > score2 ? old.team1_id : old.team2_id;
                updated = connection
                    .prepare(
                        "UPDATE matches SET score1=?, score2=?, winner_id=?, status='finished' WHERE id=? AND status != 'finished' RETURNING *"
                    )
                    .get(score1, score2, winnerId, id);
                if (!updated) {
                    throw Object.assign(new Error('Mecz już zakończony'), { status: 409 });
                }

                // advance winner inside the same transaction
                advanceWinner(connection, id, winnerId!);
                connection.exec('COMMIT');
            } catch (txErr) {
                try {
                    connection.exec('ROLLBACK');
                } catch {
                    /* ignore */
                }
                throw txErr;
            }

            writeAudit(connection, 'match', id, 'update', old, updated, req.user!.id);

            // notify via WebSocket
            publishToChannel(`tournament:${old!.tournament_id}`, {
                type: 'match_updated',
                payload: { matchId: id, score1, score2, winnerId, status: 'finished' },
            });

            // email both captains (best-effort: a notification failure must never
            // fail the already-committed score update). `users` lives in sysDb.
            try {
                const caps = connection
                    .prepare('SELECT captain_id FROM teams WHERE id IN (?, ?) AND captain_id IS NOT NULL')
                    .all(old!.team1_id, old!.team2_id) as { captain_id: number }[];
                if (caps.length) {
                    const ph = caps.map(() => '?').join(',');
                    const emails = sysDb
                        .prepare(`SELECT email FROM users WHERE id IN (${ph})`)
                        .all(...caps.map(c => c.captain_id)) as { email: string }[];
                    const t = connection
                        .prepare('SELECT name FROM tournaments WHERE id = ?')
                        .get(old!.tournament_id) as { name: string };
                    for (const e of emails) {
                        if (e.email)
                            void sendEmail(
                                e.email,
                                'Wynik meczu zaktualizowany',
                                `<p>Wynik meczu w turnieju <b>${escapeHtml(t?.name)}</b>: ${escapeHtml(score1)}:${escapeHtml(score2)}</p>`
                            );
                    }
                }
            } catch (mailErr) {
                console.error('Powiadomienie e-mail (wynik meczu) nie powiodło się:', mailErr);
            }

            res.json(updated);
        } catch (err) {
            next(err);
        }
    });

    router.put('/:id/status', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const { status } = req.body as { status: string };
            const allowed = ['scheduled', 'in_progress', 'finished'];
            if (!allowed.includes(status)) throw new Error('Nieprawidłowy status');
            const updated = connection.prepare('UPDATE matches SET status=? WHERE id=? RETURNING *').get(status, id);
            if (!updated) throw new Error('Mecz nie znaleziony');
            const m = updated as { tournament_id: number };
            publishToChannel(`tournament:${m.tournament_id}`, {
                type: 'match_updated',
                payload: { matchId: id, status },
            });
            res.json(updated);
        } catch (err) {
            next(err);
        }
    });

    router.put('/:id/schedule', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const { scheduled_at } = req.body as { scheduled_at: string };
            if (typeof scheduled_at !== 'string' || !scheduled_at.trim()) throw new Error('Wymagana data meczu');
            const updated = connection
                .prepare('UPDATE matches SET scheduled_at=? WHERE id=? RETURNING *')
                .get(scheduled_at, id);
            if (!updated) throw new Error('Mecz nie znaleziony');
            const m = updated as { tournament_id: number };
            publishToChannel(`tournament:${m.tournament_id}`, {
                type: 'match_scheduled',
                payload: { matchId: id, scheduled_at },
            });
            res.json(updated);
        } catch (err) {
            next(err);
        }
    });

    return router;
}
