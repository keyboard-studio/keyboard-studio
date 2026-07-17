import type { LintFinding } from "@keyboard-studio/contracts";
import { INVALID_CHAR_RE, stripNonCodeSource } from "./_shared.js";

// Single-arg keywords: full paren content is the identifier (stop at closing paren).
const SINGLE_ARG_RE = /\b(group|store|dk|use|call|deadkey)\s*\(\s*([^)]*?)\s*\)/;
// Multi-arg keywords (index, if): only the first argument before the comma is an identifier.
// Stop at '=' too so that if(userStore = 'val') captures only the name, not the full condition.
const FIRST_ARG_RE = /\b(index|if)\s*\(\s*([^=,)]*)/;

export function checkIdentifiers(source: string): LintFinding[] {
  const findings: LintFinding[] = [];
  // Strip quoted-string and comment spans first so a `dk( )`/`store( )` shape
  // in prose (a trailing `c` comment or a quoted doc value) is not read as a
  // real identifier declaration/use.
  const lines = stripNonCodeSource(source).split("\n");
  const regexes = [
    new RegExp(SINGLE_ARG_RE.source, "gi"),
    new RegExp(FIRST_ARG_RE.source, "gi"),
  ];

  const handleMatch = (match: RegExpExecArray, lineIdx: number): void => {
    const name = (match[2] ?? "").trim();

    // System stores (&BITMAP, &PLATFORM, etc.) are not user identifiers
    if (name.startsWith("&")) return;

    if (name.length === 0 || name.length > 255 || INVALID_CHAR_RE.test(name)) {
      findings.push({
        code: "KM_ERROR_INVALID_IDENTIFIER",
        severity: "error",
        layer: "A",
        message: `Invalid identifier "${name}": must be 1–255 characters with no spaces, commas, parentheses, brackets, or control characters`,
        location: { file: "", line: lineIdx + 1, column: match.index + 1 },
      });
    }
  };

  // Preserve original per-line, per-regex ordering (SINGLE_ARG_RE then
  // FIRST_ARG_RE within each line).
  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const line = lines[lineIdx] ?? "";

    for (const re of regexes) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(line)) !== null) {
        handleMatch(match, lineIdx);
      }
    }
  }

  return findings;
}
