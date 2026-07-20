/**
 * Shared kmcmplib-faithful line-continuation join.
 *
 * A backslash (\) at the end of a physical line — optionally followed by
 * trailing whitespace, and not inside/after a `c` comment — joins the next
 * physical line, transitively (a chain of `\`-terminated lines all fold into
 * one logical line). This is the ONE place that join lives; both the codec
 * tokenizer (tokenize.ts) and the Layer-A validator (validator/index.ts)
 * consume it so the join logic never drifts between two implementations.
 *
 * Beyond the joined text, {@link joinContinuations} also returns a
 * per-logical-line segment map recording which physical line each stretch of
 * the joined text came from, and how much leading whitespace was trimmed —
 * enough for a consumer to translate a diagnostic's logical (line, column)
 * back to the physical (line, column) the user actually sees.
 */

// A backslash at the end of a physical line — optionally followed by trailing
// whitespace — joins the next physical line. The trailing whitespace is
// tolerated because real keyboard sources sometimes ship `\ ` or `\  `
// (e.g. basic_kbdoldit line 92, store(unused) continuation).
export const CONTINUATION_RE = /\\\s*$/;

// A full-line `c` comment ends at the newline. kmcmplib does NOT honor a
// trailing backslash inside a comment as a line-continuation, so a line like
// `c \` must not swallow the following line. Mirrors the comment classifier
// in hasCommentToken() below, but tests the untrimmed physical line.
export const COMMENT_LINE_RE = /^\s*c(?:\s|$)/i;

/**
 * True if `text` contains an unquoted `c` comment token — a `c`/`C` that is
 * whitespace-preceded (or at line start) and whitespace-or-EOL-followed, and
 * not inside a quoted string. In .kmn a standalone `c` is unambiguously the
 * comment keyword and the comment runs to end-of-line, so any trailing
 * backslash after it is NOT a line-continuation. This catches TRAILING
 * comments (e.g. `... > 'b' c note \`) that COMMENT_LINE_RE — which only
 * matches full-line comments — misses; without it the next line is silently
 * swallowed into the comment. Mirrors kmcmplib, which does not honor a
 * backslash inside a comment as a continuation.
 */
export function hasCommentToken(text: string): boolean {
  let quote: string | null = null;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (quote !== null) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "c" || ch === "C") {
      const prev = text[k - 1];
      const next = text[k + 1];
      const prevIsWs = prev === undefined || prev === " " || prev === "\t";
      const nextIsWsOrEol = next === undefined || next === " " || next === "\t";
      if (prevIsWs && nextIsWsOrEol) return true;
    }
  }
  return false;
}

/**
 * One physical line folded into a logical line's joined `text`.
 */
export interface ContinuationSegment {
  /** 0-based index into the physical-lines array this segment came from. */
  physicalLine: number;
  /** Offset within the logical line's joined `text` where this segment's content begins. */
  logicalStart: number;
  /**
   * Whitespace characters trimmed from the start of this segment's own
   * physical line before folding it in. The first segment of a logical line
   * is never trimmed (tokenize.ts's join has never trimmed physical line 1),
   * so segment 0 always has `leadingTrim: 0`.
   */
  leadingTrim: number;
}

export interface LogicalLine {
  /** Joined text — continuation backslashes removed, later segments' leading whitespace trimmed. */
  text: string;
  /** 1-based physical line number of the first segment. */
  line: number;
  /** One entry per physical line folded into this logical line, in order. */
  segments: ContinuationSegment[];
}

/**
 * Split `source` into physical lines (on `\r?\n`) and fold `\`-terminated
 * continuation lines into logical lines per kmcmplib semantics.
 *
 * Callers that need BOM handling must strip it before calling this (see
 * tokenize.ts's `stripBom`) — this function only splits and joins.
 */
export function joinContinuations(source: string): LogicalLine[] {
  const physicalLines = source.split(/\r?\n/);
  const logicalLines: LogicalLine[] = [];
  let i = 0;
  while (i < physicalLines.length) {
    let text = physicalLines[i] ?? "";
    const startLine = i + 1; // 1-based
    const segments: ContinuationSegment[] = [
      { physicalLine: i, logicalStart: 0, leadingTrim: 0 },
    ];
    while (
      CONTINUATION_RE.test(text) &&
      !COMMENT_LINE_RE.test(text) &&
      !hasCommentToken(text) &&
      i + 1 < physicalLines.length
    ) {
      text = text.replace(CONTINUATION_RE, ""); // drop backslash + trailing ws
      i++;
      const nextRaw = physicalLines[i] ?? "";
      const trimmed = nextRaw.trimStart();
      const leadingTrim = nextRaw.length - trimmed.length;
      segments.push({ physicalLine: i, logicalStart: text.length, leadingTrim });
      text = text + trimmed;
    }
    logicalLines.push({ text, line: startLine, segments });
    i++;
  }
  return logicalLines;
}
