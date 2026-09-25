// notAskedStatusMessage — the ONE "passed — {reason}" mapping (spec 079
// FR-068, US3 T065).
//
// A `not-asked` step recorded no decision entry and gave no answer (T055); the
// decision trail and the journey strip must say so as a PASSED step, not
// render it as though the author had answered a question. Both surfaces read
// this module so the wording can never diverge, mirroring
// `survey/reproposalReason.ts`'s "one reason -> message mapping" precedent for
// the sibling re-proposal vocabulary.
//
// `NotAskedReason.code` is a plain `string` in the shared type (see
// steps/answerTypes.ts) because it is open-ended per step; this module maps
// the codes that exist today (Convenience letters' tri-state gate,
// survey/convenience/convenienceGate.ts) and degrades to a generic "passed"
// statement for any code it does not yet name, so an unrecognised reason is
// never blank or the raw code.

import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { NotAskedReason } from "../steps/answerTypes.ts";
import { resolveMessage } from "../lib/i18nResolve.ts";

const REASON_MESSAGE: Record<string, ReturnType<typeof msg>> = {
  "convenience-not-instantiated": msg({
    id: "survey.convenience.notAsked.reason.notInstantiated",
    message: "no project has been instantiated yet",
  }),
  "convenience-no-surplus": msg({
    id: "survey.convenience.notAsked.reason.noSurplus",
    message: "there are no surplus letters to offer",
  }),
  "convenience-signal-unknown": msg({
    id: "survey.convenience.notAsked.reason.signalUnknown",
    message: "the orthography signal is not yet known",
  }),
};

const GENERIC_REASON_MESSAGE = msg({
  id: "survey.notAsked.reason.generic",
  message: "it does not apply",
});

/** Localized reason text for one `NotAskedReason.code` (no "passed —" prefix). */
export function notAskedReasonMessage(reason: NotAskedReason, i18n?: I18n): string {
  const descriptor = REASON_MESSAGE[reason.code] ?? GENERIC_REASON_MESSAGE;
  return resolveMessage(i18n, descriptor);
}

/**
 * The "passed — {reason}" statement itself (FR-068). The ONE place a
 * `not-asked` `StepStatus` becomes author-facing text — `DecisionTrailView`
 * and the journey strip (`decisions/progressDots.ts`) both call this rather
 * than rendering the status as if it were an answer.
 */
export function notAskedPassedMessage(reason: NotAskedReason, i18n?: I18n): string {
  const why = notAskedReasonMessage(reason, i18n);
  return resolveMessage(
    i18n,
    msg({
      id: "survey.notAsked.passed",
      message: `passed — ${{ reason: why }}`,
    }),
  );
}
