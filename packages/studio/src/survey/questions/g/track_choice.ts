// Per-question module: track_choice (Phase G — Authoring Track)
//
// Gate question that determines whether the author is creating a new keyboard
// based on the selected base (copy-track) or modifying it in place (adapt-track).
//
// Routing (DEC-D2): copy → project_name step; adapt → jumps to characters.
// The fork is handled by PhaseTrack → onTrackSelected at the manifest level
// (StudioShell.handleTrackSelected). Phase 2 qu-mutate-track is where a YAML
// `next` rule here becomes load-bearing for router evaluation.
//
// inputs:  []  — the prompt uses {{base_name}} from SurveyContext, not the IR;
//               neither validate() nor the question definition reads any IR path.
// writes:  []  — branch selection only; no IR leaf in Phase 1 (DEC-D2 comment).

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "track_choice",
  type: "radio" as const,
  prompt: "How do you want to work with {{base_name}}?",
  audit_label: "Authoring approach",
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
  // Terminal — the PhaseTrack wrapper handles the copy-vs-adapt fork at the
  // manifest level via onTrackSelected (StudioShell.handleTrackSelected).
  // Phase 2 qu-mutate-track is where this becomes a routing-live YAML `next`.
  next: null,
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
  // Decision apply (spec 089 T012): deliberately EMPTY. The track decision
  // itself is the whole effect — routing reads it through the decision
  // selectors (088's selectTrack), and nothing is written to the working
  // copy at this completion. The working-copy setup an adapt selection
  // implies is spec 092's instantiation concern, and the adapt track's
  // scaffold consequence (no scaffold spec) is deriveScaffoldSpec's rule
  // (null unless the track is "copy"), not a write performed here. The
  // empty apply exists so the module's place in the apply contract is
  // explicit rather than an omission.
  apply: () => ({}),
  fixtures,
  inputs: [],
  writes: [],
  provides: ["authoring-track"],
};
export default mod;
