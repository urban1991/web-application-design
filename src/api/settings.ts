import { Router, Request, Response } from 'express';
import { DatabaseSync } from 'node:sqlite';
import { requireAuth } from '../auth';
import { writeAudit } from '../auditlog';
import speakeasy from 'speakeasy';

export function settingsRouter(sysDb: DatabaseSync, connection: DatabaseSync): Router {
    const router = Router();

    router.put('/preferences', requireAuth(0, 1, 2), (req: Request, res: Response, next) => {
        try {
            const { theme, language } = req.body as { theme?: string; language?: string };
            const allowed_themes = ['light', 'dark'];
            const allowed_langs = ['pl', 'en'];
            if (theme && !allowed_themes.includes(theme)) throw new Error('Nieprawidłowy motyw');
            if (language && !allowed_langs.includes(language)) throw new Error('Nieprawidłowy język');
            const old = sysDb.prepare('SELECT theme, language FROM users WHERE id=?').get(req.user!.id);
            sysDb
                .prepare('UPDATE users SET theme=COALESCE(?,theme), language=COALESCE(?,language) WHERE id=?')
                .run(theme ?? null, language ?? null, req.user!.id);
            const user = sysDb.prepare('SELECT theme, language FROM users WHERE id=?').get(req.user!.id);
            writeAudit(connection, 'user_preferences', req.user!.id, 'update', old, user, req.user!.id);
            res.json(user);
        } catch (err) {
            next(err);
        }
    });

    router.post('/mfa/setup', requireAuth(0, 1, 2), (_req: Request, res: Response) => {
        const secretObj = speakeasy.generateSecret({ name: `PAW Tournament (${_req.user!.username})`, length: 20 });
        const secret = secretObj.base32;
        const otpauthUrl = secretObj.otpauth_url ?? '';
        // store secret temporarily (not enabled yet)
        sysDb.prepare('UPDATE users SET mfa_secret=? WHERE id=?').run(secret, _req.user!.id);
        res.json({ secret, otpauthUrl });
    });

    router.post('/mfa/verify', requireAuth(0, 1, 2), (req: Request, res: Response, next) => {
        try {
            const { token } = req.body as { token: string };
            const row = sysDb.prepare('SELECT mfa_secret FROM users WHERE id=?').get(req.user!.id) as
                | { mfa_secret: string | null }
                | undefined;
            if (!row?.mfa_secret) throw new Error('MFA nie zostało zainicjalizowane');
            const valid = speakeasy.totp.verify({ token, secret: row.mfa_secret, encoding: 'base32' });
            if (!valid) throw new Error('Nieprawidłowy kod TOTP');
            sysDb.prepare('UPDATE users SET mfa_enabled=1 WHERE id=?').run(req.user!.id);
            writeAudit(
                connection,
                'user_mfa',
                req.user!.id,
                'update',
                { mfa_enabled: false },
                { mfa_enabled: true },
                req.user!.id
            );
            res.json({ message: 'MFA włączone' });
        } catch (err) {
            next(err);
        }
    });

    router.post(
        '/mfa/disable',
        requireAuth(0, 1, 2),
        (_req: Request, res: Response, next: import('express').NextFunction) => {
            try {
                sysDb.prepare('UPDATE users SET mfa_enabled=0, mfa_secret=NULL WHERE id=?').run(_req.user!.id);
                writeAudit(
                    connection,
                    'user_mfa',
                    _req.user!.id,
                    'update',
                    { mfa_enabled: true },
                    { mfa_enabled: false },
                    _req.user!.id
                );
                res.json({ message: 'MFA wyłączone' });
            } catch (err) {
                next(err);
            }
        }
    );

    return router;
}
