import type { LintFinding } from "@keyboard-studio/contracts";
import { INVALID_CHAR_RE } from "./_shared.js";

// Single-arg keywords: full paren content is the identifier (stop at closing paren).
const SINGLE_ARG_RE = /\b(group|store|dk|use|call|deadkey)\s*\(\s*([^)]*?)\s*\)/;
// Multi-arg keywords (index, if): only the first argument before the comma is an identifier.
// Stop at '=' too so that if(userStore = 'val') captures only the name, not the full condition.
const FIRST_ARG_RE = /\b(index|if)\s*\(\s*([^=,)]*)/;

export function checkIdentifiers(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = source.split("\n");

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";
    const regexes = [
      new RegExp(SINGLE_ARG_RE.source, "gi"),
      new RegExp(FIRST_ARG_RE.source, "gi"),
    ];

    for (const re of regexes) {
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        const name = (match[2] ?? "").trim();

        // System stores (&BITMAP, &PLATFORM, etc.) are not user identifiers
        if (name.startsWith("&")) continue;

        if (name.length === 0 || name.length > 255 || INVALID_CHAR_RE.test(name)) {
          findings.push({
            code: "KM_ERROR_INVALID_IDENTIFIER",
            severity: "error",
            layer: "A",
            message: `Invalid identifier "${name}": must be 1–255 characters with no spaces, commas, parentheses, brackets, or control characters`,
            location: { file: "", line: lineIdx + 1, column: match.index + 1 },
          });
        }
      }
    }
  }

  return findings;
}
