// Keystroke classification (mapping rows 2.1-2.7, 2.9-2.13, 2.19-2.25).
// A rule has no key field: the keystroke is found through the shared rule-shape readers
// (the element after the `+` separator, or the last element when there is none).

import {
  US_BASE_LAYOUT,
  ruleConditions,
  ruleHasNulContext,
  ruleKeystroke,
  rulePreContext,
} from "@keyboard-studio/contracts";
import { assertNever } from "@keyboard-studio/contracts";
import type { ContextElement, IRRule, IRStore, StoreItem } from "@keyboard-studio/contracts";
import { FORM_ONLY_KEYS, FORM_ROWS, type LdmlForm } from "../lower/positions.js";
import type { LdmlBaseLayout, RowId } from "../types.js";
import { isUnsupportedModifier, parseBracketKey } from "./rawText.js";

/** LDML modifier components, in the canonical order a layer's `modifiers` is written. */
export const COMPONENT_ORDER = ["ctrl", "ctrlL", "ctrlR", "alt", "altL", "altR", "shift"] as const;

export interface ModifierSet {
  /** LDML components (never `caps`), canonical order. */
  components: string[];
  /** `any`: the rule names no caps state (row 2.14). */
  caps: "on" | "off" | "any";
  /** Rows to report: 2.12, 2.22, 2.23. */
  rows: RowId[];
  /** NUMLOCK / SCROLL words (row 2.22). */
  unsupported: string[];
  /** Left and right modifiers mixed (row 2.23). */
  mixedSides: boolean;
}

function sideOf(word: string): "L" | "R" | null {
  if (word === "LCTRL" || word === "LALT") return "L";
  if (word === "RCTRL" || word === "RALT") return "R";
  return null;
}

/** Analyse a KMN modifier word list. `neutral` collapses the sided forms to ctrl/alt (row 2.23). */
export function analyseModifiers(words: readonly string[], neutral = false): ModifierSet {
  const comps = new Set<string>();
  const rows: RowId[] = [];
  const unsupported: string[] = [];
  let caps: ModifierSet["caps"] = "any";
  const sides = new Set<string>();
  for (const raw of words) {
    const w = raw.toUpperCase();
    const side = sideOf(w);
    if (side) sides.add(side);
    switch (w) {
      case "SHIFT":
        comps.add("shift");
        break;
      case "RSHIFT":
      case "LSHIFT":
        comps.add("shift");
        if (!rows.includes("2.12")) rows.push("2.12");
        break;
      case "CTRL":
        comps.add("ctrl");
        break;
      case "LCTRL":
        comps.add(neutral ? "ctrl" : "ctrlL");
        break;
      case "RCTRL":
        comps.add(neutral ? "ctrl" : "ctrlR");
        break;
      case "ALT":
        comps.add("alt");
        break;
      case "LALT":
        comps.add(neutral ? "alt" : "altL");
        break;
      case "RALT":
        comps.add(neutral ? "alt" : "altR");
        break;
      case "CAPS":
        caps = "on";
        break;
      case "NCAPS":
        caps = "off";
        break;
      default:
        if (isUnsupportedModifier(w)) unsupported.push(w);
    }
  }
  const mixedSides = sides.size > 1;
  if (mixedSides) rows.push("2.23");
  if (unsupported.length > 0) rows.push("2.22");
  const components = COMPONENT_ORDER.filter((c) => comps.has(c));
  return { components, caps, rows, unsupported, mixedSides };
}

export type Keystroke =
  | { kind: "vkey"; vkey: string; mods: ModifierSet }
  | { kind: "char"; char: string }
  | { kind: "any"; storeRef: string }
  /** `[NUMLOCK K_A]`: a bracketed key the codec kept as text (row 2.22). */
  | { kind: "rawKey"; vkey: string; mods: ModifierSet }
  | { kind: "opaque"; text: string };

export interface SplitRule {
  /** Context before the keystroke (guards and `nul` still present). */
  pre: ContextElement[];
  keystroke: Keystroke | null;
  /** The keystroke's own context element, for offset arithmetic. */
  keyElement: ContextElement | null;
}

function toKeystroke(el: ContextElement): Keystroke {
  switch (el.kind) {
    case "vkey":
      return { kind: "vkey", vkey: el.name, mods: analyseModifiers(el.modifiers) };
    case "char":
      return { kind: "char", char: el.value };
    case "any":
      return { kind: "any", storeRef: el.storeRef };
    case "raw": {
      const b = parseBracketKey(el.text);
      if (b) return { kind: "rawKey", vkey: b.vkey, mods: analyseModifiers(b.modifiers) };
      return { kind: "opaque", text: el.text };
    }
    case "notany":
    case "deadkey":
    case "namedDeadkey":
    case "context":
    case "index":
    case "baselayout":
    case "if":
      return { kind: "opaque", text: el.kind };
    default:
      return assertNever(el, "toKeystroke");
  }
}

/**
 * Split a rule at its keystroke, through the shared rule-shape readers. A rule in
 * a group without `using keys` has none. `pre` is `[nul?, ...conditions,
 * ...preContext]` and never carries the `+` separator, so `[...pre, keyElement]`
 * is the offset-numbered element list (`elementAtOffset`).
 */
export function splitRule(rule: IRRule, usingKeys: boolean): SplitRule {
  const group = { usingKeys };
  const pre: ContextElement[] = [];
  if (ruleHasNulContext(rule)) pre.push({ kind: "raw", text: "nul" });
  pre.push(...ruleConditions(rule), ...rulePreContext(rule, group));
  const keyElement = ruleKeystroke(rule, group) ?? null;
  return { pre, keystroke: keyElement === null ? null : toKeystroke(keyElement), keyElement };
}

