// Shared helpers for validator checks — internal to the checks directory.
// Do NOT re-export from packages/engine/src/validator/index.ts.

import type { LintCode, LintFinding } from "@keyboard-studio/contracts";

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

/**
 * Shared deduplication scanner used by checkDuplicateGroups and checkDuplicateStores.
 *
 * Walks `source` line by line, applying `declRe` (must have one capture group: the
 * declared name) and emitting a `LintFinding` for each name seen more than once.
 * Names are compared case-insensitively, matching Keyman's CheckForDuplicates logic.
 *
 * @param source      Raw .kmn source text.
 * @param declRe      Regex that matches a declaration line and captures the name.
 *                    Must begin with `^` so it only fires at the start of a line,
 *                    consistent with CheckForDuplicates.cpp:13-29 / :31-52.
 * @param code        The `LintFinding.code` to emit on a duplicate.
 * @param elementName Human-readable label used in the error message (e.g. "group", "store").
 * @param exemptPrefix  If set, names that start with this string are silently skipped
 *                    (used to exempt system stores like &BITMAP from duplicate checking).
 */
export function checkForDuplicateDeclarations(
  source: string,
  declRe: RegExp,
  code: LintCode,
  elementName: string,
  exemptPrefix?: string,
): LintFinding[] {
  const findings: LintFinding[] = [];
  const seen = new Map<string, number>(); // lowercase name -> first line (1-based)
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const match = declRe.exec(line);
    if (!match) continue;

    const name = (match[1] ?? "").trim();
    if (exemptPrefix !== undefined && name.startsWith(exemptPrefix)) continue;

    const key = name.toLowerCase();
    const firstLine = seen.get(key);

    if (firstLine !== undefined) {
      findings.push({
        code,
        severity: "error",
        layer: "A",
        message: `Duplicate ${elementName} name "${name}" (first declared on line ${firstLine})`,
        location: { file: "", line: lineIdx + 1, column: match.index + 1 },
      });
    } else {
      seen.set(key, lineIdx + 1);
    }
  }

  return findings;
}

// Matches a store declaration body (the quoted string that follows).
// e.g. store(s) "abc" — captures "abc" (3 chars = length 3).
// Also handles single-quoted bodies: store(s) 'abc'
// Note: does not handle escaped quotes in body strings (e.g. "ab\"cd")
const STORE_BODY_RE = /^\s*store\s*\([^)]+\)\s*(?:"([^"]*)"|'([^']*)')/i;

/**
 * Shared line-by-line, global-regex iteration used by checkDeprecatedStores,
 * checkIdentifiers, checkCodepointFormat, and checkIfStoreResolution.
 *
 * Splits `source` into lines, and for each line clones `regex` (preserving its
 * flags, forcing the global flag on) so `RegExp.exec`'s per-call `lastIndex`
 * state never leaks across lines, then repeatedly execs it against the line,
 * invoking `cb` with each match and the 0-based line index.
 *
 * @param source  Raw .kmn source text.
 * @param regex   Pattern to match; flags (e.g. case-insensitivity) are preserved.
 * @param cb      Called once per match with the match array and 0-based line index.
 */
export function forEachMatch(
  source: string,
  regex: RegExp,
  cb: (match: RegExpExecArray, lineIdx: number) => void,
): void {
  const lines = source.split("\n");
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const re = new RegExp(regex.source, flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      cb(match, lineIdx);
      // Guard against a zero-width match (e.g. a lookahead-only regex) leaving
      // lastIndex unadvanced, which would spin the loop forever.
      if (match.index === re.lastIndex) re.lastIndex++;
    }
  }
}

/**
 * Whether the character at `line[i]` begins a standalone, unquoted `c`/`C`
 * line comment: the token is `c` or `C`, preceded by line-start or whitespace,
 * and followed by end-of-line or whitespace. This is only the boundary test —
 * callers remain responsible for tracking quote state (which differs between
 * {@link stripNonCode} and {@link stripComment}) before calling this.
 */
function isCommentStart(line: string, i: number): boolean {
  const ch = line[i];
  return (
    (ch === "c" || ch === "C") &&
    (i === 0 || /\s/.test(line[i - 1] ?? "")) &&
    (i === line.length - 1 || /\s/.test(line[i + 1] ?? ""))
  );
}

/**
 * Blank a standalone, unquoted `c ...` line comment in `line` to end of line,
 * length-preserving. A KMN `c` comment starts at a standalone, unquoted
 * `c`/`C` token (at line start or preceded by whitespace, and followed by
 * whitespace or end of line) and runs to end of line, mirroring the kmcmplib
 * lexer. Unlike {@link stripNonCode}, this does NOT blank quoted-string
 * contents — callers that still need quoted content as tokens (e.g.
 * contextOrdering's CONTENT_TOKEN_RE, which matches `"..."`/`'...'`) can strip
 * only the comment and keep quotes intact.
 */
export function stripComment(line: string): string {
  const out = line.split("");
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inSingle) { if (ch === "'") inSingle = false; continue; }
    if (inDouble) { if (ch === '"') inDouble = false; continue; }
    if (ch === "'") { inSingle = true; continue; }
    if (ch === '"') { inDouble = true; continue; }
    if (isCommentStart(line, i)) {
      for (let j = i; j < line.length; j++) out[j] = " ";
      break;
    }
  }
  return out.join("");
}

/** Apply {@link stripComment} to every line of `source` (length-preserving). */
export function stripCommentSource(source: string): string {
  return source.split("\n").map(stripComment).join("\n");
}

/**
 * Blank the "non-code" spans of a single KMN source line — the contents of
 * quoted string literals (`'...'` / `"..."`) and any `c ...` line comment —
 * replacing them with spaces so a downstream regex scan never mistakes a
 * keyword-shaped substring sitting in prose for live syntax (e.g. `U+110000`,
 * `dk(...)`, `&language`, `if(...)`, `index(...)` appearing inside a comment or
 * a quoted value). Length-preserving: every character keeps its column, so
 * match offsets — and therefore reported columns — stay accurate.
 *
 * This intentionally does NOT blank bracket/paren contents — the checks that
 * consume it legitimately match code inside `[...]` and `(...)`.
 */
export function stripNonCode(line: string): string {
  const out = line.split("");
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inSingle) { out[i] = " "; if (ch === "'") inSingle = false; continue; }
    if (inDouble) { out[i] = " "; if (ch === '"') inDouble = false; continue; }
    if (ch === "'") { inSingle = true; out[i] = " "; continue; }
    if (ch === '"') { inDouble = true; out[i] = " "; continue; }
    if (isCommentStart(line, i)) {
      for (let j = i; j < line.length; j++) out[j] = " ";
      break;
    }
  }
  return out.join("");
}

/** Apply {@link stripNonCode} to every line of `source` (length-preserving). */
export function stripNonCodeSource(source: string): string {
  return source.split("\n").map(stripNonCode).join("\n");
}

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
