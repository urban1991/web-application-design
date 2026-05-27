import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';
import { writeAudit } from '../auditlog';
import { sanitizeFtsQuery } from '../fts';
import { parsePageParams } from '../pagination';

class Team {
    id?: number;
    name: string;
    shortname: string;
    captain_id?: number;

    constructor(data: unknown) {
        if (typeof data !== 'object' || !data) throw new Error('Nieprawidłowe dane drużyny');
        const obj = data as Record<string, unknown>;
        if (typeof obj.name !== 'string' || !obj.name.trim()) throw new Error('Pole name jest wymagane');
        if (typeof obj.shortname !== 'string' || !obj.shortname.trim()) throw new Error('Pole shortname jest wymagane');
        this.name = obj.name.trim();
        this.shortname = obj.shortname.trim();
        if (typeof obj.captain_id === 'number') this.captain_id = obj.captain_id;
        if (typeof obj.id === 'number') this.id = obj.id;
    }
}

export function teamRouter(connection: DatabaseSync): Router {
    const router = Router();

    router.get('/', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const { limit, offset } = parsePageParams(req.query as Record<string, unknown>);
        const q = req.query.q ? String(req.query.q).trim() : null;
        const filter = req.query.filter ? String(req.query.filter).trim() : null;

        const total = (connection.prepare('SELECT COUNT(*) AS c FROM teams').get() as { c: number }).c;
        let data: unknown[], filtered: number;

        if (q) {
            const safeQ = sanitizeFtsQuery(q);
            if (!safeQ) {
                res.json({ total, filtered: 0, data: [] });
                return;
            }
            const ids = (
                connection.prepare('SELECT rowid FROM teams_fts WHERE teams_fts MATCH ? ORDER BY rank').all(safeQ) as {
                    rowid: number;
                }[]
            ).map(r => r.rowid);
            if (!ids.length) {
                res.json({ total, filtered: 0, data: [] });
                return;
            }
            filtered = ids.length;
            const pageIds = ids.slice(offset, offset + limit);
            if (!pageIds.length) {
                res.json({ total, filtered, data: [] });
                return;
            }
            const ph = pageIds.map(() => '?').join(',');
            const rows = connection
                .prepare(`SELECT * FROM teams WHERE id IN (${ph})`)
                .all(...(pageIds as (string | number | null)[])) as { id: number }[];
            const byId = new Map(rows.map(r => [r.id, r]));
            data = pageIds.map(id => byId.get(id)).filter(Boolean) as unknown[];
        } else if (filter) {
            const like = `%${filter}%`;
            filtered = (
                connection
                    .prepare('SELECT COUNT(*) AS c FROM teams WHERE name LIKE ? OR shortname LIKE ?')
                    .get(like, like) as { c: number }
            ).c;
            data = connection
                .prepare('SELECT * FROM teams WHERE name LIKE ? OR shortname LIKE ? LIMIT ? OFFSET ?')
                .all(like, like, limit, offset);
        } else {
            filtered = total;
            data = connection.prepare('SELECT * FROM teams ORDER BY name LIMIT ? OFFSET ?').all(limit, offset);
        }
        res.json({ total, filtered, data });
    });

    router.get('/:id', requireAuth(0, 1, 2), (req: Request, res: Response) => {
        const team = connection.prepare('SELECT * FROM teams WHERE id = ?').get(req.params.id as string);
        if (!team) {
            res.status(404).json({ error: 'Nie znaleziono' });
            return;
        }
        const players = connection
            .prepare('SELECT * FROM players WHERE team_id = ? ORDER BY lastname')
            .all(req.params.id as string);
        res.json({ ...(team as object), players });
    });

    router.post('/', requireAuth(0, 1), (req: Request, res: Response, next) => {
        try {
            const t = new Team(req.body);
            const created = connection
                .prepare('INSERT INTO teams (name, shortname, captain_id) VALUES (?, ?, ?) RETURNING *')
                .get(t.name, t.shortname, t.captain_id ?? null);
            writeAudit(connection, 'team', (created as { id: number }).id, 'create', null, created, req.user!.id);
            res.json(created);
        } catch (err) {
            next(err);
        }
    });

    const teamUpdateHandler = (req: Request, res: Response, next: import('express').NextFunction) => {
        try {
            const t = new Team(req.body);
            const idFromParam = req.params.id ? parseInt(req.params.id as string) : undefined;
            const targetId = idFromParam ?? t.id;
            if (!targetId) throw new Error('Brak id');

            const isAdmin = req.user!.roles.includes(0);
            const old = connection.prepare('SELECT * FROM teams WHERE id = ?').get(targetId) as
                | { id: number; captain_id: number | null }
                | undefined;
            if (!old) throw new Error(`Nie znaleziono drużyny o id=${targetId}`);

            // captain (without admin/role-1) can only edit their own team
            const onlyCaptain = req.user!.roles.includes(2) && !isAdmin && !req.user!.roles.includes(1);
            if (onlyCaptain && old.captain_id !== req.user!.id) {
                throw Object.assign(new Error('Brak uprawnień do edycji tej drużyny'), { status: 403 });
            }

            // Only admin (role 0) can change captain_id. Non-admins keep the existing captain.
            const newCaptainId = isAdmin ? (t.captain_id ?? null) : old.captain_id;

            const updated = connection
                .prepare('UPDATE teams SET name=?, shortname=?, captain_id=? WHERE id=? RETURNING *')
                .get(t.name, t.shortname, newCaptainId, targetId);
            if (!updated) throw new Error(`Nie znaleziono drużyny o id=${targetId}`);
            writeAudit(connection, 'team', targetId, 'update', old, updated, req.user!.id);
            res.json(updated);
        } catch (err) {
            next(err);
        }
    };
    router.put('/', requireAuth(0, 1, 2), teamUpdateHandler);
    router.put('/:id', requireAuth(0, 1, 2), teamUpdateHandler);

    router.delete('/:id', requireAuth(0), (req: Request, res: Response, next) => {
        try {
            const id = parseInt(req.params.id as string);
            const old = connection.prepare('SELECT * FROM teams WHERE id = ?').get(id);
            const deleted = connection.prepare('DELETE FROM teams WHERE id = ? RETURNING *').get(id);
            if (!deleted) throw new Error('Nie znaleziono');
            writeAudit(connection, 'team', id, 'delete', old, null, req.user!.id);
            res.json(deleted);
        } catch (err) {
            next(err);
        }
    });

    return router;
}
