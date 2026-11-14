// touchText -- patch a touch layout's OWN TEXT so it parses to an intended layout.
//
// On Open an applied touch edit must change only what it touches (FR-010): every
// other byte of the `.keyman-touch-layout` stays. `patchTouchText(beforeText,
// afterLayout)` reads `beforeText` into a span tree, diffs it against the
// intended layout and rebuilds only the containers whose members changed:
//   - a scalar that changed is replaced, keeping the file's escaping;
//   - an object member or array element that is new is rendered in the style of
//     its neighbour (separator, indentation, spacing) and spliced in;
//   - one that is gone is cut out together with one separator;
//   - arrays of different length are aligned by `id` (keys, layers, subkeys), so
//     an insert in the middle of a row is an insert, not a shift of every key.
// The result is read back: if it does not parse to exactly `afterLayout` (object
// key order aside) the answer is undefined and the caller asks for consent to
// the canonical serialisation. A duplicated object key is also undefined (a
// parse reads the LAST one, a patch may have hit the first).
//
// Pure; no store, no timers.

/** The hex digits of every real `\\uXXXX` escape in `text` (an escaped backslash before `u` is not one). */
function unicodeEscapeDigits(text: string): string[] {
  return [...text.matchAll(/(?<!\\)(?:\\\\)*\\u([0-9a-fA-F]{4})/g)].map((m) => m[1]!);
}

/** A JSON string literal for `value`, escaped the way the file escapes (raw or \uXXXX). */
export function literalLike(original: string, value: string): string {
  const base = JSON.stringify(value);
  const digits = unicodeEscapeDigits(original);
  if (digits.length === 0 || /[^\x00-\x7f]/.test(original)) return base;
  const upper = digits.some((d) => /[A-F]/.test(d)) && !digits.some((d) => /[a-f]/.test(d));
  return base.replace(/[^\x00-\x7f]/g, (unit) => {
    const hex = unit.charCodeAt(0).toString(16).padStart(4, "0");
    return `\\u${upper ? hex.toUpperCase() : hex}`;
  });
}


// -- the span tree -------------------------------------------------------------

interface ScalarNode {
  t: "scalar";
  start: number;
  end: number;
  value: unknown;
}
interface MemberNode {
  key: string;
  start: number; // the key's opening quote
  end: number; // end of the value
  value: Node;
}
interface ObjNode {
  t: "obj";
  start: number;
  end: number;
  members: MemberNode[];
  value: Record<string, unknown>;
}
interface ArrNode {
  t: "arr";
  start: number;
  end: number;
  items: Node[];
  value: unknown[];
}
type Node = ScalarNode | ObjNode | ArrNode;

class Unpatchable extends Error {}

const WS = /\s/;

/** Read `text` (from offset `from`) into a span tree. Throws on bad JSON or a duplicated key. */
function parseTree(text: string, from: number): { node: Node; end: number } {
  let i = from;
  const ws = (): void => {
    while (i < text.length && WS.test(text[i]!)) i++;
  };
  const str = (): string => {
    const start = i;
    i++;
    while (i < text.length && text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
    i++;
    return JSON.parse(text.slice(start, i)) as string;
  };
  const value = (): Node => {
    ws();
    const start = i;
    const c = text[i];
    if (c === "{") {
      i++;
      const members: MemberNode[] = [];
      const obj: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      ws();
      if (text[i] === "}") {
        i++;
        return { t: "obj", start, end: i, members, value: obj };
      }
      for (;;) {
        ws();
        if (text[i] !== '"') throw new Unpatchable("object key expected");
        const keyStart = i;
        const key = str();
        ws();
        if (text[i] !== ":") throw new Unpatchable("colon expected");
        i++;
        const v = value();
        if (Object.prototype.hasOwnProperty.call(obj, key)) throw new Unpatchable("duplicate key");
        obj[key] = nodeValue(v);
        members.push({ key, start: keyStart, end: v.end, value: v });
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] !== "}") throw new Unpatchable("} expected");
        i++;
        return { t: "obj", start, end: i, members, value: obj };
      }
    }
    if (c === "[") {
      i++;
      const items: Node[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return { t: "arr", start, end: i, items, value: [] };
      }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] !== "]") throw new Unpatchable("] expected");
        i++;
        return { t: "arr", start, end: i, items, value: items.map(nodeValue) };
      }
    }
    if (c === '"') {
      const v = str();
      return { t: "scalar", start, end: i, value: v };
    }
    while (i < text.length && !/[\s,\]}]/.test(text[i]!)) i++;
    const raw = text.slice(start, i);
    if (raw === "") throw new Unpatchable("value expected");
    return { t: "scalar", start, end: i, value: JSON.parse(raw) as unknown };
  };
  const node = value();
  return { node, end: i };
}

