// builtKmnView -- helpers for the Code tab's built view (spec 117 US8, research R15).
//
// On Copy the Code tab shows the keyboard as it will be built (the projected `.kmn`), and an Apply
// records the difference from that text as a kept `kmn-edits` entry. Two things follow from that
// and live here, as pure functions over text and IR:
//
// - `findGeneratedRuleTouches`: the projection generates some rules after the Layout-tab edits
//   (mark guards 2.6, context tolerance 2.7, caps handling 2.8) and replays the Code-tab edits
//   after them (2.9), so an edit to such a rule is kept like any other. It is still worth naming:
//   the author is asked to confirm that the edit overrides that step, and the entry is flagged for
//   review. A generated rule is found by differential, not by looking at the rule: the projection
//   reports the `.kmn` after each step (`kmnStageTap`), and a change whose anchor is in a
//   generating stage's text but not in the Layout-edit text (`kmn-edits`) touches something that
//   stage made or rewrote. `&TARGETS` (step 3.1 forces it to `any` on Copy) is the one exception
//   that is still refused.
// - `buildRevealLines`: "view in code" names a node of the working IR; the shown text is a
//   different parse, so the node is matched to its line in the shown text by content.

import type { IRChange, IRStore, KeyboardIR, StoreValue } from "@keyboard-studio/contracts";
import { applyIRChanges, diffIR, emitKmn, parseKmn } from "@keyboard-studio/engine";
import type { KmnStage } from "./projectWorkingCopyVfs.ts";

/**
 * Which step made, or rewrote, the rule an edit touched. `targets` is the `&TARGETS` store step 3.1
 * forces on Copy (the only source an Apply refuses). The identity steps (3 and 4) own the header
 * stores, whose edits keep the identity confirm, so they are never a source.
 */
export type GeneratedSource = "mark-guards" | "context-tolerance" | "caps" | "targets";

export interface GeneratedRuleTouch {
  /** Index into the Apply's changes. */
  readonly change: number;
  readonly source: GeneratedSource;
  /** 1-based line in the text the author was shown (1 when the change carries none). */
  readonly line: number;
}

/** The `.kmn` text after each reported stage, as `kmnStageTap` delivers it. */
export type KmnStageTexts = ReadonlyMap<KmnStage, string>;

/** The stages that can make or rewrite a rule between the Layout-tab edits and the Code-tab edits, in build order. */
const GENERATING_STAGES: ReadonlyArray<KmnStage & ("mark-guards" | "context-tolerance" | "caps")> = [
  "mark-guards",
  "context-tolerance",
  "caps",
];

/** System stores the identity steps (3, 4) write: an edit to one keeps the FR-062 identity confirm. */
const IDENTITY_STORES = new Set(["name", "copyright", "version", "keyboardversion", "bcp47", "languages", "message", "bitmap", "keyboardid"]);

type HeaderClass = "identity" | "targets" | null;

/** Whether a change is to a header-level item an identity step writes, and which kind. */
function headerClass(change: IRChange): HeaderClass {
  if (change.change === "set-header") {
    return "targets" in change.header || "targets" in change.previous ? "targets" : "identity";
  }
  if (change.change === "set-store" || change.change === "remove-store") {
    const system = change.change === "set-store" ? change.value.isSystem : change.previous.isSystem;
    if (!system) return null;
    const name = change.name.toLowerCase();
    if (name === "targets") return "targets";
    if (IDENTITY_STORES.has(name)) return "identity";
  }
  return null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function storeContent(s: StoreValue | IRStore): string {
  const { nodeId: _n, sourceLine: _l, consumedSourceLines: _c, trailingComment: _t, ...rest } = s as IRStore;
  return stable(rest);
}

function storeKey(s: { name: string; isSystem: boolean }): string {
  return `${s.isSystem ? "&" : ""}${s.name}`.toLowerCase();
}

/** Whether `change` finds what it names in `ir`: its anchor, and for a store change the store's content. */
function fitsIn(ir: KeyboardIR, change: IRChange): boolean {
  if (applyIRChanges(ir, [change]).misses.length > 0) return false;
  if (change.change === "set-store" || change.change === "remove-store") {
    const previous = change.previous;
    if (previous === undefined) return true;
    const here = ir.stores.find((s) => storeKey(s) === storeKey(previous));
    return here !== undefined && storeContent(here) === storeContent(previous);
  }
  return true;
}

function lineOfChange(change: IRChange, shown: KeyboardIR | null): number {
  let line: number | undefined;
  switch (change.change) {
    case "set-store":
    case "remove-store": {
      const system = change.change === "set-store" ? change.value.isSystem : change.previous.isSystem;
      line = shown?.stores.find((s) => storeKey(s) === storeKey({ name: change.name, isSystem: system }))?.sourceLine;
      break;
    }
    case "replace":
    case "remove":
      line = change.old.sourceLine;
      break;
    case "insert":
      line = change.node.sourceLine;
      break;
    default:
      line = undefined;
  }
  return Math.max(1, line ?? 1);
}

/**
 * The changes that touch a rule (or store) a generating step made or rewrote, in change order.
 * `stages` holds the `.kmn` after each reported step; `shownText` is the final projected text the
 * author edited. With no Layout-edit text (no projection ran) nothing can be told generated.
 *
 * The base is the `kmn-edits` text (Layout-tab edits applied, nothing generated). A change that
 * does not fit there but fits a generating stage's text was made by that stage; one that fits the
 * base but not a generating stage's text names a rule that stage rewrote in place. One that fits
 * nowhere (a rule an earlier Code-tab edit made, an Assign-tab rule that is not in the base...) is
 * not generated: it is left to the owner check and the compile gate's "does not fit". Header
 * stores the identity steps write are not generated (they keep the identity confirm), except
 * `&TARGETS`, which step 3.1 forces.
 */
export function findGeneratedRuleTouches(
  changes: readonly IRChange[],
  stages: KmnStageTexts,
  shownText: string,
  keyboardId: string,
): GeneratedRuleTouch[] {
  const baseText = stages.get("kmn-edits");
  if (baseText === undefined) return [];
  const parse = (text: string): KeyboardIR | null => {
    try {
      return parseKmn(text, keyboardId).ir;
    } catch {
      return null;
    }
  };
  const base = parse(baseText);
  if (base === null) return [];
  const shown = parse(shownText);
  const generated: Array<{ source: GeneratedSource; ir: KeyboardIR }> = [];
  for (const stage of GENERATING_STAGES) {
    const text = stages.get(stage);
    const ir = text === undefined || text === baseText ? null : parse(text);
    if (ir !== null) generated.push({ source: stage, ir });
  }

  const out: GeneratedRuleTouch[] = [];
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i]!;
    const header = headerClass(change);
    if (header === "identity") continue;
    if (header === "targets") {
      out.push({ change: i, source: "targets", line: lineOfChange(change, shown) });
      continue;
    }
    if (!fitsIn(base, change)) {
      const hit = generated.find((l) => fitsIn(l.ir, change));
      if (hit !== undefined) out.push({ change: i, source: hit.source, line: lineOfChange(change, shown) });
      continue;
    }
    if (change.change === "insert" || change.change === "remove" || change.change === "replace") {
      const rewritten = generated.find((l) => !fitsIn(l.ir, change));
      if (rewritten !== undefined) out.push({ change: i, source: rewritten.source, line: lineOfChange(change, shown) });
    }
  }
  return out;
}

