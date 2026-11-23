// StudioFooter — the footer IS the breadcrumb (spec 057 Q7 resolved; T051,
// T053, T063 (current dot wiring)).
//
// A narrow strip, present from the moment the journey starts, absent — not an
// empty shell — before it (Q6, FR-040). It names the project (FR-041,
// `deriveProjectLabel` — the ONE precedence, not a fourth derivation) and
// opens the whole-journey marks `decisions/progressDots` assembles (FR-042)
// as a labelled Contents list (JourneyContents) on every viewport; the bare
// dot row it once showed on desktop is gone. Activating a reached mark uses
// `jumpToLocation` — the SAME primitive the decision trail's deep links use
// (FR-045); there is no second jump implementation and no second router
// (FR-006).
//
// The list holds only steps this author's walk includes: the resolve context
// carries the manifest's screen gates, so a step the track skips is left out
// (FR-049a) even when answers for it were recorded earlier.
//
// WHY THE GATE IS NOT "a project exists" ANY MORE (author's call, 2026-08-05).
// As shipped, the strip appeared only once `deriveProjectLabel` returned a
// name — and the earliest tier of that precedence is filled at INSTANTIATION,
// i.e. when a base keyboard is chosen. But the identity-lite battery runs
// BEFORE base selection, and its answers (English name, autonym, language
// code, author attribution) are decisions that reach the emitted `.kps`. Under
// the old gate the row was hidden for exactly the stretch where the author has
// already made several recordable decisions and most needs to see where they
// are. The row must show from the FIRST question.
//
// So visibility now keys on "is there a journey", not "is there a name":
// a published step walk means a step's runner is live and the author is
// standing on one of its stops (see lib/stepWalk.ts — SurveyRunner publishes
// on mount, and `WelcomeScreen`/start-over both `reset()` the store, so an
// author who has not entered the survey has no walks). The old
// `projectLabel !== null` test is kept as a second disjunct rather than
// replaced: a deep-link arrival can put a project in scope on a tab whose
// runner never mounts, and that case rendered a footer before this change.
//
// The NAME is a separate question from the STRIP. Before instantiation there
// genuinely is no project name — `identityResult` is an answer about the
// language, not a name for the project, and projectLabel.ts's header forbids
// deriving one from it (FR-041). So the label span is omitted until a name
// exists, rather than filled with an invented "Untitled".
//
// NOT MOUNTED HERE. T052 (mounting this in StudioShell.tsx, on every route
// where a project exists) belongs to whoever owns that file — this component
// decides internally whether it has anything to show (returns `null` when
// `deriveProjectLabel` returns `null`), so StudioShell can mount it
// unconditionally as a layout sibling without a route-by-route check.

import { useEffect, useMemo, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { deriveScaffoldSpec } from "../decisions/identitySelectors.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import {
  decisionsWithoutTouchSeed,
  selectTrack,
  useDecisionStore,
} from "../stores/decisionStore.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useReproposalNoticeStore } from "../stores/reproposalNoticeStore.ts";
import {
  CRITERIA_ROUTE_NAV_STEP_ID,
  START_ROUTE_NAV_STEP_ID,
  useStepNavStore,
  hasSlots,
} from "../stores/stepNavStore.ts";
import { useWorkToDo } from "../hooks/useWorkToDo.ts";
import { stepPositionIds } from "../lib/stepWalk.ts";
import { manifest, screenGates } from "../steps/manifest.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { deriveProjectLabel } from "../lib/projectLabel.ts";
import { jumpToLocation, peekPendingJump } from "../lib/jumpToLocation.ts";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import {
  buildProgressDots,
  unreachableReasonLabel,
  type ProgressDot as ProgressDotData,
} from "../decisions/progressDots.ts";
import { JourneyContents } from "./JourneyContents.tsx";
import { useJourneyContentsStore } from "../stores/journeyContentsStore.ts";
import { useIsNarrow } from "../hooks/useViewport.ts";
import { StepNavCluster } from "./StepNavCluster.tsx";
import { CSS_BORDER, CSS_TEXT, CSS_TEXT_MUTED } from "../ui/theme.ts";
import type { RouteId } from "../lib/navigate.ts";

