import type { LintFinding } from "@keyboard-studio/contracts";
import { forEachMatch, stripNonCodeSource } from "./_shared.js";

// Codepoint validation — lint.md check #10 (Compiler.cpp:3746-3770).
// U+XXXX literals must be in range 0..0x10FFFF and must not be:
//   - Surrogates:    0xD800–0xDFFF
//   - Non-chars:     0xFDD0–0xFDEF
//   - Specials:      0xFFFE, 0xFFFF

// Matches U+XXXX or U+XXXXXX (1–6 hex digits). Case-insensitive so u+0041 is caught.
const UPLUS_RE = /\bU\+([0-9A-Fa-f]{1,6})\b/i;

export function checkCodepointFormat(source: string): LintFinding[] {
  const findings: LintFinding[] = [];

  // Strip quoted-string and comment spans first so a `U+hhhh` in prose (a
  // trailing `c` comment or a quoted doc value) is not read as a codepoint.
  forEachMatch(stripNonCodeSource(source), new RegExp(UPLUS_RE.source, "gi"), (match, lineIdx) => {
    const hex = match[1] ?? "";
    const cp = parseInt(hex, 16);

    let problem: string | null = null;

    if (cp > 0x10ffff) {
      problem = `U+${hex.toUpperCase()} is above the maximum Unicode codepoint (U+10FFFF)`;
    } else if (cp >= 0xd800 && cp <= 0xdfff) {
      problem = `U+${hex.toUpperCase()} is a surrogate codepoint (0xD800–0xDFFF) and is not a valid scalar value`;
    } else if (cp >= 0xfdd0 && cp <= 0xfdef) {
      problem = `U+${hex.toUpperCase()} is a Unicode non-character (0xFDD0–0xFDEF)`;
    } else if (cp === 0xfffe) {
      problem = `U+FFFE is a Unicode non-character`;
    } else if (cp === 0xffff) {
      problem = `U+FFFF is a Unicode non-character`;
    }

    if (problem !== null) {
      findings.push({
        code: "KM_ERROR_INVALID_CODEPOINT",
        severity: "error",
        layer: "A",
        message: problem,
        location: { file: "", line: lineIdx + 1, column: match.index + 1 },
      });
    }
  });

  return findings;
}
