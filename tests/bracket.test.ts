import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { generateBracket, advanceWinner } from '../src/bracket';

function makeDb(): DatabaseSync {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec(`CREATE TABLE teams (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, shortname TEXT)`);
    db.exec(`
        CREATE TABLE tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT, sport TEXT, status TEXT DEFAULT 'draft'
        )
    `);
    db.exec(`
        CREATE TABLE tournament_teams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER, team_id INTEGER, seed INTEGER
        )
    `);
    db.exec(`
        CREATE TABLE matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER, round INTEGER, match_number INTEGER,
            team1_id INTEGER, team2_id INTEGER,
            score1 INTEGER, score2 INTEGER, scheduled_at TEXT,
            status TEXT DEFAULT 'scheduled', winner_id INTEGER, next_match_id INTEGER
        )
    `);
    return db;
}

function seedTeams(db: DatabaseSync, n: number): number[] {
    const insert = db.prepare('INSERT INTO teams (name, shortname) VALUES (?, ?) RETURNING id');
    return Array.from({ length: n }, (_, i) => (insert.get(`Team ${i + 1}`, `T${i + 1}`) as { id: number }).id);
}

function registerTeams(db: DatabaseSync, tournamentId: number, teamIds: number[]): void {
    const ins = db.prepare('INSERT INTO tournament_teams (tournament_id, team_id, seed) VALUES (?, ?, ?)');
    teamIds.forEach((id, i) => ins.run(tournamentId, id, i + 1));
}

describe('bracket generation', () => {
    let db: DatabaseSync;
    let tournamentId: number;

    beforeEach(() => {
        db = makeDb();
        const t = db.prepare('INSERT INTO tournaments (name, sport) VALUES (?, ?) RETURNING id').get('Test', 'Piłka') as { id: number };
        tournamentId = t.id;
    });

    afterEach(() => db.close());

    it('generates correct number of matches for 8 teams (3 rounds)', () => {
        const ids = seedTeams(db, 8);
        registerTeams(db, tournamentId, ids);
        generateBracket(db, tournamentId);

        const matches = db.prepare('SELECT * FROM matches WHERE tournament_id = ?').all(tournamentId) as { round: number }[];
        // 8 teams: R1=4, R2=2, R3=1 => 7 total
        expect(matches.length).toBe(7);
        const r1 = matches.filter(m => m.round === 1).length;
        const r2 = matches.filter(m => m.round === 2).length;
        const r3 = matches.filter(m => m.round === 3).length;
        expect(r1).toBe(4);
        expect(r2).toBe(2);
        expect(r3).toBe(1);
    });

    it('pads to next power of 2 for 6 teams (uses 8 slots with 2 BYE)', () => {
        const ids = seedTeams(db, 6);
        registerTeams(db, tournamentId, ids);
        generateBracket(db, tournamentId);

        const matches = db.prepare('SELECT * FROM matches WHERE tournament_id = ?').all(tournamentId) as { round: number }[];
        expect(matches.length).toBe(7); // still 7 matches (2 BYEs auto-finish)
    });

    it('auto-finishes BYE matches and advances winner', () => {
        const ids = seedTeams(db, 6);
        registerTeams(db, tournamentId, ids);
        generateBracket(db, tournamentId);

        const byeMatches = db.prepare(
            "SELECT * FROM matches WHERE tournament_id = ? AND status = 'finished'"
        ).all(tournamentId) as { winner_id: number }[];
        expect(byeMatches.length).toBeGreaterThan(0);
        byeMatches.forEach(m => expect(m.winner_id).not.toBeNull());
    });

    it('links next_match_id for round 1 matches', () => {
        const ids = seedTeams(db, 4);
        registerTeams(db, tournamentId, ids);
        generateBracket(db, tournamentId);

        const r1 = db.prepare(
            'SELECT * FROM matches WHERE tournament_id = ? AND round = 1'
        ).all(tournamentId) as { next_match_id: number | null }[];
        r1.forEach(m => expect(m.next_match_id).not.toBeNull());
    });

    it('throws when fewer than 2 teams', () => {
        const ids = seedTeams(db, 1);
        registerTeams(db, tournamentId, ids);
        expect(() => generateBracket(db, tournamentId)).toThrow('co najmniej 2');
    });
});

describe('advanceWinner', () => {
    let db: DatabaseSync;
    let tournamentId: number;

    beforeEach(() => {
        db = makeDb();
        const t = db.prepare('INSERT INTO tournaments (name, sport) VALUES (?, ?) RETURNING id').get('Test', 'Piłka') as { id: number };
        tournamentId = t.id;
        const ids = seedTeams(db, 4);
        registerTeams(db, tournamentId, ids);
        generateBracket(db, tournamentId);
    });

    afterEach(() => db.close());

    it('places winner in correct slot of next match', () => {
        const r1 = db.prepare(
            'SELECT * FROM matches WHERE tournament_id = ? AND round = 1 ORDER BY match_number'
        ).all(tournamentId) as { id: number; next_match_id: number; team1_id: number; match_number: number }[];

        const match = r1[0];
        advanceWinner(db, match.id, match.team1_id);

        const nextMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.next_match_id) as { team1_id: number | null; team2_id: number | null };
        // match_number=1 (odd) → team1_id slot
        expect(nextMatch.team1_id).toBe(match.team1_id);
    });

    it('places winner in team2_id slot for even match_number', () => {
        const r1 = db.prepare(
            'SELECT * FROM matches WHERE tournament_id = ? AND round = 1 ORDER BY match_number'
        ).all(tournamentId) as { id: number; next_match_id: number; team1_id: number; match_number: number }[];

        const match = r1[1]; // match_number=2 (even)
        advanceWinner(db, match.id, match.team1_id);

        const nextMatch = db.prepare('SELECT * FROM matches WHERE id = ?').get(match.next_match_id) as { team1_id: number | null; team2_id: number | null };
        expect(nextMatch.team2_id).toBe(match.team1_id);
    });

    it('does nothing for a match without next_match_id (final)', () => {
        const finalMatch = db.prepare(
            'SELECT * FROM matches WHERE tournament_id = ? ORDER BY round DESC LIMIT 1'
        ).get(tournamentId) as { id: number; next_match_id: number | null; team1_id: number };

        expect(finalMatch.next_match_id).toBeNull();
        expect(() => advanceWinner(db, finalMatch.id, finalMatch.team1_id)).not.toThrow();
    });

    it('both round-1 winners correctly fill the final', () => {
        const r1 = db.prepare(
            'SELECT * FROM matches WHERE tournament_id = ? AND round = 1 ORDER BY match_number'
        ).all(tournamentId) as { id: number; next_match_id: number; team1_id: number; match_number: number }[];

        const w1 = r1[0].team1_id;
        const w2 = r1[1].team1_id;
        advanceWinner(db, r1[0].id, w1);
        advanceWinner(db, r1[1].id, w2);

        const final = db.prepare(
            'SELECT * FROM matches WHERE tournament_id = ? AND round = 2'
        ).get(tournamentId) as { team1_id: number | null; team2_id: number | null };
        expect(final.team1_id).toBe(w1);
        expect(final.team2_id).toBe(w2);
    });
});
