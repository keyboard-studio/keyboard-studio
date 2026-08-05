// StudioFooter — the footer IS the breadcrumb (spec 057 Q7 resolved; T051,
// T053, T063 (current dot wiring)).
//
// A narrow strip, present on every tab where a project exists, absent — not
// an empty shell — everywhere else (Q6, FR-040). It names the project
// (FR-041, `deriveProjectLabel` — the ONE precedence, not a fourth
// derivation) and renders the whole-journey dot row `decisions/progressDots`
// assembles (FR-042). Activating a reached dot uses `jumpToLocation` — the
// SAME primitive the decision trail's deep links use (FR-045); there is no
// second jump implementation and no second router (FR-006).
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
  const cursors = useStepWalkStore((s) => s.cursors);

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
      traversal: { activeStepId, history, selectedTrack } as unknown as ResolveContext["traversal"],
      hasProject,
      // Without this, a dot naming a gallery character would refuse itself as
      // `question-not-in-build` — a character has no questionRegistry entry.
      stepPositions: stepPositionIds(walks),
    }),
    [activeStepId, history, selectedTrack, hasProject, walks],
  );

  const dots = useMemo(
    () =>
      buildProgressDots({
        record,
        ctx,
        i18n,
        stepWalks: walks,
        stepCursors: cursors,
        ...(currentQuestion !== undefined ? { currentQuestion } : {}),
      }),
    [record, ctx, i18n, walks, cursors, currentQuestion],
  );

  // ---------------------------------------------------------------------------
  // Reason surfacing for a refused/degraded activation (FR-045, US4 scenario
  // 9). A live region rather than a modal or a thrown error — the author
  // stays exactly where they were; this just says why the click did nothing.
  // ---------------------------------------------------------------------------
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

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

  // Q6 / FR-040: absent, not an empty shell, whenever there is no project to
  // name — covers Welcome (no working copy at all) and any other state
  // `deriveProjectLabel`'s precedence cannot yet resolve.
  if (projectLabel === null) return null;

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

      <div
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
        {statusMessage}
      </span>
    </footer>
  );
}
