// Per-question module: track_choice (Phase G — Authoring Track)
//
// Gate question that determines whether the author is creating a new keyboard
// based on the selected base (copy-track) or modifying it in place (adapt-track).
//
// Routing (DEC-D2): copy → project_name step; adapt → jumps to characters.
// The fork is expressed as this question's next rules.
//
// inputs:  header.bcp47, header.name — read to frame the copy-vs-adapt choice.
// writes:  []  — branch selection only; no IR leaf in Phase 1 (DEC-D2 comment).

import { irPath } from "@keyboard-studio/contracts";
import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "track_choice",
  type: "radio" as const,
  prompt: "How do you want to work with {{base_name}}?",
  help_text:
    "Choose how you want to use this base keyboard. " +
    "Copy creates an independent new keyboard you can fully rename and own. " +
    "Adapt lets you modify the existing keyboard keeping its name and ID.",
  required: true,
  options: [
    {
      value: "copy",
      label: "Copy — start a new keyboard based on this layout",
      note: "You will give it a new name and keyboard ID. The original is not changed.",
    },
    {
      value: "adapt",
      label: "Adapt — modify this keyboard in place",
      note: "Keep the keyboard's existing name and ID. Useful for adding a language or fixing a layout.",
    },
  ],
  // copy → project_display_name (first question in project_name flow);
  // adapt → null (terminal — the PhaseTrack wrapper skips to characters).
  // The next values here drive the SurveyRunner routing within the track flow.
  next: [
    { condition: "value == 'copy'", goto: null },
    { default: true as const, goto: null },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value : "";
  if (v !== "copy" && v !== "adapt") {
    return {
      ok: false,
      code: "required",
      message: "Please choose either Copy or Adapt to continue.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "copy", note: "copy track" },
    { value: "adapt", note: "adapt track" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "other", expectedCode: "required", note: "unrecognised value" },
  ],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [irPath("header", "bcp47"), irPath("header", "name")],
  writes: [],
};
export default mod;
