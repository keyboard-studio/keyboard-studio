// Base-keyboard fill (FR-021, row 2.8; task T031).
//
// LDML does not fall through to the base keyboard: an undefined key outputs nothing. So every
// main-block position of the chosen form, in every exported layer, gets an explicit key: the
// rule's output, or else the base keyboard's character for that layer. The positions to fill
// are those spec 109's enumerator reports as unhandled. A position whose rule outputs `nul` or
// `beep` with no context is a gap and overrides the fill (rows 3.15a, 3.16; FR-029). A `"deadkey"`
// cell at a position no rule covers is omitted (row 2.26), and the classifier reports it.
//
// Each position's provenance (authored, filled, suppressed) is recorded for FR-028.

import { enumerateUnhandledPositions, type PositionState } from "../../base-fallback/unhandledPositions.js";
import { layerModifiers, tableVKey } from "../classify/keystrokes.js";
import type { RulePlan } from "../classify/ruleElements.js";
import type { LdmlBaseLayout } from "../types.js";
import { baseCasedKeys, expandCaps, type LayerKey } from "./capsExpand.js";
import { compareCodePoints } from "./keyIds.js";
import { FORM_ROWS, type LdmlForm } from "./positions.js";

export type Provenance = "authored" | "filled" | "suppressed";

/** One rule reaching one key in one layer (after caps expansion and key-store expansion). */
export interface ExpandedRule {
  plan: RulePlan;
  vkey: string;
  layer: LayerKey;
  itemIndex: number | null;
}

export interface GridCell {
  vkey: string;
  /** The rule that decides the key's output when it has no context (the first by source line). */
  ctxless: ExpandedRule | undefined;
  /** Rules with context that fire on this key. */
  ctxRules: ExpandedRule[];
  /** The base keyboard's character for this layer and key. */
  base: string | "deadkey" | undefined;
  provenance: Provenance;
}

export interface GridLayer {
  /** The `modifiers` attribute. */
  modifiers: string;
  components: readonly string[];
  caps: boolean;
  /** In position-table order. */
  cells: GridCell[];
}

export interface Grid {
  form: LdmlForm;
  layers: GridLayer[];
}

const BASE_STATES: readonly { state: PositionState; components: readonly string[] }[] = [
  { state: "none", components: [] },
  { state: "shift", components: ["shift"] },
  { state: "altgr", components: ["altR"] },
  { state: "shiftAltgr", components: ["altR", "shift"] },
];

const STATE_LAYER: Record<PositionState, "base" | "shift" | "altgr" | "shiftAltgr"> = {
  none: "base",
  shift: "shift",
  altgr: "altgr",
  shiftAltgr: "shiftAltgr",
};

function stateOfComponents(components: readonly string[]): PositionState | null {
  const key = components.join(" ");
  return BASE_STATES.find((s) => s.components.join(" ") === key)?.state ?? null;
}

/** The base keyboard's character for a layer and key, with caps derived as Windows does (research R26). */
export function baseCharFor(
  base: LdmlBaseLayout,
  components: readonly string[],
  caps: boolean,
  vkey: string,
  cased: ReadonlySet<string> = baseCasedKeys(base),
): string | "deadkey" | undefined {
  const state = stateOfComponents(components);
  if (state === null) return undefined;
  let layer = STATE_LAYER[state];
  if (caps && cased.has(vkey) && (layer === "base" || layer === "shift")) layer = layer === "base" ? "shift" : "base";
  const c = base.layers[layer][vkey];
  if (c === undefined && vkey === "K_SPACE" && Object.keys(base.layers[layer]).length > 0) return " ";
  return c;
}

