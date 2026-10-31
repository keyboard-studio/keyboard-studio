// The decisions the headless author cannot reach (spec 107 FR-042): UI
// choices whose rule lives in a component or hook and cannot be lifted
// without changing what the product does. Each is exercised only by the
// Playwright walks. The table is data: every run report carries the rule ids
// as `notCovered`, and the header comment of runAuthorCase.ts repeats the
// table for readers (playwrightOnly.test.ts keeps the two in step).

export interface PlaywrightOnlyRule {
  /** Stable id, reported as `notCovered`. */
  rule: string;
  /** The component or hook that owns the decision. */
  component: string;
  reason: string;
}

export const PLAYWRIGHT_ONLY: readonly PlaywrightOnlyRule[] = [
  {
    rule: "intro-manual-path",
    component: "survey/PhaseB.tsx (IntroChooser)",
    reason: "the manual flow fills no inventory draft; the author takes the build-list path the chooser pre-selects",
  },
  {
    rule: "escape-banner-toggles",
    component: "editors/assignLoop/DeadkeyEscapesBanner.tsx",
    reason: "checkbox edits to a placed deadkey's trigger escapes are free-form edits with no proposal to accept",
  },
  {
    rule: "mark-for-later-review",
    component: "editors/assignLoop/MechanismGallery.tsx",
    reason: "defers a character instead of placing it; the author always places",
  },
  {
    rule: "manual-s08-pickers",
    component: "editors/assignLoop/MechanismGallery.tsx",
    reason: "the layer-token and custom-character key pickers are free-form entry, not a proposal",
  },
  {
    rule: "deadkey-card-prefill",
    component: "editors/assignLoop/MechanismGallery.tsx",
    reason: "a chip that only prefills the deadkey card for a manual Apply; the walk dismisses it and takes the next offer",
  },
  {
    rule: "back-next-unlock",
    component: "components/StepHost.tsx, editors/assignLoop/MechanismGallery.tsx, survey/convenience/ConvenienceCharsStep.tsx",
    reason: "the author only moves forward; Back, the pop navigation branch and unlocking a completed step are navigation state",
  },
  {
    rule: "existing-method-removal",
    component: "editors/assignLoop/MechanismGallery.tsx",
    reason: "removing a method the copied keyboard already has is a deliberate edit with no proposal",
  },
  {
    rule: "touch-case-pair-proposal",
    component: "editors/assignLoop/TouchGallery.tsx",
    reason: "raised only by a touch key edit; the touch step completes with no edits",
  },
  {
    rule: "oauth-author-seed",
    component: "editors/adapters/flowStepDeps.ts (authenticated-profile hook)",
    reason: "needs a connected GitHub session; the author is a guest",
  },
  {
    rule: "rebase-confirm-prompt",
    component: "survey/chooseStart/confirmStartKeyboard.ts (window.confirm)",
    reason: "a browser dialog; the author starts from a clean working copy so it never fires",
  },
  {
    rule: "language-region-pick",
    component: "survey/SurveyRunner.tsx (il_language_region, routed by identityResolution)",
    reason: "asked only for a region-ambiguous language, as a free pick among its regions; a case names no region, so the author leaves it blank",
  },
  {
    rule: "debug-pin-chip",
    component: "survey/SurveyRunner.tsx (debugPinsStore)",
    reason: "a debug-only affordance that pins a question's value, not part of an author's decisions",
  },
  {
    rule: "help-docs-dialog",
    component: "editors/adapters/PhaseFGate.tsx (ConfirmDialog)",
    reason: "a blocking dialog over the help-docs content; dismissing it records nothing",
  },
  {
    rule: "documentation-fix-proposals",
    component: "components/DocumentationFixProposals.tsx",
    reason: "per-finding fix proposals applied by button; no walk policy accepts them",
  },
  {
    rule: "more-detail-gate-yes",
    component: "survey/questions/f (pf_more_detail_gate)",
    reason: "answering Yes opens extra Phase F questions; the author keeps the lookup default (No)",
  },
];

/** The rule ids a run report names as not covered. */
export const NOT_COVERED: readonly string[] = PLAYWRIGHT_ONLY.map((r) => r.rule);
