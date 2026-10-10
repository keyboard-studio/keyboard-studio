// retainedConvenienceChars — gallery decision module for `retained-convenience-chars` (spec 090).
//
// The convenience characters retained from the base keyboard. The
// toggles record the value live through onChange (design record
// D-090-12); the step's completion result — whose
// `retainedConvenienceChars` field `recordPhase` derives
// `session.retainedConvenienceChars` from, carve's read — is computed
// FROM the recorded value, so the session mirror is a value-sourced
// derivation, not a second record. (The task text's "applied view
// written by apply" is not implementable inside 089's contract:
// WorkingCopyPatch has no session channel, and adding one amends that
// contract — see D-090-12.) Apply is therefore a no-op and the module
// declares no IR writes.
// Boundary (FR-003): a gallery module is a pure descriptor — no store
// imports; the value arrives via DecisionRendererProps and changes leave
// via onChange, recorded and applied by the gallery host.

import type { GalleryModule } from "../../types.ts";
import { ConvenienceCharsStep } from "../../convenience/ConvenienceCharsStep.tsx";
import type { RetainedConvenienceCharsValue } from "../../convenience/convenienceValue.ts";

export type {
  RetainedConvenienceChar,
  RetainedConvenienceCharsValue,
} from "../../convenience/convenienceValue.ts";

export const definition = {
  id: "retainedConvenienceChars",
  type: "notice" as const,
  prompt: "Which convenience characters should stay?",
  audit_label: "Retained convenience characters",
};

const retainedConvenienceChars: GalleryModule<RetainedConvenienceCharsValue> = {
  definition,
  provides: ["retained-convenience-chars"],
  screen: "convenience",
  requires: ["character-inventory", "base-keyboard"],
  inputs: [],
  writes: [],
  apply: () => ({}),
  renderer: ConvenienceCharsStep,
  fixtures: {
    valid: [{ value: undefined, note: "no decision recorded yet" }],
    invalid: [],
  },
};

export default retainedConvenienceChars;
