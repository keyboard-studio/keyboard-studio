// Per-question module: script_not_supported_stub (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// §16 / §14 Decision 5: CJK, Ethiopic, and Hangul are excluded from v1.
// Gated here at Phase A so the user gets an honest "coming soon" message
// instead of a broken survey path. See spec §9 three-group routing.

import type { QuestionModule } from "../../types.ts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "script_not_supported_stub",
  prompt: "This writing system is not supported yet",
  help_text:
    "This version does not yet support Hangul keyboards — jamo-to-syllable " +
    "cluster composition rules will be added in a future release. " +
    "This version does not yet support Chinese, Japanese, or other Han-based " +
    "scripts — these require an input-method composition layer not yet built. " +
    "This version does not yet support Ethiopic scripts (Ge'ez, Amharic, " +
    "Tigrinya, and others) — reorder-pattern curation for Ethiopic is still " +
    "in progress and will be available in a future release. " +
    "You can close this form for now — nothing you entered will be submitted.",
  type: "notice" as const,
  required: false,
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — notice terminal node; no user input.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: undefined, note: "terminal notice — no value expected" },
    { value: "", note: "empty string acceptable" },
  ],
  invalid: [],
};


const mod: QuestionModule = {
  definition,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [],
};
export default mod;
