// Trigger text and trigger markers (mapping section 3; task T032).
//
// KMN fires on keystroke identity; LDML fires on a key's output plus context. A context-free
// character rule becomes the key's `output`. A key with context rules gets a trigger: its
// no-context output, or else its base character, and the transforms match `context + trigger`.
// When another position types the same text but does not carry the same context rules, the key
// gets a trigger marker `\m{...}` as its output instead, and one catch-all transform per marker,
// `\m{m}` to the key's default output, sits last in its group so no marker is ever left in text
// (FR-024).

import { dkKey } from "../classify/ruleElements.js";
import type { OutputElement } from "@keyboard-studio/contracts";
import type { IRStore } from "@keyboard-studio/contracts";
import { impliedKeyId, compareCodePoints, outputKeyId } from "./keyIds.js";
import type { Grid, GridCell, GridLayer } from "./baseFill.js";
import { escapeFrom, escapeOutput, escapeTo, marker } from "./transforms.js";

/** Typed text: literal characters and markers, in order. */
export type Part = { t: "text"; v: string } | { t: "marker"; source: string };

export function partsKey(parts: readonly Part[]): string {
  return parts.map((p) => (p.t === "text" ? `T${p.v}` : `M${p.source}`)).join("\u0000");
}

function pushText(parts: Part[], v: string): void {
  if (v === "") return;
  const last = parts[parts.length - 1];
  if (last?.t === "text") last.v += v;
  else parts.push({ t: "text", v });
}

function storeItem(store: IRStore | undefined, i: number): string {
  const it = store?.items[i];
  return it?.kind === "char" ? it.value : "";
}

/** The text a context-free rule types, as parts. */
export function ruleParts(
  out: readonly OutputElement[],
  itemIndex: number | null,
  findStore: (name: string) => IRStore | undefined,
): Part[] {
  const parts: Part[] = [];
  for (const o of out) {
    if (o.kind === "char") pushText(parts, o.value);
    else if (o.kind === "deadkey" || o.kind === "namedDeadkey") parts.push({ t: "marker", source: dkKey(o) });
    else if (o.kind === "outs") {
      const s = findStore(o.storeRef);
      for (let i = 0; i < (s?.items.length ?? 0); i++) pushText(parts, storeItem(s, i));
    } else if (o.kind === "index") pushText(parts, storeItem(findStore(o.storeRef), itemIndex ?? 0));
  }
  return parts;
}

export function basePartsOf(c: string): Part[] {
  return c === "" ? [] : [{ t: "text", v: c }];
}

export type CellKind =
  /** A position the author or base gives no output: omitted or suppressed. */
  | { kind: "gap" }
  | { kind: "text"; parts: Part[] }
  /** The key types a marker; a catch-all supplies the default text. */
  | { kind: "marker"; source: string; defaultParts: Part[] };

export interface TriggerPlan {
  /** layer modifiers + "|" + vkey, to what the cell does. */
  cells: Map<string, CellKind>;
  /** Marker sources used as triggers (deterministic order). */
  triggerSources: string[];
  /** Catch-all per trigger marker: marker source, key id source, default text parts. */
  catchAlls: { source: string; defaultParts: Part[] }[];
}

export function cellKey(layer: GridLayer, vkey: string): string {
  return `${layer.modifiers}|${vkey}`;
}

function ruleSetKey(cell: GridCell): string {
  return cell.ctxRules
    .map((r) => `${r.plan.nodeKey}#${r.itemIndex ?? ""}`)
    .sort(compareCodePoints)
    .join(",");
}

/** Default (no-context) parts for a cell, or null for a gap. */
function defaultParts(cell: GridCell, findStore: (name: string) => IRStore | undefined): Part[] | null {
  if (cell.ctxless) {
    if (cell.ctxless.plan.suppress) return null;
    return ruleParts(cell.ctxless.plan.rule.output, cell.ctxless.itemIndex, findStore);
  }
  if (cell.base === undefined || cell.base === "deadkey") return [];
  return basePartsOf(cell.base);
}