const nodeValue = (n: Node): unknown => n.value;

// -- comparison ------------------------------------------------------------------

/** Deep equality of parsed JSON; object key order does not matter, array order does. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((x, i) => same(x, b[i]));
  }
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object" && !Array.isArray(b)) {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** What names an array element: its string `id`, else (layers, platforms) its `name`, else its whole content. */
function identity(v: unknown): string {
  if (isObj(v)) {
    // A row is the keys it holds, so an edited row still matches and an
    // inserted row does not shift its neighbours.
    if (Array.isArray(v.key)) return `row:${v.key.map((x) => (isObj(x) && typeof x.id === "string" ? x.id : "?")).join("|")}`;
    if (typeof v.id === "string") return `id:${v.id}`;
    if (typeof v.name === "string") return `name:${v.name}`;
  }
  return `json:${JSON.stringify(v)}`;
}

// -- the file's style --------------------------------------------------------------

interface Style {
  eol: string;
  /** One indent step. */
  unit: string;
  /** Space after `:` in object members. */
  colon: string;
  /** Separator between siblings on one line (`, ` or `,`). */
  comma: string;
  /** Whether the file escapes non-ASCII (see `literalLike`). */
  text: string;
}

function detectStyle(text: string): Style {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let unit = "  ";
  const lead = /\n([ \t]+)\S/.exec(text);
  if (lead !== null) {
    const l = lead[1]!;
    unit = l.startsWith("\t") ? "\t" : l.length > 4 ? "  " : l;
  }
  const spaced = (text.match(/"\s*:\s/g) ?? []).length;
  const tight = (text.match(/"\s*:[^\s]/g) ?? []).length;
  const spacedComma = (text.match(/,[ \t]+[^\s]/g) ?? []).length;
  const tightComma = (text.match(/,[^\s]/g) ?? []).length;
  return { eol, unit, colon: spaced > tight ? " " : "", comma: spacedComma > tightComma ? ", " : ",", text };
}

/** Indentation of the line that holds offset `at`. */
function lineIndent(text: string, at: number): string {
  const nl = text.lastIndexOf("\n", at - 1);
  return /^[ \t]*/.exec(text.slice(nl + 1))![0];
}

/** The space (or none) the file puts after `:` in member `m`. */
function memberColon(text: string, m: MemberNode): string {
  const between = text.slice(m.start, m.value.start);
  return /\s/.test(between.slice(between.lastIndexOf(":") + 1)) ? " " : "";
}

// -- rendering new values -----------------------------------------------------------

const isMultiline = (text: string, n: Node): boolean => n.t !== "scalar" && text.slice(n.start, n.end).includes("\n");

interface RenderCtx {
  text: string;
  style: Style;
}

/**
 * JSON text for `value` as a child sitting at line-indent `base`. `tmpl` is a
 * neighbouring node that already has this shape (it supplies single-line vs
 * multi-line, indent step and `:` spacing); `inherit` is the parent's multi-line
 * mode when there is no template.
 */
function render(ctx: RenderCtx, value: unknown, base: string, tmpl: Node | undefined, inherit: boolean): string {
  const { text, style } = ctx;
  if (typeof value === "string") return literalLike(style.text, value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  const arr = Array.isArray(value);
  const sameShape = tmpl !== undefined && ((arr && tmpl.t === "arr") || (!arr && tmpl.t === "obj"));
  const t = sameShape ? tmpl : undefined;
  const entries: [string | null, unknown][] = arr
    ? (value as unknown[]).map((v) => [null, v])
    : Object.entries(value as Record<string, unknown>);
  const open = arr ? "[" : "{";
  const close = arr ? "]" : "}";
  if (entries.length === 0) return open + close;
  const multi = t !== undefined ? isMultiline(text, t) : inherit;
  // The template's own colon spacing, if it has a member to read it from.
  let colon = style.colon;
  if (t?.t === "obj" && t.members.length > 0) {
    colon = memberColon(text, t.members[0]!);
  }
  const childTmpl = (key: string | null, index: number): Node | undefined => {
    if (t === undefined) return undefined;
    if (t.t === "obj") return t.members.find((m) => m.key === key)?.value;
    return t.items[index] ?? t.items[0];
  };
  const one = (key: string | null, v: unknown, index: number, childBase: string): string => {
    const body = render(ctx, v, childBase, childTmpl(key, index), multi);
    return key === null ? body : `${JSON.stringify(key)}:${colon}${body}`;
  };
  let comma = style.comma;
  if (t !== undefined) {
    const spans = t.t === "obj" ? t.members : t.items;
    if (spans.length >= 2 && !text.slice(spans[0]!.end, spans[1]!.start).includes("\n")) {
      comma = text.slice(spans[0]!.end, spans[1]!.start).replace(/^,/, "") === "" ? "," : ", ";
    }
  }
  if (!multi) return open + entries.map(([k, v], i) => one(k, v, i, base)).join(comma) + close;
  // Indent step: the template's own, when it has a first child to read it from.
  let unit = style.unit;
  if (t !== undefined) {
    const first = t.t === "obj" ? t.members[0]?.start : t.items[0]?.start;
    if (first !== undefined) {
      const childIndent = lineIndent(text, first);
      const own = lineIndent(text, t.start);
      if (text.slice(text.lastIndexOf("\n", first - 1) + 1, first).trim() === "" && childIndent.startsWith(own) && childIndent.length > own.length) {
        unit = childIndent.slice(own.length);
      }
    }
  }
  const inner = base + unit;
  return `${open}${style.eol}${entries.map(([k, v], i) => inner + one(k, v, i, inner)).join(`,${style.eol}`)}${style.eol}${base}${close}`;
}

// -- the diff ------------------------------------------------------------------------

/** An aligned pair: indexes into the before and after arrays (-1 = none). */
interface Pair {
  b: number;
  a: number;
}

/** Order-preserving alignment of two arrays by identity; equal-size gaps are paired by position. */
function align(before: readonly unknown[], after: readonly unknown[]): Pair[] {
  const ib = before.map(identity);
  const ia = after.map(identity);
  const n = before.length;
  const m = after.length;
  // LCS table.
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) {
      lcs[x]![y] = ib[x] === ia[y] ? lcs[x + 1]![y + 1]! + 1 : Math.max(lcs[x + 1]![y]!, lcs[x]![y + 1]!);
    }
  }
  const out: Pair[] = [];
  let x = 0;
  let y = 0;
  let gapB = 0;
  let gapA = 0;
  const flushGap = (): void => {
    const nb = x - gapB;
    const na = y - gapA;
    if (nb === na) {
      for (let k = 0; k < nb; k++) out.push({ b: gapB + k, a: gapA + k });
    } else {
      for (let k = 0; k < nb; k++) out.push({ b: gapB + k, a: -1 });
      for (let k = 0; k < na; k++) out.push({ b: -1, a: gapA + k });
    }
  };
  while (x < n && y < m) {
    if (ib[x] === ia[y]) {
      flushGap();
      out.push({ b: x, a: y });
      x++;
      y++;
      gapB = x;
      gapA = y;
    } else if (lcs[x + 1]![y]! >= lcs[x]![y + 1]!) x++;
    else y++;
  }
  x = n;
  y = m;
  flushGap();
  return out;
}

type PatchCtx = RenderCtx;

interface Part {
  text: string;
  from: number;
  key?: string;
}

/** The separator text between consecutive children, per index; and what leads/trails them. */
function layoutOf(text: string, spans: readonly { start: number; end: number }[], open: number, close: number) {
  const seps: string[] = [];
  for (let k = 0; k + 1 < spans.length; k++) seps.push(text.slice(spans[k]!.end, spans[k + 1]!.start));
  const lead = spans.length > 0 ? text.slice(open + 1, spans[0]!.start) : "";
  const trail = spans.length > 0 ? text.slice(spans[spans.length - 1]!.end, close) : "";
  return { seps, lead, trail };
}

/** Rebuild one container's interior from its new child texts, reusing the file's separators. */
function rebuild(
  text: string,
  n: ObjNode | ArrNode,
  spans: readonly { start: number; end: number }[],
  parts: readonly Part[],
  style: Style,
): string {
  const open = n.t === "obj" ? "{" : "[";
  const close = n.t === "obj" ? "}" : "]";
  if (parts.length === 0) return open + close;
  const { seps, lead, trail } = layoutOf(text, spans, n.start, n.end - 1);
  let defaultSep: string;
  if (seps.length > 0) defaultSep = seps[0]!;
  else if (lead.includes("\n")) defaultSep = `,${lead}`;
  else defaultSep = style.comma;
  let l = lead;
  let tr = trail;
  if (spans.length === 0) {
    l = "";
    tr = "";
  }
  let out = open + l;
  parts.forEach((p, k) => {
    out += p.text;
    if (k + 1 === parts.length) return;
    const next = parts[k + 1]!;
    // Two children that were neighbours keep the separator between them.
    if (p.from >= 0 && next.from === p.from + 1) out += seps[p.from]!;
    else if (p.from >= 0 && seps[p.from] !== undefined) out += seps[p.from]!;
    else if (next.from > 0 && seps[next.from - 1] !== undefined) out += seps[next.from - 1]!;
    else out += defaultSep;
  });
  return out + tr + close;
}

function patchNode(ctx: PatchCtx, n: Node, after: unknown): string {
  const { text, style } = ctx;
  if (same(n.value, after)) return text.slice(n.start, n.end);
  if (n.t === "scalar") {
    return render(ctx, after, lineIndent(text, n.start), undefined, false);
  }
  if (n.t === "obj" && isObj(after)) {
    const keys = Object.keys(after);
    const parts: Part[] = [];
    for (let k = 0; k < n.members.length; k++) {
      const m = n.members[k]!;
      if (!Object.prototype.hasOwnProperty.call(after, m.key)) continue;
      const body = patchNode(ctx, m.value, after[m.key]);
      parts.push({ text: text.slice(m.start, m.value.start) + body, from: k, key: m.key });
    }
    // New members go right after the member that precedes them in `after`.
    const base = lineIndent(text, n.start);
    const multi = isMultiline(text, n);
    const colon = n.members.length >= 1 ? memberColon(text, n.members[0]!) : style.colon;
    const child = multi && n.members.length > 0 ? lineIndent(text, n.members[0]!.start) : base;
    for (let ai = 0; ai < keys.length; ai++) {
      const key = keys[ai]!;
      if (n.members.some((m) => m.key === key)) continue;
      const body = render(ctx, after[key], child, undefined, multi);
      const prev = ai > 0 ? keys[ai - 1]! : undefined;
      const idx = prev === undefined ? -1 : parts.findIndex((p) => p.key === prev);
      parts.splice(idx + 1, 0, { text: `${JSON.stringify(key)}:${colon}${body}`, from: -1, key });
    }
    const body = rebuild(text, n, n.members, parts, style);
    return body;
  }
  if (n.t === "arr" && Array.isArray(after)) {
    const pairs = align(n.value, after);
    const base = lineIndent(text, n.start);
    const multi = isMultiline(text, n);
    const parts: Part[] = [];
    pairs.forEach((p) => {
      if (p.a < 0) return; // removed
      if (p.b >= 0) {
        parts.push({ text: patchNode(ctx, n.items[p.b]!, after[p.a]), from: p.b });
        return;
      }
      // New element: styled like the nearest matched neighbour.
      const near = [...pairs].reverse().find((q) => q.b >= 0 && q.a >= 0 && q.a < p.a) ?? pairs.find((q) => q.b >= 0 && q.a >= 0);
      const tmpl = near !== undefined ? n.items[near.b] : n.items[0];
      const child = multi && n.items.length > 0 ? lineIndent(text, n.items[0]!.start) : base;
      parts.push({ text: render(ctx, after[p.a], child, tmpl, multi), from: -1 });
    });
    return rebuild(text, n, n.items, parts, style);
  }
  // A different kind of value: replace it, styled like what it replaces.
  return render(ctx, after, lineIndent(text, n.start), n, false);
}

// -- the public function -----------------------------------------------------------

const BOM = "﻿";

/**
 * `beforeText` with `afterLayout` applied: every untouched byte kept, and the
 * result parses back to exactly `afterLayout`. Undefined when that cannot be
 * done (not JSON, a duplicated key, a change the patch could not read back).
 */
export function patchTouchText(beforeText: string, afterLayout: unknown): string | undefined {
  try {
    const target: unknown = JSON.parse(JSON.stringify(afterLayout));
    const from = beforeText.startsWith(BOM) ? 1 : 0;
    const { node, end } = parseTree(beforeText, from);
    // Nothing but whitespace may follow the value (a second value is not a layout).
    if (beforeText.slice(end).trim() !== "") return undefined;
    if (same(node.value, target)) return beforeText;
    const ctx: PatchCtx = { text: beforeText, style: detectStyle(beforeText) };
    const out = beforeText.slice(0, node.start) + patchNode(ctx, node, target) + beforeText.slice(node.end);
    const back: unknown = JSON.parse(out.startsWith(BOM) ? out.slice(1) : out);
    return same(back, target) ? out : undefined;
  } catch {
    return undefined;
  }
}
