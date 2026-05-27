import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';

export function auditRouter(connection: DatabaseSync, sysDb: DatabaseSync = connection): Router {
    const router = Router();

    router.get('/', requireAuth(0), (req: Request, res: Response) => {
        const limitRaw = parseInt(req.query.limit as string);
        const offsetRaw = parseInt(req.query.offset as string);
        if (req.query.limit !== undefined && (isNaN(limitRaw) || limitRaw < 1)) {
            res.status(400).json({ error: 'Nieprawidłowy parametr limit' });
            return;
        }
        if (req.query.offset !== undefined && (isNaN(offsetRaw) || offsetRaw < 0)) {
            res.status(400).json({ error: 'Nieprawidłowy parametr offset' });
            return;
        }
        const limit = Math.min(isNaN(limitRaw) ? 20 : limitRaw, 100);
        const offset = isNaN(offsetRaw) ? 0 : offsetRaw;
        const entity = req.query.entity ? String(req.query.entity) : null;

        const where = entity ? 'WHERE entity = ?' : '';
        const args: unknown[] = entity ? [entity] : [];

        const total = (
            connection
                .prepare(`SELECT COUNT(*) AS c FROM audit_log ${where}`)
                .get(...(args as (string | number | null)[])) as { c: number }
        ).c;
        const rows = connection
            .prepare(`SELECT * FROM audit_log ${where} ORDER BY changed_at DESC LIMIT ? OFFSET ?`)
            .all(...(args as (string | number | null)[]), limit, offset) as { changed_by: number | null }[];

        const userIds = [...new Set(rows.map(r => r.changed_by).filter((id): id is number => id !== null))];
        const userMap = new Map<number, string>();
        if (userIds.length) {
            const ph = userIds.map(() => '?').join(',');
            const users = sysDb
                .prepare(`SELECT id, username FROM users WHERE id IN (${ph})`)
                .all(...(userIds as (string | number | null)[])) as { id: number; username: string }[];
            for (const u of users) userMap.set(u.id, u.username);
        }

        const data = rows.map(r => ({
            ...r,
            username: r.changed_by !== null ? (userMap.get(r.changed_by) ?? null) : null,
        }));
        res.json({ total, data });
    });

    return router;
}
