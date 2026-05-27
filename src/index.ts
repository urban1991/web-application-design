import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import crypto from 'crypto';
import morgan from 'morgan';
import { DatabaseSync } from 'node:sqlite';
import createError from 'http-errors';

import { initAuth } from './auth';
import { initWebSocket } from './websocket';
import { initEmail } from './email';
import { authRouter } from './api/auth';
import { tournamentRouter } from './api/tournament';
import { teamRouter } from './api/team';
import { playerRouter } from './api/player';
import { matchRouter } from './api/match';
import { importRouter } from './api/import';
import { auditRouter } from './api/audit';
import { settingsRouter } from './api/settings';

const config = {
    port: 4000,
    frontend: 'frontend/dist',
    api: '/api',
    dbfilename: 'data/app.sqlite3',
    sysDbFilename: 'data/sys.sqlite3',
    sessionSecret: process.env.SESSION_SECRET ?? 'tajne!',
    sessionMaxAge: 86400000,
    adminPassword: process.env.ADMIN_PASSWORD ?? 'Admin123',
    userPassword: process.env.USER_PASSWORD ?? 'User123',
    isProduction: process.env.NODE_ENV === 'production',
    email: {
        host: process.env.SMTP_HOST ?? '',
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
        from: process.env.SMTP_FROM ?? 'noreply@paw.local',
    }
};

async function main() {
    // Fail-fast in production if security-critical env vars are missing.
    if (config.isProduction) {
        const missing: string[] = [];
        if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
        if (!process.env.ADMIN_PASSWORD) missing.push('ADMIN_PASSWORD');
        if (!process.env.USER_PASSWORD) missing.push('USER_PASSWORD');
        if (missing.length) {
            throw new Error(`Brakujące zmienne środowiskowe w trybie produkcyjnym: ${missing.join(', ')}`);
        }
    }

    const app = express();
    const server = http.createServer(app);

    app.use(morgan('tiny'));
    app.use(express.json());
    app.use(express.static(config.frontend));

    // CSRF: double-submit cookie pattern.
    // On any request, ensure a `csrf_token` cookie is set (non-httpOnly so JS can read it).
    // On mutating API requests, require header `X-CSRF-Token` to match the cookie value.
    app.use((req: Request, res: Response, next: NextFunction) => {
        const cookieHeader = req.headers.cookie ?? '';
        const cookies: Record<string, string> = {};
        for (const part of cookieHeader.split(';')) {
            const [k, ...v] = part.trim().split('=');
            if (k) cookies[k] = decodeURIComponent(v.join('='));
        }
        let token = cookies['csrf_token'];
        if (!token) {
            token = crypto.randomBytes(24).toString('hex');
            const attrs = [
                `csrf_token=${token}`,
                'Path=/',
                'SameSite=Lax',
                `Max-Age=${Math.floor(config.sessionMaxAge / 1000)}`,
            ];
            if (config.isProduction) attrs.push('Secure');
            res.setHeader('Set-Cookie', attrs.join('; '));
        }
        // attach for downstream handlers
        (req as Request & { csrfCookieToken?: string }).csrfCookieToken = token;
        next();
    });

    // Enforce CSRF on mutating API routes (skip safe verbs and the login endpoint
    // which is itself the bootstrap entry point for users without a session).
    app.use(config.api, (req: Request, _res: Response, next: NextFunction) => {
        const method = req.method.toUpperCase();
        if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();
        // exempt login (no session yet) and CSRF token fetch
        if (req.path === '/auth/login' || req.path === '/auth/csrf') return next();
        const cookieToken = (req as Request & { csrfCookieToken?: string }).csrfCookieToken;
        const headerToken = req.headers['x-csrf-token'];
        if (!cookieToken || !headerToken || cookieToken !== headerToken) {
            return next(createError(403, 'Nieprawidłowy token CSRF'));
        }
        next();
    });

    // Expose current CSRF token (frontend reads this once on app boot).
    app.get(config.api + '/auth/csrf', (req: Request, res: Response) => {
        const token = (req as Request & { csrfCookieToken?: string }).csrfCookieToken;
        res.json({ csrf_token: token });
    });

    // init email (optional — won't crash if SMTP not configured)
    if (config.email.host) initEmail(config.email);

    // auth
    const { db: sysDb, sessionMiddleware } = await initAuth(app, config);
    app.use(config.api + '/auth', authRouter(sysDb));
    // app db
    const connection = new DatabaseSync(config.dbfilename);
    connection.exec('PRAGMA foreign_keys = ON');

    app.use(config.api + '/settings', settingsRouter(sysDb, connection));
    app.use(config.api + '/tournament', tournamentRouter(connection, sysDb));
    app.use(config.api + '/team', teamRouter(connection));
    app.use(config.api + '/player', playerRouter(connection));
    app.use(config.api + '/match', matchRouter(connection, sysDb));
    app.use(config.api + '/import', importRouter(connection));
    app.use(config.api + '/audit', auditRouter(connection, sysDb));

    // 404 for unhandled API routes
    app.use(config.api, (_req: Request, res: Response, _next: NextFunction) => {
        res.status(404).json({ error: 'endpoint not handled' });
    });

    // SPA fallback
    app.use((_req: Request, res: Response) => {
        res.sendFile('index.html', { root: config.frontend });
    });

    // error handler
    app.use((err: Error & { status?: number; expose?: boolean }, req: Request, res: Response, _next: NextFunction) => {
        const status = err.status ?? 400;
        // Always log full error server-side for diagnostics.
        console.error(`[${req.method} ${req.originalUrl}] ${status}:`, err);
        // In production, only echo the message when http-errors marked it safe
        // (err.expose) or for client errors (<500). Mask 500-class entirely.
        let message: string;
        if (config.isProduction) {
            if (status >= 500) {
                message = 'Błąd serwera';
            } else if (err.expose === true || status < 500) {
                message = err.message || 'Błąd żądania';
            } else {
                message = 'Błąd żądania';
            }
        } else {
            message = err.message;
        }
        res.status(status).json({ error: message });
    });

    // WebSocket
    initWebSocket(server, sessionMiddleware);

    server.listen(config.port, () => {
        console.log(`Serwer wystartował na porcie ${config.port}`);
    });
}

main().catch(err => {
    console.error(`Błąd uruchomienia serwera [${err.code}]: ${err.message}`);
    process.exit(1);
});
