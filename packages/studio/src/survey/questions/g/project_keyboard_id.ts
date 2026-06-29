// Per-question module: project_keyboard_id (Phase G — Project Name, copy-track)
//
// Text question for the keyboard's unique ID (slug). Seeded from the
// project_display_name answer via getSeedValue in PhaseProjectName, applying
// slugifyKeyboardId. The user may edit the suggested slug before confirming.
//
// The same slug-derivation and validation logic is used by ProjectNameStep.tsx
// (the legacy panel). Both import from @keyboard-studio/contracts so the logic
// is not duplicated.
//
// inputs:  header.bcp47    — language context.
// writes:  header.keyboardId — the keyboard ID is stored here.

import { irPath, slugifyKeyboardId, validateKeyboardId } from "@keyboard-studio/contracts";
import type { QuestionModule, ValidationResult } from "../../types.ts";

export { slugifyKeyboardId };

export const definition = {
  id: "project_keyboard_id",
  type: "text" as const,
  prompt: "Confirm the keyboard ID",
  help_text:
    "The keyboard ID is a short lowercase identifier used as the folder name in " +
    "the keyboard repository (e.g. \"hausa_qwerty\", \"ewondo\"). " +
    "It must start with a lowercase letter or underscore and may contain only " +
    "lowercase letters, digits, and underscores. Maximum 254 characters. " +
    "A suggestion has been filled in from your display name — edit it if needed.",
  required: true,
  // Terminal question in the project_name flow — null means flow ends here.
  next: null,
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const id = typeof value === "string" ? value.trim() : "";
  const result = validateKeyboardId(id);
  if (!result.valid) {
    return {
      ok: false,
      code: "invalid_keyboard_id",
      message: result.reason ?? "Invalid keyboard ID",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "hausa_qwerty", note: "canonical slug" },
    { value: "ewondo", note: "single-word lowercase" },
    { value: "my_layout_123", note: "with digits" },
    { value: "_foo", note: "leading underscore (allowed by KD convention)" },
  ],
  invalid: [
    { value: "", expectedCode: "invalid_keyboard_id", note: "empty" },
    { value: "123abc", expectedCode: "invalid_keyboard_id", note: "starts with digit" },
    { value: "foo bar", expectedCode: "invalid_keyboard_id", note: "space not allowed" },
    { value: undefined, expectedCode: "invalid_keyboard_id", note: "undefined" },
    {
      value: "a".repeat(255),
      expectedCode: "invalid_keyboard_id",
      note: "exceeds 254 character limit",
    },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47")],
  writes: [irPath("header", "keyboardId")],
};
export default mod;
