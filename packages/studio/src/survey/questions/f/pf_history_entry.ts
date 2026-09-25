// Per-question module: pf_history_entry (Phase F, spec 079 US5 / T043)
//
// The HISTORY.md proposal surface (contracts/studio-surfaces.md §3, research
// R6, data-model.md §3): confirm / edit / dismiss the first HISTORY entry the
// tool drafts from what the author actually did this session (a base credit
// on an adaptation, characters added, mechanisms assigned, keys removed — see
// decisions/historyProposalSeed.ts, which derives the seed with NO NEW
// change journal). Sits between the description question
// (pf_welcome_paragraph) and the opt-in "more detail" gate — spliced in via
// pf_usage_tip_1's `next` (the last default-path screen before the gate),
// since routing in this flow is per-module (`definition.next`), and this
// module cannot rewrite a DIFFERENT module's `next` field.
//
// The confirm/edit/dismiss choice. Its edit branch routes to the companion
// module `pf_history_entry_bullets.ts` (own file so the registry-wide
// question-module contract suite can see it as a default export). Both
// converge back on `pf_more_detail_gate`.
//
// DEFERRED WIRING SEAM (mirrors pf_welcome_paragraph.ts's `prefill`/
// `requiredWhen`): `QuestionModule` (survey/types.ts) has no store-write hook,
// and a question module must not import stores/ (depcruise
// `question-modules-no-bypass-mutate-seam`). Pure helpers
// `deriveHistoryEntryState` / `applyHistoryEntryAction` live in
// lib/historyEntryState.ts for a flow-assembly caller (flowStepOptions.tsx's
// `phaseFOptions`) to call with live working-copy context.

import type { FlowQuestion, QuestionModule, ValidationResult } from "../../types.ts";

// ---------------------------------------------------------------------------
// pf_history_entry — confirm / edit / dismiss
// ---------------------------------------------------------------------------

export const HISTORY_ENTRY_ACTIONS = ["confirm", "edit", "dismiss"] as const;
export type HistoryEntryAction = (typeof HISTORY_ENTRY_ACTIONS)[number];

/**
 * Exported (not just used internally by `validate` below) so
 * `flowStepOptions.tsx`'s `phaseFOptions.onCommit` — the deferred wiring seam
 * this module's header documents — can narrow a raw `pf_history_entry`
 * answer string to `HistoryEntryAction` before calling
 * `applyHistoryEntryAction`, without duplicating this check.
 */
export function isHistoryEntryAction(value: string): value is HistoryEntryAction {
  return (HISTORY_ENTRY_ACTIONS as readonly string[]).includes(value);
}

export const definition = {
  id: "pf_history_entry",
  prompt: "Here is the first HISTORY entry we propose — confirm, edit, or dismiss it.",
  // `{{history_heading}}`/`{{history_bullets}}` (spec 079 US5): the actual
  // proposed entry text, injected via SurveyContext by
  // phaseFOptions.buildContext (flowStepOptions.tsx) — the same `{{token}}`
  // interpolation mechanism every other context-dependent flow string already
  // uses (interpolate.ts), so no new rendering path was needed. Both tokens
  // resolve to "" (never left as literal unresolved braces) until the
  // mount-time derivation lands (phaseFOptions.onMount) — a same-commit React
  // effect, not a network round-trip, so in practice there is no visible
  // blank-then-filled flash.
  help_text:
    "{{history_heading}}\n{{history_bullets}}\n\n" +
    "We drafted this from what changed while you built this keyboard: the base " +
    "you started from (if any), the characters you added, the mechanisms you " +
    "assigned, and any keys you removed. It becomes the top entry in " +
    "HISTORY.md. Choose \"edit\" to change the wording, or \"dismiss\" to skip " +
    "adding an entry for now — you can come back to this from the Output " +
    "checklist later.",
  type: "radio" as const,
  required: false,
  options: [
    {
      value: "confirm",
      label: "Add it as written",
    },
    {
      value: "edit",
      label: "Use it, but let me edit the wording",
    },
    {
      value: "dismiss",
      label: "Don't add a HISTORY entry yet",
    },
  ],
  next: [
    { condition: "value == 'edit'", goto: "pf_history_entry_bullets" },
    { goto: "pf_more_detail_gate", default: true },
  ],
} satisfies FlowQuestion;

export function validate(value: string | string[] | undefined): ValidationResult {
  const v = typeof value === "string" ? value : "";
  // Optional (propose-then-confirm, §3c): leaving it blank means "not decided
  // yet" — the state stays "proposed" and nothing ships until the author
  // returns (FR-011). This check only guards against a value outside the
  // three offered actions.
  if (v === "") return { ok: true };
  if (!isHistoryEntryAction(v)) {
    return {
      ok: false,
      code: "invalid_option",
      message: "Please choose one of the offered options.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "confirm", note: "add the drafted entry as written" },
    { value: "edit", note: "routes to pf_history_entry_bullets" },
    { value: "dismiss", note: "skip for now — stays a placeholder (FR-011)" },
    { value: "", note: "blank is fine — not yet decided" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [{ value: "delete_it", expectedCode: "invalid_option" }],
};

const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  specRef: "specs/079-documentation-completeness",
};
export default mod;

// `deriveHistoryEntryState` / `applyHistoryEntryAction` live in
// lib/historyEntryState.ts: they need the engine's buildHistoryProposal, and
// question modules stay engine-free so the standalone content-i18n extractor
// can load them.
