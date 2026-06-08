// Shared helpers for validator checks — internal to the checks directory.
// Do NOT re-export from packages/engine/src/validator/index.ts.

// Forbidden characters per validation.cpp:79-127:
// space, comma, parens, square brackets, C0 controls (U+0000-U+001F), DEL (U+007F),
// Unicode non-characters (U+FDD0-U+FDEF, U+FFFE, U+FFFF)
export const INVALID_CHAR_RE = new RegExp(
  "[ ,()\\[\\]\\x00-\\x1F\\x7F\\uFDD0-\\uFDEF\\uFFFE\\uFFFF]"
);

export interface StoreInfo {
  line: number;   // 1-based declaration line
  length: number | null;  // character length if determinable, else null
}

// Matches a store declaration: store(name)
export const STORE_DECL_RE = /^\s*store\s*\(\s*([^)]+?)\s*\)/i;

// Matches a store declaration body (the quoted string that follows).
// e.g. store(s) "abc" — captures "abc" (3 chars = length 3).
// Also handles single-quoted bodies: store(s) 'abc'
// Note: does not handle escaped quotes in body strings (e.g. "ab\"cd")
const STORE_BODY_RE = /^\s*store\s*\([^)]+\)\s*(?:"([^"]*)"|'([^']*)')/i;

export function collectDeclaredStores(source: string): Map<string, StoreInfo> {
  const stores = new Map<string, StoreInfo>();
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const declMatch = STORE_DECL_RE.exec(line);
    if (!declMatch) continue;
    const name = (declMatch[1] ?? "").trim();
    if (name.startsWith("&")) continue;
    const key = name.toLowerCase();
    if (stores.has(key)) continue; // first declaration wins

    const bodyMatch = STORE_BODY_RE.exec(line);
    // Group 1 = double-quoted body, group 2 = single-quoted body.
    const bodyStr = bodyMatch ? (bodyMatch[1] ?? bodyMatch[2] ?? null) : null;
    const length = bodyStr !== null ? bodyStr.length : null;
    stores.set(key, { line: i + 1, length });
  }
  return stores;
}
