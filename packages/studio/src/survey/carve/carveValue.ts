// carveValue — the carved-layout decision's value and its derivation
// from the live carve overlay (spec 090 T032, ruling D-090-30).
//
// The value types live here, in the carve feature home (the D-090-8
// pattern — deadkeyOps.ts, ruleAdditions.ts): the gallery module
// (survey/questions/gallery/carvedLayout.ts) may not import stores,
// editors, or lib, so the shape it re-exports is declared beside the
// overlay it snapshots. `currentCarvedLayoutValue()` is shared by
// CarveAdapter's completion recording and the module's decision
// renderer so the two surfaces never compute different values (the
// currentRuleSetValue precedent).

import type { CarveDisposition } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

/**
 * One removal-set item (RULED, T003 / owner ruling 2026-10-06): flat
 * per-item provenance — asked (the author removed it), derived (a studio
 * rule proposed and the author accepted the set), or extracted (it came
 * from the base keyboard's evidence).
 */
export interface CarveRemovalItem {
  kind: "node" | "item" | "family" | "char";
  id: string;
  provenance: "asked" | "derived" | "extracted";
}

/** The carved-layout decision value (data-model.md). */
export interface CarvedLayoutValue {
  removals: CarveRemovalItem[];
  dispositions: CarveDisposition[];
  closedKeyboardCard: "accepted" | "declined" | null;
}

/** The overlay slices the value snapshots — a structural subset of the
 * working copy's carve state, so the builder stays pure and testable. */
export interface CarveOverlaySnapshot {
  deletedNodeIds: ReadonlySet<string>;
  deletedItemIds: ReadonlySet<string>;
  disabledFamilyIds: ReadonlySet<string>;
  carveChars: ReadonlySet<string>;
  carveDispositions: readonly CarveDisposition[];
  closedKeyboardCard: "accepted" | "declined" | null;
}

const KIND_ORDER: readonly CarveRemovalItem["kind"][] = ["node", "item", "family", "char"];

/**
 * Build the decision value from an overlay snapshot.
 *
 * The four removal collections become one item list discriminated by
 * `kind` (data-model.md — the four id spaces stay distinct), sorted by
 * kind then id so the recorded value is canonical: two sessions that
 * reach the same overlay by different click orders record the same
 * value. Dispositions ride verbatim (the contracts type carries its
 * own spec-076 provenance — research R8), as does the closed-keyboard
 * card outcome.
 *
 * Per-item provenance is `asked` for every item, deliberately: in the
 * live flow every overlay removal is an author action (the gallery's
 * cascadeDelete/keepAll/restoreAll handlers and the assign loop's
 * cascadeDelete route) — no proposal-acceptance or starting-point
 * seeding path writes the overlay today, so `derived` / `extracted`
 * items cannot be produced honestly yet. Those values become real
 * when the seeding paths land (092 live extraction); inventing the
 * split at record time would fabricate provenance.
 *
 * Reconstructibility (ruling D-090-30 condition (i)): the snapshot
 * covers every overlay component that can be non-trivial at carve
 * completion and feeds the applied view — the four removal sets, the
 * dispositions, the card. The one remaining overlay field,
 * `carveTouchKeepInert`, has no live writer (its only UI,
 * TouchKeepInertControl, is an unmounted stub for a future surface),
 * so it is always empty in the live flow; if that surface ever
 * mounts, this value needs a field for it (named in the spec's
 * downstream handoff, D-090-31).
 */
export function carvedLayoutValueFromOverlay(
  overlay: CarveOverlaySnapshot,
): CarvedLayoutValue {
  const sets: Record<CarveRemovalItem["kind"], ReadonlySet<string>> = {
    node: overlay.deletedNodeIds,
    item: overlay.deletedItemIds,
    family: overlay.disabledFamilyIds,
    char: overlay.carveChars,
  };
  const removals: CarveRemovalItem[] = [];
  for (const kind of KIND_ORDER) {
    for (const id of [...sets[kind]].sort()) {
      removals.push({ kind, id, provenance: "asked" });
    }
  }
  return {
    removals,
    dispositions: [...overlay.carveDispositions],
    closedKeyboardCard: overlay.closedKeyboardCard,
  };
}

/** The carved-layout value from the live working copy's carve overlay. */
export function currentCarvedLayoutValue(): CarvedLayoutValue {
  const s = useWorkingCopyStore.getState();
  return carvedLayoutValueFromOverlay({
    deletedNodeIds: s.deletedNodeIds,
    deletedItemIds: s.deletedItemIds,
    disabledFamilyIds: s.disabledFamilyIds,
    carveChars: s.carveChars,
    carveDispositions: s.carveDispositions,
    closedKeyboardCard: s.closedKeyboardCard,
  });
}
