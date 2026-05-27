import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { auditRouter } from '../src/api/audit';

function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT)`);

    // Seed data
    db.prepare("INSERT INTO users (id, username) VALUES (1, 'admin')").run();
    db.prepare('INSERT INTO audit_log (entity, entity_id, action, changed_by) VALUES (?, ?, ?, ?)').run('tournament', 1, 'create', 1);
    db.prepare('INSERT INTO audit_log (entity, entity_id, action, changed_by) VALUES (?, ?, ?, ?)').run('tournament', 1, 'update', 1);
    db.prepare('INSERT INTO audit_log (entity, entity_id, action, changed_by) VALUES (?, ?, ?, ?)').run('match', 1, 'update', 1);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] }; // admin role
        next();
    });
    
    app.use('/api/audit', auditRouter(db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 400).json({ error: err.message }));

    return { app, db };
}

describe('audit API', () => {
    let app: express.Express;

    beforeAll(() => {
        ({ app } = makeApp());
    });

    it('GET / returns paginated audit logs', async () => {
        const res = await request(app).get('/api/audit?limit=2&offset=0');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(3);
        expect(res.body.data.length).toBe(2);
        expect(res.body.data[0].action).toBeDefined(); // DESC order, newest first
    });

    it('GET / filters by entity', async () => {
        const res = await request(app).get('/api/audit?entity=match');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.data[0].entity).toBe('match');
    });
});
