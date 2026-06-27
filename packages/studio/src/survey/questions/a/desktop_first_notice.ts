// Per-question module: desktop_first_notice (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.

import type { QuestionModule } from "../../types.ts";

export const definition = {
  id: "desktop_first_notice",
  type: "notice" as const,
  body:
    "This tool is designed around physical keyboards — the survey asks about " +
    "key names, modifier keys (Shift, AltGr), and key combinations that exist " +
    "on a hardware keyboard.\n\n" +
    "If your keyboard is primarily used on mobile devices, you can still " +
    "complete the survey. The survey results in a desktop keyboard layout, " +
    "and a touch layout for mobile is scaffolded from it in Phase E of the " +
    "survey, with a short gallery to enable features like longpress menus and " +
    "layer switching.\n\n" +
    "Touch-first authoring — where the survey is built around touchscreen " +
    "gestures rather than physical keys — is a v1.1 roadmap candidate.",
  next: "language_name_autonym",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — notice nodes have no user input.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: undefined, note: "notice question — no value expected" },
    { value: "", note: "empty string is also acceptable for a notice" },
  ],
  invalid: [],
};


const mod: QuestionModule = { definition, fixtures, inputs: [], writes: [] };
export default mod;