function isIdentityChange(change: IRChange): boolean {
  const header = headerClass(change);
  return header === "identity" || header === "targets";
}

/** 1-based line in the applied text of the change that turns the predicted keyboard into it. */
function lineInApplied(change: IRChange, applied: KeyboardIR): number {
  let line: number | undefined;
  switch (change.change) {
    case "insert":
    case "replace":
      line = change.node.sourceLine;
      break;
    case "set-store": {
      const key = storeKey({ name: change.name, isSystem: change.value.isSystem });
      line = applied.stores.find((s) => storeKey(s) === key)?.sourceLine;
      break;
    }
    default:
      line = undefined;
  }
  return Math.max(1, line ?? 1);
}

/**
 * The 1-based line, in `appliedText`, of the first difference between the keyboard the build would
 * produce with the author's edit recorded (`predictedText`, the real projection run with the entry
 * included) and the text the author applied, or `null` when they agree. Formatting-only differences
 * do not count (both sides are parsed and diffed structurally), and neither do the header items the
 * identity steps own. A difference means a later build step overrides the edit, so recording it
 * would be silently lost.
 */
export function findBuildMismatch(predictedText: string, appliedText: string, keyboardId: string): number | null {
  let predicted: KeyboardIR;
  let applied: KeyboardIR;
  try {
    predicted = parseKmn(predictedText, keyboardId).ir;
    applied = parseKmn(appliedText, keyboardId).ir;
  } catch {
    return null;
  }
  const first = diffIR(predicted, applied).find((c) => !isIdentityChange(c));
  return first === undefined ? null : lineInApplied(first, applied);
}

/**
 * Node id of the WORKING IR -> 1-based line in `shownText`, for "view in code". The shown text is
 * the built keyboard, parsed afresh (its ids are not the working IR's), so each working node is
 * matched by content: a group or store by name, a rule by its group and emitted line, the nth
 * identical rule to the nth identical rule. A node the built keyboard does not hold (a rule an
 * assignment replaced) is simply absent.
 */
export function buildRevealLines(
  ir: KeyboardIR,
  shownText: string,
  keyboardId: string,
): Map<string, number> {
  const out = new Map<string, number>();
  let shown: KeyboardIR;
  try {
    shown = parseKmn(shownText, keyboardId).ir;
  } catch {
    return out;
  }
  const working = emitKmn(ir, { lineMap: true });
  const workingLines = working.text.split("\n");
  const shownEmit = emitKmn(shown, { lineMap: true });
  const shownLines = shownEmit.text.split("\n");

  const lineText = (lines: string[], map: ReadonlyMap<string, number>, id: string): string | undefined => {
    const n = map.get(id);
    return n === undefined ? undefined : lines[n - 1];
  };

  for (const g of ir.groups) {
    const other = shown.groups.find((x) => x.name === g.name);
    if (other === undefined) continue;
    if (other.sourceLine !== undefined) out.set(g.nodeId, other.sourceLine);
    const pool = new Map<string, number[]>();
    for (const r of other.rules) {
      const text = lineText(shownLines, shownEmit.lineByNodeId, r.nodeId);
      if (text === undefined || r.sourceLine === undefined) continue;
      const list = pool.get(text) ?? [];
      list.push(r.sourceLine);
      pool.set(text, list);
    }
    const used = new Map<string, number>();
    for (const r of g.rules) {
      const text = lineText(workingLines, working.lineByNodeId, r.nodeId);
      if (text === undefined) continue;
      const n = used.get(text) ?? 0;
      used.set(text, n + 1);
      const line = pool.get(text)?.[n];
      if (line !== undefined) out.set(r.nodeId, line);
    }
  }
  for (const s of ir.stores) {
    const other = shown.stores.find((x) => storeKey(x) === storeKey(s));
    if (other?.sourceLine !== undefined) out.set(s.nodeId, other.sourceLine);
  }
  return out;
}
