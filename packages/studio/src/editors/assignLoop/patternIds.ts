// Pattern IDs as they exist in the browser pattern library (content/patterns/).
// These MUST match the `id:` fields in the YAML — a mismatch means getById()
// returns undefined, the assignment can't resolve, and the live preview never
// reflects the added key.
//
// Hoisted out of MechanismGallery.tsx so consumers that only need the id
// constants (e.g. SequenceBuilderPanel) don't pull in the whole component's
// module graph. MechanismGallery.tsx re-exports these for backward
// compatibility.

import type { MechanismAssignment } from "@keyboard-studio/contracts";

export const PATTERN_SEQUENCE = "multi_char_sequence"; // S-03
export const PATTERN_DEADKEY = "deadkey_single_tap"; // S-02
export const PATTERN_SWAP = "simple_swap"; // S-01
export const PATTERN_RALT = "modifier_as_layer_switch"; // S-08

// ---------------------------------------------------------------------------
// isSequenceAssignmentForChar — the ONE place that knows the "does this
// assignment belong to `char`'s PATTERN_SEQUENCE bucket?" predicate:
// scope === "individual" + target === char + at least one PATTERN_SEQUENCE
// mechanism. Hoisted here (a dependency-light leaf both the store and the
// gallery already import PATTERN_SEQUENCE from) so every read/write site
// derives from this single exported function instead of reimplementing the
// scope/target/mechanism check inline — a future predicate tweak (e.g. a
// second sequence-shaped pattern id) then only needs to change one place.
// Current call sites: SequenceBuilderPanel.partitionSequenceAssignment
// (read), workingCopyStore.unflagCharForSequence (write/strip), and
// MechanismGallery.handleRemoveCovered (write/split).
// ---------------------------------------------------------------------------
export function isSequenceAssignmentForChar(
  assignment: MechanismAssignment,
  char: string,
): boolean {
  return (
    assignment.scope === "individual" &&
    assignment.target === char &&
    assignment.mechanisms.some((m) => m.patternId === PATTERN_SEQUENCE)
  );
}
