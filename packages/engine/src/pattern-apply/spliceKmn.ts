// spliceKmn — position-faithful .kmn text projection (spec 111).
//
// Diffs two IRs that share node ids and applies the resulting edits to the
// starting text, leaving every line outside an edited span byte-identical,
// including its original line ending. Spans come from `sourceLine` plus
// `joinContinuations`, as carveViaSplice resolves them.

import type { KeyboardIR, IRGroup } from "@keyboard-studio/contracts";
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
}

function indexNodes(ir: KeyboardIR): Map<string, NodeInfo> {
  const m = new Map<string, NodeInfo>();
  for (const g of ir.groups) {
    m.set(g.nodeId, { kind: "group", sourceLine: g.sourceLine });
    for (const r of g.rules) m.set(r.nodeId, { kind: "rule", sourceLine: r.sourceLine });
  }
  for (const s of ir.stores) m.set(s.nodeId, { kind: "store", sourceLine: s.sourceLine });
  for (const f of ir.raw) m.set(f.nodeId, { kind: "raw", sourceLine: f.sourceLine });
  return m;
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

  for (const edit of edits) {
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
