import path from 'path';
import PDFDocument from 'pdfkit';
import { DatabaseSync } from 'node:sqlite';
import { Response } from 'express';

// pdfkit's built-in Helvetica uses WinAnsi encoding, which mangles Polish
// diacritics (ł, ż, ń, ó, ...). Embed a Unicode TTF that supports them.
const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
const FONT_REGULAR = path.join(FONT_DIR, 'DejaVuSans.ttf');
const FONT_BOLD = path.join(FONT_DIR, 'DejaVuSans-Bold.ttf');

interface TournamentRow {
    id: number;
    name: string;
    sport: string;
    start_date: string;
    end_date: string;
    status: string;
}
interface TeamRow {
    id: number;
    name: string;
    shortname: string;
}
interface MatchRow {
    id: number;
    round: number;
    match_number: number;
    team1_id: number | null;
    team2_id: number | null;
    score1: number | null;
    score2: number | null;
    status: string;
    winner_id: number | null;
}

export function generateTournamentPDF(db: DatabaseSync, tournamentId: number, res: Response): void {
    const tournament = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(tournamentId) as
        | TournamentRow
        | undefined;
    if (!tournament) {
        res.status(404).json({ error: 'Turniej nie znaleziony' });
        return;
    }

    const teams = db
        .prepare(
            `
        SELECT t.* FROM teams t
        JOIN tournament_teams tt ON tt.team_id = t.id
        WHERE tt.tournament_id = ?
        ORDER BY tt.seed
    `
        )
        .all(tournamentId) as unknown as TeamRow[];

    const matches = db
        .prepare('SELECT * FROM matches WHERE tournament_id = ? ORDER BY round, match_number')
        .all(tournamentId) as unknown as MatchRow[];

    const teamMap = new Map(teams.map(t => [t.id, t]));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="turniej-${tournamentId}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.registerFont('Sans', FONT_REGULAR);
    doc.registerFont('Sans-Bold', FONT_BOLD);
    doc.pipe(res);

    // header
    doc.fontSize(20).font('Sans-Bold').text(tournament.name, { align: 'center' });
    doc.fontSize(12).font('Sans').text(`Sport: ${tournament.sport}`, { align: 'center' });
    doc.text(`${tournament.start_date} – ${tournament.end_date}`, { align: 'center' });
    doc.text(`Status: ${tournament.status}`, { align: 'center' });
    doc.moveDown(2);

    // teams
    doc.fontSize(14).font('Sans-Bold').text('Drużyny');
    doc.font('Sans').fontSize(11);
    teams.forEach((t, i) => doc.text(`${i + 1}. ${t.name} (${t.shortname})`));
    doc.moveDown(2);

    // matches
    doc.fontSize(14).font('Sans-Bold').text('Wyniki meczów');
    doc.font('Sans').fontSize(11);
    const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
    for (const round of rounds) {
        const roundMatches = matches.filter(m => m.round === round);
        const totalRounds = Math.max(...matches.map(m => m.round));
        const roundName = round === totalRounds ? 'Finał' : round === totalRounds - 1 ? 'Półfinał' : `Runda ${round}`;
        doc.moveDown(0.5).font('Sans-Bold').text(roundName).font('Sans');
        for (const m of roundMatches) {
            const t1 = m.team1_id ? (teamMap.get(m.team1_id)?.shortname ?? '?') : 'BYE';
            const t2 = m.team2_id ? (teamMap.get(m.team2_id)?.shortname ?? '?') : 'BYE';
            const score = m.status === 'finished' ? `${m.score1}:${m.score2}` : 'vs';
            doc.text(`  ${t1} ${score} ${t2}`);
        }
    }

    doc.end();
}
