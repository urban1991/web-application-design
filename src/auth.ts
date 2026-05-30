import { Request, Response, NextFunction, RequestHandler } from 'express';
import { Application } from 'express';
import { DatabaseSync } from 'node:sqlite';
import session from 'express-session';
import connectSqlite3 from 'connect-sqlite3';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import createError from 'http-errors';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface User {
            id: number;
            username: string;
            roles: number[];
        }
    }
}

async function initSysDb(filename: string, adminPassword: string, userPassword: string): Promise<DatabaseSync> {
    const db = new DatabaseSync(filename);
    db.exec('PRAGMA journal_mode=WAL');

    db.exec(`CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        roles         TEXT NOT NULL DEFAULT '[]',
        email         TEXT,
        mfa_secret    TEXT,
        mfa_enabled   INTEGER NOT NULL DEFAULT 0,
        theme         TEXT NOT NULL DEFAULT 'light',
        language      TEXT NOT NULL DEFAULT 'pl'
    )`);
    // migrate existing tables (adds columns if missing)
    try {
        db.exec(`ALTER TABLE users ADD COLUMN email TEXT`);
    } catch {}
    try {
        db.exec(`ALTER TABLE users ADD COLUMN mfa_secret TEXT`);
    } catch {}
    try {
        db.exec(`ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0`);
    } catch {}
    try {
        db.exec(`ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'light'`);
    } catch {}
    try {
        db.exec(`ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'pl'`);
    } catch {}

    const count = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
    if ((count?.c ?? 0) === 0) {
        let hash = await bcrypt.hash(adminPassword, 10);
        db.prepare('INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)').run(
            'admin',
            hash,
            JSON.stringify([0])
        );
        console.log(`Utworzono domyślnego administratora: admin:${adminPassword} (role: [0])`);
        hash = await bcrypt.hash(userPassword, 10);
        db.prepare('INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)').run(
            'user',
            hash,
            JSON.stringify([1])
        );
        console.log(`Utworzono domyślnego użytkownika: user:${userPassword} (role: [1])`);
        hash = await bcrypt.hash('Captain123', 10);
        db.prepare('INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)').run(
            'captain',
            hash,
            JSON.stringify([2])
        );
        console.log(`Utworzono domyślnego kapitana: captain:Captain123 (role: [2])`);
    }

    return db;
}

// --- Configuration passport and session ---

export async function initAuth(
    app: Application,
    config: {
        sysDbFilename: string;
        sessionSecret: string;
        sessionMaxAge: number;
        adminPassword: string;
        userPassword: string;
    }
): Promise<{ db: DatabaseSync; sessionMiddleware: RequestHandler }> {
    const db = await initSysDb(config.sysDbFilename, config.adminPassword, config.userPassword);

    const [dir, db_name] = (() => {
        const i = config.sysDbFilename.lastIndexOf('/');
        return i === -1
            ? ['.', config.sysDbFilename]
            : [config.sysDbFilename.slice(0, i), config.sysDbFilename.slice(i + 1)];
    })();
    const SQLiteStore = connectSqlite3(session);

    const isProduction = process.env.NODE_ENV === 'production';
    if (isProduction) {
        app.set('trust proxy', 1);
    }
    // Shared so the WebSocket upgrade handler can authenticate connections too.
    const sessionMiddleware = session({
        store: new SQLiteStore({ db: db_name, dir, table: 'sessions' }) as unknown as session.Store,
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',
            maxAge: config.sessionMaxAge,
        },
    });
    app.use(sessionMiddleware);

    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(
        new LocalStrategy(async (username, password, done) => {
            try {
                const row = db
                    .prepare('SELECT id, username, password_hash, roles FROM users WHERE username = ?')
                    .get(username) as
                    | { id: number; username: string; password_hash: string; roles: string }
                    | undefined;
                if (!row) return done(null, false, { message: 'Nieprawidłowe dane logowania' });
                const ok = await bcrypt.compare(password, row.password_hash);
                if (!ok) return done(null, false, { message: 'Nieprawidłowe dane logowania' });
                done(null, { id: row.id, username: row.username, roles: JSON.parse(row.roles) as number[] });
            } catch (e) {
                done(e);
            }
        })
    );

    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    passport.deserializeUser((id: number, done) => {
        try {
            const row = db.prepare('SELECT id, username, roles FROM users WHERE id = ?').get(id) as
                | { id: number; username: string; roles: string }
                | undefined;
            if (!row) return done(null, false);
            done(null, { id: row.id, username: row.username, roles: JSON.parse(row.roles) as number[] });
        } catch (e) {
            done(e);
        }
    });

    return { db, sessionMiddleware };
}

export function requireAuth(...roles: number[]): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.isAuthenticated()) return next(createError(401, 'Wymagana autoryzacja'));
        if (roles.length > 0) {
            const userRoles = new Set(req.user!.roles);
            const hasRole = roles.some(r => userRoles.has(r));
            if (!hasRole) return next(createError(403, 'Brak uprawnień'));
        }
        next();
    };
}
