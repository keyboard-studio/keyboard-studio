/**
 * Line-by-line tokenizer for Keyman .kmn source files.
 *
 * Produces a flat array of Token objects. Each token carries:
 *   - kind   — what kind of syntactic element this is
 *   - text   — the raw source text of the token (trimmed)
 *   - line   — 1-based source line (after continuation joining)
 *   - col    — 1-based column of the first non-whitespace character
 *
 * Line continuation: a backslash (\) at the very end of a physical line
 * (optionally followed by \r) joins the next physical line. The resulting
 * logical line carries the line number of the first physical line.
 *
 * Comments: the `c` comment syntax has two forms:
 *   1. A line whose first non-whitespace text is `c` followed by whitespace or
 *      end-of-line (KMN column-0 convention).
 *   2. The tail of any logical line that follows the rule separator `>`, where
 *      a `c` preceded by whitespace starts a trailing comment (rare but valid).
 *      For simplicity we strip those at the rule-parsing stage, not here.
 */

export type TokenKind =
  | "comment"        // c <text>
  | "store"          // store(...) <items>
  | "begin"          // begin Unicode > use(<group>)
  | "group"          // group(<name>) [using keys]
  | "rule"           // <context> > <output>
  | "match"          // match > use(<group>)
  | "nomatch"        // nomatch > use(<group>)
  | "blank";         // empty logical line

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  col: number;
}

/** Strip a UTF-8 / UTF-16 BOM if present. */
function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  return text;
}

/**
 * Tokenize .kmn source text into a flat Token array.
 *
 * @param source  Raw .kmn file text (any line ending).
 */
export function tokenize(source: string): Token[] {
  const clean = stripBom(source);
  const physicalLines = clean.split(/\r?\n/);

  // Step 1: join continuation lines.
  const logicalLines: Array<{ text: string; line: number }> = [];
  let i = 0;
  while (i < physicalLines.length) {
    let text = physicalLines[i] ?? "";
    const startLine = i + 1; // 1-based
    while (text.endsWith("\\") && i + 1 < physicalLines.length) {
      text = text.slice(0, -1); // remove trailing backslash
      i++;
      text = text + (physicalLines[i] ?? "").trimStart();
    }
    logicalLines.push({ text, line: startLine });
    i++;
  }

  const tokens: Token[] = [];

  for (const { text, line } of logicalLines) {
    const trimmed = text.trim();

    // Blank lines
    if (trimmed === "") {
      tokens.push({ kind: "blank", text: "", line, col: 1 });
      continue;
    }

    // Column of first non-whitespace
    const col = text.search(/\S/) + 1;

    // Comment: starts with `c` followed by whitespace, or `c` alone
    if (/^c(?:\s|$)/i.test(trimmed)) {
      const commentText = trimmed.slice(1).trim();
      tokens.push({ kind: "comment", text: commentText, line, col });
      continue;
    }

    // begin directive
    if (/^begin\s/i.test(trimmed)) {
      tokens.push({ kind: "begin", text: trimmed, line, col });
      continue;
    }

    // group declaration
    if (/^group\s*\(/i.test(trimmed)) {
      tokens.push({ kind: "group", text: trimmed, line, col });
      continue;
    }

    // store declaration (system or user)
    if (/^store\s*\(/i.test(trimmed)) {
      tokens.push({ kind: "store", text: trimmed, line, col });
      continue;
    }

    // match / nomatch transition rules (no + prefix)
    if (/^match\s*>/i.test(trimmed)) {
      tokens.push({ kind: "match", text: trimmed, line, col });
      continue;
    }
    if (/^nomatch\s*>/i.test(trimmed)) {
      tokens.push({ kind: "nomatch", text: trimmed, line, col });
      continue;
    }

    // Rule: anything else that contains `>` (possibly with `+` prefix, or bare context)
    // We treat any non-blank, non-directive line with `>` as a potential rule.
    if (trimmed.includes(">")) {
      tokens.push({ kind: "rule", text: trimmed, line, col });
      continue;
    }

    // Fallthrough: unrecognized — treat as a rule token so the parser can
    // generate a RawKmnFragment rather than silently losing the line.
    tokens.push({ kind: "rule", text: trimmed, line, col });
  }

  return tokens;
}