export function StudioFooter({ activeRoute = "survey" }: { activeRoute?: RouteId }) {
  const { t, i18n } = useLingui();
  // A "Contents" button opens the journey's marks as a labelled, scrollable
  // list (JourneyContents). Back / Next stay in the footer.
  const isNarrow = useIsNarrow();
  const setContentsAvailable = useJourneyContentsStore((s) => s.setAvailable);
  const setContentsOpen = useJourneyContentsStore((s) => s.setOpen);

  // ---------------------------------------------------------------------------
  // Project label — the ONE precedence (FR-041). No fourth derivation.
  // ---------------------------------------------------------------------------
  const decisions = useDecisionStore((s) => s.decisions);
  const scaffoldSpec = deriveScaffoldSpec(decisions);
  const identity = useWorkingCopyStore((s) => s.identity);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  const projectLabel = useMemo(
    () => deriveProjectLabel({ scaffoldSpec, identity, startKeyboard }),
    [scaffoldSpec, identity, startKeyboard],
  );

  // ---------------------------------------------------------------------------
  // Traversal — the three fields resolveLocation.ts and progressDots.ts
  // actually read off `ctx.traversal` (`activeStepId`, `history`,
  // `selectedTrack` — verified against both modules' `ctx.traversal.` reads).
  // Narrow selectors rather than a whole-store subscription, matching the
  // established idiom in StudioShell.tsx. If either module starts reading a
  // new traversal field, this list has to grow with it — there is no
  // compile-time link between the two (TraversalSnapshot's own module comment
  // makes the analogous point about snapshotTraversal()).
  // ---------------------------------------------------------------------------
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  const history = useSurveySessionStore((s) => s.history);
  // Spec 088 FR-005: the track is a decision-store selector now; the
  // session field it used to be read from is deleted. (Reads the `decisions`
  // subscription from the project-label block above.)
  const selectedTrack = selectTrack(decisions);
  // `visited` is the high-water mark `isReached` now keys on (see
  // surveySessionStore.ts). Omitting it here is not a cosmetic gap: the ROW
  // would go on rendering the author's finished-but-jumped-behind stages as
  // refused `upcoming` dots while `jumpToLocation` — which reads the whole
  // snapshot, not this subset — happily performed the jump. The two would
  // disagree about the same question.
  const visited = useSurveySessionStore((s) => s.visited);

  const record = useDecisionLogStore((s) => s.record);

  const hasProject = startKeyboard !== null;

  // ---------------------------------------------------------------------------
  // Within-step walks — the per-question / per-character stops each stage's own
  // component publishes (see lib/stepWalk.ts). This is what turns a stage with
  // a dozen internal stops from one dot into a dozen, and what makes the
  // current-position marker question-accurate during ordinary forward walking
  // rather than only right after a deep-link arrival.
  // ---------------------------------------------------------------------------
  const walks = useStepWalkStore((s) => s.walks);
  // Positions live in the answer store (spec 079 R-01) so they survive a
  // reload; `buildProgressDots` still takes them as the same `stepCursors` map.
  const answerSteps = useSurveyAnswerStore((s) => s.steps);
  const cursors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [stepId, step] of Object.entries(answerSteps)) {
      if (step.position !== null) out[stepId] = step.position;
    }
    return out;
  }, [answerSteps]);

  // `peekPendingJump()` is a plain read of jumpToLocation.ts's module-level
  // slot, not a subscribable store. It remains the fallback refinement for the
  // stage dot of a step that has published no walk (a deep-link arrival landing
  // before the runner mounts); a published walk supersedes it, and the walk's
  // cursor is what a jump now writes (see jumpToLocation.ts). Read fresh on
  // every render; a jump's own `navigateTo` call changes the hash, which
  // re-renders this component's ancestor anyway, so the value is live at the
  // render that matters.
  const currentQuestion = peekPendingJump()?.question;

  const ctx: ResolveContext = useMemo(
    () => ({
      manifest,
      questionRegistry,
      traversal: {
        activeStepId,
        history,
        selectedTrack,
        visited,
      } as unknown as ResolveContext["traversal"],
      // Spec 088 C-3.2: the gate view over the decision store, seed omitted.
      decisions: decisionsWithoutTouchSeed(decisions),
      // The same gates jumpToLocation resolves with, so a step this track
      // skips is absent from the list rather than offered as "not reached".
      screenGates,
      hasProject,
      // Without this, a dot naming a gallery character would refuse itself as
      // `question-not-in-build` — a character has no questionRegistry entry.
      stepPositions: stepPositionIds(walks),
    }),
    [activeStepId, history, selectedTrack, decisions, visited, hasProject, walks],
  );

  // spec 079 R-10/T062: which step's mark(s) show a "work waiting" badge,
  // and each not-asked step's status (FR-068's "passed — {reason}"). Both
  // come from the surveyAnswerStore-derived hooks; `decisions/progressDots.ts`
  // itself stays store-free (the `decisions-layer` boundary), receiving these
  // as plain data exactly like `record`/`ctx` above.
  const workToDo = useWorkToDo();
  const stepStatuses = useMemo(() => {
    const out: Record<string, (typeof answerSteps)[string]["status"]> = {};
    for (const [stepId, step] of Object.entries(answerSteps)) out[stepId] = step.status;
    return out;
  }, [answerSteps]);
  const recordedScreenOf = useSurveyAnswerStore((s) => s.recordedScreenOf);
  // Characters is judged by its outcome — the keyboard has letters — not by
  // whether every optional box on the way was filled.
  const hasLetters = useWorkingCopyStore((s) => s.session.confirmedInventory.length > 0);
  const satisfiedSteps = useMemo(
    () => new Set<string>(hasLetters ? ["characters"] : []),
    [hasLetters],
  );

  const dots = useMemo(
    () =>
      buildProgressDots({
        record,
        ctx,
        i18n,
        stepWalks: walks,
        stepCursors: cursors,
        recordedScreenOf,
        workToDo,
        stepStatuses,
        satisfiedSteps,
        ...(currentQuestion !== undefined ? { currentQuestion } : {}),
      }),
    [
      record,
      ctx,
      i18n,
      walks,
      cursors,
      recordedScreenOf,
      workToDo,
      stepStatuses,
      satisfiedSteps,
      currentQuestion,
    ],
  );

  // ---------------------------------------------------------------------------
  // Reason surfacing for a refused/degraded activation (FR-045, US4 scenario
  // 9). A live region rather than a modal or a thrown error — the author
  // stays exactly where they were; this just says why the click did nothing.
  // ---------------------------------------------------------------------------
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // FR-016 non-blocking notice (spec 079 T064, journey-strip-contract.md §9).
  // Rides the SAME role="status" span as the jump-refusal message above — no
  // second aria-live region, no new timer. `components/StepHost.tsx` raises
  // it, pinned to the step the author just landed on; it clears here on the
  // NEXT navigation away from that step (R-13), never on the transition that
  // raised it.
  // ---------------------------------------------------------------------------
  const noticeMessage = useReproposalNoticeStore((s) => s.message);
  const noticeStepId = useReproposalNoticeStore((s) => s.stepId);
  const clearNotice = useReproposalNoticeStore((s) => s.clear);
  useEffect(() => {
    if (noticeStepId !== null && noticeStepId !== activeStepId) clearNotice();
  }, [activeStepId, noticeStepId, clearNotice]);
  const reproposalNotice = noticeStepId === activeStepId ? noticeMessage : null;

  function handleActivate(dot: ProgressDotData): boolean {
    const outcome = jumpToLocation(dot.location);
    if (outcome.kind === "arrived") {
      setStatusMessage(null);
      return true;
    }
    // Held behind the unapplied-text question (spec 111 FR-046): not a refusal, so no reason to show.
    // The jump runs when the author answers.
    if (outcome.kind === "pending") {
      setStatusMessage(null);
      return false;
    }
    // Both "refused" and "degraded" mean the gate held. A step-bearing
    // location NEVER resolves the resolver's own `kind:"unreachable"`
    // variant (see progressDots.ts's module header) — `resolveLocation`
    // returns `degraded` for a beyond-gate/skipped-by-track stage, landing on
    // the nearest reachable ancestor rather than the requested step. Either
    // way nothing skipped the gate; the reason is what the author needs.
    setStatusMessage(unreachableReasonLabel(outcome.reason, i18n));
    return false;
  }

  // Q6 / FR-040: absent, not an empty shell, until the journey exists — see
  // the module header for why this is no longer `projectLabel !== null`.
  // Welcome is covered because `WelcomeScreen` resets the walk store and no
  // working copy is open there.
  // Spec 081 FR-021: a step that publishes Back / forward buttons needs the
  // footer up to reach them, whatever else is true.
  const stepIdForFooterNav =
    activeRoute === "start"
      ? START_ROUTE_NAV_STEP_ID
      : activeRoute === "criteria"
        ? CRITERIA_ROUTE_NAV_STEP_ID
        : activeStepId;
  const activeHasNav = useStepNavStore((s) =>
    hasSlots(s.entries[stepIdForFooterNav]?.spec),
  );
  const journeyStarted =
    Object.keys(walks).length > 0 ||
    projectLabel !== null ||
    activeHasNav ||
    (activeRoute === "criteria" && hasProject);
  // Tell NavBar's menu whether there is a contents list to open.
  const contentsAvailable = journeyStarted && isNarrow;
  useEffect(() => {
    setContentsAvailable(contentsAvailable);
  }, [contentsAvailable, setContentsAvailable]);
  useEffect(() => () => setContentsAvailable(false), [setContentsAvailable]);
  if (!journeyStarted) return null;

  return (
    <footer
      aria-label={t({ id: "footer.ariaLabel", message: "Project and progress" })}
      className="ks-studio-footer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        // Narrow: FR-040 forbids materially reducing the walk's vertical
        // space. Fixed height rather than content-driven, so the row never
        // grows the footer taller than this budget regardless of dot count —
        // overflow is handled horizontally (below), not vertically. The height
        // itself is on `.ks-studio-footer` (index.css): 40 px, or 52 px under a
        // coarse pointer (spec 081 FR-020a), which an inline style cannot say.
        flexShrink: 0,
        padding: "0 12px",
        // Solid chrome: the opaque surface, the hairline divider above the bar
        // and the fixed-height logic all live on `.ks-studio-footer`
        // (index.css) — the fixed height needs a pointer query no inline
        // style can express. The bar sits in the shell's normal column flow,
        // so content ends at its top edge and no scrollbar runs behind it.
        color: CSS_TEXT,
        fontSize: 13,
        // FR-047: no horizontal overflow of the page body — the footer's own
        // box never exceeds its flex parent's width.
        overflowX: "clip",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Spec 081: the active step's Back / Skip / forward, first in the DOM
          and in Tab order. Keyed on the step, so a step change remounts it and
          focus never carries over from the previous step's buttons. The
          buttons never shrink, wrap or clip; at constrained widths the cluster
          itself scrolls horizontally (StepNavCluster) while the project label
          gives way first. */}
      <StepNavCluster key={`nav-${stepIdForFooterNav}`} stepId={stepIdForFooterNav} />

      {/* Omitted entirely, not placeholdered, while the project has no name —
          see the module header. */}
      {!isNarrow && projectLabel !== null && (
        <span
          className="ks-studio-footer-project"
          style={{
            // First to give way when space runs short (spec 081 FR-022):
            // ellipsis here, then hidden outright at narrow widths (index.css).
            flexShrink: 1,
            minWidth: 0,
            fontWeight: 600,
            color: CSS_TEXT,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "30%",
          }}
          title={projectLabel}
        >
          {t({ id: "footer.project.label", message: `Project: ${{ name: projectLabel }}` })}
        </span>
      )}

      <button
        type="button"
        // Press feedback via the shared .ks-press utility (index.css): the
        // inline styles pin no transform, so the class stays additive.
        // `.ks-hit-target`: 44 px under a coarse pointer only. A fixed
        // 44 px min-height would overflow the 40 px fine-pointer bar.
        className="ks-focus-ring ks-hit-target ks-press"
        aria-haspopup="dialog"
        // Hand the sheet the trigger point so its enter/exit animation
        // anchors at the button that opened it (see JourneyContents).
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setContentsOpen(true, {
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        }}
        data-testid="journey-contents-open"
        style={{
          marginLeft: "auto",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 12px",
          flexShrink: 0,
          border: `1px solid ${CSS_BORDER}`,
          borderRadius: 8,
          background: "transparent",
          color: CSS_TEXT,
          fontFamily: "var(--app-font)",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true">☰</span>
        {t({ id: "journeyContents.open", message: "Contents" })}
      </button>
      <JourneyContents
        dots={dots}
        onActivate={handleActivate}
        statusMessage={statusMessage ?? reproposalNotice}
      />

      <span role="status" aria-live="polite" style={{ flexShrink: 0, color: CSS_TEXT_MUTED, maxWidth: "25%" }}>
        {statusMessage ?? reproposalNotice}
      </span>
    </footer>
  );
}