/** Expand the lowered key rules over caps layers (row 2.14) and key-store items (row 2.25). */
export function expandKeyRules(plans: readonly RulePlan[], cased: ReadonlySet<string>): ExpandedRule[] {
  const out: ExpandedRule[] = [];
  for (const plan of plans) {
    if (!plan.lower || plan.backspace || plan.facts.role !== "main" || !plan.group.usingKeys) continue;
    for (const t of plan.targets) {
      for (const layer of expandCaps(t.target.mods, t.target.vkey, cased)) {
        out.push({ plan, vkey: tableVKey(t.target.vkey), layer, itemIndex: t.itemIndex });
      }
    }
  }
  return out;
}

/** True when the rule has no context to match (guards, which are evaluated away, do not count). */
export function isContextFree(plan: RulePlan): boolean {
  return !plan.hasContext && !plan.anchorStart;
}

function layerId(l: LayerKey): string {
  return layerModifiers(l.components, l.caps);
}

export interface FillInput {
  plans: readonly RulePlan[];
  baseLayout: LdmlBaseLayout;
  form: LdmlForm;
  cased: ReadonlySet<string>;
  /** The IR, for the unhandled-position enumerator. */
  ir: Parameters<typeof enumerateUnhandledPositions>[0];
}

export function computeGrid(input: FillInput): Grid {
  const { baseLayout: base, form } = input;
  const expanded = expandKeyRules(input.plans, input.cased);
  const baseCased = baseCasedKeys(base);
  const positions = FORM_ROWS[form].flatMap((row) => row.map((c) => c.vkey));
  const unhandled = new Set(enumerateUnhandledPositions(input.ir, positions).map((p) => `${p.vkey}|${p.state}`));

  // Layers: the base keyboard's, with caps variants, plus any layer a rule reaches.
  const layers = new Map<string, LayerKey>();
  for (const s of BASE_STATES) {
    const has = Object.keys(base.layers[STATE_LAYER[s.state]]).length > 0;
    if (!has) continue;
    for (const caps of [false, true]) layers.set(layerModifiers(s.components, caps), { components: s.components, caps });
  }
  for (const e of expanded) layers.set(layerId(e.layer), e.layer);
  const baseOrder = new Map<string, number>();
  BASE_STATES.forEach((s, i) => {
    baseOrder.set(layerModifiers(s.components, false), i * 2);
    baseOrder.set(layerModifiers(s.components, true), i * 2 + 1);
  });
  const ordered = [...layers.entries()].sort(([a], [b]) => {
    const x = baseOrder.get(a);
    const y = baseOrder.get(b);
    if (x !== undefined && y !== undefined) return x - y;
    if (x !== undefined) return -1;
    if (y !== undefined) return 1;
    return compareCodePoints(a, b);
  });

  const byCell = new Map<string, ExpandedRule[]>();
  for (const e of expanded) {
    const k = `${layerId(e.layer)}|${e.vkey}`;
    const list = byCell.get(k) ?? [];
    list.push(e);
    byCell.set(k, list);
  }

  const out: GridLayer[] = [];
  for (const [modifiers, lk] of ordered) {
    const state = stateOfComponents(lk.components);
    const cells: GridCell[] = [];
    for (const vkey of positions) {
      const rules = byCell.get(`${modifiers}|${vkey}`) ?? [];
      const free = rules.filter((r) => isContextFree(r.plan)).sort((a, b) => (a.plan.rule.sourceLine ?? 0) - (b.plan.rule.sourceLine ?? 0));
      const ctxRules = rules.filter((r) => !isContextFree(r.plan));
      const ctxless = free[0];
      let provenance: Provenance;
      if (ctxless?.plan.suppress) provenance = "suppressed";
      else if (rules.length > 0 || (state !== null && !unhandled.has(`${vkey}|${state}`))) provenance = "authored";
      else provenance = "filled";
      cells.push({
        vkey,
        ctxless,
        ctxRules,
        base: baseCharFor(base, lk.components, lk.caps, vkey, baseCased),
        provenance,
      });
    }
    out.push({ modifiers, components: lk.components, caps: lk.caps, cells });
  }
  return { form, layers: out };
}

