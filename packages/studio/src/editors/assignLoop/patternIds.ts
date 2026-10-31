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
/**
 * The decomposed S-02 shape (spec 106 US3): base letters plus one mark string.
 * The studio never WRITES it (stored assignments stay form-independent and use
 * PATTERN_DEADKEY); it exists in refs the engine or a recognized keyboard
 * carries, so every READ of "is this a deadkey ref?" goes through
 * {@link isDeadkeyPatternId}.
 */
export const PATTERN_DEADKEY_NFD = "deadkey_single_tap_nfd"; // S-02
export const PATTERN_SWAP = "simple_swap"; // S-01
export const PATTERN_RALT = "modifier_as_layer_switch"; // S-08

/** True for either S-02 deadkey shape. Mirrors the engine's DEADKEY_PATTERNS set. */
export function isDeadkeyPatternId(patternId: string): boolean {
  return patternId === PATTERN_DEADKEY || patternId === PATTERN_DEADKEY_NFD;
}

/**
 * The (base, output) pairs a deadkey ref carries, whichever shape. A
 * decomposed ref has no accentedForms: each output is the base plus
 * `markChars`. A single-base ref carries its whole output (it may be a base
 * plus a mark with no single code point of its own).
 */
export function deadkeyPairsOfSlots(
  patternId: string,
  slotValues: Readonly<Record<string, string>> | undefined,
): Array<{ base: string; output: string }> {
  const sv = slotValues ?? {};
  const bases = [...(typeof sv["baseLetters"] === "string" ? sv["baseLetters"] : "")];
  if (patternId === PATTERN_DEADKEY_NFD) {
    const marks = typeof sv["markChars"] === "string" ? sv["markChars"] : "";
    return bases.map((base) => ({ base, output: base + marks }));
  }
  const forms = typeof sv["accentedForms"] === "string" ? sv["accentedForms"] : "";
  if (bases.length === 1) return [{ base: bases[0]!, output: forms }];
  const outs = [...forms];
  return bases.flatMap((base, i) => (outs[i] === undefined ? [] : [{ base, output: outs[i]! }]));
}

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
