import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;
let fromAddress: string = 'PAW Tournament <noreply@paw.local>';

const HTML_ESCAPE_MAP: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
};

export function escapeHtml(s: unknown): string {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => HTML_ESCAPE_MAP[c]!);
}

export function initEmail(config: { host: string; port: number; user: string; pass: string; from: string }): void {
    transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        auth: { user: config.user, pass: config.pass },
    });
    if (config.from) fromAddress = config.from;
}

// Per-recipient rate limiting to mitigate amplification from request handlers
// (e.g. generate-bracket fan-out, register-team spam). Suppress duplicate
// sends to the same address within RATE_LIMIT_MS.
const RATE_LIMIT_MS = 60 * 1000;
const lastSentAt = new Map<string, number>();

function shouldRateLimit(to: string): boolean {
    const now = Date.now();
    const prev = lastSentAt.get(to);
    if (prev !== undefined && now - prev < RATE_LIMIT_MS) return true;
    lastSentAt.set(to, now);
    // opportunistic cleanup to avoid unbounded growth
    if (lastSentAt.size > 10000) {
        for (const [k, v] of lastSentAt) {
            if (now - v > RATE_LIMIT_MS * 10) lastSentAt.delete(k);
        }
    }
    return false;
}

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!transporter) return; // email disabled if not configured
    if (shouldRateLimit(to)) {
        console.warn(`Email do ${to} pominięty (rate limit)`);
        return;
    }
    try {
        await transporter.sendMail({ from: fromAddress, to, subject, html });
    } catch (err) {
        console.error('Email send error:', err);
    }
}
