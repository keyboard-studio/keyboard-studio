// spliceKmn — position-faithful .kmn text projection (spec 111).
//
// Diffs two IRs that share node ids and applies the resulting edits to the
// starting text, leaving every line outside an edited span byte-identical,
// including its original line ending. Spans come from `sourceLine` plus
// `joinContinuations`, as carveViaSplice resolves them.

import type { KeyboardIR, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { joinContinuations, type LogicalLine } from "../codec/continuation.js";
import { emitRule, emitStore } from "../codec/emit.js";
import { parse } from "../codec/parse.js";

export type InsertAnchor =
  | { after: "last-store" }
  | { after: "group-end"; groupNodeId: string }
  // Rules match first to last, so a new rule goes right after the nearest
  // earlier rule both versions share, or right after the group header when
  // no earlier rule is shared.
  | { after: "rule"; nodeId: string }
  | { after: "group-start"; groupNodeId: string };

export type KmnEdit =
  | { kind: "delete"; nodeId: string }
  | { kind: "replace"; nodeId: string; text: string }
  | { kind: "insert"; anchor: InsertAnchor; text: string }
  // A whole new group: header line plus its rules, newline-joined in `text`.
  // Anchored after the last surviving line of the file (the end of the last
  // existing group), behind one blank line unless that line is blank. The group is never in the
  // starting keyboard, so nothing else can anchor on it.
  | { kind: "insert-group"; groupNodeId: string; text: string };

export type SpliceKmnResult =
  | { ok: true; text: string }
  | { ok: false; reason: string; nodeId?: string };

interface NodeInfo {
  kind: "group" | "rule" | "store" | "raw";
  sourceLine: number | undefined;
  /**
   * Extra source lines the node consumes beyond `sourceLine` (a #2633
   * merge-dropped twin's line, or a dropped header statement's line).
   * Deleting/replacing the node must remove these lines too — they have
   * no node of their own, so nothing else ever deletes them.
   */
  consumedSourceLines?: readonly number[] | undefined;
  /** The node's own trailing `c <comment>` text, when it has one. */
  trailingComment?: string | undefined;
}

function indexNodes(ir: KeyboardIR): Map<string, NodeInfo> {
  const m = new Map<string, NodeInfo>();
  for (const g of ir.groups) {
    m.set(g.nodeId, { kind: "group", sourceLine: g.sourceLine });
    for (const r of g.rules) {
      m.set(r.nodeId, {
        kind: "rule",
        sourceLine: r.sourceLine,
        consumedSourceLines: r.consumedSourceLines,
        trailingComment: r.trailingComment,
      });
    }
  }
  for (const s of ir.stores) {
    m.set(s.nodeId, {
      kind: "store",
      sourceLine: s.sourceLine,
      consumedSourceLines: s.consumedSourceLines,
      trailingComment: s.trailingComment,
    });
  }
  for (const f of ir.raw) {
    m.set(f.nodeId, {
      kind: "raw",
      sourceLine: f.sourceLine,
      consumedSourceLines: f.consumedSourceLines,
    });
  }
  return m;
}

/**
 * Normalise delete/replace edits that land on a physical line shared by
 * several rules (#2633 target-selector expansion: one `$keymanweb:` line
 * becomes three platform-guarded copies sharing its sourceLine). The
 * line-granular apply loop below cannot express "delete one copy": left
 * alone, deleting one copy would delete the whole line (silently dropping
 * the surviving copies), and deleting all copies would error as
 * "overlapping edits". Each shared line's edits collapse into a single
 * edit — a delete when every rule on the line is deleted, otherwise a
 * replace with the surviving rules re-emitted in IR order (a deleted
 * first copy's trailing comment rides onto the last surviving line).
 * Lines with a single rule pass through untouched, so the common 1-line /
 * 1-node case is byte-identical to before.
 */
function normaliseSharedLineEdits(
  startIr: KeyboardIR,
  edits: readonly KmnEdit[],
  spanOf: (sourceLine: number | undefined) => Span | undefined,
): KmnEdit[] {
  const nodes = indexNodes(startIr);
  // Rules by source line — only lines with >1 rule need normalisation.
  const rulesByLine = new Map<number, { group: IRGroup; rule: IRRule }[]>();
  for (const g of startIr.groups) {
    for (const r of g.rules) {
      if (r.sourceLine === undefined) continue;
      const list = rulesByLine.get(r.sourceLine) ?? [];
      list.push({ group: g, rule: r });
      rulesByLine.set(r.sourceLine, list);
    }
  }

  // Group non-insert edits by the start of their resolved span.
  type NonInsertEdit = Exclude<KmnEdit, { kind: "insert" | "insert-group" }>;
  const bySpanStart = new Map<number, NonInsertEdit[]>();
  const out: KmnEdit[] = [];
  for (const edit of edits) {
    if (edit.kind === "insert" || edit.kind === "insert-group") {
      out.push(edit);
      continue;
    }
    const info = nodes.get(edit.nodeId);
    const span = info === undefined ? undefined : spanOf(info.sourceLine);
    if (span === undefined) {
      out.push(edit);
      continue;
    }
    const list = bySpanStart.get(span.start) ?? [];
    list.push(edit);
    bySpanStart.set(span.start, list);
  }

  // A line shared by several rules needs normalisation even for a SINGLE
  // edit on it: deleting one copy must re-emit the surviving copies onto
  // the line, not delete it. Lines with one rule pass through untouched.
  for (const lineEdits of bySpanStart.values()) {
    const first = lineEdits[0]!;
    const firstInfo = nodes.get(first.nodeId);
    const lineRules = rulesByLine.get(firstInfo?.sourceLine ?? -1) ?? [];
    if (lineRules.length < 2) {
      out.push(...lineEdits);
      continue;
    }
    // Several rules on one physical line: only the shared-rule-line shape
    // is normalised; anything else falls through to the overlap error.
    const ruleIds = new Set(lineRules.map(({ rule }) => rule.nodeId));
    const allRuleEdits = lineEdits.every(
      (e) => (e.kind === "delete" || e.kind === "replace") && ruleIds.has(e.nodeId),
    );
    if (!allRuleEdits) {
      out.push(...lineEdits);
      continue;
    }
    const byId = new Map(lineEdits.map((e) => [e.nodeId, e]));
    const survivors: { rule: IRRule; text: string }[] = [];
    let droppedComment: string | undefined;
    for (const { group, rule } of lineRules) {
      const edit = byId.get(rule.nodeId);
      if (edit === undefined) {
        survivors.push({ rule, text: emitRule(rule, group.usingKeys) });
      } else if (edit.kind === "replace") {
        survivors.push({ rule, text: edit.text });
      } else if (droppedComment === undefined) {
        droppedComment = rule.trailingComment;
      }
    }
    if (survivors.length === 0) {
      // Every rule on the line is deleted: one delete, not N overlapping ones.
      out.push({ kind: "delete", nodeId: lineRules[0]!.rule.nodeId });
      continue;
    }
    // A deleted first copy owned the line's trailing comment (parse gives
    // it to copy 0 only); carry it onto the last surviving line so the
    // comment is not lost with the deleted copy.
    const last = survivors[survivors.length - 1]!;
    if (droppedComment !== undefined && last.rule.trailingComment === undefined) {
      last.text = `${last.text} c ${droppedComment}`;
    }
    out.push({
      kind: "replace",
      nodeId: lineRules[0]!.rule.nodeId,
      text: survivors.map((s) => s.text).join("\n"),
    });
  }
  return out;
}

/** Diff two IRs that share node ids (startIr -> working ir) into edits. */
export function diffIrToKmnEdits(startIr: KeyboardIR, ir: KeyboardIR): KmnEdit[] {
  const edits: KmnEdit[] = [];
  const startStoreById = new Map(startIr.stores.map((s) => [s.nodeId, s]));
  const startRawById = new Map(startIr.raw.map((f) => [f.nodeId, f]));
  const startRuleText = new Map<string, string>();
  for (const g of startIr.groups) {
    for (const r of g.rules) startRuleText.set(r.nodeId, emitRule(r, g.usingKeys));
  }

  const startGroupIds = new Set(startIr.groups.map((g) => g.nodeId));
  const workIds = new Set<string>();
  for (const g of ir.groups) {
    workIds.add(g.nodeId);
    if (!startGroupIds.has(g.nodeId)) {
      // A group the text does not have: one insert carrying header + rules.
      const header = g.usingKeys ? `group(${g.name}) using keys` : `group(${g.name})`;
      const body = g.rules.map((r) => {
        workIds.add(r.nodeId);
        return emitRule(r, g.usingKeys);
      });
      edits.push({ kind: "insert-group", groupNodeId: g.nodeId, text: [header, ...body].join("\n") });
      continue;
    }
    let lastShared: string | undefined;
    for (const r of g.rules) {
      workIds.add(r.nodeId);
      const text = emitRule(r, g.usingKeys);
      const before = startRuleText.get(r.nodeId);
      if (before === undefined) {
        const anchor: InsertAnchor =
          lastShared !== undefined
            ? { after: "rule", nodeId: lastShared }
            : { after: "group-start", groupNodeId: g.nodeId };
        edits.push({ kind: "insert", anchor, text });
        continue;
      }
      lastShared = r.nodeId;
      if (before !== text) {
        edits.push({ kind: "replace", nodeId: r.nodeId, text });
      }
    }
  }
  for (const s of ir.stores) {
    workIds.add(s.nodeId);
    const text = emitStore(s);
    const before = startStoreById.get(s.nodeId);
    if (before === undefined) {
      edits.push({ kind: "insert", anchor: { after: "last-store" }, text });
    } else if (emitStore(before) !== text) {
      edits.push({ kind: "replace", nodeId: s.nodeId, text });
    }
  }
  for (const f of ir.raw) {
    workIds.add(f.nodeId);
    const before = startRawById.get(f.nodeId);
    if (before === undefined) {
      const anchor: InsertAnchor =
        f.groupNodeId !== undefined
          ? { after: "group-end", groupNodeId: f.groupNodeId }
          : { after: "last-store" };
      edits.push({ kind: "insert", anchor, text: f.sourceText });
    } else if (before.sourceText !== f.sourceText) {
      edits.push({ kind: "replace", nodeId: f.nodeId, text: f.sourceText });
    }
  }

  for (const g of startIr.groups) {
    if (!workIds.has(g.nodeId)) edits.push({ kind: "delete", nodeId: g.nodeId });
    for (const r of g.rules) {
      if (!workIds.has(r.nodeId)) edits.push({ kind: "delete", nodeId: r.nodeId });
    }
  }
  for (const s of startIr.stores) {
    if (!workIds.has(s.nodeId)) edits.push({ kind: "delete", nodeId: s.nodeId });
  }
  for (const f of startIr.raw) {
    if (!workIds.has(f.nodeId)) edits.push({ kind: "delete", nodeId: f.nodeId });
  }
  return edits;
}

interface Span {
  start: number; // 0-based physical line index, inclusive
  end: number;
}

// ---------------------------------------------------------------------------
// Keeping the author's spelling in a replaced line (Open mode)
//
// A replace edit carries text freshly emitted from the IR, which re-spells the
// whole line. When the new line only drops things from the old one, the lines
// the author wrote are kept as they were: a store loses just the dropped
// items (the rest keep their `U+XXXX` / quoted / `dk()` spelling and line
// layout), and the gap before a trailing comment is kept as written. Anything
// not recognised, or any result that does not re-read as the intended line,
// falls back to the emitted text, so this can only ever keep more of the file.
// ---------------------------------------------------------------------------

interface StoreTok {
  start: number;
  end: number;
  quote: "'" | '"' | "";
  items: string[];
}

interface StoreBody {
  head: string;
  toks: StoreTok[];
  /** From the trailing comment's `c` to the end; "" when there is none. */
  tail: string;
  /** Where the gap after the last token ends (start of `tail`, or end of text). */
  gapEnd: number;
  bodyStart: number;
  text: string;
}

function tokenizeStore(text: string): StoreBody | undefined {
  const h = /^(store\s*\([A-Za-z0-9_&]+\))/i.exec(text);
  if (h === null) return undefined;
  const bodyStart = h[1]!.length;
  const toks: StoreTok[] = [];
  let pos = bodyStart;
  let tail = "";
  let gapEnd = text.length;
  const gapRe = /(?:[ \t]+|\\[ \t]*\r?\n)/y;
  for (;;) {
    gapRe.lastIndex = pos;
    let m = gapRe.exec(text);
    let sawGap = false;
    while (m !== null) {
      sawGap = true;
      pos = gapRe.lastIndex;
      m = gapRe.exec(text);
    }
    if (pos >= text.length) break;
    const rest = text.slice(pos);
    if (sawGap && /^c(?:[ \t]|$)/i.test(rest)) {
      tail = rest;
      gapEnd = pos;
      break;
    }
    let tm: RegExpExecArray | null;
    if ((tm = /^(['"])([^'"\r\n]*)\1(?=[ \t\\]|$)/.exec(rest)) !== null || (tm = /^(['"])([^\r\n]*?)\1(?=[ \t\\]|$)/.exec(rest)) !== null) {
      const q = tm[1] as "'" | '"';
      if (tm[2]!.includes(q)) return undefined;
      toks.push({ start: pos, end: pos + tm[0].length, quote: q, items: [...tm[2]!].map((c) => `c:${c.codePointAt(0)}`) });
      pos += tm[0].length;
    } else if ((tm = /^U\+([0-9A-Fa-f]{4,6})(?=[ \t\\]|$)/.exec(rest)) !== null) {
      toks.push({ start: pos, end: pos + tm[0].length, quote: "", items: [`c:${parseInt(tm[1]!, 16)}`] });
      pos += tm[0].length;
    } else if ((tm = /^(?:dk|deadkey)\(\s*([^)\s]+)\s*\)(?=[ \t\\]|$)/i.exec(rest)) !== null) {
      toks.push({ start: pos, end: pos + tm[0].length, quote: "", items: [`dk:${tm[1]!.toLowerCase()}`] });
      pos += tm[0].length;
    } else {
      return undefined;
    }
  }
  return { head: h[1]!, toks, tail, gapEnd, bodyStart, text };
}

