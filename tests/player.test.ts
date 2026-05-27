import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { playerRouter } from '../src/api/player';

function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE players (id INTEGER PRIMARY KEY AUTOINCREMENT, firstname TEXT NOT NULL, lastname TEXT NOT NULL, position TEXT, team_id INTEGER)`);
    db.exec(`CREATE VIRTUAL TABLE players_fts USING fts5(firstname, lastname, content='players', content_rowid='id')`);
    db.exec(`CREATE TRIGGER players_ai AFTER INSERT ON players BEGIN INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);
    db.exec(`CREATE TRIGGER players_ad AFTER DELETE ON players BEGIN INSERT INTO players_fts(players_fts,rowid,firstname,lastname) VALUES('delete',old.id,old.firstname,old.lastname); END`);
    db.exec(`CREATE TRIGGER players_au AFTER UPDATE ON players BEGIN INSERT INTO players_fts(players_fts,rowid,firstname,lastname) VALUES('delete',old.id,old.firstname,old.lastname); INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);
    db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT, entity_id INTEGER, action TEXT, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] };
        next();
    });
    
    app.use('/api/player', playerRouter(db, db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 400).json({ error: err.message }));

    return { app, db };
}

describe('player API', () => {
    let app: express.Express;
    let db: DatabaseSync;

    beforeAll(() => {
        ({ app, db } = makeApp());
    });

    it('POST / creates a player', async () => {
        const res = await request(app).post('/api/player').send({ firstname: 'Jan', lastname: 'Kowalski', position: 'Napastnik' });
        expect(res.status).toBe(200);
        expect(res.body.firstname).toBe('Jan');
        expect(res.body.id).toBeDefined();
    });

    it('GET / returns paginated list of players', async () => {
        const res = await request(app).get('/api/player?limit=5&offset=0');
        expect(res.status).toBe(200);
        expect(res.body.data).toBeInstanceOf(Array);
        expect(res.body.total).toBeGreaterThan(0);
    });

    it('GET / supports FTS search', async () => {
        await request(app).post('/api/player').send({ firstname: 'Robert', lastname: 'Lewandowski' });
        const res = await request(app).get('/api/player?q=Robert');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBe(1);
        expect(res.body.data[0].lastname).toBe('Lewandowski');
    });

    it('PUT / updates a player', async () => {
        const create = await request(app).post('/api/player').send({ firstname: 'Piotr', lastname: 'Zieliński' });
        const id = create.body.id;
        const res = await request(app).put('/api/player').send({ id, firstname: 'Piotr', lastname: 'Zieliński', position: 'Pomocnik' });
        expect(res.status).toBe(200);
        expect(res.body.position).toBe('Pomocnik');
    });

    it('GET /:id returns single player', async () => {
        const create = await request(app).post('/api/player').send({ firstname: 'Arkadiusz', lastname: 'Milik' });
        const id = create.body.id;
        
        const res = await request(app).get(`/api/player/${id}`);
        expect(res.status).toBe(200);
        expect(res.body.firstname).toBe('Arkadiusz');
    });

    it('DELETE /:id removes player', async () => {
        const create = await request(app).post('/api/player').send({ firstname: 'Do', lastname: 'Usunięcia' });
        const id = create.body.id;
        const res = await request(app).delete(`/api/player/${id}`);
        expect(res.status).toBe(200);
        
        const check = db.prepare('SELECT id FROM players WHERE id=?').get(id);
        expect(check).toBeUndefined();
    });
});
