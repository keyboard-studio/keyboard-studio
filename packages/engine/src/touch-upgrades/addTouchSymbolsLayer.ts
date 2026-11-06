/**
 * Symbols-layer upgrade for a touch layout (spec 111 T059c).
 *
 * Adds the owner's `symbol` layer (`symbols.json`, embedded in
 * `symbolsLayerData.ts`) when a platform has none, and a `K_SYMBOLS` link key
 * on every other layer: `symbol` from most layers, `symbol-caps` from the caps
 * layers (that layer is derived from `symbol`, its `*abc*` key replaced by an
 * `*ABC*` key that returns to `caps`).
 *
 * The link key follows the keyboards fork's "add K_SYMBOLS link key" change:
 * one placement for the whole platform so keys do not move between layers --
 * on the row that holds `K_SPACE`, just after `K_LOPT`, as wide as `K_LOPT`,
 * taking its room from the row's slack first and from `K_SPACE` for the rest
 * (the spacebar never goes below 500). A platform where that does not fit is
 * left alone.
 *
 * Platforms on the numerals scheme (a `K_NUMERALS` key) already reach symbols
 * through their own layers and are not touched. Raw JSON in, raw JSON out; a
 * layout with nothing to add comes back as the same string.
 */

import { isTouchCapsLayerId, isTouchOneShotKey } from "@keyboard-studio/contracts";
import { TOUCH_LAYOUT_JSON_INDENT } from "../codec/parse-touch.js";
import { SYMBOLS_LAYER } from "./symbolsLayerData.js";

interface RawKey {
  id?: string;
  text?: string;
  sp?: string | number;
  width?: string | number;
  pad?: string | number;
  nextlayer?: string | null;
  [k: string]: unknown;
}
interface RawRow {
  id?: number | string;
  key?: RawKey[];
  [k: string]: unknown;
}
interface RawLayer {
  id?: string;
  row?: RawRow[];
  [k: string]: unknown;
}

const DEFAULT_KEY_WIDTH = 100;
const DEFAULT_PAD = 15;
const DEFAULT_LINK_WIDTH = 140;
const SPACE_FLOOR = 500;

/** Layers of the symbols route, which carry no K_SYMBOLS link of their own. */
const isSymbolFamily = (id: string): boolean => /^(symbol|numeric|currency)/i.test(id);

const num = (v: string | number | undefined): number | undefined => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const keysOf = (layer: RawLayer): RawKey[] => (layer.row ?? []).flatMap((r) => r.key ?? []);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rowTotal = (row: RawRow): number =>
  (row.key ?? []).reduce(
    (sum, k) => sum + (num(k.width) ?? DEFAULT_KEY_WIDTH) + (num(k.pad) ?? DEFAULT_PAD),
    0,
  );

/**
 * A copy of the symbols data whose character keys return to `back` after one
 * tap (the one-shot rule the caps upgrade applies to every non-default layer,
 * so the two upgrades agree whichever runs first).
 */
function symbolsLayerReturningTo(id: string, back: string): RawLayer {
  const layer = clone(SYMBOLS_LAYER) as RawLayer;
  layer.id = id;
  for (const row of layer.row ?? []) {
    row.key = (row.key ?? []).map((k) => {
      if (id === "symbol-caps" && k.id === "K_LOWER") {
        return { id: "T_UPPER", text: "*ABC*", sp: 2, nextlayer: "caps" };
      }
      if (k.nextlayer === undefined && isTouchOneShotKey(k.sp)) return { ...k, nextlayer: back };
      if (k.nextlayer === "default") return { ...k, nextlayer: back };
      return k;
    });
  }
  return layer;
}

interface Slot {
  layer: RawLayer;
  row: RawRow;
  /** Index to insert the link key at. */
  at: number;
  space: RawKey;
  total: number;
  widest: number;
}