/** How the codec reads a store line: name, items and comment, as one comparable string. */
function realStoreOf(line: string): string | undefined {
  try {
    const ir = parse(`${line}\nbegin Unicode > use(main)\ngroup(main) using keys\n`, "guard").ir;
    const st = ir.stores[0];
    if (st === undefined) return undefined;
    return JSON.stringify({ n: st.name, s: st.isSystem, i: st.items, c: st.trailingComment });
  } catch {
    return undefined;
  }
}

const tailText = (t: string): string => t.replace(/^c[ \t]*/i, "");

/** The old store line with only the dropped items removed, or undefined when that is not possible. */
function dropStoreItems(orig: string, next: string): string | undefined {
  const o = tokenizeStore(orig);
  const n = tokenizeStore(next);
  if (o === undefined || n === undefined) return undefined;
  if (o.head.toLowerCase() !== n.head.toLowerCase()) return undefined;
  if (tailText(o.tail) !== tailText(n.tail)) return undefined;
  const want = n.toks.flatMap((t) => t.items);
  let j = 0;
  const kept: boolean[][] = [];
  for (const t of o.toks) {
    kept.push(
      t.items.map((it) => {
        if (j < want.length && want[j] === it) {
          j += 1;
          return true;
        }
        return false;
      }),
    );
  }
  if (j !== want.length || want.length === 0) return undefined;
  let out = o.head;
  let prevEnd = o.bodyStart;
  for (let i = 0; i < o.toks.length; i++) {
    const t = o.toks[i]!;
    const flags = kept[i]!;
    const keptAny = flags.some(Boolean);
    const gap = orig.slice(prevEnd, t.start);
    prevEnd = t.end;
    if (!keptAny) continue;
    let tokText = orig.slice(t.start, t.end);
    if (!flags.every(Boolean)) {
      const chars = [...tokText.slice(1, -1)].filter((_, k) => flags[k]);
      tokText = `${t.quote}${chars.join("")}${t.quote}`;
    }
    out += gap + tokText;
  }
  out += orig.slice(prevEnd, o.gapEnd) + o.tail;
  // A gap that belonged to a dropped token is gone with it; what is left must
  // still read as exactly the intended store.
  const check = tokenizeStore(out);
  if (check === undefined) return undefined;
  const got = check.toks.flatMap((t) => t.items);
  if (got.length !== want.length || got.some((it, k) => it !== want[k])) return undefined;
  if (tailText(check.tail) !== tailText(n.tail)) return undefined;
  // The tokeniser must not vouch for its own reading: the real parser has to
  // read the edited line as the same store as the freshly emitted one.
  const real = realStoreOf(out);
  const intended = realStoreOf(next);
  if (real === undefined || intended === undefined || real !== intended) return undefined;
  return out;
}

