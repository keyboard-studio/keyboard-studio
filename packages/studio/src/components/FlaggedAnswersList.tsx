// FlaggedAnswersList — a step's flagged earlier screens, with jump links and
// their catalog reason (spec 079 US3 T057, FR-013).
//
// One consumer of `selectWorkToDo()`'s `reproposed` items per step. Every jump
// goes through `jumpToLocation` (lib/jumpToLocation.ts) — the ONE jump
// implementation (spec 057) — so this list can never disagree with the footer
// or the decision trail about where a link lands.
//
// The actual `jumpToLocation` call is read from `lib/jumpContext.ts`
// (`useJumpToScreen()`), NOT imported here directly — see that module's header
// for why: this component is rendered from inside a step (`MarksSeriesStep.tsx`
// today; every other step T080 wires in), and every step is itself imported by
// `steps/manifest.ts`, which `jumpToLocation.ts` imports to resolve a jump
// target. A static (or dynamic) import of `jumpToLocation.ts` from here would
// close that into a genuine runtime circular dependency (`no-circular`,
// .dependency-cruiser.cjs — depcruise's circular check follows dynamic-import
// edges too, so a lazy `import()` does not avoid it either). `StepHost.tsx`
// (which imports `manifest.ts` but is never imported BY it) provides the real
// function via `JumpContext`, mirroring `lib/questionRecorder.ts`'s existing
// no-op-default-context pattern for the identical reason.
//
// Semantic `<ul>` of buttons (not `<a href>`: a jump can be refused, and a
// button communicates "in-page action" rather than "leaves the page" — see
// docs/accessibility.md). Fully keyboard-operable: each item is a native
// `<button>`, reachable by Tab, activatable by Enter/Space with no extra
// wiring needed.

import { useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";
import type { ActiveStepId } from "../stores/surveySessionStore.ts";
import { useJumpToScreen } from "../lib/jumpContext.ts";
import { reproposalReasonMessage } from "../survey/reproposalReason.ts";
import type { ReproposalReason } from "../steps/answerTypes.ts";
import { ACCENT, TEXT_MAIN } from "../survey/surveyStyles.ts";

export interface FlaggedAnswersListItem {
  readonly answerId: string;
  readonly screenId: string;
  readonly reason: ReproposalReason;
}

export interface FlaggedAnswersListProps {
  readonly stepId: ActiveStepId;
  readonly items: readonly FlaggedAnswersListItem[];
}

/** A step's flagged earlier screens. Renders nothing when `items` is empty. */
export function FlaggedAnswersList({ stepId, items }: FlaggedAnswersListProps) {
  const { t, i18n } = useLingui();
  const jumpToScreen = useJumpToScreen();
  if (items.length === 0) return null;
  return (
    <section data-testid="flagged-answers-list" aria-label={t(msg({ id: "survey.flagged.heading", message: "Needs reconfirming" }))}>
      <h3 style={{ fontSize: 14, fontWeight: 600, color: TEXT_MAIN, margin: "0 0 8px 0" }}>
        {t(msg({ id: "survey.flagged.heading", message: "Needs reconfirming" }))}
      </h3>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => (
          <li key={item.answerId}>
            <button
              type="button"
              data-testid={`flagged-answer-${item.answerId}`}
              onClick={() => jumpToScreen(stepId, item.screenId)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                border: `1px solid ${ACCENT}`,
                borderRadius: 6,
                background: "transparent",
                color: TEXT_MAIN,
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              {reproposalReasonMessage(item.reason, i18n)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
