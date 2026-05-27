import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { matchRouter } from '../src/api/match';

function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sport TEXT NOT NULL)`);
    db.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, shortname TEXT NOT NULL, captain_id INTEGER)`);
    db.exec(`CREATE TABLE matches (id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER, round INTEGER, match_number INTEGER, team1_id INTEGER, team2_id INTEGER, score1 INTEGER, score2 INTEGER, scheduled_at TEXT, status TEXT DEFAULT 'scheduled', winner_id INTEGER, next_match_id INTEGER)`);
    db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // Add some data
    db.prepare('INSERT INTO tournaments (name, sport) VALUES (?, ?)').run('Test Tourney', 'Siatkówka');
    db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('T1', 'T1');
    db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('T2', 'T2');
    db.prepare('INSERT INTO matches (tournament_id, round, match_number, team1_id, team2_id) VALUES (?, ?, ?, ?, ?)').run(1, 1, 1, 1, 2);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] };
        next();
    });
    
    app.use('/api/match', matchRouter(db, db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 400).json({ error: err.message }));

    return { app, db };
}

describe('match API', () => {
    let app: express.Express;
    let db: DatabaseSync;

    beforeAll(() => {
        ({ app, db } = makeApp());
    });

    it('PUT /:id/score updates match score', async () => {
        const res = await request(app).put('/api/match/1/score').send({ score1: 3, score2: 1 });
        expect(res.status).toBe(200);
        
        const row = db.prepare('SELECT score1, score2, status, winner_id FROM matches WHERE id=1').get() as any;
        expect(row.score1).toBe(3);
        expect(row.score2).toBe(1);
        expect(row.status).toBe('finished');
        expect(row.winner_id).toBe(1); // 3 > 1, so team1 (id: 1) is winner
    });

    it('PUT /:id/score fails if missing data', async () => {
        const res = await request(app).put('/api/match/1/score').send({ score1: 3 });
        expect(res.status).toBe(400);
    });

    it('PUT /:id/score writes audit log', async () => {
        const entry = db.prepare("SELECT * FROM audit_log WHERE entity='match' AND entity_id=1").get() as any;
        expect(entry).toBeDefined();
        expect(entry.action).toBe('update');
    });

    it('PUT /:id/status updates match status', async () => {
        const res = await request(app).put('/api/match/1/status').send({ status: 'in_progress' });
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('in_progress');
    });

    it('PUT /:id/schedule updates match schedule date', async () => {
        const res = await request(app).put('/api/match/1/schedule').send({ scheduled_at: '2026-06-01T12:00:00Z' });
        expect(res.status).toBe(200);
        expect(res.body.scheduled_at).toBe('2026-06-01T12:00:00Z');
    });
});
