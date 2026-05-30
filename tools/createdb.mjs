import { DatabaseSync } from 'node:sqlite';
import { fakerPL as faker } from '@faker-js/faker';

const config = {
    dbfilename: './data/app.sqlite3',
    FAKE_TEAMS: 40,
    FAKE_PLAYERS_PER_TEAM: 6,
    FAKE_TOURNAMENTS: 12,
};

console.log('createdb — tournament management');

const connection = new DatabaseSync(config.dbfilename);
const { user_version } = connection.prepare('PRAGMA user_version;').get();

if (!user_version) {
    connection.exec('PRAGMA user_version = 1;');
    connection.exec('PRAGMA foreign_keys = ON');

    // --- tournaments ---
    connection.exec(`
        CREATE TABLE tournaments (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            sport       TEXT NOT NULL,
            start_date  DATE,
            end_date    DATE,
            status      TEXT NOT NULL DEFAULT 'draft',
            created_by  INTEGER
        )
    `);
    connection.exec(`CREATE VIRTUAL TABLE tournaments_fts USING fts5(name, sport, content='tournaments', content_rowid='id')`);
    connection.exec(`CREATE TRIGGER tournaments_ai AFTER INSERT ON tournaments BEGIN INSERT INTO tournaments_fts(rowid,name,sport) VALUES(new.id,new.name,new.sport); END`);
    connection.exec(`CREATE TRIGGER tournaments_ad AFTER DELETE ON tournaments BEGIN INSERT INTO tournaments_fts(tournaments_fts,rowid,name,sport) VALUES('delete',old.id,old.name,old.sport); END`);
    connection.exec(`CREATE TRIGGER tournaments_au AFTER UPDATE ON tournaments BEGIN INSERT INTO tournaments_fts(tournaments_fts,rowid,name,sport) VALUES('delete',old.id,old.name,old.sport); INSERT INTO tournaments_fts(rowid,name,sport) VALUES(new.id,new.name,new.sport); END`);

    // --- teams ---
    connection.exec(`
        CREATE TABLE teams (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            shortname   TEXT NOT NULL,
            captain_id  INTEGER
        )
    `);
    connection.exec(`CREATE VIRTUAL TABLE teams_fts USING fts5(name, shortname, content='teams', content_rowid='id')`);
    connection.exec(`CREATE TRIGGER teams_ai AFTER INSERT ON teams BEGIN INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);
    connection.exec(`CREATE TRIGGER teams_ad AFTER DELETE ON teams BEGIN INSERT INTO teams_fts(teams_fts,rowid,name,shortname) VALUES('delete',old.id,old.name,old.shortname); END`);
    connection.exec(`CREATE TRIGGER teams_au AFTER UPDATE ON teams BEGIN INSERT INTO teams_fts(teams_fts,rowid,name,shortname) VALUES('delete',old.id,old.name,old.shortname); INSERT INTO teams_fts(rowid,name,shortname) VALUES(new.id,new.name,new.shortname); END`);

    // --- players ---
    connection.exec(`
        CREATE TABLE players (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            firstname   TEXT NOT NULL,
            lastname    TEXT NOT NULL,
            position    TEXT,
            team_id     INTEGER,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
        )
    `);
    connection.exec(`CREATE VIRTUAL TABLE players_fts USING fts5(firstname, lastname, content='players', content_rowid='id')`);
    connection.exec(`CREATE TRIGGER players_ai AFTER INSERT ON players BEGIN INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);
    connection.exec(`CREATE TRIGGER players_ad AFTER DELETE ON players BEGIN INSERT INTO players_fts(players_fts,rowid,firstname,lastname) VALUES('delete',old.id,old.firstname,old.lastname); END`);
    connection.exec(`CREATE TRIGGER players_au AFTER UPDATE ON players BEGIN INSERT INTO players_fts(players_fts,rowid,firstname,lastname) VALUES('delete',old.id,old.firstname,old.lastname); INSERT INTO players_fts(rowid,firstname,lastname) VALUES(new.id,new.firstname,new.lastname); END`);

    // --- tournament_teams ---
    connection.exec(`
        CREATE TABLE tournament_teams (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id   INTEGER NOT NULL,
            team_id         INTEGER NOT NULL,
            seed            INTEGER,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
            UNIQUE(tournament_id, team_id)
        )
    `);

    // --- matches ---
    connection.exec(`
        CREATE TABLE matches (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id   INTEGER NOT NULL,
            round           INTEGER NOT NULL,
            match_number    INTEGER NOT NULL,
            team1_id        INTEGER,
            team2_id        INTEGER,
            score1          INTEGER,
            score2          INTEGER,
            scheduled_at    DATETIME,
            status          TEXT NOT NULL DEFAULT 'scheduled',
            winner_id       INTEGER,
            next_match_id   INTEGER,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (team1_id) REFERENCES teams(id),
            FOREIGN KEY (team2_id) REFERENCES teams(id),
            FOREIGN KEY (winner_id) REFERENCES teams(id),
            FOREIGN KEY (next_match_id) REFERENCES matches(id)
        )
    `);

    // --- audit_log ---
    connection.exec(`
        CREATE TABLE audit_log (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            entity      TEXT NOT NULL,
            entity_id   INTEGER NOT NULL,
            action      TEXT NOT NULL,
            old_value   TEXT,
            new_value   TEXT,
            changed_by  INTEGER,
            changed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // --- seed data ---
    const sports = ['Piłka nożna', 'Koszykówka', 'Siatkówka', 'Tenis stołowy'];
    const positions = ['Napastnik', 'Pomocnik', 'Obrońca', 'Bramkarz', 'Rozgrywający'];
    const insertTeam = connection.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?) RETURNING *');
    const insertPlayer = connection.prepare('INSERT INTO players (firstname, lastname, position, team_id) VALUES (?, ?, ?, ?)');
    const insertTournament = connection.prepare('INSERT INTO tournaments (name, sport, start_date, end_date, status) VALUES (?, ?, ?, ?, ?) RETURNING *');
    const insertTT = connection.prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?, ?, ?)');

    const teamIds = [];
    console.log(`* generowanie ${config.FAKE_TEAMS} drużyn...`);
    for (let i = 0; i < config.FAKE_TEAMS; i++) {
        const name = faker.company.name();
        const shortname = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 5);
        const team = insertTeam.get(name, shortname);
        teamIds.push(team.id);
        for (let j = 0; j < config.FAKE_PLAYERS_PER_TEAM; j++) {
            insertPlayer.run(faker.person.firstName(), faker.person.lastName(), positions[j % positions.length], team.id);
        }
    }

    console.log(`* generowanie ${config.FAKE_TOURNAMENTS} turniejów...`);
    for (let i = 0; i < config.FAKE_TOURNAMENTS; i++) {
        const sport = sports[i % sports.length];
        const start = faker.date.soon({ days: 30 }).toISOString().split('T')[0];
        const end = faker.date.soon({ days: 60, refDate: new Date(start) }).toISOString().split('T')[0];
        const statuses = ['active', 'draft', 'draft', 'finished'];
        const t = insertTournament.get(`Turniej ${sport} 2026`, sport, start, end, statuses[i % statuses.length]);
        const slice = teamIds.slice(i * 4, i * 4 + 8);
        slice.forEach((tid, idx) => insertTT.run(t.id, tid, idx + 1));
    }

    console.log('* baza stworzona');
} else {
    console.log('* baza już istnieje');
}
