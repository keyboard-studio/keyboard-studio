// Per-question module: il_script_not_supported (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// CJK/Ethiopic/Hangul gate — consistent with §9 three-group routing and the
// Phase A script_not_supported_stub. Detected in il_target_script so the user
// gets an honest "coming soon" exit before base resolution rather than a broken
// flow. Article VII of the constitution requires this stub to remain honest —
// do not silently empty the gallery or remove this node.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_script_not_supported",
  prompt: "This writing system is not supported yet",
  help_text:
    "This version does not yet support Ethiopic, Han (Chinese/Japanese), or " +
    "Hangul keyboards. Hangul needs jamo-to-syllable composition; Ethiopic and " +
    "Han need reorder / IME candidate work — neither is built yet. You can close " +
    "this form for now; nothing you entered will be submitted.",
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

// inputs: [] — this notice's help_text is fully static; there is no BCP47
// interpolation here (unlike script_not_supported_stub which reads
// irPath("header","bcp47")).  The empty array is intentional.
const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;
