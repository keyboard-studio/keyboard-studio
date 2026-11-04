// Open-path upgrade (spec 112, FR-008): give an opened keyboard a `&CasedKeys`
// store derived from its own letters, and replace the per-key NCAPS/CAPS rule
// quartets the store makes redundant. Pure: the input IR is never mutated.

import { casedKeySet, type CasedKeySet, type KeyboardIR } from "@keyboard-studio/contracts";
import { replaceCapsRules } from "./replaceCapsRules.js";
import { writeCasedKeysStore } from "./casedKeysStore.js";

export interface UpgradeResult {
  ir: KeyboardIR;
  set: CasedKeySet;
  versionRaised: { from: string | null; to: "14.0" } | null;
}

export function upgradeToCasedKeys(ir: KeyboardIR, opts: { bcp47?: string } = {}): UpgradeResult {
  const out = structuredClone(ir);
  // Empty floor: an opened keyboard's set is exactly what its own rules show.
  const set = casedKeySet(out, {
    floor: [],
    ...(opts.bcp47 !== undefined ? { bcp47: opts.bcp47 } : {}),
  });
  if (set.keys.length === 0) return { ir: out, set, versionRaised: null };
  replaceCapsRules(out, new Set(set.keys));
  const { versionRaised } = writeCasedKeysStore(out, set.keys);
  return { ir: out, set, versionRaised };
}