/** Where a layer's K_SYMBOLS goes, or undefined when the layer has no K_SPACE row. */
function slotFor(layer: RawLayer): Slot | undefined {
  const rows = layer.row ?? [];
  const row = rows.find((r) => (r.key ?? []).some((k) => k.id === "K_SPACE"));
  if (row === undefined) return undefined;
  const keys = row.key ?? [];
  const space = keys.find((k) => k.id === "K_SPACE")!;
  const lopt = keys.findIndex((k) => k.id === "K_LOPT");
  return {
    layer,
    row,
    at: lopt >= 0 ? lopt + 1 : keys.indexOf(space),
    space,
    total: rowTotal(row),
    widest: Math.max(...rows.map(rowTotal)),
  };
}

/** Add what one platform lacks; returns true when anything changed. */
function fixPlatform(layers: RawLayer[]): boolean {
  const def = layers.find((l) => l.id === "default");
  if (def === undefined) return false;
  if (layers.some((l) => keysOf(l).some((k) => k.id === "K_NUMERALS"))) return false;

  const needLink = layers.filter(
    (l) =>
      typeof l.id === "string" &&
      !isSymbolFamily(l.id) &&
      !keysOf(l).some((k) => k.id === "K_SYMBOLS"),
  );

  // Plan the link key first: a platform it does not fit is left untouched.
  let width = DEFAULT_LINK_WIDTH;
  let shrink = 0;
  const slots: Slot[] = [];
  if (needLink.length > 0) {
    const slotted = needLink.map(slotFor);
    if (slotted.some((s) => s === undefined)) return false;
    slots.push(...(slotted as Slot[]));
    const lopt = keysOf(def).find((k) => k.id === "K_LOPT");
    width = num(lopt?.width) ?? DEFAULT_LINK_WIDTH;
    const needed = width + DEFAULT_PAD;
    shrink = Math.max(...slots.map((s) => Math.max(0, needed - (s.widest - s.total))));
    if (slots.some((s) => (num(s.space.width) ?? DEFAULT_KEY_WIDTH) - shrink < SPACE_FLOOR)) return false;
  }

  let changed = false;
  if (!layers.some((l) => l.id === "symbol")) {
    layers.push(symbolsLayerReturningTo("symbol", "default"));
    changed = true;
  }
  const linksToCaps = [...needLink, ...layers.filter((l) => keysOf(l).some((k) => k.id === "K_SYMBOLS"))].some(
    (l) => typeof l.id === "string" && isTouchCapsLayerId(l.id) && !isSymbolFamily(l.id),
  );
  if (linksToCaps && !layers.some((l) => l.id === "symbol-caps")) {
    layers.push(symbolsLayerReturningTo("symbol-caps", "caps"));
    changed = true;
  }
  for (const slot of slots) {
    const id = slot.layer.id as string;
    slot.row.key = slot.row.key ?? [];
    slot.row.key.splice(slot.at, 0, {
      id: "K_SYMBOLS",
      text: "*Symbol*",
      sp: 1,
      width,
      nextlayer: isTouchCapsLayerId(id) ? "symbol-caps" : "symbol",
    });
    if (shrink > 0) {
      const old = num(slot.space.width) ?? DEFAULT_KEY_WIDTH;
      slot.space.width = typeof slot.space.width === "string" ? String(old - shrink) : old - shrink;
    }
    changed = true;
  }
  return changed;
}

export function addTouchSymbolsLayerRaw(rawJson: string): { json: string; changed: boolean } {
  let layout: Record<string, unknown>;
  try {
    layout = JSON.parse(rawJson) as Record<string, unknown>;
  } catch {
    return { json: rawJson, changed: false };
  }
  if (layout === null || typeof layout !== "object") return { json: rawJson, changed: false };
  let changed = false;
  for (const platform of Object.values(layout)) {
    const layers = (platform as { layer?: unknown } | null)?.layer;
    if (Array.isArray(layers) && fixPlatform(layers as RawLayer[])) changed = true;
  }
  if (!changed) return { json: rawJson, changed: false };
  return { json: JSON.stringify(layout, null, TOUCH_LAYOUT_JSON_INDENT), changed: true };
}
