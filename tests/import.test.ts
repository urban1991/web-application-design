import { describe, it, expect, beforeAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import { DatabaseSync } from 'node:sqlite';
import { importRouter } from '../src/api/import';

function makeApp() {
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, shortname TEXT NOT NULL, captain_id INTEGER)`);
    db.exec(`CREATE VIRTUAL TABLE teams_fts USING fts5(name, shortname, content='teams', content_rowid='id')`);
    db.exec(`CREATE TRIGGER teams_ai AFTER INSERT ON teams BEGIN INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);
    db.exec(`CREATE TABLE players (id INTEGER PRIMARY KEY AUTOINCREMENT, firstname TEXT NOT NULL, lastname TEXT NOT NULL, position TEXT, team_id INTEGER)`);
    db.exec(`CREATE VIRTUAL TABLE players_fts USING fts5(firstname, lastname, content='players', content_rowid='id')`);
    db.exec(`CREATE TRIGGER players_ai AFTER INSERT ON players BEGIN INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);
    db.exec(`CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, entity TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL, old_value TEXT, new_value TEXT, changed_by INTEGER, changed_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    const app = express();
    app.use(express.json());
    app.use((req: any, _res: any, next: any) => {
        req.isAuthenticated = () => true;
        req.user = { id: 1, username: 'admin', roles: [0] };
        next();
    });
    app.use('/api/import', importRouter(db));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(400).json({ error: err.message }));
    return { app, db };
}

describe('import API', () => {
    let app: express.Express;
    let db: ReturnType<typeof makeApp>['db'];

    beforeAll(() => ({ app, db } = makeApp()));

    it('imports teams from CSV', async () => {
        const csv = 'name,shortname\nDrużyna Alpha,DA\nDrużyna Beta,DB\n';
        const res = await request(app)
            .post('/api/import/teams')
            .attach('file', Buffer.from(csv), { filename: 'teams.csv', contentType: 'text/csv' });
        expect(res.status).toBe(200);
        expect(res.body.inserted).toBe(2);
    });

    it('imports teams from JSON', async () => {
        const json = JSON.stringify([{ name: 'Gamma FC', shortname: 'GFC' }]);
        const res = await request(app)
            .post('/api/import/teams')
            .attach('file', Buffer.from(json), { filename: 'teams.json', contentType: 'application/json' });
        expect(res.status).toBe(200);
        expect(res.body.inserted).toBe(1);
    });

    it('imports players from CSV', async () => {
        const csv = 'firstname,lastname,position\nJan,Kowalski,Napastnik\nAnna,Nowak,Bramkarz\n';
        const res = await request(app)
            .post('/api/import/players')
            .attach('file', Buffer.from(csv), { filename: 'players.csv', contentType: 'text/csv' });
        expect(res.status).toBe(200);
        expect(res.body.inserted).toBe(2);
    });

    it('returns 400 when no file', async () => {
        const res = await request(app).post('/api/import/teams');
        expect(res.status).toBe(400);
    });

    it('skips rows with missing required fields', async () => {
        const csv = 'name,shortname\n,\nValid Team,VT\n';
        const res = await request(app)
            .post('/api/import/teams')
            .attach('file', Buffer.from(csv), { filename: 'teams.csv', contentType: 'text/csv' });
        expect(res.body.inserted).toBe(1);
    });

    it('imports players from JSON', async () => {
        const json = JSON.stringify([
            { firstname: 'Piotr', lastname: 'Zając', position: 'MF' },
            { firstname: 'Maria', lastname: 'Wiśniewska' },
        ]);
        const res = await request(app)
            .post('/api/import/players')
            .attach('file', Buffer.from(json), { filename: 'players.json', contentType: 'application/json' });
        expect(res.status).toBe(200);
        expect(res.body.inserted).toBe(2);
    });

    it('assigns team_id when provided in CSV', async () => {
        const teamRow = db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?) RETURNING id').get('Import FC', 'IFC') as { id: number };
        const csv = `firstname,lastname,team_id\nTestowy,Gracz,${teamRow.id}\n`;
        const res = await request(app)
            .post('/api/import/players')
            .attach('file', Buffer.from(csv), { filename: 'pl.csv', contentType: 'text/csv' });
        expect(res.status).toBe(200);
        const player = db.prepare("SELECT * FROM players WHERE firstname = 'Testowy'").get() as any;
        expect(player.team_id).toBe(teamRow.id);
    });

    it('position is nullable (CSV without position column)', async () => {
        const csv = 'firstname,lastname\nKrzysztof,Wróbel\n';
        const res = await request(app)
            .post('/api/import/players')
            .attach('file', Buffer.from(csv), { filename: 'pl.csv', contentType: 'text/csv' });
        expect(res.status).toBe(200);
        const player = db.prepare("SELECT * FROM players WHERE firstname = 'Krzysztof'").get() as any;
        expect(player.position).toBeNull();
    });

    it('handles bulk import of 50 players from JSON', async () => {
        const players = Array.from({ length: 50 }, (_, i) => ({ firstname: `F${i}`, lastname: `L${i}` }));
        const res = await request(app)
            .post('/api/import/players')
            .attach('file', Buffer.from(JSON.stringify(players)), { filename: 'bulk.json', contentType: 'application/json' });
        expect(res.status).toBe(200);
        expect(res.body.inserted).toBe(50);
    });

    it('returns 400 for invalid JSON payload', async () => {
        const res = await request(app)
            .post('/api/import/teams')
            .attach('file', Buffer.from('{ not valid json }'), { filename: 'bad.json', contentType: 'application/json' });
        expect(res.status).toBe(400);
    });
});
