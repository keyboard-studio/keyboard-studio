import type { LintFinding } from "@keyboard-studio/contracts";
import { stripCommentSource } from "./_shared.js";

// Context statement ordering — lint.md check #11 (Compiler.cpp:1509-1520).
// Rules for the context (LHS before +) of a key rule:
//   1. `nul` must be the first token in context if present.
//   2. if()/platform()/baselayout() must appear before other content tokens.
//   3. No virtual keys [K_X] are allowed in context.

// Matches virtual keys: [K_SOMETHING] (only K_ prefixed names are virtual keys)
const VIRTUAL_KEY_RE = /\[[^\]]*\bK_[A-Za-z0-9_]+[^\]]*\]/g;

// Matches guard/condition tokens: if(...), platform(...), baselayout(...)
// NOTE: GUARD_TOKEN_RE is intentionally NOT used for stripping guard tokens —
// it cannot handle quoted strings containing ')' inside the argument, e.g.
// if(s = "a(b)"). Guard stripping is done by stripGuardTokens() below instead.

// Matches nul keyword as a standalone word
const NUL_RE = /\bnul\b/i;

// Matches a single hex digit — used by extractContext to detect a `U+hhhh`
// codepoint literal's `+` (which is never the context/key separator).
const HEX_DIGIT_RE = /[0-9A-Fa-f]/;

// Matches guard keyword calls: if(...), platform(...), baselayout(...) — shared by
// stripGuardTokens() and the rule-2 scan below. Both manage `.lastIndex` explicitly
// before each exec, so a single hoisted instance is safe to reuse.
const GUARD_KW_RE = /\b(?:if|platform|baselayout)\s*\(/gi;

// Matches content tokens (not guards, not nul):
// dk(...), deadkey(...), context, any(...), index(...), U+XXXX, quoted strings.
// These are searched on the STRIPPED context (guards already blanked out), so
// quoted values inside if("x") have already been removed before this runs.
const CONTENT_TOKEN_RE =
  /(?:\b(?:dk|deadkey|context|any|index)\s*\([^)]*\)|\bU\+[0-9A-Fa-f]{1,6}\b|"[^"]*"|'[^']*')/gi;

/**
 * Scan `str` starting at `start` (which should be positioned just after an
 * opening `(` of ANY parenthesised group — a guard call like `if(...)` or a
 * content call like `dk(...)`/`index(...)`/`any(...)`) and return the index just
 * past the matching `)`, honouring nested parens and double/single-quoted
 * strings. Used by stripGuardTokens (guard groups) and blankParenContents (all
 * groups); not guard-specific despite the historical name.
 */
function scanPastParenArg(str: string, start: number): number {
  let depth = 1;
  let inDouble = false;
  let inSingle = false;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (inDouble || inSingle) continue;
    if (ch === "(") { depth++; continue; }
    if (ch === ")") {
      depth--;
      if (depth === 0) return i + 1; // position after the closing ')'
    }
  }
  return str.length; // unterminated — consume to end
}

/**
 * Replace every guard token (if(...), platform(...), baselayout(...)) in `ctx`
 * with spaces of equal length so character offsets are preserved.  Unlike the
 * former GUARD_TOKEN_RE approach this scanner is quote-aware and correctly
 * handles ')' characters inside quoted store values, e.g. if(s = "a(b)").
 */
function stripGuardTokens(ctx: string): string {
  // We rebuild the result character-by-character using a fresh scan to avoid
  // RegExp-lastIndex complications after mutations.
  const out = ctx.split("");
  let searchFrom = 0;
  while (true) {
    GUARD_KW_RE.lastIndex = searchFrom;
    const kwMatch = GUARD_KW_RE.exec(ctx);
    if (!kwMatch) break;

    const tokenStart = kwMatch.index;
    // kwMatch[0] ends with '(', so the arg starts right after it:
    const argStart = tokenStart + kwMatch[0].length;
    const tokenEnd = scanPastParenArg(ctx, argStart);

    // Blank out the guard token in `out`.
    for (let i = tokenStart; i < tokenEnd; i++) {
      out[i] = " ";
    }

    searchFrom = tokenEnd; // continue scanning after this guard
  }
  return out.join("");
}

