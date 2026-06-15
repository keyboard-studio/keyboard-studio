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

/**
 * Target-selector prefix from kmcmplib (Compiler.cpp::GetLinePrefixType):
 *   $keyman:     line applies to both Keyman desktop and KeymanWeb
 *   $keymanweb:  line applies to KeymanWeb only
 *   $keymanonly: line applies to Keyman desktop only
 * Unknown `$<word>:` prefixes (named-constant references) cause kmcmplib to
 * skip the line; our parser preserves them as raw fragments rather than
 * silently dropping them.
 */
export type TargetSelector = "keyman" | "keymanweb" | "keymanonly";

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  col: number;
  /** Set when the source line carried a `$keyman[web|only]:` prefix. */
  targetSelector?: TargetSelector;
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
  // A backslash at the end of a physical line — optionally followed by
  // trailing whitespace — joins the next physical line. The trailing
  // whitespace is tolerated because real keyboard sources sometimes ship
  // `\ ` or `\  ` (e.g. basic_kbdoldit line 92, store(unused) continuation).
  const CONTINUATION_RE = /\\\s*$/;
  const logicalLines: Array<{ text: string; line: number }> = [];
  let i = 0;
  while (i < physicalLines.length) {
    let text = physicalLines[i] ?? "";
    const startLine = i + 1; // 1-based
    while (CONTINUATION_RE.test(text) && i + 1 < physicalLines.length) {
      text = text.replace(CONTINUATION_RE, ""); // drop backslash + trailing ws
      i++;
      text = text + (physicalLines[i] ?? "").trimStart();
    }
    logicalLines.push({ text, line: startLine });
    i++;
  }

  const tokens: Token[] = [];

  // Target-selector prefix matchers (case-insensitive; kmcmplib uses u16nicmp).
  // The colon is required; whitespace between the prefix and the rest of the
  // line is optional.
  const TARGET_PREFIX_RE = /^\$(keyman|keymanweb|keymanonly):\s*/i;

  for (const { text, line } of logicalLines) {
    let trimmed = text.trim();

    // Blank lines
    if (trimmed === "") {
      tokens.push({ kind: "blank", text: "", line, col: 1 });
      continue;
    }

    // Column of first non-whitespace (computed BEFORE stripping the prefix
    // so error messages still point at the source column the user sees).
    const col = text.search(/\S/) + 1;

    // Target-selector prefix: $keyman:, $keymanweb:, $keymanonly:
    // Stripped here so the rest of the line classifies as the underlying
    // kind (store / rule / etc.) and we don't pollute downstream parsers.
    let targetSelector: TargetSelector | undefined;
    const prefixMatch = TARGET_PREFIX_RE.exec(trimmed);
    if (prefixMatch) {
      targetSelector = (prefixMatch[1] ?? "").toLowerCase() as TargetSelector;
      trimmed = trimmed.slice(prefixMatch[0].length).trim();
      // If after stripping the prefix nothing remains, treat as blank.
      if (trimmed === "") {
        tokens.push({ kind: "blank", text: "", line, col, targetSelector });
        continue;
      }
    }
    const pushToken = (kind: TokenKind, tokenText: string): void => {
      const t: Token = { kind, text: tokenText, line, col };
      if (targetSelector !== undefined) t.targetSelector = targetSelector;
      tokens.push(t);
    };

    // Comment: starts with `c` followed by whitespace, or `c` alone
    if (/^c(?:\s|$)/i.test(trimmed)) {
      const commentText = trimmed.slice(1).trim();
      pushToken("comment", commentText);
      continue;
    }

    // begin directive
    if (/^begin\s/i.test(trimmed)) {
      pushToken("begin", trimmed);
      continue;
    }

    // group declaration
    if (/^group\s*\(/i.test(trimmed)) {
      pushToken("group", trimmed);
      continue;
    }

    // store declaration (system or user)
    if (/^store\s*\(/i.test(trimmed)) {
      pushToken("store", trimmed);
      continue;
    }

    // match / nomatch transition rules (no + prefix)
    if (/^match\s*>/i.test(trimmed)) {
      pushToken("match", trimmed);
      continue;
    }
    if (/^nomatch\s*>/i.test(trimmed)) {
      pushToken("nomatch", trimmed);
      continue;
    }

    // Rule: anything else that contains `>` (possibly with `+` prefix, or bare context)
    // We treat any non-blank, non-directive line with `>` as a potential rule.
    if (trimmed.includes(">")) {
      pushToken("rule", trimmed);
      continue;
    }

    // Fallthrough: unrecognized — treat as a rule token so the parser can
    // generate a RawKmnFragment rather than silently losing the line.
    pushToken("rule", trimmed);
  }

  return tokens;
}