/** Keep the original gap before a trailing `c <comment>` when the new line carries the same comment. */
function keepCommentGap(orig: string, next: string, comment: string | undefined): string {
  if (comment === undefined) return next;
  const suffix = `c ${comment}`;
  const lastLine = orig.slice(orig.lastIndexOf("\n") + 1);
  if (!lastLine.endsWith(suffix)) return next;
  const gap = /[ \t]+$/.exec(lastLine.slice(0, -suffix.length));
  if (gap === null) return next;
  const nextSuffix = ` ${suffix}`;
  if (!next.endsWith(nextSuffix)) return next;
  return next.slice(0, -nextSuffix.length) + gap[0] + suffix;
}

/** The new store line re-quoted in the old line's quote style, when only the values changed. */
function keepQuoteStyle(orig: string, next: string): string | undefined {
  const o = tokenizeStore(orig);
  const n = tokenizeStore(next);
  if (o === undefined || n === undefined) return undefined;
  if (o.head.toLowerCase() !== n.head.toLowerCase() || o.toks.length !== n.toks.length || n.toks.length === 0) return undefined;
  let out = next.slice(0, n.toks[0]!.start);
  for (let i = 0; i < n.toks.length; i++) {
    const ot = o.toks[i]!;
    const nt = n.toks[i]!;
    let text = next.slice(nt.start, nt.end);
    if (ot.quote !== "" && nt.quote !== "" && ot.quote !== nt.quote) {
      const body = text.slice(1, -1);
      if (body.includes(ot.quote)) return undefined;
      text = `${ot.quote}${body}${ot.quote}`;
    }
    out += text + next.slice(nt.end, n.toks[i + 1]?.start ?? next.length);
  }
  if (out === next) return undefined;
  const real = realStoreOf(out);
  const intended = realStoreOf(next);
  return real !== undefined && real === intended ? out : undefined;
}

