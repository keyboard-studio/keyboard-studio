// Check 7.25 — KM_LINT_DEPRECATED_NUMERIC_FORMAT.
//
// All character literals in the `.kmn` use `U+NNNN` notation. The decimal
// (`d###`) and hex (`x###`) formats are deprecated — kmc warns on them and
// they are removed in Keyman 20. Evidence: `store(punct) "..." d34` →
// `U+0022` (#4166), `xff` → `U+00FF` (#4156), `store(RusVaiChar) d187...`.
//
// Conservative text scan (the IR normalises notations away, so only the
// source text can see them): mask string literals and trailing comments,
// blank out `dk(...)` deadkey IDs (numeric, not character codes), then
// flag standalone `d<digits>` / `x<hex>` tokens. One finding per line.

import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** Blank string literals and cut trailing comments, preserving line structure. */
function maskLine(line: string): string {
  let out = "";
  let i = 0;
  let quote: "'" | '"' | null = null;
  while (i < line.length) {
    const ch = line[i]!;
    if (quote !== null) {
      if (ch === quote) {
        if (line[i + 1] === quote) {
          out += "  ";
          i += 2;
          continue;
        }
        quote = null;
      }
      out += " ";
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      out += " ";
      i += 1;
      continue;
    }
    // A standalone `c` token outside a string starts a trailing comment.
    if (
      (ch === "c" || ch === "C") &&
      (i === 0 || /\s/.test(line[i - 1]!)) &&
      (i + 1 >= line.length || /\s/.test(line[i + 1]!))
    ) {
      break;
    }
    out += ch;
    i += 1;
  }
  return out;
}

// Deadkey references `dk(1)` / `dk(name)` — numeric IDs are not character codes.
const DK_PARENS = /\b[dD][kK]\s*\([^)]*\)/g;
// Standalone deprecated notations: d<decimal> or x<hex>. \b keeps `0x1F`
// (the x is glued to the 0) and identifiers like `ad12` out of the match.
const DEPRECATED_TOKEN = /\b[dD][0-9]+\b|\b[xX][0-9a-fA-F]+\b/g;

/** 7.25 — one finding per line carrying a deprecated numeric format. */
export function checkDeprecatedNumericFormats(
  kmnText: string,
  path: string,
): CheckResult {
  const offenderLines: Array<{ line: number; tokens: string[] }> = [];
  const lines = kmnText.split(/\r?\n/);
  lines.forEach((line, idx) => {
    const masked = maskLine(line).replace(DK_PARENS, "dk()");
    const tokens = [...new Set(masked.match(DEPRECATED_TOKEN) ?? [])];
    if (tokens.length > 0) offenderLines.push({ line: idx + 1, tokens });
  });
  if (offenderLines.length > 0) {
    return checkFailed("KM_LINT_DEPRECATED_NUMERIC_FORMAT", [
      criteriaFinding({
        code: "KM_LINT_DEPRECATED_NUMERIC_FORMAT",
        file: path,
        message: `Deprecated decimal/hex character codes (use U+NNNN instead): ${offenderLines
          .map((o) => `line ${o.line} (${o.tokens.join(", ")})`)
          .join("; ")}.`,
        hint: "Rewrite each code in U+NNNN notation; the d### and x### formats are removed in Keyman 20.",
      }),
    ]);
  }
  return checkPassed("KM_LINT_DEPRECATED_NUMERIC_FORMAT", [
    `Scanned ${lines.length} line(s): no deprecated d###/x### character codes.`,
  ]);
}
