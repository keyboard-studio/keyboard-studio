// StudioFooter — the footer IS the breadcrumb (spec 057 Q7 resolved; T051,
// T053, T063 (current dot wiring)).
//
// A narrow strip, present from the moment the journey starts, absent — not an
// empty shell — before it (Q6, FR-040). It names the project (FR-041,
// `deriveProjectLabel` — the ONE precedence, not a fourth derivation) and
// renders the whole-journey dot row `decisions/progressDots` assembles
// (FR-042). Activating a reached dot uses `jumpToLocation` — the SAME
// primitive the decision trail's deep links use (FR-045); there is no second
// jump implementation and no second router (FR-006).
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

import { useEffect, useMemo, useRef, useState } from "react";
import { useLingui } from "@lingui/react/macro";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useDecisionLogStore } from "../decisions/decisionLogStore.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useReproposalNoticeStore } from "../stores/reproposalNoticeStore.ts";
import { useWorkToDo } from "../hooks/useWorkToDo.ts";
import { stepPositionIds } from "../lib/stepWalk.ts";
import { manifest } from "../steps/manifest.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import { deriveProjectLabel } from "../lib/projectLabel.ts";
import { jumpToLocation, peekPendingJump } from "../lib/jumpToLocation.ts";
import type { ResolveContext } from "../lib/resolveLocation.ts";
import {
  buildProgressDots,
  unreachableReasonLabel,
  type ProgressDot as ProgressDotData,
} from "../decisions/progressDots.ts";
import { ProgressDot } from "./ProgressDot.tsx";
import { CSS_BORDER, CSS_SURFACE, CSS_TEXT, CSS_TEXT_MUTED } from "../ui/theme.ts";

