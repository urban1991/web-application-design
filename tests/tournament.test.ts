import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { tournamentRouter } from '../src/api/tournament';

// minimal supertest setup — no real auth, inject user manually
function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`CREATE TABLE tournaments (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sport TEXT NOT NULL, start_date DATE, end_date DATE, status TEXT DEFAULT 'draft', created_by INTEGER)`);
    db.exec(`CREATE VIRTUAL TABLE tournaments_fts USING fts5(name, sport, content='tournaments', content_rowid='id')`);
    db.exec(`CREATE TRIGGER tournaments_ai AFTER INSERT ON tournaments BEGIN INSERT INTO tournaments_fts(rowid,name,sport) VALUES(new.id,new.name,new.sport); END`);
    db.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, shortname TEXT, captain_id INTEGER)`);
    db.exec(`CREATE TABLE tournament_teams (id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER, team_id INTEGER, seed INTEGER, UNIQUE(tournament_id,team_id))`);
    db.exec(`CREATE TABLE matches (id INTEGER PRIMARY KEY AUTOINCREMENT, tournament_id INTEGER, round INTEGER, match_number INTEGER, team1_id INTEGER, team2_id INTEGER, score1 INTEGER, score2 INTEGER, scheduled_at TEXT, status TEXT DEFAULT 'scheduled', winner_id INTEGER, next_match_id INTEGER)`);
    db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.exec(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, email TEXT, roles TEXT, password_hash TEXT)`);

    const app = express();
    app.use(express.json());
    // inject fake authenticated user
    app.use((req: any, _res: any, next: any) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] };
        next();
    });
    app.use('/api/tournament', tournamentRouter(db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(400).json({ error: err.message }));
    return { app, db };
}

