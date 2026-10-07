// retainedConvenienceChars — gallery decision module for `retained-convenience-chars` (spec 090).
//
// Stub landed with T008 so the FR-002 coverage test pins this decision's
// provider from the start; the real renderer/apply fill in with T024 (US2).
// The convenience characters retained from the base keyboard; the
// working-copy mirror of this set becomes an applied view in T024.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { UnmigratedGalleryRenderer } from "./placeholderRenderer.tsx";

export const definition = {
  id: "retainedConvenienceChars",
  type: "notice" as const,
  prompt: "Which convenience characters should stay?",
  audit_label: "Retained convenience characters",
};

import type { DecisionProvenance } from "../../../decisions/decisionTypes.ts";

/** One retained convenience character with its provenance (FR-006). */
export interface RetainedConvenienceChar {
  char: string;
  provenance: DecisionProvenance;
}

/** The retained-convenience-chars decision value (data-model.md). */
export interface RetainedConvenienceCharsValue {
  retained: RetainedConvenienceChar[];
}

const retainedConvenienceChars: GalleryModule<RetainedConvenienceCharsValue> = {
  definition,
  provides: ["retained-convenience-chars"],
  requires: ["character-inventory", "base-keyboard"],
  inputs: [],
  // decisionIRPaths maps this decision to [] today; a story that gives the
  // module real IR writes updates decisionIRPaths in the same change
  // (decisionIRConsistency.test.ts pins the two together).
  writes: [],
  apply: () => ({}),
  renderer: UnmigratedGalleryRenderer,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default retainedConvenienceChars;
