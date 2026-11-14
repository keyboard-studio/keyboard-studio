// touchLabels -- patch key labels into a touch layout's own text.
//
// The engine's keycap-label step re-serialises the whole touch layout when it
// changes a label, so a file that is not in the engine's canonical layout
// would be rewritten wholesale (FR-010: only the affected keys may change).
// On Open the changed `text` values are located in the ORIGINAL text and only
// those string literals are replaced; every other byte stays.

type Seg = string | number;

/** Paths where two parsed JSON values differ, with both values. */
function diffs(a: unknown, b: unknown, path: Seg[] = []): { path: Seg[]; before: unknown; after: unknown }[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.flatMap((x, i) => diffs(x, b[i], [...path, i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((k) =>
      diffs((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], [...path, k]),
    );
  }
  return [{ path, before: a, after: b }];
}

/** Start and end of the value at `segs` in JSON `text`, or undefined. */
function findValueSpan(text: string, segs: readonly Seg[]): [number, number] | undefined {
  let i = 0;
  const ws = (): void => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  const skipString = (): void => {
    i++; // opening quote
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++; // closing quote
  };
  const skipValue = (): void => {
    ws();
    const c = text[i];
    if (c === '"') return skipString();
    if (c === "{" || c === "[") {
      const close = c === "{" ? "}" : "]";
      i++;
      ws();
      if (text[i] === close) {
        i++;
        return;
      }
      for (;;) {
        ws();
        if (c === "{") {
          skipString();
          ws();
          i++; // colon
        }
        skipValue();
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        i++; // close
        return;
      }
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i++;
  };
  const descend = (n: number): [number, number] | undefined => {
    ws();
    if (n === segs.length) {
      const start = i;
      skipValue();
      return [start, i];
    }
    const want = segs[n]!;
    if (typeof want === "number") {
      if (text[i] !== "[") return undefined;
      i++;
      for (let idx = 0; ; idx++) {
        ws();
        if (text[i] === "]") return undefined;
        if (idx === want) return descend(n + 1);
        skipValue();
        ws();
        if (text[i] !== ",") return undefined;
        i++;
      }
    }
    if (text[i] !== "{") return undefined;
    i++;
    for (;;) {
      ws();
      if (text[i] !== '"') return undefined;
      const keyStart = i;
      skipString();
      const key = JSON.parse(text.slice(keyStart, i)) as string;
      ws();
      if (text[i] !== ":") return undefined;
      i++;
      if (key === want) return descend(n + 1);
      skipValue();
      ws();
      if (text[i] !== ",") return undefined;
      i++;
    }
  };
  try {
    return descend(0);
  } catch {
    return undefined;
  }
}

/** The hex digits of every real `\\uXXXX` escape in `text` (an escaped backslash before `u` is not one). */
function unicodeEscapeDigits(text: string): string[] {
  return [...text.matchAll(/(?<!\\)(?:\\\\)*\\u([0-9a-fA-F]{4})/g)].map((m) => m[1]!);
}

/** A JSON string literal for `value`, escaped the way the file escapes (raw or \uXXXX). */
function literalLike(original: string, value: string): string {
  const base = JSON.stringify(value);
  const digits = unicodeEscapeDigits(original);
  if (digits.length === 0 || /[^\x00-\x7f]/.test(original)) return base;
  const upper = digits.some((d) => /[A-F]/.test(d)) && !digits.some((d) => /[a-f]/.test(d));
  return base.replace(/[^\x00-\x7f]/g, (unit) => {
    const hex = unit.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${upper ? hex.toUpperCase() : hex}`;
  });
}

/** Where and what to insert to add `"text": literal` as the last member of the object at `segs`. */
function memberInsertion(
  text: string,
  segs: readonly Seg[],
  literal: string,
): { start: number; end: number; text: string } | undefined {
  const span = findValueSpan(text, segs);
  if (span === undefined || text[span[0]] !== "{") return undefined;
  const close = span[1] - 1;
  if (text[close] !== "}") return undefined;
  let lastEnd = close;
  while (lastEnd > span[0] + 1 && /\s/.test(text[lastEnd - 1]!)) lastEnd--;
  if (lastEnd === span[0] + 1) return { start: lastEnd, end: lastEnd, text: `"text": ${literal}` };
  const lead = /^\s*/.exec(text.slice(span[0] + 1))![0];
  const sep = /\n/.test(lead) ? `,${lead}` : ", ";
  return { start: lastEnd, end: lastEnd, text: `${sep}"text": ${literal}` };
}

/**
 * `before` with only the label changes of `after` applied, byte for byte
 * elsewhere. Undefined when `after` differs in anything but key `text` values,
 * or a value cannot be located in `before`.
 */
export function labelPatchedTouchText(before: string, after: string): string | undefined {
  if (before === after) return before;
  let a: unknown;
  let b: unknown;
  try {
    a = JSON.parse(before);
    b = JSON.parse(after);
  } catch {
    return undefined;
  }
  const changes = diffs(a, b);
  const edits: { start: number; end: number; text: string }[] = [];
  for (const d of changes) {
    if (d.path[d.path.length - 1] !== "text" || typeof d.after !== "string") return undefined;
    if (d.before === undefined) {
      // The key had no label: add the member to its object.
      const at = memberInsertion(before, d.path.slice(0, -1), literalLike(before, d.after));
      if (at === undefined) return undefined;
      edits.push(at);
      continue;
    }
    if (typeof d.before !== "string") return undefined;
    const span = findValueSpan(before, d.path);
    if (span === undefined || JSON.parse(before.slice(span[0], span[1])) !== d.before) return undefined;
    edits.push({ start: span[0], end: span[1], text: literalLike(before, d.after) });
  }
  let out = before;
  for (const e of edits.sort((x, y) => y.start - x.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  // The patched text must read back as exactly the intended layout. This also
  // catches an object with a duplicated key, where JSON.parse reads the LAST
  // occurrence and the patch may have hit the first.
  try {
    if (JSON.stringify(JSON.parse(out)) !== JSON.stringify(b)) return undefined;
  } catch {
    return undefined;
  }
  return out;
}
