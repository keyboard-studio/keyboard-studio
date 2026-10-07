// convenienceValue — the retained-convenience-chars decision value
// (spec 090 T024, design record D-090-12).
//
// The value types live here, not in the gallery module file, for the
// D-090-8 reason: the module imports the renderer (ConvenienceCharsStep),
// the renderer imports these types, and neither may import the module
// file without closing a cycle through the registry. The module
// (survey/questions/gallery/retainedConvenienceChars.ts) re-exports them.
//
// Shape: `retained` is the kept set, per character with its provenance
// (FR-006). `rejected` carries the primaries the author explicitly
// un-kept — the tri-state the pre-T024 answer-store booleans encoded
// (a saved `false` is a rejection; NO record is the propose-then-confirm
// default). A candidate in neither list — one that became surplus only
// after the value was recorded — is kept by default, exactly as a
// candidate with no saved answer was. Without `rejected`, a recorded
// value would silently un-keep every later-appearing candidate.

import type { DecisionProvenance } from "../../decisions/decisionTypes.ts";

/** One retained convenience character with its provenance (FR-006). */
export interface RetainedConvenienceChar {
  char: string;
  provenance: DecisionProvenance;
}

/** The retained-convenience-chars decision value (data-model.md). */
export interface RetainedConvenienceCharsValue {
  retained: RetainedConvenienceChar[];
  /** Candidate primaries the author explicitly un-kept. */
  rejected: string[];
}