function refineReplacement(info: NodeInfo, orig: string, next: string): string {
  if (info.kind === "store" && !next.includes("\n")) {
    const dropped = dropStoreItems(orig, next);
    if (dropped !== undefined) return dropped;
    const requoted = keepQuoteStyle(orig, next);
    if (requoted !== undefined) return keepCommentGap(orig, requoted, info.trailingComment);
  }
  if (info.kind === "rule" || info.kind === "store") {
    return keepCommentGap(orig, next, info.trailingComment);
  }
  return next;
}

/** Apply edits to the starting text. ok:false names the first ineligible edit. */
export function spliceKmn(
  startText: string,
  startIr: KeyboardIR,
  edits: readonly KmnEdit[],
): SpliceKmnResult {
  if (edits.length === 0) return { ok: true, text: startText };

  const nodes = indexNodes(startIr);
  const logical = new Map<number, LogicalLine>(joinContinuations(startText).map((l) => [l.line, l]));
  const spanOf = (sourceLine: number | undefined): Span | undefined => {
    if (sourceLine === undefined) return undefined;
    const l = logical.get(sourceLine);
    if (l === undefined) return undefined;
    return { start: l.line - 1, end: l.line - 1 + l.segments.length - 1 };
  };

  // Physical lines keep their own terminators.
  const lines = startText.split(/(?<=\n)/);
  const eol = startText.includes("\r\n") ? "\r\n" : "\n";
  const normalise = (text: string, withTerminator: boolean): string => {
    const body = text.replace(/\r?\n$/, "").replace(/\r?\n/g, eol);
    return withTerminator ? body + eol : body;
  };

  const removed = new Set<number>();
  const replaceAt = new Map<number, string>(); // span start line -> replacement text
  const replaceNoEol = new Set<number>();
  const insertAfter = new Map<number, string[]>(); // line index -> texts

  // Collapse edits that share one physical line (several rules from one
  // `$keymanweb:` line) into a single edit per line before applying.
  const normalisedEdits = normaliseSharedLineEdits(startIr, edits, spanOf);

  const groupInserts: string[] = [];
  for (const edit of normalisedEdits) {
    if (edit.kind === "insert-group") {
      groupInserts.push(edit.text);
      continue;
    }
    if (edit.kind === "insert") {
      let after: number | undefined;
      if (edit.anchor.after === "last-store") {
        for (const s of startIr.stores) {
          const sp = spanOf(s.sourceLine);
          if (sp !== undefined && (after === undefined || sp.end > after)) after = sp.end;
        }
        if (after === undefined) return { ok: false, reason: "no store with a source span to insert after" };
      } else if (edit.anchor.after === "rule") {
        const anchorId = edit.anchor.nodeId;
        const info = nodes.get(anchorId);
        const sp = info === undefined ? undefined : spanOf(info.sourceLine);
        if (info === undefined || info.kind !== "rule" || sp === undefined) {
          return { ok: false, reason: `insert anchor rule "${anchorId}" has no resolvable source span`, nodeId: anchorId };
        }
        after = sp.end;
      } else if (edit.anchor.after === "group-start") {
        const groupNodeId = edit.anchor.groupNodeId;
        const g: IRGroup | undefined = startIr.groups.find((x) => x.nodeId === groupNodeId);
        if (g === undefined) {
          return { ok: false, reason: `insert anchor group "${groupNodeId}" is not in the starting keyboard`, nodeId: groupNodeId };
        }
        const hs = spanOf(g.sourceLine);
        if (hs === undefined) return { ok: false, reason: `group "${groupNodeId}" has no resolvable source span`, nodeId: groupNodeId };
        after = hs.end;
      } else {
        const groupNodeId = edit.anchor.groupNodeId;
        const g: IRGroup | undefined = startIr.groups.find((x) => x.nodeId === groupNodeId);
        if (g === undefined) {
          return { ok: false, reason: `insert anchor group "${groupNodeId}" is not in the starting keyboard`, nodeId: groupNodeId };
        }
        for (const r of g.rules) {
          const sp = spanOf(r.sourceLine);
          if (sp !== undefined && (after === undefined || sp.end > after)) after = sp.end;
        }
        if (after === undefined) {
          const hs = spanOf(g.sourceLine);
          if (hs === undefined) return { ok: false, reason: `group "${groupNodeId}" has no resolvable source span`, nodeId: groupNodeId };
          after = hs.end;
        }
      }
      const list = insertAfter.get(after) ?? [];
      list.push(edit.text);
      insertAfter.set(after, list);
      continue;
    }

    const info = nodes.get(edit.nodeId);
    if (info === undefined) return { ok: false, reason: `node "${edit.nodeId}" is not in the starting keyboard`, nodeId: edit.nodeId };
    if (edit.kind === "replace" && info.kind === "raw") {
      return { ok: false, reason: `opaque fragment "${edit.nodeId}" cannot be edited`, nodeId: edit.nodeId };
    }
    if (edit.kind === "replace" && info.kind === "group") {
      return { ok: false, reason: `group header "${edit.nodeId}" cannot be replaced`, nodeId: edit.nodeId };
    }
    const span = spanOf(info.sourceLine);
    if (span === undefined) {
      return { ok: false, reason: `${info.kind} "${edit.nodeId}" has no resolvable source span`, nodeId: edit.nodeId };
    }
    for (let i = span.start; i <= span.end; i++) {
      if (removed.has(i)) return { ok: false, reason: `overlapping edits on "${edit.nodeId}"`, nodeId: edit.nodeId };
      removed.add(i);
    }
    // A merge-dropped twin's line (consumedSourceLines) has no node of its
    // own: editing this node must remove it too, or a re-parse resurrects
    // the twin. Idempotent — the line is unowned, so no other edit claims it.
    if (info.consumedSourceLines !== undefined) {
      for (const line of info.consumedSourceLines) {
        const cspan = spanOf(line);
        if (cspan === undefined) continue;
        for (let i = cspan.start; i <= cspan.end; i++) removed.add(i);
      }
    }
    if (edit.kind === "replace") {
      const origText = lines.slice(span.start, span.end + 1).join("").replace(/\r?\n$/, "").replace(/^\uFEFF/, "");
      replaceAt.set(span.start, refineReplacement(info, origText, edit.text));
      if (!/\n$/.test(lines[span.end] ?? "")) replaceNoEol.add(span.start);
    }
  }

  // New groups go after the last line that survives, behind one blank line
  // unless that line is already blank (a group removed in the same call took
  // its own lines, not the blank that separated it, so strip-then-reinsert
  // of a trailing group is byte-identical). They follow any other insert on
  // that same line.
  if (groupInserts.length > 0) {
    let last = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!removed.has(i) || replaceAt.has(i)) {
        last = i;
        break;
      }
    }
    // Anything inserted after the last surviving line (a fragment anchored on a
    // group whose last rule was deleted) must stay above the new group.
    for (const k of insertAfter.keys()) if (k > last) last = k;
    if (last === -1) last = lines.length - 1;
    const list = insertAfter.get(last) ?? [];
    const prior = list[list.length - 1];
    const lastText = prior !== undefined ? prior : (replaceAt.get(last) ?? lines[last] ?? "");
    let needBlank = lastText.trim() !== "";
    for (const t of groupInserts) {
      if (needBlank) list.push("");
      list.push(t);
      needBlank = true;
    }
    insertAfter.set(last, list);
  }

  const out: string[] = [];
  const push = (piece: string): void => {
    const prev = out[out.length - 1];
    if (prev !== undefined && !prev.endsWith("\n")) out[out.length - 1] = prev + eol;
    out.push(piece);
  };
  for (let i = 0; i < lines.length; i++) {
    const replacement = replaceAt.get(i);
    if (replacement !== undefined) {
      push(normalise(replacement, !replaceNoEol.has(i)));
    } else if (!removed.has(i)) {
      push(lines[i]!);
    }
    for (const t of insertAfter.get(i) ?? []) push(normalise(t, true));
  }
  const joined = out.join("");
  // A leading BOM belongs to the file, not to whatever line sat first.
  const bom = startText.startsWith("\uFEFF") && !joined.startsWith("\uFEFF");
  return { ok: true, text: bom ? `\uFEFF${joined}` : joined };
}

