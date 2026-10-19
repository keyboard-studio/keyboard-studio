// usePlacementInventory — the store-facing wrapper over
// lib/placementInventory.ts's `derivePlacementInventory` (issue #2293).
//
// Both assign-loop galleries (MechanismGallery, TouchGallery) walk THIS
// list — the placement set the marks series' answers already filtered to
// one representation — instead of the flat `session.confirmedInventory`.
// The flat inventory remains the production-coverage denominator
// (criterion 18.6) everywhere coverage is computed; it is only the WALK
// that changes. See the lib module's doc for the derivation and its
// identity fallbacks (no/empty worklist, no alphabet ⇒ flat inventory,
// unchanged).

import { useMemo } from "react";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  derivePlacementInventory,
  deriveTreatmentFilteredChars,
} from "../lib/placementInventory.ts";

/**
 * The placement walk inventory for the current session (NFC, deduped;
 * flat-inventory order, then any worklist-only units in worklist order).
 */
export function usePlacementInventory(): string[] {
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const marksWorklist = useWorkingCopyStore((s) => s.session.marksWorklist);

  return useMemo(
    () => derivePlacementInventory(confirmedInventory, alphabet, marksWorklist),
    [confirmedInventory, alphabet, marksWorklist],
  );
}

/**
 * The characters the marks treatment answer filtered OUT of placement
 * (issue #2293) — see lib/placementInventory.ts's
 * `deriveTreatmentFilteredChars`. The galleries gate their SHOW-ALL
 * strip selection on this set: a filtered character stays visible for
 * coverage, but selecting it (chip click or arrow-key cycling) does
 * not open the placement pane.
 */
export function useTreatmentFilteredChars(): Set<string> {
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const alphabet = useWorkingCopyStore((s) => s.session.alphabet);
  const marksWorklist = useWorkingCopyStore((s) => s.session.marksWorklist);

  return useMemo(
    () => deriveTreatmentFilteredChars(confirmedInventory, alphabet, marksWorklist),
    [confirmedInventory, alphabet, marksWorklist],
  );
}
