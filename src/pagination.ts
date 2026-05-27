// Parse and clamp pagination params from a query object. Non-numeric values
// fall back to defaults; negative/oversized values are clamped. This prevents
// `?limit=-1` (which SQLite treats as "no limit" → full-table dump) and
// `?limit=abc` (NaN bound into SQL → datatype error).
export function parsePageParams(
    query: Record<string, unknown>,
    opts: { defaultLimit?: number; maxLimit?: number } = {}
): { limit: number; offset: number } {
    const defaultLimit = opts.defaultLimit ?? 10;
    const maxLimit = opts.maxLimit ?? 200;
    const rawLimit = parseInt(String(query.limit ?? ''), 10);
    const rawOffset = parseInt(String(query.offset ?? ''), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), maxLimit) : defaultLimit;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;
    return { limit, offset };
}
