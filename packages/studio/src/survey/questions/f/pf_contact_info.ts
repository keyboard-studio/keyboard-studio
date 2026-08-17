// Per-question module: pf_contact_info (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.
//
// PRE-FILLED, STILL OPTIONAL. Once keyboard attribution (spec 064) captures an
// author contact in the identity phase — itself pre-filled from the authenticated
// GitHub profile — this field is seeded from it rather than asked a second time.
// See CTX_AUTHOR_CONTACT in editors/adapters/flowStepOptions.tsx.
//
// It remains `required: false` on purpose. The seed is a starting value, not an
// answer: the author may clear it, and the question asks for the LANGUAGE
// COMMUNITY's public contact, which is often not the author's own address.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_contact_info",
  prompt: "Is there a public contact for the language community? (optional)",
  audit_label: "Community contact",
  help_text:
    "An email address, website, or social media handle where people can reach " +
    "the language community. This appears at the end of the help page so users " +
    "can ask questions or report problems. If your own contact details are " +
    "already filled in, you can replace them with a shared community address, or " +
    "leave them as they are. Leave blank to omit the section.",
  type: "text" as const,
  required: false,
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text contact info.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "info@bafutliteracy.org",
      note: "email contact",
    },
    {
      value: "https://bafutliteracy.org/contact",
      note: "website contact",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;
