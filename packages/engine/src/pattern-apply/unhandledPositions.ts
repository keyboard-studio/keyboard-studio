// Unhandled-position enumerator (spec 109, FR-040 / FR-041).
//
// Returns the printable key-and-modifier positions the IR does not handle.
// It is positional: it reads only the IR, never a base keyboard. The caller
// joins characters in from base-keyboard data (FR-041), so the engine imports
// nothing from the studio.
//
// A position is HANDLED when some rule binds that key on that modifier layer
// with no other context (a bare `+ [MODS K_X]`, or an `any()` over a store that
// lists the key). A rule that also needs a character or deadkey in its context
// only handles the key conditionally, so the bare position still falls through.
//
// `layerBound` is true when the IR binds at least one printable key on that
// layer, conditionally or not. The default and Shift layers are always listed
// so an overlay keyboard that binds only a few keys still reports the rest.
// Frame keys (Backspace, Enter, Tab, Escape, Delete, navigation, Space) are
// not in the printable set, so they are never reported.

import type { IRRule, KeyboardIR, StoreItem } from "@keyboard-studio/contracts";
import { canonicalizeCombo, parseKeySpec, type ModifierToken } from "./modifierCombos.js";

/** One printable position the IR does not handle. */
export interface UnhandledPosition {
  /** Virtual-key name, e.g. "K_A". */
  key: string;
  /** Canonical kmn modifier set, space-joined; "" for the default layer. */
  modifiers: string;
  /** True when the IR binds at least one printable key on this modifier layer. */
  layerBound: boolean;
}

const PRINTABLE_KEYS: readonly string[] = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((c) => `K_${c}`),
  ..."1234567890".split("").map((d) => `K_${d}`),
  "K_BKQUOTE",
  "K_HYPHEN",
  "K_EQUAL",
  "K_LBRKT",
  "K_RBRKT",
  "K_BKSLASH",
  "K_COLON",
  "K_QUOTE",
  "K_COMMA",
  "K_PERIOD",
  "K_SLASH",
  "K_OE2",
];

const PRINTABLE_SET: ReadonlySet<string> = new Set(PRINTABLE_KEYS);

/** Layers always listed, bound or not. */
const STANDARD_LAYERS: readonly string[] = ["", "SHIFT"];

function layerOf(tokens: readonly string[]): string | undefined {
  try {
    return canonicalizeCombo(tokens.filter((t): t is ModifierToken => t.length > 0 && isToken(t))).join(" ");
  } catch {
    return undefined;
  }
}

const TOKENS: ReadonlySet<string> = new Set([
  "SHIFT", "CAPS", "NCAPS", "ALT", "RALT", "LALT", "CTRL", "RCTRL", "LCTRL",
]);

function isToken(t: string): t is ModifierToken {
  return TOKENS.has(t);
}

export interface Binding {
  key: string;
  layer: string;
}

export function bindingsOfStoreItem(item: StoreItem): Binding | undefined {
  let parsed: { tokens: ModifierToken[]; vkey: string } | null = null;
  if (item.kind === "vkey") parsed = { tokens: [], vkey: item.name };
  else if (item.kind === "raw") parsed = parseKeySpec(item.text);
  if (!parsed) return undefined;
  return { key: parsed.vkey, layer: parsed.tokens.join(" ") };
}

/**
 * A store's items with `outs(other)` references spliced in, so a store built
 * from parts (as `swallowUndefined` does when one line would be too long)
 * reads the same as its flattened form.
 */
export function expandedStoreItems(
  ir: KeyboardIR,
  storeName: string,
  seen: ReadonlySet<string> = new Set(),
): StoreItem[] {
  if (seen.has(storeName)) return [];
  const store = ir.stores.find((s) => s.name === storeName);
  if (store === undefined) return [];
  const next = new Set(seen).add(storeName);
  const out: StoreItem[] = [];
  for (const item of store.items) {
    const ref = item.kind === "raw" ? /^outs\(([^)]+)\)$/.exec(item.text.trim()) : null;
    if (ref?.[1] !== undefined) out.push(...expandedStoreItems(ir, ref[1], next));
    else out.push(item);
  }
  return out;
}

/** The key bindings one rule makes, and whether they are unconditional. */
export function bindingsOfRule(ir: KeyboardIR, rule: IRRule): { bindings: Binding[]; bare: boolean } {
  const bindings: Binding[] = [];
  let conditional = false;
  for (const el of rule.context) {
    if (el.kind === "vkey") {
      const layer = layerOf(el.modifiers);
      if (layer !== undefined) bindings.push({ key: el.name, layer });
    } else if (el.kind === "any") {
      for (const item of expandedStoreItems(ir, el.storeRef)) {
        const b = bindingsOfStoreItem(item);
        if (b) bindings.push(b);
      }
    } else if (!(el.kind === "raw" && el.text === "+")) {
      conditional = true;
    }
  }
  return { bindings, bare: !conditional };
}

/**
 * Printable positions the IR does not handle, in stable order: layers in
 * first-seen order (default, Shift, then any other bound layer), keys in
 * keyboard order within a layer. Deterministic for a given IR.
 */
export function enumerateUnhandledPositions(ir: KeyboardIR): UnhandledPosition[] {
  const handled = new Set<string>();
  const boundLayers = new Set<string>();
  const layers: string[] = [...STANDARD_LAYERS];

  for (const group of ir.groups) {
    if (group.readonly) continue;
    for (const rule of group.rules) {
      const { bindings, bare } = bindingsOfRule(ir, rule);
      for (const { key, layer } of bindings) {
        if (!PRINTABLE_SET.has(key)) continue;
        boundLayers.add(layer);
        if (!layers.includes(layer)) layers.push(layer);
        if (bare) handled.add(`${layer}|${key}`);
      }
    }
  }

  const out: UnhandledPosition[] = [];
  for (const layer of layers) {
    for (const key of PRINTABLE_KEYS) {
      if (handled.has(`${layer}|${key}`)) continue;
      out.push({ key, modifiers: layer, layerBound: boundLayers.has(layer) });
    }
  }
  return out;
}
