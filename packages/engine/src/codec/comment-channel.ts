/**
 * The comment side-channel of the spec 116 reader (contracts/comment-channel.md).
 *
 * Keyman's lexer drops `COMMENT` tokens (`emit: false`), so the grammar never
 * sees them. The local `onTrivia` patch (ng/PROVENANCE.md, patch 2) hands them
 * over in source order, and this module turns them into one record per
 * physical line. The `c` keyword is recognised only where the upstream
 * recogniser matches it, so a quoted `"c "` or a key name `[K_C]` is never a
 * comment: earlier recognisers have already consumed it.
 *
 * Continuations and blank lines are not recorded here: the reader's line loop
 * reads both from the NEWLINE tokens it already walks, so a record for them
 * would have no consumer.
 */

import { Lexer, type Token } from "./ng/lexer.js";
import { TokenType } from "./ng/token-type.js";

export interface CommentRecord {
  /** The body after `c`, trimmed the way the legacy reader trims it. A bare `c` gives "". */
  text: string;
  /** 1-based physical line. */
  line: number;
  /** 1-based column of the `c`. */
  column: number;
  /** "line" when no emitted token precedes it on its physical line, else "trailing". */
  kind: "line" | "trailing";
}

const COMMENT_ONLY: ReadonlySet<TokenType> = new Set([TokenType.COMMENT]);

/** Lex `text` once, returning the emitted tokens and the comment on each physical line. */
export function lexWithComments(text: string): { tokens: Token[]; comments: Map<number, CommentRecord> } {
  const comments = new Map<number, CommentRecord>();
  const tokens = new Lexer(text, undefined, (t) => {
    comments.set(t.lineNum, { text: t.text.slice(1).trim(), line: t.lineNum, column: t.charNum, kind: "line" });
  }, COMMENT_ONLY).parse();
  if (comments.size > 0) {
    // A comment runs to the end of its line, so any emitted token on that line precedes it.
    for (const t of tokens) {
      if (t.tokenType === TokenType.NEWLINE || t.tokenType === TokenType.EOF) continue;
      const rec = comments.get(t.lineNum);
      if (rec !== undefined) rec.kind = "trailing";
    }
  }
  return { tokens, comments };
}
