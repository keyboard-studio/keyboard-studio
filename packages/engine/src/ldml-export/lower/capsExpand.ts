// Caps-lock expansion (mapping row 2.14; task T029).
//
// LDML layers match modifiers exactly, and `none` requires caps up. A KMN rule that names
// no caps flag therefore has to be emitted into both the `X` and the `X caps` layer. The
// rule is kmcmplib's `ExpandCapsRulesForGroup`: under caps lock a cased key behaves as if
// its shift state were inverted, so the shift-less rule reaches the `shift caps` layer on a
// cased key, and the `caps` layer on every other key. Which keys are cased comes from
// `&CasedKeys`; a keyboard that declares none inverts nothing.

import { declaredCasedKeys, type KeyboardIR } from "@keyboard-studio/contracts";
import { COMPONENT_ORDER, tableVKey, type ModifierSet } from "../classify/keystrokes.js";
import type { LdmlBaseLayout } from "../types.js";

export interface LayerKey {
  /** LDML components in canonical order, never `caps`. */
  components: readonly string[];
  caps: boolean;
}

/** Keys whose base character has a distinct uppercase that is the shifted character. */
export function baseCasedKeys(base: LdmlBaseLayout): Set<string> {
  const out = new Set<string>();
  for (const [vkey, c] of Object.entries(base.layers.base)) {
    const s = base.layers.shift[vkey];
    if (c !== "deadkey" && s !== undefined && s !== "deadkey" && c !== s && c.toUpperCase() === s) out.add(vkey);
  }
  return out;
}

/**
 * The keys whose shift state caps lock inverts for rule matching: the keys `&CasedKeys` lists.
 * A keyboard that declares none has no inversion, so a shift-less rule reaches the `caps` layer.
 * Spelled as the position table spells them. (The base keyboard's cased keys only decide the
 * characters of the derived caps layers; see baseFill.)
 */
export function casedKeys(ir: KeyboardIR, _base?: LdmlBaseLayout): Set<string> {
  const declared = declaredCasedKeys(ir);
  return new Set<string>([...(declared ?? [])].map(tableVKey));
}

function toggleShift(components: readonly string[]): string[] {
  const has = components.includes("shift");
  const rest = components.filter((c) => c !== "shift");
  const next = has ? rest : [...rest, "shift"];
  return COMPONENT_ORDER.filter((c) => next.includes(c));
}

/** The layers a rule reaches for one key: one when it names a caps state, two otherwise. */
export function expandCaps(mods: ModifierSet, vkey: string, cased: ReadonlySet<string>): LayerKey[] {
  if (mods.caps === "off") return [{ components: mods.components, caps: false }];
  if (mods.caps === "on") return [{ components: mods.components, caps: true }];
  const capsLayer = cased.has(tableVKey(vkey)) ? toggleShift(mods.components) : [...mods.components];
  return [
    { components: mods.components, caps: false },
    { components: capsLayer, caps: true },
  ];
}
