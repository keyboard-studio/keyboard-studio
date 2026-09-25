// marksViews — the single source of truth for which marks answers are
// FLAGGED and why (spec 079 US3 items 3-5). `MarksSeriesStep.tsx` renders its
// "needs reconfirming" cues and `FlaggedAnswersList` from
// `deriveMarksFlags()`'s output, and `hooks/useWorkToDo.ts` calls the SAME
// function for the journey-strip badges — so a station's in-page flag and its
// footer badge can never disagree.
//
// Pure (no store, no React): takes the station inputs `MarksSeriesStep.tsx`
// already derives from the engine (`classes`, `proposals`, `treatmentPrefills`,
// `multiMarkStacks`) plus the confirmed alphabet and the step's saved answers,
// and returns the flagged subset with a real `ReproposalReason` per answer
// (never the evidence.ts `UNSPECIFIED_REASON` default).
//
// FLAG RULE (spec 079 US3 item 4): an answer is flagged when either
//   (a) its view is `reproposed` (saved, but its key no longer matches), or
//   (b) its view is `proposed` (nothing saved yet) on a station the author has
//       already confirmed at least once — detected via `lastRecorded[screenId]`
//       (surveyAnswerStore's per-screen Next hash), which is set only by that
//       screen's own Next.
// `inactive` (the answer's subject is gone) is never flagged — data-model.md
// §3's `inactive, kept` transition has no reason to show.

