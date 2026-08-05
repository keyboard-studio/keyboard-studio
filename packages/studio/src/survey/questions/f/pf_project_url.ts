// Per-question module: pf_project_url (Phase F)
//
// NEW (Phase F documentation revision). release/template/README.md asks for a
// Home URL and a Help URL as two separate fields, and 250 of 918 shipped .kps
// files populate <WebSite>. pf_contact_info captures a person or address to reach;
// this captures the project's published location, which is a different thing and
// lands in different package metadata.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "pf_project_url",
  prompt: "Does this keyboard or language project have a website? (optional)",
  help_text:
    "A project home page, a documentation page, or a download page. This is " +
    "recorded in the keyboard package metadata as well as shown on the help " +
    "page, so it is worth filling in even if the site is simple. If the help " +
    "documentation lives at a different address from the project home page, give " +
    "both, one per line. Leave blank if there is no website.",
  type: "text" as const,
  required: false,
  next: "pf_credits",
} satisfies import("../../types.ts").FlowQuestion;

// No validation: required: false; free-text URL field (a strict URL validator
// would reject the "home plus help, one per line" shape the prompt invites).

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value: "https://bafutliteracy.org",
      note: "single project home page",
    },
    {
      value: "https://bafutliteracy.org\nhttps://bafutliteracy.org/keyboard-help",
      note: "home plus separate help URL (template README asks for both)",
    },
    { value: "", note: "blank is fine (optional)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;
