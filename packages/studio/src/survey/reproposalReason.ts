// reproposalReason — the ONE reason -> message mapping (spec 079 US3 item 11).
//
// `MarksSeriesStep.tsx`'s "needs reconfirming" cue, `FlaggedAnswersList` (every
// step) and the journey-strip badge tooltip (a later agent's T062/T063) all
// read a `ReproposalReason.code` through `reproposalReasonMessage()` so the
// wording can never diverge between the in-page cue and the footer.
//
// Plain module, not a hook — same convention as `decisions/stageText.ts`:
// `msg()` only DEFINES the descriptor, `resolveMessage` resolves it against
// the caller's `i18n` (or the English source text when called with none, for
// tests).

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ReproposalReason } from "../steps/answerTypes.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";

const REASON_MESSAGE: Record<ReproposalReason["code"], (subject: string) => ReturnType<typeof msg>> = {
  "evidence-added": (subject) =>
    msg({
      id: "survey.reproposal.reason.evidenceAdded",
      message: `You added ${{ subject }}`,
    }),
  "evidence-removed": (subject) =>
    msg({
      id: "survey.reproposal.reason.evidenceRemoved",
      message: `You removed ${{ subject }}`,
    }),
  "outside-script": (subject) =>
    msg({
      id: "survey.reproposal.reason.outsideScript",
      message: `${{ subject }} is outside the new script`,
    }),
  "now-applicable": (subject) =>
    msg({
      id: "survey.reproposal.reason.nowApplicable",
      message: `${{ subject }} now applies`,
    }),
};

/** Localized "why is this flagged" text for one `ReproposalReason`. */
export function reproposalReasonMessage(reason: ReproposalReason, i18n?: I18n): string {
  return resolveMessage(i18n, REASON_MESSAGE[reason.code](reason.subject));
}

/** The "Needs reconfirming — {reason}" cue text shown next to a flagged answer. */
export function reproposalCueMessage(reason: ReproposalReason, i18n?: I18n): string {
  const why = reproposalReasonMessage(reason, i18n);
  return resolveMessage(
    i18n,
    msg({
      id: "survey.reproposal.cue",
      message: `Needs reconfirming — ${{ reason: why }}`,
    }),
  );
}