import type { AttestedStack, ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { stackKey } from "@keyboard-studio/contracts";
import type { AttachmentProposal, MarkClass, MarkTreatmentPrefill } from "@keyboard-studio/engine";
import type { ReproposalReason, SavedAnswer } from "../../steps/answerTypes.ts";
import {
  hasChar,
  marksAttachmentKey,
  marksClassTreatmentKey,
  marksMarkTreatmentKey,
  marksOutputFormKey,
  marksPromotedKey,
  marksStackingAllowedKey,
  marksStackKey as marksStackEvidenceKey,
} from "../../steps/evidence.ts";

export type MarksStationId =
  | "marks_attachment"
  | "marks_treatment"
  | "marks_output_form"
  | "marks_stacking";

/** Attachment answers: per mark, per base — checked = reachable on the keyboard. */
export type AttachmentChecked = Record<string, Record<string, boolean>>;

/**
 * Initial S1 state from the proposals: attested pre-checked, everything else
 * unchecked. Used as the DEFAULT view both by `MarksSeriesStep.tsx` (re-
 * exported unchanged) and by `hooks/useWorkToDo.ts`'s badge computation,
 * which has no saved-answer reconciliation of its own to fall back on.
 */
export function initialAttachmentChecked(proposals: readonly AttachmentProposal[]): AttachmentChecked {
  const out: AttachmentChecked = {};
  for (const proposal of proposals) {
    const row: Record<string, boolean> = {};
    for (const [base, state] of Object.entries(proposal.states)) {
      row[base] = state === "attested";
    }
    out[proposal.mark] = row;
  }
  return out;
}

export interface FlaggedMarksAnswer {
  readonly answerId: string;
  readonly screenId: MarksStationId;
  readonly reason: ReproposalReason;
}

export interface MarksFlagInput {
  readonly alphabet: ConfirmedAlphabet;
  readonly proposals: readonly AttachmentProposal[];
  /** The bases actually OFFERED as attachment checkboxes (case-folded, spec
   * 049) — an uppercase base derived via case-counterpart expansion is never
   * saved directly, so it must never be classified as `proposed`-on-a-
   * confirmed-screen (which would flag it forever with nothing to resolve). */
  readonly attachmentBases: readonly string[];
  readonly classes: readonly MarkClass[];
  readonly treatmentPrefills: readonly MarkTreatmentPrefill[];
  readonly multiMarkStacks: readonly AttestedStack[];
  readonly postureId: string;
  readonly savedAnswers: Readonly<Record<string, SavedAnswer>>;
  /** `stepAnswers.lastRecorded` — which screens have had at least one Next. */
  readonly lastRecorded: Readonly<Record<string, string>>;
}

const SOURCE_STEP_ID = "characters";

type ViewState = "current" | "reproposed" | "proposed" | "inactive";

function classify(saved: SavedAnswer | undefined, currentKey: string | null): ViewState {
  if (saved === undefined) return "proposed";
  if (currentKey === null) return "inactive";
  if (saved.evidenceKey === currentKey) return "current";
  return "reproposed";
}

function stationConfirmed(lastRecorded: Readonly<Record<string, string>>, screenId: string): boolean {
  return lastRecorded[screenId] !== undefined;
}

/**
 * Push a flag for `answerId` when its computed state warrants one. `reason` is
 * only evaluated (and only needs to be correct) when the answer is actually
 * flagged, so callers may pass a reason built from values that are only
 * meaningful in the flagged case.
 */
function considerFlag(
  out: FlaggedMarksAnswer[],
  answerId: string,
  screenId: MarksStationId,
  saved: SavedAnswer | undefined,
  currentKey: string | null,
  lastRecorded: Readonly<Record<string, string>>,
  reason: () => ReproposalReason,
): void {
  const state = classify(saved, currentKey);
  const flagged = state === "reproposed" || (state === "proposed" && stationConfirmed(lastRecorded, screenId));
  if (flagged) out.push({ answerId, screenId, reason: reason() });
}

/**
 * The flagged subset of a marks step's saved answers, each with a real reason.
 * Never flags an `inactive` answer, and never flags the input-order answer
 * (it is carried forward via `adjust`, not re-proposed — FR-012).
 */
export function deriveMarksFlags(input: MarksFlagInput): FlaggedMarksAnswer[] {
  const {
    alphabet,
    proposals,
    attachmentBases,
    classes,
    treatmentPrefills,
    multiMarkStacks,
    postureId,
    savedAnswers,
    lastRecorded,
  } = input;
  const out: FlaggedMarksAnswer[] = [];

  // --- attachment: M x B rows (offered bases only — see MarksFlagInput doc) ---
  for (const proposal of proposals) {
    for (const base of attachmentBases.filter((b) => b in proposal.states)) {
      const answerId = `marks_attachment.${proposal.mark}|${base}`;
      const key = marksAttachmentKey(alphabet, proposal.mark, base);
      considerFlag(out, answerId, "marks_attachment", savedAnswers[answerId], key, lastRecorded, () => ({
        code: hasChar(alphabet, proposal.mark) && hasChar(alphabet, base) ? "evidence-added" : "evidence-removed",
        subject: base,
        sourceStepId: SOURCE_STEP_ID,
      }));
    }
  }

  // --- class treatment ---
  for (const prefill of treatmentPrefills) {
    const markClass = classes.find((c) => c.id === prefill.classId);
    const members = markClass?.marks ?? [];
    const answerId = `marks_treatment.class.${prefill.classId}`;
    const key = marksClassTreatmentKey(members);
    considerFlag(out, answerId, "marks_treatment", savedAnswers[answerId], key, lastRecorded, () => ({
      code: "evidence-added",
      subject: members.join(", "),
      sourceStepId: SOURCE_STEP_ID,
    }));
  }

  // --- per-mark treatment overrides (only ones the author explicitly set) ---
  for (const [answerId, saved] of Object.entries(savedAnswers)) {
    const prefix = "marks_treatment.mark.";
    if (!answerId.startsWith(prefix)) continue;
    const mark = answerId.slice(prefix.length);
    const markClass = classes.find((c) => c.marks.includes(mark));
    const key = marksMarkTreatmentKey(alphabet, mark, markClass?.id ?? "");
    considerFlag(out, answerId, "marks_treatment", saved, key, lastRecorded, () => ({
      code: hasChar(alphabet, mark) ? "evidence-added" : "evidence-removed",
      subject: mark,
      sourceStepId: SOURCE_STEP_ID,
    }));
  }

  // --- promoted composed characters ---
  {
    const answerId = "marks_treatment.promoted";
    const saved = savedAnswers[answerId];
    const savedPromoted = (saved?.value as string[] | undefined) ?? [];
    const key = marksPromotedKey(alphabet, savedPromoted);
    considerFlag(out, answerId, "marks_treatment", saved, key, lastRecorded, () => ({
      code: "evidence-removed",
      subject: savedPromoted.join(", "),
      sourceStepId: SOURCE_STEP_ID,
    }));
  }

  // --- output form ---
  {
    const answerId = "marks_output_form.form";
    const key = marksOutputFormKey(postureId);
    considerFlag(out, answerId, "marks_output_form", savedAnswers[answerId], key, lastRecorded, () => ({
      code: "evidence-added",
      subject: "the marks in your alphabet",
      sourceStepId: SOURCE_STEP_ID,
    }));
  }

  // --- stacking ---
  {
    const stackKeys = multiMarkStacks.map((s) => stackKey(s));
    const answerId = "marks_stacking.allowed";
    const key = marksStackingAllowedKey(stackKeys);
    considerFlag(out, answerId, "marks_stacking", savedAnswers[answerId], key, lastRecorded, () => ({
      code: "evidence-added",
      subject: "your multi-mark stacks",
      sourceStepId: SOURCE_STEP_ID,
    }));
  }
  for (const stack of multiMarkStacks) {
    const key = stackKey(stack);
    const evidenceKey = marksStackEvidenceKey(alphabet, stack.marks);
    const answerId = `marks_stacking.stack.${key}`;
    considerFlag(out, answerId, "marks_stacking", savedAnswers[answerId], evidenceKey, lastRecorded, () => ({
      code: stack.marks.every((m) => hasChar(alphabet, m)) && hasChar(alphabet, stack.base)
        ? "evidence-added"
        : "evidence-removed",
      subject: stack.base + stack.marks.join(""),
      sourceStepId: SOURCE_STEP_ID,
    }));
  }

  return out;
}
