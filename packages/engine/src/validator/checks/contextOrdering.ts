import type { LintFinding } from "@keyboard-studio/contracts";

// Context statement ordering — lint.md check #11 (Compiler.cpp:1509-1520).
// Rules for the context (LHS before +) of a key rule:
//   1. `nul` must be the first token in context if present.
//   2. if()/platform()/baselayout() must appear before other content tokens.
//   3. No virtual keys [K_X] are allowed in context.

// Matches virtual keys: [K_SOMETHING] (only K_ prefixed names are virtual keys)
const VIRTUAL_KEY_RE = /\[[^\]]*\bK_[A-Za-z0-9_]+[^\]]*\]/;

// Matches guard/condition tokens: if(...), platform(...), baselayout(...)
// NOTE: GUARD_TOKEN_RE is intentionally NOT used for stripping guard tokens —
// it cannot handle quoted strings containing ')' inside the argument, e.g.
// if(s = "a(b)"). Guard stripping is done by stripGuardTokens() below instead.

// Matches nul keyword as a standalone word
const NUL_RE = /\bnul\b/i;

// Matches content tokens (not guards, not nul):
// dk(...), deadkey(...), context, any(...), index(...), U+XXXX, quoted strings.
// These are searched on the STRIPPED context (guards already blanked out), so
// quoted values inside if("x") have already been removed before this runs.
const CONTENT_TOKEN_RE =
  /(?:\b(?:dk|deadkey|context|any|index)\s*\([^)]*\)|\bU\+[0-9A-Fa-f]{1,6}\b|"[^"]*"|'[^']*')/gi;

/**
 * Scan `str` starting at `start` (which should be positioned just after the
 * opening `(` of a guard call) and return the index just past the matching `)`,
 * honouring nested parens and double/single-quoted strings.
 */
function scanPastGuardArg(str: string, start: number): number {
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
  const GUARD_KW_RE = /\b(if|platform|baselayout)\s*\(/gi;
  let result = ctx;
  let offset = 0; // accumulated shift if we ever change string length (we don't)

  // We rebuild result character-by-character using a fresh scan to avoid
  // RegExp-lastIndex complications after mutations.
  const out = ctx.split("");
  let searchFrom = 0;
  while (true) {
    GUARD_KW_RE.lastIndex = searchFrom;
    const kwMatch = GUARD_KW_RE.exec(result);
    if (!kwMatch) break;

    const tokenStart = kwMatch.index;
    // kwMatch[0] ends with '(', so the arg starts right after it:
    const argStart = tokenStart + kwMatch[0].length;
    const tokenEnd = scanPastGuardArg(result, argStart);

    // Blank out the guard token in `out`.
    for (let i = tokenStart; i < tokenEnd; i++) {
      out[i] = " ";
    }

    searchFrom = tokenEnd; // continue scanning after this guard
  }
  return out.join("");
}

/**
 * Extract the context (LHS before the rule separator `+`) from a rule line.
 * Returns null if the line does not look like a key rule (no `+` separator).
 * Lines starting with `+` have no context (empty LHS).
 */
function extractContext(line: string): { ctx: string; ctxStart: number } | null {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("+")) {
    // No context — output side only, nothing to check.
    return null;
  }

  // Scan for the first ` + ` separator, skipping quoted regions.
  let inDouble = false;
  let inSingle = false;
  let depth = 0; // paren depth — skip contents of function calls
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle && depth === 0) { inDouble = !inDouble; continue; }
    if (ch === "'" && !inDouble && depth === 0) { inSingle = !inSingle; continue; }
    if (inDouble || inSingle) continue;
    if (ch === "(") { depth++; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); continue; }
    if (depth > 0) continue;
    if (ch === "+" && (i === 0 || line[i - 1] === " ") &&
        (i + 1 >= line.length || line[i + 1] === " ")) {
      return { ctx: line.slice(0, i).trim(), ctxStart: 0 };
    }
  }
  return null;
}

export function checkContextOrdering(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const extracted = extractContext(line);
    if (!extracted) continue;
    const { ctx } = extracted;
    if (!ctx) continue;

    // --- Rule 3: no virtual keys [K_X] in context ---
    const vkRe = new RegExp(VIRTUAL_KEY_RE.source, "g");
    let vkMatch: RegExpExecArray | null;
    while ((vkMatch = vkRe.exec(ctx)) !== null) {
      findings.push({
        code: "KM_ERROR_VIRTUAL_KEY_IN_CONTEXT",
        severity: "error",
        layer: "A",
        message: `Virtual key "${vkMatch[0]}" is not allowed in the context (LHS) of a rule`,
        location: { file: "", line: lineIdx + 1, column: vkMatch.index + 1 },
      });
    }

    // Remove guard tokens from context for ordering analysis.
    // This prevents quoted string values inside if("x") from being seen as content.
    // stripGuardTokens() is quote-aware so ')' inside quoted values is not confused
    // with the closing paren of the guard call (e.g. if(s = "a(b)")).
    const ctxStripped = stripGuardTokens(ctx);

    // --- Rule 1: nul must be the first token if present ---
    const nulInStripped = NUL_RE.exec(ctxStripped);
    if (nulInStripped) {
      const beforeNul = ctxStripped.slice(0, nulInStripped.index).trim();
      if (beforeNul.length > 0) {
        // Find nul position in original ctx for accurate column
        const nulOrig = NUL_RE.exec(ctx);
        findings.push({
          code: "KM_ERROR_NUL_NOT_FIRST",
          severity: "error",
          layer: "A",
          message: `"nul" must be the first token in the context`,
          location: { file: "", line: lineIdx + 1, column: (nulOrig?.index ?? 0) + 1 },
        });
      }
    }

    // --- Rule 2: guard tokens must appear before content tokens ---
    // Find the last guard end-position in the original ctx.
    // Use the same quote-aware scanner as stripGuardTokens() so ')' inside
    // quoted values does not truncate the measured extent of the guard.
    const guardKwRe = /\b(?:if|platform|baselayout)\s*\(/gi;
    let lastGuardEnd = -1;
    let guardKwMatch: RegExpExecArray | null;
    while ((guardKwMatch = guardKwRe.exec(ctx)) !== null) {
      const argStart = guardKwMatch.index + guardKwMatch[0].length;
      const end = scanPastGuardArg(ctx, argStart);
      lastGuardEnd = Math.max(lastGuardEnd, end);
    }

    if (lastGuardEnd >= 0) {
      // Search for content tokens in the STRIPPED context (guards removed).
      // A content token whose position in stripped context is before lastGuardEnd means
      // there was content before the last guard.
      const contentRe = new RegExp(CONTENT_TOKEN_RE.source, "gi");
      let contentMatch: RegExpExecArray | null;
      while ((contentMatch = contentRe.exec(ctxStripped)) !== null) {
        if (contentMatch.index < lastGuardEnd) {
          findings.push({
            code: "KM_ERROR_GUARD_AFTER_CONTENT",
            severity: "error",
            layer: "A",
            message: `if()/platform()/baselayout() must appear before other content tokens in the context`,
            location: { file: "", line: lineIdx + 1, column: contentMatch.index + 1 },
          });
          break; // one finding per line is sufficient
        }
      }
    }
  }

  return findings;
}