export function StudioFooter() {
  const { t, i18n } = useLingui();

  // ---------------------------------------------------------------------------
  // Project label — the ONE precedence (FR-041). No fourth derivation.
  // ---------------------------------------------------------------------------
  const scaffoldSpec = useSurveySessionStore((s) => s.scaffoldSpec);
  const identity = useWorkingCopyStore((s) => s.identity);
  const baseKeyboard = useWorkingCopyStore((s) => s.baseKeyboard);
  const projectLabel = useMemo(
    () => deriveProjectLabel({ scaffoldSpec, identity, baseKeyboard }),
    [scaffoldSpec, identity, baseKeyboard],
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
  const selectedTrack = useSurveySessionStore((s) => s.selectedTrack);
  // `visited` is the high-water mark `isReached` now keys on (see
  // surveySessionStore.ts). Omitting it here is not a cosmetic gap: the ROW
  // would go on rendering the author's finished-but-jumped-behind stages as
  // refused `upcoming` dots while `jumpToLocation` — which reads the whole
  // snapshot, not this subset — happily performed the jump. The two would
  // disagree about the same question.
  const visited = useSurveySessionStore((s) => s.visited);

  const record = useDecisionLogStore((s) => s.record);

  const hasProject = baseKeyboard !== null;

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
      hasProject,
      // Without this, a dot naming a gallery character would refuse itself as
      // `question-not-in-build` — a character has no questionRegistry entry.
      stepPositions: stepPositionIds(walks),
    }),
    [activeStepId, history, selectedTrack, visited, hasProject, walks],
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

  function handleActivate(dot: ProgressDotData): void {
    const outcome = jumpToLocation(dot.location);
    if (outcome.kind === "arrived") {
      setStatusMessage(null);
      return;
    }
    // Both "refused" and "degraded" mean the gate held. A step-bearing
    // location NEVER resolves the resolver's own `kind:"unreachable"`
    // variant (see progressDots.ts's module header) — `resolveLocation`
    // returns `degraded` for a beyond-gate/skipped-by-track stage, landing on
    // the nearest reachable ancestor rather than the requested step. Either
    // way nothing skipped the gate; the reason is what the author needs.
    setStatusMessage(unreachableReasonLabel(outcome.reason, i18n));
  }

  // Auto-scroll the current mark into view on every dot-row change (FR-047:
  // "the current position MUST remain visible without the author having to
  // scroll to find it"). `inline: "nearest"` is a no-op when it is already
  // visible, so this never fights a manual scroll the author just made.
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const row = rowRef.current;
    if (row === null) return;
    const currentEl = row.querySelector('[data-progress-dot-kind="current"]');
    // jsdom (the component-test environment) has no `scrollIntoView`
    // implementation at all — guard rather than let a test-only
    // environment gap throw in every render. Real browsers always have it.
    if (typeof currentEl?.scrollIntoView === "function") {
      currentEl.scrollIntoView({ inline: "nearest", block: "nearest" });
    }
  }, [dots]);

  // Q6 / FR-040: absent, not an empty shell, until the journey exists — see
  // the module header for why this is no longer `projectLabel !== null`.
  // Welcome is covered because `WelcomeScreen` resets the walk store and no
  // working copy is open there.
  const journeyStarted = Object.keys(walks).length > 0 || projectLabel !== null;
  if (!journeyStarted) return null;

  return (
    <footer
      aria-label={t({ id: "footer.ariaLabel", message: "Project and progress" })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        // Narrow: FR-040 forbids materially reducing the walk's vertical
        // space. Fixed height rather than content-driven, so the row never
        // grows the footer taller than this budget regardless of dot count —
        // overflow is handled horizontally (below), not vertically.
        height: 40,
        flexShrink: 0,
        padding: "0 12px",
        background: CSS_SURFACE,
        borderTop: `1px solid ${CSS_BORDER}`,
        color: CSS_TEXT,
        fontSize: 13,
        // FR-047: no horizontal overflow of the page body — the footer's own
        // box never exceeds its flex parent's width; the SCROLLING happens
        // inside the dot row below.
        overflow: "hidden",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {/* Omitted entirely, not placeholdered, while the project has no name —
          see the module header. The dot row simply takes the full width. */}
      {projectLabel !== null && (
        <span
          style={{
            flexShrink: 0,
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

      <div
        // spec 079 T062/T063: keyed on the active step. The two-tier strip
        // collapses/expands a section's whole set of children every time the
        // author moves between steps — a heavier structural change than
        // spec 057's single-tier row ever made (that row only ever APPENDED
        // dots; nothing changed KIND wholesale for many children at once).
        // Keying the row on `activeStepId` forces a full remount of every
        // mark on that transition, which is the one guarantee this feature
        // actually needs: no mark published while a step was active (and
        // whose underlying data a NON-active step's own async effects may
        // still be settling — e.g. a step's walk-publish effect committing
        // slightly out of step with this row's own re-render) can ever
        // survive as a stale sibling once the author has moved on. Losing
        // DOM-node identity (and therefore focus) across an ACTIVE STEP
        // change is an acceptable trade — the author's focus was already
        // moving to the new step's own content at that exact moment.
        key={activeStepId}
        ref={rowRef}
        style={{
          display: "flex",
          alignItems: "center",
          flex: 1,
          minWidth: 0,
          // FR-047's overflow degrade: horizontal scroll rather than wrap or
          // silent truncation. Every mark stays reachable — by mouse drag,
          // by trackpad/wheel, or simply by Tab (focusing an off-screen
          // button scrolls it into view natively).
          overflowX: "auto",
          overflowY: "hidden",
          flexWrap: "nowrap",
        }}
      >
        {dots.map((dot) => (
          // Keyed by STEP + stop, not by kind + stop. Two reasons, both now real:
          // the mechanisms and touch walks address the same characters, so the
          // same token id appears twice in one row and `kind:id` alone would
          // collide; and a stop's kind CHANGES as the author answers it
          // (upcoming -> completed -> current), which under a kind-bearing key
          // unmounts and remounts the button — throwing away focus mid-Tab.
          <ProgressDot
            key={`${dot.location.step ?? "-"}:${dot.id}`}
            dot={dot}
            onActivate={handleActivate}
          />
        ))}
      </div>

      <span role="status" aria-live="polite" style={{ flexShrink: 0, color: CSS_TEXT_MUTED, maxWidth: "25%" }}>
        {statusMessage ?? reproposalNotice}
      </span>
    </footer>
  );
}