/**
 * Blank the CONTENTS of every parenthesised group (dk(...), index(...),
 * any(...), if(...), etc.) with spaces, preserving the parens and surrounding
 * tokens, so a keyword-shaped identifier used as a call ARGUMENT — e.g. a
 * deadkey literally named `nul` in `dk(nul)` — is not mistaken for a standalone
 * `nul` context token. Quote-aware (a ')' inside a quoted argument does not
 * close the group early) and length-preserving (columns stay accurate).
 *
 * The wrapping call token is preserved (only the interior is blanked), so a
 * legitimate content token that precedes a bare `nul` — e.g. `dk(acute) nul` —
 * still registers as "content before nul" for the rule-1 check.
 */
function blankParenContents(ctx: string): string {
  const out = ctx.split("");
  let i = 0;
  while (i < ctx.length) {
    if (ctx[i] === "(") {
      const close = scanPastParenArg(ctx, i + 1); // index just past matching ')'
      for (let j = i + 1; j < close - 1; j++) out[j] = " ";
      i = close;
    } else {
      i++;
    }
  }
  return out.join("");
}

/**
 * Extract the context (LHS before the rule separator `+`) from a rule line.
 * Returns null unless the line is a key rule — i.e. it has BOTH a context/key
 * separator `+` and, after it, an unquoted `>` rule separator. Requiring the
 * `>` confirmation stops a non-rule line with irregular spacing (e.g.
 * `store(x) "a" +"b"`) from being mis-scanned as a rule.
 * Lines starting with `+` have no context (empty LHS).
 */
function extractContext(line: string): { ctx: string; ctxStart: number } | null {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("+")) {
    // No context — output side only, nothing to check.
    return null;
  }

  // Single quote/paren-aware scan that must find, in order:
  //   (a) the context/key separator `+`, then
  //   (b) an unquoted, depth-0 `>` rule separator after it.
  let inDouble = false;
  let inSingle = false;
  let sepIndex = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (inDouble || inSingle) continue;
    if (ch === "(") { i = scanPastParenArg(line, i + 1) - 1; continue; }

    if (sepIndex < 0 && ch === "+") {
      // Any depth-0, unquoted `+` is the context/key separator — whether it is
      // whitespace-, terminator- (`]` `)` `'` `"`), or bareword-preceded (e.g.
      // `nul+[K_A]`). The one exception is a `U+hhhh` codepoint literal, whose
      // `+` follows `U`/`u` and precedes a hex digit; that `+` is never the
      // separator, so a later real `+` (or none) is used instead.
      const prev = line[i - 1];
      const next = line[i + 1];
      const isCodepointPlus =
        (prev === "U" || prev === "u") && next !== undefined && HEX_DIGIT_RE.test(next);
      if (!isCodepointPlus) {
        sepIndex = i;
      }
      continue;
    }

    if (sepIndex >= 0 && ch === ">") {
      // Confirmed rule: separator found and an unquoted `>` follows it.
      // ctxStart records the leading-whitespace width dropped by trim() so the
      // caller can re-offset finding columns back to the original line (an
      // indented rule's context otherwise reports a column shifted left).
      const rawCtx = line.slice(0, sepIndex);
      return { ctx: rawCtx.trim(), ctxStart: rawCtx.length - rawCtx.trimStart().length };
    }
  }
  // No separator, or no `>` after it — not a key rule.
  return null;
}

