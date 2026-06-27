// Per-question module: il_language_code (identity-lite)
// Ported verbatim from content/flows/identity_lite.yaml.
//
// optional (required: false) — the author may leave blank. The language subtag
// drives the bcp47 field in IdentityLiteResult.bcp47 (built by buildTargetBcp47
// in IdentityLite.tsx). An empty subtag degrades suggestBases() to script-match
// ranking (spec §8).

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "il_language_code",
  prompt: "What is the ISO 639 language subtag for this language?",
  help_text:
    "Enter the two- or three-letter ISO 639 code for your language — the short " +
    "code linguists and software systems use to identify it. Examples: \"en\" " +
    "(English), \"fr\" (French), \"ha\" (Hausa), \"hi\" (Hindi), \"sw\" (Swahili), " +
    "\"bft\" (Balti). Leave blank if you are unsure; you can add it later. " +
    "Note: enter only the language subtag, not a full BCP47 tag with region " +
    "or variant (those are added during the documentation stage).",
  type: "text" as const,
  required: false,
  next: "il_target_script",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional free-text; no client-side gating implied by the YAML.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "ha", note: "ISO 639-1 code for Hausa" },
    { value: "bft", note: "ISO 639-3 code for Balti" },
    { value: undefined, note: "blank is explicitly allowed (required: false)" },
    { value: "", note: "empty string is acceptable for optional question" },
  ],
  invalid: [],
};

const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;
