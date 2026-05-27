import { vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import type { Database } from 'better-sqlite3';

vi.mock('node:sqlite', () => ({
    DatabaseSync: BetterSqlite3,
}));

export function createAppDb(): Database {
    const db = new BetterSqlite3(':memory:');
    db.exec('PRAGMA foreign_keys = ON');

    db.exec(`CREATE TABLE tournaments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sport TEXT NOT NULL,
        start_date DATE,
        end_date DATE,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by INTEGER
    )`);
    db.exec(`CREATE VIRTUAL TABLE tournaments_fts USING fts5(name, sport, content='tournaments', content_rowid='id')`);
    db.exec(`CREATE TRIGGER tournaments_ai AFTER INSERT ON tournaments BEGIN INSERT INTO tournaments_fts(rowid,name,sport) VALUES(new.id,new.name,new.sport); END`);
    db.exec(`CREATE TRIGGER tournaments_ad AFTER DELETE ON tournaments BEGIN INSERT INTO tournaments_fts(tournaments_fts,rowid,name,sport) VALUES('delete',old.id,old.name,old.sport); END`);
    db.exec(`CREATE TRIGGER tournaments_au AFTER UPDATE ON tournaments BEGIN INSERT INTO tournaments_fts(tournaments_fts,rowid,name,sport) VALUES('delete',old.id,old.name,old.sport); INSERT INTO tournaments_fts(rowid,name,sport) VALUES(new.id,new.name,new.sport); END`);

    db.exec(`CREATE TABLE teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        shortname TEXT NOT NULL,
        captain_id INTEGER
    )`);
    db.exec(`CREATE VIRTUAL TABLE teams_fts USING fts5(name, shortname, content='teams', content_rowid='id')`);
    db.exec(`CREATE TRIGGER teams_ai AFTER INSERT ON teams BEGIN INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);
    db.exec(`CREATE TRIGGER teams_ad AFTER DELETE ON teams BEGIN INSERT INTO teams_fts(teams_fts,rowid,name,shortname) VALUES('delete',old.id,old.name,old.shortname); END`);
    db.exec(`CREATE TRIGGER teams_au AFTER UPDATE ON teams BEGIN INSERT INTO teams_fts(teams_fts,rowid,name,shortname) VALUES('delete',old.id,old.name,old.shortname); INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);

    db.exec(`CREATE TABLE players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        firstname TEXT NOT NULL,
        lastname TEXT NOT NULL,
        position TEXT,
        team_id INTEGER,
        FOREIGN KEY (team_id) REFERENCES teams(id)
    )`);
    db.exec(`CREATE VIRTUAL TABLE players_fts USING fts5(firstname, lastname, content='players', content_rowid='id')`);
    db.exec(`CREATE TRIGGER players_ai AFTER INSERT ON players BEGIN INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);
    db.exec(`CREATE TRIGGER players_ad AFTER DELETE ON players BEGIN INSERT INTO players_fts(players_fts,rowid,firstname,lastname) VALUES('delete',old.id,old.firstname,old.lastname); END`);
    db.exec(`CREATE TRIGGER players_au AFTER UPDATE ON players BEGIN INSERT INTO players_fts(players_fts,rowid,firstname,lastname) VALUES('delete',old.id,old.firstname,old.lastname); INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);

    db.exec(`CREATE TABLE tournament_teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        team_id INTEGER NOT NULL,
        seed INTEGER,
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
        FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
        UNIQUE(tournament_id, team_id)
    )`);

    db.exec(`CREATE TABLE matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tournament_id INTEGER NOT NULL,
        round INTEGER NOT NULL,
        match_number INTEGER NOT NULL,
        team1_id INTEGER,
        team2_id INTEGER,
        score1 INTEGER,
        score2 INTEGER,
        scheduled_at DATETIME,
        status TEXT NOT NULL DEFAULT 'scheduled',
        winner_id INTEGER,
        next_match_id INTEGER,
        FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
        FOREIGN KEY (team1_id) REFERENCES teams(id),
        FOREIGN KEY (team2_id) REFERENCES teams(id),
        FOREIGN KEY (winner_id) REFERENCES teams(id),
        FOREIGN KEY (next_match_id) REFERENCES matches(id)
    )`);

    db.exec(`CREATE TABLE audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by INTEGER,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return db;
}
