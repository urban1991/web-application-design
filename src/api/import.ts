import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';
import { writeAudit } from '../auditlog';
import multer from 'multer';
import { parse } from 'csv-parse/sync';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const MAX_IMPORT_ROWS = 1000;

interface TeamImport {
    name: string;
    shortname: string;
}
interface PlayerImport {
    firstname: string;
    lastname: string;
    position?: string;
    team_id?: number;
}

// Sniff actual file shape (do NOT trust client-supplied mimetype/extension).
// Returns 'json' if the buffer's first non-whitespace byte is `{` or `[`,
// otherwise 'csv'. Forces a server-side decision.
function detectFileKind(buffer: Buffer): 'json' | 'csv' {
    for (let i = 0; i < buffer.length; i++) {
        const b = buffer[i];
        if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) continue; // whitespace
        if (b === 0x7b /* { */ || b === 0x5b /* [ */) return 'json';
        return 'csv';
    }
    return 'csv';
}

// Drop dangerous keys that could trigger prototype pollution downstream.
function sanitizeRow<T extends object>(row: unknown): T | null {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return null;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        out[k] = v;
    }
    return out as T;
}

export function importRouter(connection: DatabaseSync): Router {
    const router = Router();

    router.post('/teams', requireAuth(0, 1), upload.single('file'), (req: Request, res: Response, next) => {
        try {
            if (!req.file) throw new Error('Brak pliku');
            const kind = detectFileKind(req.file.buffer);
            let rawRows: unknown[];

            if (kind === 'json') {
                rawRows = JSON.parse(req.file.buffer.toString()) as unknown[];
            } else {
                rawRows = parse(req.file.buffer, { columns: true, skip_empty_lines: true }) as unknown[];
            }

            if (!Array.isArray(rawRows)) throw new Error('Oczekiwano tablicy rekordów');
            if (rawRows.length > MAX_IMPORT_ROWS) throw new Error(`Zbyt wiele rekordów (max ${MAX_IMPORT_ROWS})`);

            const insert = connection.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?) RETURNING *');
            const inserted: unknown[] = [];
            connection.exec('BEGIN IMMEDIATE');
            try {
                for (const raw of rawRows) {
                    const row = sanitizeRow<TeamImport>(raw);
                    if (!row) continue;
                    if (typeof row.name !== 'string' || typeof row.shortname !== 'string') continue;
                    const name = row.name.trim();
                    const shortname = row.shortname.trim();
                    if (!name || !shortname) continue;
                    const created = insert.get(name, shortname);
                    writeAudit(
                        connection,
                        'team',
                        (created as unknown as { id: number }).id,
                        'create',
                        null,
                        created,
                        req.user!.id
                    );
                    inserted.push(created);
                }
                connection.exec('COMMIT');
            } catch (txErr) {
                try {
                    connection.exec('ROLLBACK');
                } catch {
                    /* ignore */
                }
                throw txErr;
            }
            res.json({ inserted: inserted.length, data: inserted });
        } catch (err) {
            next(err);
        }
    });

    router.post('/players', requireAuth(0, 1), upload.single('file'), (req: Request, res: Response, next) => {
        try {
            if (!req.file) throw new Error('Brak pliku');
            const kind = detectFileKind(req.file.buffer);
            let rawRows: unknown[];

            if (kind === 'json') {
                rawRows = JSON.parse(req.file.buffer.toString()) as unknown[];
            } else {
                rawRows = parse(req.file.buffer, { columns: true, skip_empty_lines: true }) as unknown[];
            }

            if (!Array.isArray(rawRows)) throw new Error('Oczekiwano tablicy rekordów');
            if (rawRows.length > MAX_IMPORT_ROWS) throw new Error(`Zbyt wiele rekordów (max ${MAX_IMPORT_ROWS})`);

            const insert = connection.prepare(
                'INSERT INTO players (firstname, lastname, position, team_id) VALUES (?, ?, ?, ?) RETURNING *'
            );
            const inserted: unknown[] = [];
            connection.exec('BEGIN IMMEDIATE');
            try {
                for (const raw of rawRows) {
                    const row = sanitizeRow<PlayerImport>(raw);
                    if (!row) continue;
                    if (typeof row.firstname !== 'string' || typeof row.lastname !== 'string') continue;
                    const firstname = row.firstname.trim();
                    const lastname = row.lastname.trim();
                    if (!firstname || !lastname) continue;
                    const position =
                        typeof row.position === 'string' && row.position.trim() ? row.position.trim() : null;
                    let teamId: number | null = null;
                    const rawTeamId: unknown = row.team_id;
                    if (rawTeamId !== undefined && rawTeamId !== null && rawTeamId !== '') {
                        const parsed = parseInt(String(rawTeamId));
                        if (Number.isFinite(parsed) && parsed > 0) teamId = parsed;
                    }
                    const created = insert.get(firstname, lastname, position, teamId);
                    writeAudit(
                        connection,
                        'player',
                        (created as unknown as { id: number }).id,
                        'create',
                        null,
                        created,
                        req.user!.id
                    );
                    inserted.push(created);
                }
                connection.exec('COMMIT');
            } catch (txErr) {
                try {
                    connection.exec('ROLLBACK');
                } catch {
                    /* ignore */
                }
                throw txErr;
            }
            res.json({ inserted: inserted.length, data: inserted });
        } catch (err) {
            next(err);
        }
    });

    return router;
}
