import type { LintFinding } from "@keyboard-studio/contracts";
import { INVALID_CHAR_RE, forEachMatch, stripNonCodeSource } from "./_shared.js";

// Deadkey resolution — lint.md check #7 (Compiler.cpp:2188-2205).
// Validates that deadkey identifiers obey identifier rules (1–255 chars, no
// spaces/commas/parens/brackets/controls/non-chars).  Auto-registration on
// first use is valid behaviour; this check only surfaces identifier faults.

// Matches dk(...) or deadkey(...) — captures the argument.
const DK_RE = /\b(?:dk|deadkey)\s*\(\s*([^)]*?)\s*\)/i;

export function checkDeadkeyResolution(source: string): LintFinding[] {
  const findings: LintFinding[] = [];

  // Strip quoted-string and comment spans first so a `dk(...)` in prose (a
  // trailing `c` comment or a quoted doc value) is not read as a deadkey call.
  forEachMatch(stripNonCodeSource(source), DK_RE, (match, lineIdx) => {
    const name = (match[1] ?? "").trim();

    if (name.length === 0 || name.length > 255 || INVALID_CHAR_RE.test(name)) {
      findings.push({
        code: "KM_ERROR_INVALID_DEADKEY_NAME",
        severity: "error",
        layer: "A",
        message: `Invalid deadkey identifier "${name}": must be 1–255 characters with no spaces, commas, parentheses, brackets, or control characters`,
        location: { file: "", line: lineIdx + 1, column: match.index + 1 },
      });
    }
  });

  return findings;
}