export function partsFromText(parts: readonly Part[], markerOf: (source: string) => string, side: "from" | "to" | "output"): string {
  let out = "";
  for (const p of parts) {
    if (p.t === "marker") out += marker(markerOf(p.source));
    else out += side === "from" ? escapeFrom(p.v) : side === "to" ? escapeTo(p.v) : escapeOutput(p.v);
  }
  return out;
}

/** The key id for typed parts: the implied id, else a content-derived one. */
export function keyIdProposal(parts: readonly Part[], markerOf: (source: string) => string): string {
  if (parts.length === 1 && parts[0]?.t === "text") {
    const implied = impliedKeyId(parts[0].v);
    if (implied !== undefined) return implied;
    return outputKeyId(parts[0].v);
  }
  const pieces = parts.map((p) => (p.t === "text" ? outputKeyId(p.v) : `m_${markerOf(p.source)}`));
  return pieces.join("_");
}

export function planTriggers(
  grid: Grid,
  findStore: (name: string) => IRStore | undefined,
): TriggerPlan {
  const cells = new Map<string, CellKind>();
  const defaults = new Map<string, Part[] | null>();
  const textIndex = new Map<string, { key: string; rules: string }[]>();
  for (const layer of grid.layers) {
    for (const cell of layer.cells) {
      const key = cellKey(layer, cell.vkey);
      const d = defaultParts(cell, findStore);
      defaults.set(key, d);
      if (d === null || d.length === 0) continue;
      const tk = partsKey(d);
      const list = textIndex.get(tk) ?? [];
      list.push({ key, rules: ruleSetKey(cell) });
      textIndex.set(tk, list);
    }
  }

  // Distinct (vkey, text, rule set) combinations that need a marker, numbered per key.
  const needs = new Map<string, { vkey: string; tk: string; rules: string }>();
  for (const layer of grid.layers) {
    for (const cell of layer.cells) {
      if (cell.ctxRules.length === 0) continue;
      const key = cellKey(layer, cell.vkey);
      const d = defaults.get(key);
      if (d === null || d === undefined) continue;
      const rules = ruleSetKey(cell);
      const tk = partsKey(d);
      const forced = d.length === 0;
      const collides = (textIndex.get(tk) ?? []).some((o) => o.key !== key && o.rules !== rules);
      if (forced || collides) needs.set(`${cell.vkey}\u0001${tk}\u0001${rules}`, { vkey: cell.vkey, tk, rules });
    }
  }
  const perKey = new Map<string, string[]>();
  for (const id of [...needs.keys()].sort(compareCodePoints)) {
    const n = needs.get(id) as { vkey: string };
    const list = perKey.get(n.vkey) ?? [];
    list.push(id);
    perKey.set(n.vkey, list);
  }
  const sourceOf = new Map<string, string>();
  for (const [vkey, ids] of perKey) ids.forEach((id, i) => sourceOf.set(id, `trigger:${vkey}:${i + 1}`));

  const catchAlls = new Map<string, { source: string; defaultParts: Part[] }>();
  for (const layer of grid.layers) {
    for (const cell of layer.cells) {
      const key = cellKey(layer, cell.vkey);
      const d = defaults.get(key);
      if (d === null || d === undefined) {
        cells.set(key, { kind: "gap" });
        continue;
      }
      const id = `${cell.vkey}\u0001${partsKey(d)}\u0001${ruleSetKey(cell)}`;
      const source = cell.ctxRules.length > 0 ? sourceOf.get(id) : undefined;
      if (source !== undefined) {
        cells.set(key, { kind: "marker", source, defaultParts: d });
        catchAlls.set(source, { source, defaultParts: d });
      } else if (d.length === 0) {
        cells.set(key, { kind: "gap" });
      } else {
        cells.set(key, { kind: "text", parts: d });
      }
    }
  }
  const triggerSources = [...catchAlls.keys()].sort(compareCodePoints);
  return {
    cells,
    triggerSources,
    catchAlls: triggerSources.map((s) => catchAlls.get(s) as { source: string; defaultParts: Part[] }),
  };
}