export function checkContextOrdering(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  // Strip trailing `c` comments before scanning — quote-preserving, unlike
  // stripNonCodeSource, since Rule 2's CONTENT_TOKEN_RE legitimately matches
  // quoted-string content tokens. A comment containing `>`, `+`, `nul`, or
  // `[K_X]` must not contaminate the rule scan (see stripCommentSource docs).
  const lines = stripCommentSource(source).split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const extracted = extractContext(line);
    if (!extracted) continue;
    const { ctx, ctxStart } = extracted;
    if (!ctx) continue;

    // --- Rule 3: no virtual keys [K_X] in context ---
    VIRTUAL_KEY_RE.lastIndex = 0;
    let vkMatch: RegExpExecArray | null;
    while ((vkMatch = VIRTUAL_KEY_RE.exec(ctx)) !== null) {
      findings.push({
        code: "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT",
        severity: "error",
        layer: "A",
        message: `Virtual key "${vkMatch[0]}" is not allowed in the context (LHS) of a rule`,
        location: { file: "", line: lineIdx + 1, column: vkMatch.index + ctxStart + 1 },
      });
    }

    // Remove guard tokens from context for ordering analysis.
    // This prevents quoted string values inside if("x") from being seen as content.
    // stripGuardTokens() is quote-aware so ')' inside quoted values is not confused
    // with the closing paren of the guard call (e.g. if(s = "a(b)")).
    const ctxStripped = stripGuardTokens(ctx);

    // --- Rule 1: nul must be the first token if present ---
    // Strip guard clauses first (stripGuardTokens erases the whole
    // if()/platform()/baselayout() token so a guard preceding `nul` is not
    // "content before nul" — guards are allowed before nul), THEN blank the
    // contents of the remaining parenthesised groups so a keyword-shaped
    // argument (e.g. a deadkey named `nul` in `dk(nul)`) is not mistaken for a
    // standalone `nul`. Both passes are length-preserving, so the match index
    // is the accurate column. A non-guard call wrapper survives blanking, so
    // `dk(acute) nul` still has content before the bare `nul` and correctly
    // reports NUL_NOT_FIRST.
    const ctxForNul = blankParenContents(stripGuardTokens(ctx));
    const nulMatch = NUL_RE.exec(ctxForNul);
    if (nulMatch) {
      const beforeNul = ctxForNul.slice(0, nulMatch.index).trim();
      if (beforeNul.length > 0) {
        findings.push({
          code: "KM_ERROR_NUL_NOT_FIRST",
          severity: "error",
          layer: "A",
          message: `"nul" must be the first token in the context`,
          location: { file: "", line: lineIdx + 1, column: nulMatch.index + ctxStart + 1 },
        });
      }
    }

    // --- Rule 2: guard tokens must appear before content tokens ---
    // Find the last guard end-position in the original ctx.
    // Use the same quote-aware scanner as stripGuardTokens() so ')' inside
    // quoted values does not truncate the measured extent of the guard.
    GUARD_KW_RE.lastIndex = 0;
    let lastGuardEnd = -1;
    let guardKwMatch: RegExpExecArray | null;
    while ((guardKwMatch = GUARD_KW_RE.exec(ctx)) !== null) {
      const argStart = guardKwMatch.index + guardKwMatch[0].length;
      const end = scanPastParenArg(ctx, argStart);
      lastGuardEnd = Math.max(lastGuardEnd, end);
    }

    if (lastGuardEnd >= 0) {
      // Search for content tokens in the STRIPPED context (guards removed).
      // A content token whose position in stripped context is before lastGuardEnd means
      // there was content before the last guard.
      CONTENT_TOKEN_RE.lastIndex = 0;
      let contentMatch: RegExpExecArray | null;
      while ((contentMatch = CONTENT_TOKEN_RE.exec(ctxStripped)) !== null) {
        if (contentMatch.index < lastGuardEnd) {
          findings.push({
            code: "KM_ERROR_GUARD_AFTER_CONTENT",
            severity: "error",
            layer: "A",
            message: `if()/platform()/baselayout() must appear before other content tokens in the context`,
            location: { file: "", line: lineIdx + 1, column: contentMatch.index + ctxStart + 1 },
          });
          break; // one finding per line is sufficient
        }
      }
    }
  }

  return findings;
}
