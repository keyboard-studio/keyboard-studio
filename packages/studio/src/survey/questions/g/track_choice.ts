// Per-question module: track_choice (Phase G — Authoring Track)
//
// Gate question that records the authoring track. Since spec 111 the start screen
// records it (New = copy, Open = adapt) and registry.ts gates this step off once
// it is recorded, so the step only asks a draft from before the start screen, and
// only offers Copy: Open is reached from the start screen, never mid-walk.
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
    "Copy creates an independent new keyboard you can fully rename and own. " +
    "To update an existing keyboard in place, open it from the start screen instead.",
  required: true,
  options: [
    {
      value: "copy",
      label: "Copy — start a new keyboard based on this layout",
      note: "You will give it a new name and keyboard ID. The original is not changed.",
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
  if (v !== "copy") {
    return {
      ok: false,
      code: "required",
      message: "Please choose Copy to continue.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "copy", note: "copy track" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "other", expectedCode: "required", note: "unrecognised value" },
    { value: "adapt", expectedCode: "required", note: "Open is chosen on the start screen" },
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
  // Spec 091 FR-003 re-homing (Delta P1, revised in phase 4): the track
  // step's ordering edge lived only in the pre-091 step table (`requires:
  // ["base-keyboard"]`). It is declared here as a SCREEN-order requirement —
  // not a module `requires`, which the frozen per-flow ordering contracts
  // (orderParity.test.ts, unmodifiable; SC-002) would see as unresolvable
  // when sorting this flow alone. `deriveScreens` folds it into the
  // full-list sort only (see survey/types.ts `screenRequires`).
  screenRequires: ["base-keyboard"],
};
export default mod;
