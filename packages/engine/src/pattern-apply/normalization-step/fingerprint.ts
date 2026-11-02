// Stable digest of a generated normalization step's functional content
// (issue #2395).
//
// The context-tolerance decision fingerprint must survive later authoring
// steps (carve, caps, assignments, touch seed) that change unrelated parts
// of the keyboard, while still invalidating when the normalized content
// itself changes. Hashing the step's emitted stores and rules — the exact
// text the step adds to the keyboard — covers the latter without depending
// on the whole source the way `normalizationStepCacheKey` does (the cache
// key must stay whole-source: the generated maps genuinely depend on it).
// `examples` are cosmetic — derived deterministically from the maps already
// encoded in the stores and rules — and are excluded.

import type { NormalizationStep } from "@keyboard-studio/contracts";

import { emitRule, emitStore } from "../../codec/emit.js";
import { fnv1a64Hex } from "../tolerance-fingerprint.js";

/** FNV-1a 64-bit hex digest over the step's emitted group, entry, stores and rules, in order. */
export function normalizationStepFingerprint(step: NormalizationStep): string {
  const lines = [
    `group(${step.groupName})`,
    `entry(${step.originalEntry})`,
    ...step.stores.map((s) => emitStore(s)),
    // The step's own group is not a `using keys` group: emit without the `+`
    // prefix, matching how the rules land in the keyboard.
    ...step.rules.map((r) => emitRule(r, false)),
  ];
  return fnv1a64Hex(lines.join("\n"));
}
