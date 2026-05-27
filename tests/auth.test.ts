import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import session from 'express-session';
import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { DatabaseSync } from 'node:sqlite';
import { authRouter } from '../src/api/auth';

function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE users (
        id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT,
        roles TEXT, mfa_secret TEXT, mfa_enabled INTEGER DEFAULT 0,
        theme TEXT DEFAULT 'light', language TEXT DEFAULT 'pl'
    )`);
    const hash = bcrypt.hashSync('Password123', 10);
    db.prepare('INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)').run('testuser', hash, '[1]');
    db.prepare('INSERT INTO users (username, password_hash, roles) VALUES (?, ?, ?)').run('mfauser', hash, '[1]');
    
    const mfaSecret = speakeasy.generateSecret({ length: 20 }).base32;
    db.prepare('UPDATE users SET mfa_secret=?, mfa_enabled=1 WHERE username=?').run(mfaSecret, 'mfauser');

    const app = express();
    app.use(express.json());
    app.use(session({ secret: 'test', resave: false, saveUninitialized: false }));
    app.use(passport.initialize());
    app.use(passport.session());

    passport.use(new LocalStrategy(async (username, password, done) => {
        const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as any;
        if (!row) return done(null, false, { message: 'Incorrect credentials' });
        if (!bcrypt.compareSync(password, row.password_hash)) return done(null, false, { message: 'Incorrect credentials' });
        done(null, { id: row.id, username: row.username, roles: JSON.parse(row.roles) });
    }));
    passport.serializeUser((user: any, done) => done(null, user.id));
    passport.deserializeUser((id, done) => {
        const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as any;
        done(null, { id: row.id, username: row.username, roles: JSON.parse(row.roles) });
    });

    app.use('/api/auth', authRouter(db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 500).json({ error: err.message }));
    
    return { app, db, mfaSecret };
}

describe('auth API', () => {
    let app: express.Express;
    let mfaSecret: string;

    beforeAll(() => {
        ({ app, mfaSecret } = makeApp());
    });

    it('POST /login success without MFA', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'Password123' });
        expect(res.status).toBe(200);
        expect(res.body.username).toBe('testuser');
    });

    it('POST /login fails with wrong password', async () => {
        const res = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'WrongPassword' });
        expect(res.status).toBe(401);
    });

    it('POST /login handles MFA flow', async () => {
        const res1 = await request(app).post('/api/auth/login').send({ username: 'mfauser', password: 'Password123' });
        expect(res1.status).toBe(200);
        expect(res1.body.mfa_required).toBe(true);

        const cookie = res1.headers['set-cookie'];
        
        const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });
        const res2 = await request(app).post('/api/auth/login').set('Cookie', cookie).send({ mfa_token: token });
        expect(res2.status).toBe(200);
        expect(res2.body.username).toBe('mfauser');
    });

    it('GET /me returns user info if logged in', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ username: 'testuser', password: 'Password123' });
        const res = await agent.get('/api/auth/me');
        expect(res.status).toBe(200);
        expect(res.body.username).toBe('testuser');
    });

    it('GET /me returns null if not logged in', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(200);
        expect(res.body).toBe(null);
    });

    it('POST /logout successfully logs out', async () => {
        const agent = request.agent(app);
        await agent.post('/api/auth/login').send({ username: 'testuser', password: 'Password123' });
        const res = await agent.post('/api/auth/logout');
        expect(res.status).toBe(200);
        
        const me = await agent.get('/api/auth/me');
        expect(me.body).toBe(null);
    });

    it('Rate limiting blocks after 10 failed attempts', async () => {
        for(let i=0; i<10; i++) {
            await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'WrongPassword' });
        }
        const res = await request(app).post('/api/auth/login').send({ username: 'testuser', password: 'WrongPassword' });
        expect(res.status).toBe(429);
    });
});
