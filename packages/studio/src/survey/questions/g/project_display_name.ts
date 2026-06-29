// Per-question module: project_display_name (Phase G — Project Name, copy-track)
//
// Free-text question for the keyboard's display name. Pre-filled via
// getSeedValue from the language autonym (passed by PhaseProjectName using the
// "default once, then user owns it" SurveyRunner contract).
//
// inputs:  header.bcp47 — read to suggest the display name pre-fill.
// writes:  header.name  — the display name is stored here.

import { irPath } from "@keyboard-studio/contracts";
import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "project_display_name",
  type: "text" as const,
  prompt: "What is the display name for your new keyboard?",
  help_text:
    "Give your keyboard a human-readable name, for example \"Hausa (QWERTY)\" " +
    "or \"Ewondo Keyboard\". This name appears in the Keyman application and the " +
    "keyboard repository. It can include spaces, accents, and non-ASCII characters.",
  required: true,
  // Advances to project_keyboard_id within the same runner.
  next: "project_keyboard_id",
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Please enter a display name for your keyboard.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Hausa (QWERTY)", note: "typical display name with parenthetical" },
    { value: "Ewondo", note: "minimal single-word name" },
    { value: "Ghomálá'", note: "name with diacritics and apostrophe" },
    { value: "  Bafut  ", note: "whitespace-padded — trimmed to non-empty" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace only" },
    { value: undefined, expectedCode: "required" },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [irPath("header", "name")],
};
export default mod;