describe('tournament API', () => {
    let app: express.Express;
    let db: DatabaseSync;

    beforeAll(() => {
        ({ app, db } = makeApp());
    });

    it('POST / creates a tournament', async () => {
        const res = await request(app)
            .post('/api/tournament')
            .send({ name: 'Turniej 1', sport: 'Piłka nożna' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Turniej 1');
        expect(res.body.id).toBeDefined();
    });

    it('GET / returns paginated list', async () => {
        const res = await request(app).get('/api/tournament?limit=5&offset=0');
        expect(res.status).toBe(200);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.total).toBeGreaterThan(0);
    });

    it('PUT / updates a tournament', async () => {
        const create = await request(app).post('/api/tournament').send({ name: 'Stara nazwa', sport: 'Koszykówka' });
        const id = create.body.id;
        const res = await request(app).put('/api/tournament').send({ id, name: 'Nowa nazwa', sport: 'Koszykówka' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Nowa nazwa');
    });

    it('DELETE /:id removes a tournament', async () => {
        const create = await request(app).post('/api/tournament').send({ name: 'Do usunięcia', sport: 'Siatkówka' });
        const id = create.body.id;
        const res = await request(app).delete(`/api/tournament/${id}`);
        expect(res.status).toBe(200);
        const check = db.prepare('SELECT id FROM tournaments WHERE id = ?').get(id);
        expect(check).toBeUndefined();
    });

    it('POST / rejects missing name', async () => {
        const res = await request(app).post('/api/tournament').send({ sport: 'Piłka nożna' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/name/);
    });

    it('GET /:id returns 404 for missing tournament', async () => {
        const res = await request(app).get('/api/tournament/99999');
        expect(res.status).toBe(404);
    });

    it('GET / supports full-text search by name', async () => {
        await request(app).post('/api/tournament').send({ name: 'Liga Mistrzów', sport: 'Piłka nożna' });
        await request(app).post('/api/tournament').send({ name: 'Puchar Polski', sport: 'Piłka nożna' });

        const res = await request(app).get('/api/tournament?q=Mistrzów');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].name).toBe('Liga Mistrzów');
    });

    it('GET / returns empty results for unmatched FTS query', async () => {
        const res = await request(app).get('/api/tournament?q=NieIstniejącySport');
        expect(res.status).toBe(200);
        expect(res.body.filtered).toBe(0);
        expect(res.body.data).toEqual([]);
    });

    it('POST /:id/register-team adds team to tournament', async () => {
        const t = await request(app).post('/api/tournament').send({ name: 'T', sport: 'S' });
        const tid = t.body.id;
        db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('Drużyna A', 'DA');
        const teamId = (db.prepare('SELECT id FROM teams WHERE name=?').get('Drużyna A') as any).id;

        const res = await request(app)
            .post(`/api/tournament/${tid}/register-team`)
            .send({ team_id: teamId });
        expect(res.status).toBe(200);
        const count = (db.prepare('SELECT COUNT(*) AS c FROM tournament_teams WHERE tournament_id=?').get(tid) as any).c;
        expect(count).toBe(1);
    });

    it('DELETE /:id/team/:teamId removes team from tournament', async () => {
        const t = await request(app).post('/api/tournament').send({ name: 'T2', sport: 'S' });
        const tid = t.body.id;
        db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('Drużyna B', 'DB');
        const teamId = (db.prepare('SELECT id FROM teams WHERE name=?').get('Drużyna B') as any).id;
        db.prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?,?,?)').run(tid, teamId, 1);

        const res = await request(app).delete(`/api/tournament/${tid}/team/${teamId}`);
        expect(res.status).toBe(200);
        const count = (db.prepare('SELECT COUNT(*) AS c FROM tournament_teams WHERE tournament_id=?').get(tid) as any).c;
        expect(count).toBe(0);
    });

    it('POST /:id/generate-bracket creates matches for 4 teams', async () => {
        const t = await request(app).post('/api/tournament').send({ name: 'Bracket T', sport: 'S' });
        const tid = t.body.id;
        for (let i = 1; i <= 4; i++) {
            db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run(`T${i}`, `T${i}`);
            const id = (db.prepare('SELECT id FROM teams ORDER BY id DESC LIMIT 1').get() as any).id;
            db.prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?,?,?)').run(tid, id, i);
        }
        const res = await request(app).post(`/api/tournament/${tid}/generate-bracket`);
        expect(res.status).toBe(200);
        const mc = (db.prepare('SELECT COUNT(*) AS c FROM matches WHERE tournament_id=?').get(tid) as any).c;
        expect(mc).toBe(3);
    });

    it('GET /:id/bracket returns bracket matches with team names', async () => {
        const t = await request(app).post('/api/tournament').send({ name: 'Bracket T2', sport: 'S' });
        const tid = t.body.id;
        db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('Alpha', 'AL');
        db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('Beta', 'BE');
        const [a, b] = (db.prepare('SELECT id FROM teams ORDER BY id DESC LIMIT 2').all() as any[]).map(r => r.id).reverse();
        db.prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?,?,?)').run(tid, a, 1);
        db.prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?,?,?)').run(tid, b, 2);
        await request(app).post(`/api/tournament/${tid}/generate-bracket`);

        const res = await request(app).get(`/api/tournament/${tid}/bracket`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('team1_name');
    });

    it('GET /:id/standings returns teams sorted by wins', async () => {
        const t = await request(app).post('/api/tournament').send({ name: 'Stand T', sport: 'S' });
        const tid = t.body.id;
        db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('Winner', 'WN');
        db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?)').run('Loser', 'LO');
        const [w, l] = (db.prepare('SELECT id FROM teams ORDER BY id DESC LIMIT 2').all() as any[]).map(r => r.id).reverse();
        db.prepare('INSERT INTO matches (tournament_id,round,match_number,team1_id,team2_id,winner_id,status) VALUES (?,?,?,?,?,?,?)').run(tid, 1, 1, w, l, w, 'finished');
        db.prepare('INSERT INTO matches (tournament_id,round,match_number,team1_id,team2_id,winner_id,status) VALUES (?,?,?,?,?,?,?)').run(tid, 2, 1, w, l, w, 'finished');

        const res = await request(app).get(`/api/tournament/${tid}/standings`);
        expect(res.status).toBe(200);
        expect(res.body[0].team_id).toBe(w);
        expect(res.body[0].team_name).toBe('Winner');
        expect(res.body[0].wins).toBe(2);
        expect(res.body[0].losses).toBe(0);
        expect(res.body[0].points).toBe(6);
    });

    it('PUT / writes audit log entry', async () => {
        const t = await request(app).post('/api/tournament').send({ name: 'Audit T', sport: 'S' });
        const tid = t.body.id;
        await request(app).put('/api/tournament').send({ id: tid, name: 'Zmieniona', sport: 'S' });
        const entry = db.prepare("SELECT * FROM audit_log WHERE entity='tournament' AND entity_id=? ORDER BY id DESC LIMIT 1").get(tid) as any;
        expect(entry).toBeDefined();
        expect(entry.action).toBe('update');
    });
});
