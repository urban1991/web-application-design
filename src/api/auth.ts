import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseSync } from 'node:sqlite';
import passport from 'passport';
import createError from 'http-errors';
import speakeasy from 'speakeasy';

// Carry the pending-MFA user id in the session between the two login steps.
declare module 'express-session' {
    interface SessionData {
        pendingMfaUserId?: number;
    }
}

// In-memory per-IP login rate limiter — the primary brute-force defense.
// Resets for a client on successful login.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RL_WINDOW_MS = 15 * 60 * 1000;
const RL_MAX = 10;
function loginRateLimit(req: Request, _res: Response, next: NextFunction): void {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    if (loginAttempts.size > 5000) {
        for (const [k, v] of loginAttempts) if (now > v.resetAt) loginAttempts.delete(k);
    }
    const rec = loginAttempts.get(key);
    if (!rec || now > rec.resetAt) {
        loginAttempts.set(key, { count: 1, resetAt: now + RL_WINDOW_MS });
        return next();
    }
    rec.count++;
    if (rec.count > RL_MAX) {
        return next(createError(429, 'Zbyt wiele prób logowania. Spróbuj ponownie za chwilę.'));
    }
    next();
}

export function authRouter(sysDb: DatabaseSync): Router {
    const router = Router();

    const finishLogin = (req: Request, res: Response, next: NextFunction, user: Express.User) => {
        req.logIn(user, loginErr => {
            if (loginErr) return next(loginErr);
            loginAttempts.delete(req.ip ?? 'unknown');
            const prefs = sysDb.prepare('SELECT theme, language FROM users WHERE id=?').get(user.id) as
                | { theme: string; language: string }
                | undefined;
            res.json({ id: user.id, username: user.username, roles: user.roles, ...prefs });
        });
    };

    // POST /api/auth/login
    router.post('/login', loginRateLimit, async (req: Request, res: Response, next: NextFunction) => {
        const { mfa_token } = req.body as { mfa_token?: string };

        // --- MFA continuation step ---
        // A pending-MFA session proves the credentials step already passed,
        // so we verify ONLY the TOTP here (no password re-check). This
        // is what prevents bypassing by sending a bogus mfa_token up front:
        // without a pending session, mfa_token falls through to the credentials step.
        if (mfa_token && req.session.pendingMfaUserId) {
            const uid = req.session.pendingMfaUserId;
            const row = sysDb.prepare('SELECT id, username, roles, mfa_secret FROM users WHERE id=?').get(uid) as
                | { id: number; username: string; roles: string; mfa_secret: string | null }
                | undefined;
            if (!row || !row.mfa_secret) return next(createError(401, 'Sesja MFA wygasła, zaloguj się ponownie'));
            const valid = speakeasy.totp.verify({ token: mfa_token, secret: row.mfa_secret, encoding: 'base32' });
            if (!valid) return next(createError(401, 'Nieprawidłowy kod MFA'));
            delete req.session.pendingMfaUserId;
            return finishLogin(req, res, next, {
                id: row.id,
                username: row.username,
                roles: JSON.parse(row.roles) as number[],
            });
        }

        // --- Credentials step ---
        passport.authenticate(
            'local',
            (err: unknown, user: Express.User | false, info: { message: string } | undefined) => {
                if (err) return next(err);
                if (!user) return next(createError(401, info?.message ?? 'Nieprawidłowe dane logowania'));

                const row = sysDb.prepare('SELECT mfa_enabled FROM users WHERE id=?').get(user.id) as
                    | { mfa_enabled: number }
                    | undefined;
                if (row?.mfa_enabled) {
                    // Defer login: mark the session pending and require the MFA step.
                    req.session.pendingMfaUserId = user.id;
                    return res.status(200).json({ mfa_required: true });
                }

                finishLogin(req, res, next, user);
            }
        )(req, res, next);
    });

    // POST /api/auth/logout
    router.post('/logout', (req: Request, res: Response, next: NextFunction) => {
        req.logout(err => {
            if (err) return next(err);
            res.json({ message: 'Wylogowano' });
        });
    });

    // GET /api/auth/me
    router.get('/me', (req: Request, res: Response) => {
        if (!req.isAuthenticated()) {
            res.json(null);
            return;
        }
        const prefs = sysDb.prepare('SELECT theme, language, mfa_enabled FROM users WHERE id=?').get(req.user!.id) as
            | { theme: string; language: string; mfa_enabled: number }
            | undefined;
        res.json({ id: req.user!.id, username: req.user!.username, roles: req.user!.roles, ...prefs });
    });

    return router;
}
