import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { settingsRouter } from '../src/api/settings';
import speakeasy from 'speakeasy';

function makeApp() {
    const sysDb = new DatabaseSync(':memory:');
    sysDb.exec(`CREATE TABLE users (
        id INTEGER PRIMARY KEY, username TEXT, mfa_secret TEXT, mfa_enabled INTEGER DEFAULT 0,
        theme TEXT DEFAULT 'light', language TEXT DEFAULT 'pl'
    )`);
    sysDb.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    sysDb.prepare('INSERT INTO users (username) VALUES (?)').run('admin');

    const app = express();
    app.use(express.json());
    // mock auth
    app.use((req: any, _res, next) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] };
        next();
    });
    
    app.use('/api/settings', settingsRouter(sysDb, sysDb));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 400).json({ error: err.message }));

    return { app, sysDb };
}

describe('settings API', () => {
    let app: express.Express;
    let sysDb: DatabaseSync;
    let mfaSecret: string;

    beforeAll(() => {
        ({ app, sysDb } = makeApp());
    });

    it('PUT /preferences updates user preferences', async () => {
        const res = await request(app).put('/api/settings/preferences').send({ theme: 'dark', language: 'en' });
        expect(res.status).toBe(200);
        expect(res.body.theme).toBe('dark');
        expect(res.body.language).toBe('en');

        // Check DB
        const row = sysDb.prepare('SELECT theme, language FROM users WHERE id=1').get() as any;
        expect(row.theme).toBe('dark');
        expect(row.language).toBe('en');
    });

    it('PUT /preferences rejects invalid preferences', async () => {
        const res = await request(app).put('/api/settings/preferences').send({ theme: 'neon' });
        expect(res.status).toBe(400);
    });

    it('POST /mfa/setup generates MFA secret', async () => {
        const res = await request(app).post('/api/settings/mfa/setup');
        expect(res.status).toBe(200);
        expect(res.body.secret).toBeDefined();
        expect(res.body.otpauthUrl).toBeDefined();
        mfaSecret = res.body.secret;
    });

    it('POST /mfa/verify activates MFA with valid token', async () => {
        const token = speakeasy.totp({ secret: mfaSecret, encoding: 'base32' });
        const res = await request(app).post('/api/settings/mfa/verify').send({ token });
        expect(res.status).toBe(200);
        
        const row = sysDb.prepare('SELECT mfa_enabled FROM users WHERE id=1').get() as any;
        expect(row.mfa_enabled).toBe(1);
    });

    it('POST /mfa/verify rejects invalid token', async () => {
        const res = await request(app).post('/api/settings/mfa/verify').send({ token: '000000' });
        expect(res.status).toBe(400);
    });

    it('POST /mfa/disable disables MFA', async () => {
        const res = await request(app).post('/api/settings/mfa/disable');
        expect(res.status).toBe(200);

        const row = sysDb.prepare('SELECT mfa_enabled, mfa_secret FROM users WHERE id=1').get() as any;
        expect(row.mfa_enabled).toBe(0);
        expect(row.mfa_secret).toBeNull();
    });
});
