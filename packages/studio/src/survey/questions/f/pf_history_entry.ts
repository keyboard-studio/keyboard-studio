// Per-question module: pf_history_entry (Phase F, spec 076 US5 / T043)
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
// TWO flow nodes live in this one file (both registered in registry.f.ts):
//   - `pf_history_entry` (default export): the confirm/edit/dismiss choice.
//   - `pf_history_entry_bullets` (named export `bulletsModule`): reached only
//     when "edit" is chosen — free-text bullet editing, one bullet per line.
// Both converge back on `pf_more_detail_gate`.
//
// DEFERRED WIRING SEAM (mirrors pf_welcome_paragraph.ts's `prefill`/
// `requiredWhen`): `QuestionModule` (survey/types.ts) has no store-write hook,
// and a question module must not import stores/ (depcruise
// `question-modules-no-bypass-mutate-seam`). This module therefore exposes
// PURE, named helpers beyond the locked contract —
// `deriveHistoryEntryState` and `applyHistoryEntryAction` — for a
// flow-assembly caller (flowStepOptions.tsx's `phaseFOptions`, the same seam
// `prefill`/`requiredWhen` document) to call with live working-copy context
// and thread into `setHistoryEntryState`. That wiring is NOT done in this
// file; see this cycle's handoff notes for the exact call sites.

import type {
  HistoryEntryState,
  HistoryProposal,
  HistoryProposalStatus,
} from "@keyboard-studio/contracts";
import { buildHistoryProposal } from "@keyboard-studio/engine";
import type { HistoryProposalSeed } from "@keyboard-studio/engine";
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
  // `{{history_heading}}`/`{{history_bullets}}` (spec 076 US5): the actual
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
  specRef: "specs/076-documentation-completeness",
};
export default mod;

// ---------------------------------------------------------------------------
// pf_history_entry_bullets — free-text bullet editing (edit branch only)
// ---------------------------------------------------------------------------

export const bulletsDefinition = {
  id: "pf_history_entry_bullets",
  prompt: "Edit the HISTORY entry's bullet points, one per line.",
  help_text:
    "Each line becomes one bullet under the entry's heading. Leave a line as " +
    "we drafted it, reword it, remove it, or add your own — whatever is here " +
    "when you continue is what ships.",
  type: "text" as const,
  required: false,
  next: "pf_more_detail_gate",
} satisfies FlowQuestion;

export const bulletsFixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Adapted from basic_kbdfr v1.3 via keyboard-studio.\nAdded 2 characters: é, è", note: "two edited bullets" },
    { value: "", note: "blank is fine — falls back to the drafted bullets (see applyHistoryEntryAction)" },
    { value: undefined, note: "undefined is fine (optional)" },
  ],
  invalid: [],
};

export const bulletsModule: QuestionModule = {
  definition: bulletsDefinition,
  fixtures: bulletsFixtures,
  inputs: [],
  writes: [],
  specRef: "specs/076-documentation-completeness",
};

// ---------------------------------------------------------------------------
// Pure model helpers (the deferred wiring seam — see module header)
// ---------------------------------------------------------------------------

/** Split a `pf_history_entry_bullets` answer into bullets: one per non-blank line. */
export function parseEditedBullets(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Build or re-derive the stored `HistoryEntryState` for the current version.
 *
 * - `previous === null` (first render, spec 076 T043): builds a fresh
 *   `"proposed"` state from `seed`/`version`/`dateIso` — `dateIso` is stamped
 *   here, once (research R12 determinism).
 * - `previous !== null` and its `proposal.version` already matches `version`:
 *   returned unchanged (no re-derivation needed).
 * - `previous !== null` and the version has changed (spec edge case): the
 *   heading/version and bullets are re-derived from `seed` at the NEW
 *   version, but `previous.proposal.dateIso` is preserved (R12 — the date is
 *   stamped once, not re-stamped per production) and both `status` and
 *   `editedBullets` are carried forward untouched — a confirmed or edited
 *   decision survives a version bump; only the heading and the tool's own
 *   drafted bullets move.
 */
export function deriveHistoryEntryState(params: {
  seed: HistoryProposalSeed;
  version: string;
  dateIso: string;
  previous: HistoryEntryState | null;
}): HistoryEntryState {
  const { seed, version, dateIso, previous } = params;

  if (previous === null) {
    const proposal = buildHistoryProposal(seed, version, dateIso);
    return { status: "proposed", proposal, editedBullets: null };
  }

  if (previous.proposal.version === version) return previous;

  const proposal: HistoryProposal = buildHistoryProposal(seed, version, previous.proposal.dateIso);
  return { status: previous.status, proposal, editedBullets: previous.editedBullets };
}

/**
 * Apply the author's `pf_history_entry` answer (+ the bullets textarea, when
 * the "edit" branch was taken) onto the current `HistoryEntryState`.
 *
 * - `"confirm"` -> `status: "confirmed"`, `editedBullets: null` (the drafted
 *   bullets ship as-is).
 * - `"dismiss"` -> `status: "dismissed"`, `editedBullets: null` — the
 *   placeholder stays (FR-011); nothing the author has not confirmed or
 *   edited ships.
 * - `"edit"` -> `status: "edited"`, `editedBullets` parsed from
 *   `editedBulletsText` (one bullet per non-blank line). A blank/undefined
 *   textarea (the author picked "edit" but changed nothing before
 *   continuing) falls back to the current proposal's own bullets rather than
 *   shipping an empty entry.
 */
export function applyHistoryEntryAction(
  action: HistoryEntryAction,
  editedBulletsText: string | undefined,
  current: HistoryEntryState,
): HistoryEntryState {
  const status: HistoryProposalStatus =
    action === "confirm" ? "confirmed" : action === "dismiss" ? "dismissed" : "edited";

  if (action !== "edit") {
    return { ...current, status, editedBullets: null };
  }

  const parsed = parseEditedBullets(editedBulletsText ?? "");
  return {
    ...current,
    status,
    editedBullets: parsed.length > 0 ? parsed : current.proposal.bullets,
  };
}
