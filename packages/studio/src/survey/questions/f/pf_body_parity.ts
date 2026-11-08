// Per-question module: pf_body_parity (Phase F, issue #2530)
//
// The welcome/help body-parity choice (criterion 11.9,
// KM_LINT_PHP_HTM_BODY_MISMATCH) as a flow question, not a fix-proposal
// row. The row it replaces (DocumentationFixProposals' body-sync row,
// #1908) stored its answer in the working-copy slice
// (`docFixProposals.bodySync`), which never reached the decision record
// or log, and which the headless author walk could not answer
// (Playwright-only). Asked here, the answer goes through the normal flow
// and decision machinery: provenance, log, Back/undo, and the walk's
// seed policy.
//
// Placement: immediately after pf_welcome_paragraph — both concern the
// help page's opening text — spliced in via that module's `next` (a
// conditional rule on the `body_parity_live` context token, which
// phaseFOptions.buildContext computes); this module's own `next` routes
// on to pf_font_guidance. The question is asked only when the finding is
// live on the adapt track, or a body-parity answer is already recorded
// (so an answered choice stays revisitable); see lib/bodyParity.ts.
//
// Migration: persisted drafts store `docFixProposals.bodySync`. The live
// extraction wiring maps it onto this answer's vocabulary
// (`"declined"` → `"keep-different"`) as `ctx.phaseF.bodyParityProposal`,
// which this module's `extract` reads. The slice stays the apply-path
// input (serializeWorkingCopy step 5c, useDocsPreview, helpDocsRender all
// keep reading it); this module's `apply` writes it back at completion
// through the 089 contract's `docFixProposals` channel, preserving the
// sibling keys (`pagename`, `imageWidth`) from
// `ctx.currentDocFixProposals`.
//
// Default: "welcome" — the old row's default radio, and the welcome page
// is the canonical document (the help page is derived from it when
// absent). Choice questions open with a defensible default the author can
// overturn (the pf_more_detail_gate precedent); the walk takes the seeded
// default as its top suggestion.

import type { FlowQuestion, QuestionModule, ApplyContext, WorkingCopyPatch } from "../../types.ts";
import { makeRequiredOptionValidator } from "../validators.ts";

export const BODY_PARITY_OPTIONS = ["welcome", "help", "keep-different"] as const;
export type BodyParityOption = (typeof BODY_PARITY_OPTIONS)[number];

/** Narrow a raw answer string to a body-parity option. */
export function isBodyParityOption(value: string): value is BodyParityOption {
  return (BODY_PARITY_OPTIONS as readonly string[]).includes(value);
}

export const definition = {
  id: "pf_body_parity",
  prompt: "The welcome page and the help page carry different text. Which text should both pages carry?",
  // `{{body_parity_welcome}}` / `{{body_parity_help}}` (issue #2530):
  // the first-difference preview as plain text (tags stripped — the
  // question never shows raw HTML to an author), injected via
  // SurveyContext by phaseFOptions.buildContext (flowStepOptions.tsx) —
  // the same `{{token}}` interpolation mechanism pf_history_entry's
  // heading/bullets already use. Both tokens resolve to "" (never left as
  // literal unresolved braces) when the question is not live.
  help_text:
    "First difference — welcome: “{{body_parity_welcome}}” · help: “{{body_parity_help}}”\n\n" +
    "The two pages should usually say the same thing. Pick the text to keep on both pages, " +
    "or keep them different if each page needs its own wording.",
  audit_label: "Welcome and help page text",
  type: "radio" as const,
  required: true,
  options: [
    {
      value: "welcome",
      label: "Use the welcome page's text",
    },
    {
      value: "help",
      label: "Use the help page's text",
    },
    {
      value: "keep-different",
      label: "Keep them different",
    },
  ],
  next: "pf_font_guidance",
} satisfies FlowQuestion;

export const validate = makeRequiredOptionValidator(
  BODY_PARITY_OPTIONS,
  "Please choose which text both pages should carry.",
  (value) => `“${value}” is not one of the offered options.`,
);

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "welcome", note: "both pages carry the welcome page's text" },
    { value: "help", note: "both pages carry the help page's text" },
    { value: "keep-different", note: "the two pages keep their different text" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: undefined, expectedCode: "required" },
    { value: "declined", expectedCode: "invalid_option", note: "the legacy slice value is not an answer" },
  ],
};

/**
 * Decision apply (issue #2530): the recorded `help-body-parity` answer
 * lands on the working copy's doc-fix-proposals slice, preserving the
 * sibling proposals. Composed from the recorded decisions (A6), like
 * pf_welcome_paragraph's helpDocs composition — the `value` argument is
 * the same answer, kept only as a fallback for a pass-2-style call with
 * no decision yet recorded. A blank/unknown answer composes to no patch
 * at all (the slice is left exactly as it was).
 */
export function apply(_value: string | string[] | undefined, ctx: ApplyContext): WorkingCopyPatch {
  const raw = ctx.decisions["help-body-parity"]?.value;
  const answer = typeof raw === "string" ? raw : typeof _value === "string" ? _value : undefined;
  if (answer === undefined || !isBodyParityOption(answer)) return {};
  const bodySync = answer === "keep-different" ? "declined" : answer;
  const current = ctx.currentDocFixProposals ?? {};
  if (current.bodySync === bodySync) return {};
  return { docFixProposals: { ...current, bodySync } };
}

const mod: QuestionModule = {
  definition,
  validate,
  apply,
  fixtures,
  inputs: [],
  writes: [],
  provides: ["help-body-parity"],
  specRef: "specs/080-documentation-completeness",
  // Migration (issue #2530, ruling 2): a persisted
  // `docFixProposals.bodySync` answer seeds this decision, mapped onto
  // the new vocabulary by the live extraction wiring
  // (`ctx.phaseF.bodyParityProposal`). The source names the base keyboard,
  // as for every extraction.
  extract: (ctx) => ctx.phaseF?.bodyParityProposal,
  // The "welcome" default (ruling 6): the old row's default radio. Only
  // when the finding is live — the wiring leaves `bodyParityLive`
  // unset otherwise, so the copy track and matching pages seed nothing.
  lookupDefault: (ctx) =>
    ctx.phaseF?.bodyParityLive === true ? { value: "welcome" } : undefined,
};
export default mod;
