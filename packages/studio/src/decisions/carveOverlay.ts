// carveOverlay — the carved-layout decision's slice of the replay
// overlay accumulator (spec 093 owned delta, 090 ruling D-090-24).
//
// 090's carve module ships as value + extract + step-side recording with
// a NO-OP apply: 089's patch contract has no carve-overlay channel, so
// the value cannot fold through `foldPatch`. Instead the replay folds
// the VALUE into this slice at the decision's own position in the
// derived order (see replayKeyboard.ts), the slice rides the overlay
// through every checkpoint, and `installRebuiltState`
// (rebuildWorkingCopy.ts) installs it into the working copy's carve
// state — so a replay rebuild reconstructs the carve overlay (deleted
// node/item/touch-key sets, carve chars, dispositions, the closed-
// keyboard card outcome) from the decision set alone.
//
// The reconstruction is the inverse of `carvedLayoutValueFromOverlay`
// (survey/carve/carveValue.ts, ruling D-090-30): the value's removal
// items partition back into the four id sets by `kind`. Per-item
// provenance is value-level metadata the overlay itself never carried
// (the live value builder re-stamps it), so the fold reconstructs
// STATE, not provenance — the decision record retains the provenance.
// `carveTouchKeepInert` has no slice field: the value carries none
// (no live writer exists — D-090-30 condition (i) / D-090-31).

import type { CarveDisposition } from "@keyboard-studio/contracts";
import type {
  CarveRemovalItem,
  CarvedLayoutValue,
} from "../survey/carve/carveValue.ts";

/** The carve state a replay folds from the carved-layout value. */
export interface CarveOverlaySlice {
  deletedNodeIds: ReadonlySet<string>;
  deletedItemIds: ReadonlySet<string>;
  disabledFamilyIds: ReadonlySet<string>;
  carveChars: ReadonlySet<string>;
  carveDispositions: readonly CarveDisposition[];
  closedKeyboardCard: "accepted" | "declined" | null;
}

/**
 * Build the overlay slice from a carved-layout decision value.
 *
 * Lenient by design: the value reaches replay through draft persistence
 * and migration paths, so a structurally partial value folds to the
 * correspondingly partial slice (missing collections are empty, unknown
 * removal kinds are skipped, an unrecognized card outcome is null)
 * rather than failing the whole rebuild — the same tolerance the draft
 * restore applies to absent carve fields. A canonically recorded value
 * (the only kind the live flow produces) reconstructs exactly.
 */
export function carveOverlayFromValue(value: unknown): CarveOverlaySlice {
  const v = (value ?? {}) as Partial<CarvedLayoutValue>;
  const sets: Record<CarveRemovalItem["kind"], Set<string>> = {
    node: new Set<string>(),
    item: new Set<string>(),
    family: new Set<string>(),
    char: new Set<string>(),
  };
  if (Array.isArray(v.removals)) {
    for (const item of v.removals) {
      if (
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        item.kind in sets
      ) {
        sets[item.kind].add(item.id);
      }
    }
  }
  return {
    deletedNodeIds: sets.node,
    deletedItemIds: sets.item,
    disabledFamilyIds: sets.family,
    carveChars: sets.char,
    carveDispositions: Array.isArray(v.dispositions) ? [...v.dispositions] : [],
    closedKeyboardCard:
      v.closedKeyboardCard === "accepted" || v.closedKeyboardCard === "declined"
        ? v.closedKeyboardCard
        : null,
  };
}
