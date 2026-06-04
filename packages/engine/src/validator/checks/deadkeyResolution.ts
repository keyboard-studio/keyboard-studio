import type { LintFinding } from "@keyboard-studio/contracts";

// Deadkey resolution — lint.md check #7 (Compiler.cpp:2188-2205).
// Validates that deadkey identifiers obey identifier rules (1–255 chars, no
// spaces/commas/parens/brackets/controls/non-chars).  Auto-registration on
// first use is valid behaviour; this check only surfaces identifier faults.

// Matches dk(...) or deadkey(...) — captures the argument.
const DK_RE = /\b(?:dk|deadkey)\s*\(\s*([^)]*?)\s*\)/;

// Forbidden characters per validation.cpp:79-127.
const INVALID_CHAR_RE = new RegExp(
  "[ ,()\\[\\]\\x00-\\x1F\\x7F\\uFDD0-\\uFDEF\\uFFFE\\uFFFF]"
);

export function checkDeadkeyResolution(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const re = new RegExp(DK_RE.source, "gi");
    let match: RegExpExecArray | null;

    while ((match = re.exec(line)) !== null) {
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
    }
  }

  return findings;
}
