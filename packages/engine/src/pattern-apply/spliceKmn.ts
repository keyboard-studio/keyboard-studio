// spliceKmn — position-faithful .kmn text projection (spec 111).
//
// Diffs two IRs that share node ids and applies the resulting edits to the
// starting text, leaving every line outside an edited span byte-identical,
// including its original line ending. Spans come from `sourceLine` plus
// `joinContinuations`, as carveViaSplice resolves them.

import type { KeyboardIR, IRGroup, IRRule } from "@keyboard-studio/contracts";
import { joinContinuations, type LogicalLine } from "../codec/continuation.js";
import { emitRule, emitStore } from "../codec/emit.js";

export type InsertAnchor =
  | { after: "last-store" }
  | { after: "group-end"; groupNodeId: string };

export type KmnEdit =
  | { kind: "delete"; nodeId: string }
  | { kind: "replace"; nodeId: string; text: string }
  | { kind: "insert"; anchor: InsertAnchor; text: string };

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
      });
    }
  }
  for (const s of ir.stores) {
    m.set(s.nodeId, {
      kind: "store",
      sourceLine: s.sourceLine,
      consumedSourceLines: s.consumedSourceLines,
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
  type NonInsertEdit = Exclude<KmnEdit, { kind: "insert" }>;
  const bySpanStart = new Map<number, NonInsertEdit[]>();
  const out: KmnEdit[] = [];
  for (const edit of edits) {
    if (edit.kind === "insert") {
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

  const workIds = new Set<string>();
  for (const g of ir.groups) {
    workIds.add(g.nodeId);
    for (const r of g.rules) {
      workIds.add(r.nodeId);
      const text = emitRule(r, g.usingKeys);
      const before = startRuleText.get(r.nodeId);
      if (before === undefined) {
        edits.push({ kind: "insert", anchor: { after: "group-end", groupNodeId: g.nodeId }, text });
      } else if (before !== text) {
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

  for (const edit of normalisedEdits) {
    if (edit.kind === "insert") {
      let after: number | undefined;
      if (edit.anchor.after === "last-store") {
        for (const s of startIr.stores) {
          const sp = spanOf(s.sourceLine);
          if (sp !== undefined && (after === undefined || sp.end > after)) after = sp.end;
        }
        if (after === undefined) return { ok: false, reason: "no store with a source span to insert after" };
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
      replaceAt.set(span.start, edit.text);
      if (!/\n$/.test(lines[span.end] ?? "")) replaceNoEol.add(span.start);
    }
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
  return { ok: true, text: out.join("") };
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
