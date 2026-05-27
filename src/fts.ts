// Sanitize user-supplied query before passing to FTS5 MATCH.
// FTS5 has its own grammar (operators AND/OR/NOT/NEAR, quoting with ",
// columns with :, prefix *, parentheses, ^). Raw user input containing
// any of these can either crash SQLite or alter the search semantics.
//
// Strategy:
//   1. Strip FTS5 control characters: " * : ^ ( )
//   2. Remove the reserved-word operators (case-insensitive) AND, OR, NOT, NEAR.
//   3. Tokenize on whitespace.
//   4. Wrap remaining tokens in double quotes for a literal phrase match,
//      then append `*` for prefix matching (preserving the prior behavior).
//   5. Return null if nothing meaningful remains, so callers can short-circuit.
export function sanitizeFtsQuery(q: string): string | null {
    if (!q) return null;
    let cleaned = q.replace(/["*:^()]/g, ' ');
    // Strip FTS5 operator keywords as whole words (case-insensitive)
    cleaned = cleaned.replace(/\b(AND|OR|NOT|NEAR)\b/gi, ' ');
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    // Each token becomes a quoted prefix term; join with implicit AND (space).
    return tokens.map(t => `"${t.replace(/"/g, '')}"*`).join(' ');
}
