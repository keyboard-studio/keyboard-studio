// unimplementedInventory — single source of truth for "which inventory
// characters still lack an implementation in this modality", shared by
// MechanismGallery (desktop/physical), TouchGallery (touch), and StepHost's
// Phase F hard-gate context build. Does NOT recompute coverage — it is a thin
// composition over the two canonical selectors that already answer this
// question (spec §7.7 / §10 criterion 18.6):
//   - physical: `uncoveredTargets` (@keyboard-studio/contracts/assignmentMap)
//     over the MechanismAssignment map.
//   - touch: `computeTouchCoverage` (@keyboard-studio/contracts/touch-coverage)
//     over the actual rendered TouchLayoutIR — this is why a `touch_inherited`
//     placeholder mechanism is never miscounted: computeTouchCoverage walks
//     the real derived layout (where an inherited char is already present),
//     it does not consult MechanismRef.patternId at all.
//
// Do not fork this definition — a gallery or step that needs "is character X
// implemented" imports one of the two functions below rather than re-deriving
// coverage locally.

import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { uncoveredTargets } from "@keyboard-studio/contracts";
import { parseTouchLayout, touchCoverage } from "@keyboard-studio/engine";

/**
 * Desktop/physical: characters in `lettersToAdd` (the base-diffed inventory —
 * see useInventoryDiff; NOT the raw confirmedInventory, since a character the
 * base keyboard already produces needs no assignment) that resolve to zero
 * mechanisms in the physical modality.
 */
export function unimplementedDesktopChars(
  assignments: readonly MechanismAssignment[],
  lettersToAdd: readonly string[],
): string[] {
  return uncoveredTargets(assignments, lettersToAdd, "physical");
}

/**
 * Touch: characters in `inventory` (the FULL confirmed inventory — touch
 * coverage is evaluated against the actual rendered layout, which may already
 * reach a character via inheritance from the seed layout) with no reachable
 * touch mechanism.
 *
 * Returns `[]` when no touch layout has been authored yet (`touchLayoutJson`
 * is `null`) or when the stored JSON fails to parse — callers use this to
 * mean "nothing to gate on", never "fully covered" as a false-positive signal
 * for a phase the author hasn't reached.
 */
export function unimplementedTouchChars(
  touchLayoutJson: string | null,
  inventory: readonly string[],
): string[] {
  if (touchLayoutJson === null) return [];
  try {
    const layout = parseTouchLayout(touchLayoutJson);
    return [...touchCoverage(layout, inventory).uncovered];
  } catch {
    return [];
  }
}

/**
 * Inputs to `inventoryCoverageGate` — the store-derived values every call
 * site (StepHost's Phase F context build, PhaseFGate, and the Output
 * download/commit gate) already reads to answer "is every inventory
 * character implemented".
 */
export interface InventoryCoverageInputs {
  readonly desktopAssignments: readonly MechanismAssignment[];
  readonly lettersToAdd: readonly string[];
  readonly touchLayoutJson: string | null;
  readonly confirmedInventory: readonly string[];
}

/**
 * Result of `inventoryCoverageGate` — the uncovered-character lists plus the
 * derived booleans every gate/warning site needs (per-modality blocked flags
 * and the combined `blocked`).
 */
export interface InventoryCoverageGate {
  readonly unimplementedDesktop: string[];
  readonly unimplementedTouch: string[];
  /** Desktop is always in scope — every session engages the physical modality. */
  readonly blockedOnDesktop: boolean;
  /** Touch is only in scope once a touch layout has been authored this session. */
  readonly blockedOnTouch: boolean;
  /** True while ANY modality actually engaged this session still has gaps. */
  readonly blocked: boolean;
}

/**
 * Single source of truth for "is every inventory character implemented,
 * desktop-always / touch-only-if-authored" (spec §7.7 / §10 criterion 18.6).
 *
 * Do not re-derive this boolean pair inline — StepHost's Phase F hard-gate
 * context build, PhaseFGate's display, and OutputScreen's download/commit
 * gate (via usePreviewArtifact) all call this one function so the three
 * never drift from each other.
 */
/**
 * Default cap on how many uncovered characters `formatUncoveredCharsList`
 * lists inline before folding the remainder into a "+N more" suffix. Long
 * inventories (30+ characters is common for e.g. an abugida) would otherwise
 * blow up the Phase F / Output blocked banners into an unreadable wall of
 * glyphs.
 */
export const DEFAULT_UNCOVERED_LIST_LIMIT = 12;

/**
 * Renders an uncovered-character array as a display string, truncating with
 * a "+N more" suffix past `limit` — the single formatting rule PhaseFGate and
 * OutputScreen both use so a long inventory degrades the same way in both
 * places rather than each call site inventing its own cutoff.
 */
export function formatUncoveredCharsList(
  chars: readonly string[],
  limit: number = DEFAULT_UNCOVERED_LIST_LIMIT,
): string {
  if (chars.length <= limit) return chars.join(", ");
  const shown = chars.slice(0, limit).join(", ");
  const remaining = chars.length - limit;
  return `${shown}, +${remaining} more`;
}

export function inventoryCoverageGate(inputs: InventoryCoverageInputs): InventoryCoverageGate {
  const unimplementedDesktop = unimplementedDesktopChars(
    inputs.desktopAssignments,
    inputs.lettersToAdd,
  );
  const unimplementedTouch = unimplementedTouchChars(
    inputs.touchLayoutJson,
    inputs.confirmedInventory,
  );
  const blockedOnDesktop = unimplementedDesktop.length > 0;
  const blockedOnTouch = inputs.touchLayoutJson !== null && unimplementedTouch.length > 0;
  return {
    unimplementedDesktop,
    unimplementedTouch,
    blockedOnDesktop,
    blockedOnTouch,
    blocked: blockedOnDesktop || blockedOnTouch,
  };
}