// ---------------------------------------------------------------------------
// Positions

const MAIN_BLOCK = new Map<string, string>();
for (const rows of Object.values(FORM_ROWS)) {
  for (const r of rows) for (const c of r) MAIN_BLOCK.set(c.vkey.toUpperCase(), c.vkey);
}

/** Normalised spelling of a vkey (`K_oE2` and `K_OE2` are one key). */
export function canonVKey(v: string): string {
  return v.toUpperCase();
}

/** The position tables' spelling of a vkey (`K_oE2`), or the input when it is not a main-block key. */
export function tableVKey(v: string): string {
  return MAIN_BLOCK.get(canonVKey(v)) ?? v;
}

export type VKeyClass = "main" | "bksp" | "frame" | "touch";

export function classifyVKey(v: string): VKeyClass {
  const u = canonVKey(v);
  if (u.startsWith("T_") || u.startsWith("U_")) return "touch";
  if (u === "K_BKSP") return "bksp";
  if (MAIN_BLOCK.has(u)) return "main";
  return "frame";
}

/** The forms a vkey lives on, or null when it is on every form. */
export function formsOf(v: string): readonly LdmlForm[] | null {
  return FORM_ONLY_KEYS[tableVKey(v)] ?? null;
}

const usChars: { char: string; vkey: string; shift: boolean }[] = [];
for (const [k, v] of US_BASE_LAYOUT) {
  const shift = k.startsWith("S+");
  usChars.push({ char: v, vkey: shift ? k.slice(2) : k, shift });
}

export interface KeyTarget {
  vkey: string;
  mods: ModifierSet;
}

const LAYER_NAMES = ["base", "shift", "altgr", "shiftAltgr"] as const;
type BaseLayerName = (typeof LAYER_NAMES)[number];

/** Reverse index of a base layout: character to the first (vkey, layer) that types it. */
export function baseCharIndex(base: LdmlBaseLayout): Map<string, { vkey: string; layer: BaseLayerName }> {
  const out = new Map<string, { vkey: string; layer: BaseLayerName }>();
  for (const layer of LAYER_NAMES) {
    for (const vkey of Object.keys(base.layers[layer]).sort()) {
      const c = base.layers[layer][vkey];
      if (c !== undefined && c !== "deadkey" && !out.has(c)) out.set(c, { vkey, layer });
    }
  }
  return out;
}

/** The KMN modifier words a base-layout layer stands for. */
export function layerWords(layer: BaseLayerName): string[] {
  if (layer === "base") return [];
  if (layer === "shift") return ["SHIFT"];
  if (layer === "altgr") return ["RALT"];
  return ["RALT", "SHIFT"];
}

export interface ResolveContext {
  mnemonic: boolean;
  baseLayout: LdmlBaseLayout;
}

/** Resolve a char to a key target through the US layout (positional) or the base keyboard (mnemonic). */
export function charTarget(char: string, rc: ResolveContext): KeyTarget | null {
  if (rc.mnemonic) {
    const hit = baseCharIndex(rc.baseLayout).get(char);
    return hit ? { vkey: hit.vkey, mods: analyseModifiers(layerWords(hit.layer)) } : null;
  }
  const us = usChars.find((e) => e.char === char);
  if (!us) return null;
  return { vkey: us.vkey, mods: analyseModifiers(us.shift ? ["SHIFT"] : []) };
}

/** A vkey keystroke's target; on a mnemonic keyboard the US character is re-found on the base keyboard. */
export function vkeyTarget(vkey: string, mods: ModifierSet, rc: ResolveContext): KeyTarget {
  const key = tableVKey(vkey);
  if (!rc.mnemonic) return { vkey: key, mods };
  const shift = mods.components.includes("shift");
  const us = US_BASE_LAYOUT.get(shift ? `S+${key}` : key);
  if (us === undefined) return { vkey: key, mods };
  return charTarget(us, rc) ?? { vkey: key, mods };
}

/** Items of an `any()` keystroke store as key targets (row 2.25); null where an item does not resolve. */
export function storeKeyTargets(store: IRStore | undefined, rc: ResolveContext): (KeyTarget | null)[] {
  if (!store) return [];
  return store.items.map((it: StoreItem): KeyTarget | null => {
    if (it.kind === "vkey") return vkeyTarget(it.name, analyseModifiers([]), rc);
    if (it.kind === "char") return charTarget(it.value, rc);
    if (it.kind === "raw") {
      const b = parseBracketKey(it.text);
      if (b) return vkeyTarget(b.vkey, analyseModifiers(b.modifiers), rc);
    }
    return null;
  });
}

/** Choose the hardware form (FR-020): ISO-only keys or an ISO-family base give `iso`; `abnt2`/`jis` for theirs. */
export function chooseForm(vkeysUsed: Iterable<string>, base: LdmlBaseLayout): LdmlForm {
  const used = new Set<string>();
  for (const v of vkeysUsed) used.add(canonVKey(v));
  if (used.has("K_OC1")) return "abnt2";
  if (used.has("K_OE0") || used.has("K_OE1")) return "jis";
  if (used.has("K_OE2") || base.isoFamily) return "iso";
  return "us";
}

/** True when the form has a position for the vkey. */
export function formHasKey(form: LdmlForm, vkey: string): boolean {
  const key = tableVKey(vkey);
  const only = FORM_ONLY_KEYS[key];
  return only === undefined || only.includes(form);
}

/** The `modifiers` attribute of a hardware layer: `none` for none, else components then `caps`. */
export function layerModifiers(components: readonly string[], caps: boolean): string {
  const parts = [...components];
  if (caps) parts.push("caps");
  return parts.length === 0 ? "none" : parts.join(" ");
}
