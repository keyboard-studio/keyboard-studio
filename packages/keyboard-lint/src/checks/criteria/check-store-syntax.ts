// Check 7.10 — KM_LINT_STORE_SYNTAX_INVALID (spec 084 Batch 1).
//
// All .kmn string-literal stores must have balanced quotes and valid
// syntax. This is a conservative text scan over store declaration lines
// of the judged .kmn: within a store's right-hand side, a quote (' or ")
// opens a string that must close on the same line (KMN strings never
// span lines); a doubled delimiter inside a string is an escaped quote,
// and a trailing `c` comment token ends the scan of the line. One
// finding per unbalanced line. Lines that are not store declarations
// are not scanned — rule syntax is the compiler's domain (7.21), and
// the criteria assembly's parse failure for the .kmn as a whole is
// surfaced through the IR-dependent rows' missing-context reasons.

import type { LintFinding } from "@keyboard-studio/contracts";
import { criteriaFinding } from "./_shared.js";

const STORE_LINE = /^\s*store\s*\(/i;

/** Scan one line's store RHS (text after the store name's `)`) for an unclosed string. */
function lineHasUnbalancedString(rhs: string): boolean {
  let quote: "'" | '"' | null = null;
  let i = 0;
  while (i < rhs.length) {
    const ch = rhs[i]!;
    if (quote !== null) {
      if (ch === quote) {
        if (rhs[i + 1] === quote) {
          i += 2; // doubled delimiter = escaped quote, stay in string
          continue;
        }
        quote = null;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      i += 1;
      continue;
    }
    // A standalone `c` token outside a string starts a trailing comment.
    if (
      (ch === "c" || ch === "C") &&
      (i === 0 || /\s/.test(rhs[i - 1]!)) &&
      (i + 1 >= rhs.length || /\s/.test(rhs[i + 1]!))
    ) {
      return false;
    }
    i += 1;
  }
  return quote !== null;
}

/** 7.10 — one finding per store line whose string literals are unbalanced. */
export function checkStoreSyntax(kmnText: string, path: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = kmnText.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!STORE_LINE.test(line)) return;
    const close = line.indexOf(")");
    if (close === -1) {
      findings.push(
        criteriaFinding({
          code: "KM_LINT_STORE_SYNTAX_INVALID",
          file: path,
          message: `Line ${idx + 1}: store declaration has no closing ")" for its name.`,
          hint: "Fix the store declaration's syntax so the .kmn parses cleanly.",
        }),
      );
      return;
    }
    if (lineHasUnbalancedString(line.slice(close + 1))) {
      findings.push(
        criteriaFinding({
          code: "KM_LINT_STORE_SYNTAX_INVALID",
          file: path,
          message: `Line ${idx + 1}: store string literal has unbalanced quotes.`,
          hint: "Close the string literal on the same line; double the delimiter to include a literal quote character.",
        }),
      );
    }
  });
  return findings;
}
