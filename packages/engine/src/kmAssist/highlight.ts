/**
 * kmAssist rule highlighter — spec 082 Track C read-only v1.
 *
 * Turns one rule's KMN text (as produced by the codec emitter) into typed
 * spans for rendering. READ-ONLY: pure function, no IR access needed.
 *
 * Span kinds:
 * - "store-ref": `any(name)`, `notany(name)`, `index(name, N)`, `outs(name)`
 * - "key": `[K_A]`, `[SHIFT RALT K_0]` bracket key references
 * - "operator": the `+` keystroke separator and the `>` arrow
 * - "output": everything on the output (RHS) side that isn't a store-ref
 * - "comment": a trailing `c <comment>`
 * - "text": everything else (whitespace, `platform('…')`, `match`, …)
 *
 * Spans tile the input exactly: concatenating span texts in order reproduces
 * `kmnText`, and every span carries start/end offsets into it.
 */
export type SpanKind =
  | "store-ref"
  | "key"
  | "operator"
  | "output"
  | "comment"
  | "text";

export interface TokenSpan {
  kind: SpanKind;
  text: string;
  /** Offset of the first character in `kmnText`. */
  start: number;
  /** Offset one past the last character in `kmnText`. */
  end: number;
}

interface RawToken {
  text: string;
  start: number;
  end: number;
}

/** Whitespace-delimited `c` outside quotes/brackets starts a line comment. */
function splitTrailingComment(line: string): { head: string; comment?: RawToken } {
  let inS = false;
  let inD = false;
  let depth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    if (
      depth === 0 &&
      ch === "c" &&
      /\s/.test(line[i - 1] ?? "") &&
      (i === line.length - 1 || /\s/.test(line[i + 1] ?? ""))
    ) {
      return {
        head: line.slice(0, i),
        comment: { text: line.slice(i), start: i, end: line.length },
      };
    }
  }
  return { head: line };
}

/** First `>` outside quotes/brackets splits context from output. */
function splitOnArrow(head: string): { lhs: string; rhs: string; arrowAt: number } | null {
  let inS = false;
  let inD = false;
  let depth = 0;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (ch === "'" && !inD) { inS = !inS; continue; }
    if (ch === '"' && !inS) { inD = !inD; continue; }
    if (inS || inD) continue;
    if (ch === "[") { depth++; continue; }
    if (ch === "]") { depth--; continue; }
    if (depth === 0 && ch === ">") {
      return { lhs: head.slice(0, i), rhs: head.slice(i + 1), arrowAt: i };
    }
  }
  return null;
}

/**
 * Split a rule side into whitespace-delimited tokens at bracket-depth 0
 * outside quotes, preserving source offsets.
 */
function tokenizeSide(side: string, base: number): RawToken[] {
  const tokens: RawToken[] = [];
  let inS = false;
  let inD = false;
  let depth = 0;
  let start = -1;
  const flush = (end: number): void => {
    if (start >= 0) {
      tokens.push({ text: side.slice(start, end), start: base + start, end: base + end });
      start = -1;
    }
  };
  for (let i = 0; i < side.length; i++) {
    const ch = side[i];
    if (ch === "'" && !inD) { inS = !inS; }
    else if (ch === '"' && !inS) { inD = !inD; }
    else if (!inS && !inD) {
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
    }
    const isWs = !inS && !inD && depth === 0 && /\s/.test(ch ?? "");
    if (isWs) {
      flush(i);
    } else if (start < 0) {
      start = i;
    }
  }
  flush(side.length);
  return tokens;
}

function classifyContextToken(tok: string): SpanKind {
  if (tok === "+") return "operator";
  if (/^(any|notany|index)\s*\(/i.test(tok)) return "store-ref";
  if (/^\[.+\]$/s.test(tok)) return "key";
  return "text";
}

function classifyOutputToken(tok: string): SpanKind {
  if (/^(index|outs)\s*\(/i.test(tok)) return "store-ref";
  return "output";
}

/**
 * Tokenize one rule's KMN text into typed, offset-carrying spans.
 * The spans tile the input: joining their texts reproduces `kmnText`.
 */
export function highlightRule(kmnText: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const push = (kind: SpanKind, text: string, start: number, end: number): void => {
    if (end > start) spans.push({ kind, text, start, end });
  };

  // Target-selector prefix (`$keyman:`, `$keymanweb:`, `$keymanonly:`).
  let rest = kmnText;
  let base = 0;
  const prefix = /^\$(keyman|keymanweb|keymanonly):/i.exec(rest);
  if (prefix !== null) {
    push("text", prefix[0], 0, prefix[0].length);
    base = prefix[0].length;
    rest = rest.slice(prefix[0].length);
  }

  const { head, comment } = splitTrailingComment(rest);
  const headBase = base;

  const pushSide = (
    side: string,
    sideBase: number,
    classify: (tok: string) => SpanKind,
  ): void => {
    let cursor = 0;
    for (const tok of tokenizeSide(side, sideBase)) {
      if (tok.start > sideBase + cursor) {
        push("text", side.slice(cursor, tok.start - sideBase), sideBase + cursor, tok.start);
      }
      push(classify(tok.text), tok.text, tok.start, tok.end);
      cursor = tok.end - sideBase;
    }
    if (cursor < side.length) {
      push("text", side.slice(cursor), sideBase + cursor, sideBase + side.length);
    }
  };

  const arrow = splitOnArrow(head);
  if (arrow === null) {
    // Not a rule line — everything is undifferentiated text.
    pushSide(head, headBase, () => "text");
  } else {
    pushSide(arrow.lhs, headBase, classifyContextToken);
    push("operator", ">", headBase + arrow.arrowAt, headBase + arrow.arrowAt + 1);
    pushSide(arrow.rhs, headBase + arrow.arrowAt + 1, classifyOutputToken);
  }

  if (comment !== undefined) {
    // Comment offsets are relative to `rest`, which starts at `headBase`
    // in the original string.
    const absStart = headBase + comment.start;
    const absEnd = headBase + comment.end;
    const gapStart = headBase + head.length;
    if (absStart > gapStart) {
      push("text", rest.slice(head.length, comment.start), gapStart, absStart);
    }
    push("comment", comment.text, absStart, absEnd);
  }

  return spans;
}