/** diff + splice; caller decides what to do on ok:false (Open: ask, then emit). */
export function projectKmnText(
  startText: string,
  startIr: KeyboardIR,
  ir: KeyboardIR,
): SpliceKmnResult {
  // A reordered (or cross-group moved) node cannot be expressed as an edit.
  const startGroupOf = new Map<string, string>();
  const startOrder = new Map<string, string[]>();
  for (const g of startIr.groups) {
    startOrder.set(g.nodeId, g.rules.map((r) => r.nodeId));
    for (const r of g.rules) startGroupOf.set(r.nodeId, g.nodeId);
  }
  // A new group is placed after the last line of the text, so it must come
  // after every group the text already has; anything else is a reorder.
  const startGroupIds = new Set(startIr.groups.map((g) => g.nodeId));
  let sawNew = false;
  for (const g of ir.groups) {
    if (!startGroupIds.has(g.nodeId)) sawNew = true;
    else if (sawNew) {
      return { ok: false, reason: `group "${g.nodeId}" follows a new group`, nodeId: g.nodeId };
    }
  }
  for (const g of ir.groups) {
    const common = g.rules.map((r) => r.nodeId).filter((id) => startGroupOf.has(id));
    for (const id of common) {
      if (startGroupOf.get(id) !== g.nodeId) {
        return { ok: false, reason: `rule "${id}" moved between groups`, nodeId: id };
      }
    }
    const commonSet = new Set(common);
    const inStart = (startOrder.get(g.nodeId) ?? []).filter((id) => commonSet.has(id));
    for (let i = 0; i < common.length; i++) {
      if (common[i] !== inStart[i]) {
        return { ok: false, reason: `rule "${common[i]}" was reordered`, nodeId: common[i]! };
      }
    }
  }
  const startStoreIds = new Set(startIr.stores.map((s) => s.nodeId));
  const workStoreIds = new Set(ir.stores.map((s) => s.nodeId));
  const workCommon = ir.stores.map((s) => s.nodeId).filter((id) => startStoreIds.has(id));
  const startCommon = startIr.stores.map((s) => s.nodeId).filter((id) => workStoreIds.has(id));
  for (let i = 0; i < workCommon.length; i++) {
    if (workCommon[i] !== startCommon[i]) {
      return { ok: false, reason: `store "${workCommon[i]}" was reordered`, nodeId: workCommon[i]! };
    }
  }
  return spliceKmn(startText, startIr, diffIrToKmnEdits(startIr, ir));
}
