// Pattern IDs as they exist in the browser pattern library (content/patterns/).
// These MUST match the `id:` fields in the YAML — a mismatch means getById()
// returns undefined, the assignment can't resolve, and the live preview never
// reflects the added key.
//
// Hoisted out of MechanismGallery.tsx so consumers that only need the id
// constants (e.g. SequenceGallery) don't pull in the whole component's module
// graph. MechanismGallery.tsx re-exports these for backward compatibility.
export const PATTERN_SEQUENCE = "multi_char_sequence"; // S-03
export const PATTERN_DEADKEY = "deadkey_single_tap"; // S-02
export const PATTERN_SWAP = "simple_swap"; // S-01
export const PATTERN_RALT = "modifier_as_layer_switch"; // S-08
