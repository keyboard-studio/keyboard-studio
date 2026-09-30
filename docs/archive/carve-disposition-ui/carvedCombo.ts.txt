// carvedCombo — the CarvedCombo row shape shared by ReviewRemovedKeys (the
// review panel) and CarvedHostConsequences (the expanded row).
//
// Lives in its own leaf module so the two components can both depend on it
// without importing each other in a cycle.

import type {
  CarveDispositionProvenance,
  CarveDispositionValue,
} from "@keyboard-studio/contracts";

/** One row of the review panel: a carved combination with its decision. */
export interface CarvedCombo {
  comboId: string;
  /** Human label, e.g. "RALT + 4" or 'store "dkt003b" slot 1 — ‘É’'. */
  label: string;
  /** Keyman K_ vkey id for lookupHostOutput; undefined when no key resolves. */
  key: string | undefined;
  /** Raw IR modifier tokens, e.g. ["RALT"]. */
  modifiers: string[];
  disposition: CarveDispositionValue;
  provenance: CarveDispositionProvenance;
  /** True for <storeNodeId>#<index> combos (no direct key of their own). */
  isStoreSlot: boolean;
}
