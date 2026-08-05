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
 *   2. A whitespace-delimited standalone `c` appearing later in the SAME
 *      logical line. kmcmplib starts an end-of-line comment there on ANY line
 *      kind — store/group/begin/rule — not only on the tail of a rule after
 *      the `>` separator. hasCommentToken() (./continuation.ts) recognizes
 *      this generically across all line kinds so the continuation-join loop
 *      knows a trailing `\` after such a `c` is inside the comment, not a
 *      line continuation. This is comment RECOGNITION only (does a `c` token
 *      start a comment here, for tokenizing purposes); it is distinct from
 *      the codec's structured trailing-comment EXTRACTION (splitting a
 *      rule's trailing `c <text>` into `IRRule.trailingComment`), which is
 *      deliberately rule-only and lives in parse.ts (splitOnArrow /
 *      stripTrailingComment). A trailing comment on a store/group/begin line
 *      is recognized here (so it doesn't break continuation joining) but is
 *      not split into a typed field elsewhere in the codec.
 *
 * The continuation join itself (backslash matching, comment guards, the
 * per-segment physical-line map) lives in ./continuation.ts and is shared
 * with the Layer-A validator (validator/index.ts) so the join logic exists
 * in exactly one place.
 */

import { joinContinuations } from "./continuation.js";

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

// Module-scope regexes (compiled once; file convention after the COMMENT_LINE_RE
// hoist — all single-use tokenizer patterns live here rather than inside
// tokenize()). The continuation-join regexes/helpers live in ./continuation.ts
// now (shared with the validator); see the import above.

// Target-selector prefix matchers (case-insensitive; kmcmplib uses u16nicmp).
// The colon is required; whitespace between the prefix and the rest of the
// line is optional.
const TARGET_PREFIX_RE = /^\$(keyman|keymanweb|keymanonly):\s*/i;

// Per-line classifier regexes (trimmed-line matchers), hoisted to module
// scope like the patterns above rather than allocated on every loop iteration.
const COMMENT_TRIMMED_RE = /^c(?:\s|$)/i;
const BEGIN_RE = /^begin\s/i;
const GROUP_RE = /^group\s*\(/i;
const STORE_RE = /^store\s*\(/i;
const MATCH_RE = /^match\s*>/i;
const NOMATCH_RE = /^nomatch\s*>/i;

/**
 * Tokenize .kmn source text into a flat Token array.
 *
 * @param source  Raw .kmn file text (any line ending).
 */
export function tokenize(source: string): Token[] {
  const clean = stripBom(source);

  // Step 1: join continuation lines (./continuation.ts, shared with the
  // validator). tokenize only needs each logical line's joined `text` and
  // its first physical `line`; the richer per-segment map is for consumers
  // that need to translate a diagnostic back to a physical position.
  const logicalLines = joinContinuations(clean);

  const tokens: Token[] = [];

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
    if (COMMENT_TRIMMED_RE.test(trimmed)) {
      const commentText = trimmed.slice(1).trim();
      pushToken("comment", commentText);
      continue;
    }

    // begin directive
    if (BEGIN_RE.test(trimmed)) {
      pushToken("begin", trimmed);
      continue;
    }

    // group declaration
    if (GROUP_RE.test(trimmed)) {
      pushToken("group", trimmed);
      continue;
    }

    // store declaration (system or user)
    if (STORE_RE.test(trimmed)) {
      pushToken("store", trimmed);
      continue;
    }

    // match / nomatch transition rules (no + prefix)
    if (MATCH_RE.test(trimmed)) {
      pushToken("match", trimmed);
      continue;
    }
    if (NOMATCH_RE.test(trimmed)) {
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
