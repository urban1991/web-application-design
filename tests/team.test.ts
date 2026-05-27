import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { teamRouter } from '../src/api/team';

function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, shortname TEXT NOT NULL, captain_id INTEGER)`);
    db.exec(`CREATE VIRTUAL TABLE teams_fts USING fts5(name, shortname, content='teams', content_rowid='id')`);
    db.exec(`CREATE TRIGGER teams_ai AFTER INSERT ON teams BEGIN INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);
    db.exec(`CREATE TRIGGER teams_ad AFTER DELETE ON teams BEGIN INSERT INTO teams_fts(teams_fts,rowid,name,shortname) VALUES('delete',old.id,old.name,old.shortname); END`);
    db.exec(`CREATE TRIGGER teams_au AFTER UPDATE ON teams BEGIN INSERT INTO teams_fts(teams_fts,rowid,name,shortname) VALUES('delete',old.id,old.name,old.shortname); INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);
    db.exec(`CREATE TABLE players (id INTEGER PRIMARY KEY AUTOINCREMENT, firstname TEXT, lastname TEXT, position TEXT, team_id INTEGER)`);
    db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] };
        next();
    });
    
    app.use('/api/team', teamRouter(db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 400).json({ error: err.message }));

    return { app, db };
}

describe('team API', () => {
    let app: express.Express;
    let db: DatabaseSync;

    beforeAll(() => {
        ({ app, db } = makeApp());
    });

    it('POST / creates a team', async () => {
        const res = await request(app).post('/api/team').send({ name: 'Drużyna 1', shortname: 'DR1' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Drużyna 1');
        expect(res.body.id).toBeDefined();
    });

    it('GET / returns paginated list of teams', async () => {
        const res = await request(app).get('/api/team?limit=5&offset=0');
        expect(res.status).toBe(200);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.total).toBeGreaterThan(0);
    });

    it('GET / supports FTS search', async () => {
        await request(app).post('/api/team').send({ name: 'FC Barcelona', shortname: 'FCB' });
        const res = await request(app).get('/api/team?q=Barcelona');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].name).toBe('FC Barcelona');
    });

    it('PUT / updates a team', async () => {
        const create = await request(app).post('/api/team').send({ name: 'Stara', shortname: 'ST' });
        const id = create.body.id;
        const res = await request(app).put('/api/team').send({ id, name: 'Nowa', shortname: 'NW' });
        expect(res.status).toBe(200);
        expect(res.body.name).toBe('Nowa');
    });

    it('GET /:id returns team with players', async () => {
        const create = await request(app).post('/api/team').send({ name: 'Z zawodnikami', shortname: 'ZZ' });
        const id = create.body.id;
        db.prepare('INSERT INTO players (firstname, lastname, team_id) VALUES (?, ?, ?)').run('Jan', 'Kowalski', id);
        
        const res = await request(app).get(`/api/team/${id}`);
        expect(res.status).toBe(200);
        expect(res.body.players.length).toBe(1);
        expect(res.body.players[0].firstname).toBe('Jan');
    });

    it('endpoint DELETE /:id removes team', async () => {
        const create = await request(app).post('/api/team').send({ name: 'Do usunięcia', shortname: 'DU' });
        const id = create.body.id;
        const res = await request(app).delete(`/api/team/${id}`);
        expect(res.status).toBe(200);
        
        const check = db.prepare('SELECT id FROM teams WHERE id=?').get(id);
        expect(check).toBeUndefined();
    });
});
