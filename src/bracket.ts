import { DatabaseSync } from 'node:sqlite';

export interface MatchRow {
    tournament_id: number;
    round: number;
    match_number: number;
    team1_id: number | null;
    team2_id: number | null;
}

function nextPow2(n: number): number {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

export function generateBracket(db: DatabaseSync, tournamentId: number): void {
    // get seeded teams
    const teams = db
        .prepare('SELECT team_id FROM tournament_teams WHERE tournament_id = ? ORDER BY seed ASC')
        .all(tournamentId) as { team_id: number }[];

    if (teams.length < 2) throw new Error('Turniej wymaga co najmniej 2 drużyn');

    const teamIds = teams.map(t => t.team_id);
    const totalSlots = nextPow2(teamIds.length);
    const totalRounds = Math.log2(totalSlots);

    // pad with null (BYE)
    const slots: (number | null)[] = [...teamIds];
    while (slots.length < totalSlots) slots.push(null);

    const insertMatch = db.prepare(`
        INSERT INTO matches (tournament_id, round, match_number, team1_id, team2_id, status)
        VALUES (?, ?, ?, ?, ?, 'scheduled') RETURNING id
    `);

    // round 1 — pair sequentially: 1 vs last, 2 vs 2nd-to-last
    const round1Ids: number[] = [];
    const half = totalSlots / 2;
    for (let i = 0; i < half; i++) {
        const t1 = slots[i];
        const t2 = slots[totalSlots - 1 - i];
        const row = insertMatch.get(tournamentId, 1, i + 1, t1, t2) as { id: number };
        round1Ids.push(row.id);

        // if one side is BYE, set winner immediately
        if (t1 === null || t2 === null) {
            const winner = t1 ?? t2;
            db.prepare('UPDATE matches SET winner_id = ?, status = ? WHERE id = ?').run(winner, 'finished', row.id);
        }
    }

    // higher rounds (empty placeholders)
    let prevIds = round1Ids;
    for (let round = 2; round <= totalRounds; round++) {
        const count = prevIds.length / 2;
        const currentIds: number[] = [];
        for (let i = 0; i < count; i++) {
            const row = insertMatch.get(tournamentId, round, i + 1, null, null) as { id: number };
            currentIds.push(row.id);
        }
        // link next_match_id for previous round
        for (let i = 0; i < prevIds.length; i++) {
            const nextId = currentIds[Math.floor(i / 2)];
            db.prepare('UPDATE matches SET next_match_id = ? WHERE id = ?').run(nextId, prevIds[i]);
        }
        // auto-advance BYE winners
        for (let i = 0; i < prevIds.length; i += 2) {
            const m1 = db.prepare('SELECT winner_id FROM matches WHERE id = ?').get(prevIds[i]) as
                | { winner_id: number | null }
                | undefined;
            const m2 = db.prepare('SELECT winner_id FROM matches WHERE id = ?').get(prevIds[i + 1]) as
                | { winner_id: number | null }
                | undefined;
            const nextId = currentIds[Math.floor(i / 2)];
            if (m1?.winner_id) {
                const col = 'team1_id';
                db.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).run(m1.winner_id, nextId);
            }
            if (m2?.winner_id) {
                db.prepare('UPDATE matches SET team2_id = ? WHERE id = ?').run(m2.winner_id, nextId);
            }
        }
        prevIds = currentIds;
    }
}

export function advanceWinner(db: DatabaseSync, matchId: number, winnerId: number): void {
    const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as
        | {
              next_match_id: number | null;
              tournament_id: number;
              round: number;
              match_number: number;
          }
        | undefined;

    if (!match?.next_match_id) return;

    // find which slot to fill (team1 or team2) based on match_number parity
    const slot = match.match_number % 2 === 1 ? 'team1_id' : 'team2_id';
    db.prepare(`UPDATE matches SET ${slot} = ? WHERE id = ?`).run(winnerId, match.next_match_id);
}
