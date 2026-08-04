// StepHost — generic survey step host (spec 028 Stage 5, T012/T013).
//
// Reads the active step id from surveySessionStore, resolves the manifest Step,
// and renders step.component with the standard EditorStepProps. Selects chrome
// by step.layout (layout:"full" → full-screen; else → left pane content). Owns
// the centralized onComplete / onBack wiring — NO per-step conditional for
// manifest steps.
//
// TERMINALS FIRST (contract §2, R5):
//   "done"        → survey-complete panel + onStartOver
//   "unsupported" → UnsupportedScriptStub + onStartOver
//   unknown id    → visible error panel (exhaustiveness guard)
//
// CENTRALIZED COMPLETION PATH (contract §2, FR-004):
//   1. If result is SurveyPhaseResult-shaped: recordPhase(result) +
//      routeAnswersThroughMutate(result, deps)
//   2. If step.id in STEPS_WITH_APPLY_COMPLETION: applyStepCompletion(id, result, deps)
//   3. advance(id, result, { selectedTrack, identitySupported, touchSeedSource }) →
//      { next, navigate?, setCharactersSubStage? }
//   4. session.advance(next)
//   5. if setCharactersSubStage: session.setCharactersSubStage("prefill")
//   6. if navigate === "output": navigateTo("output")
//
// STEP-SPECIFIC EFFECTS (research R7):
//   Steps whose pre-Stage-5 handlers wrote to the session or working-copy store
//   BEFORE calling advance do so in their ADAPTER (before calling onComplete).
//   The effect table STEPS_WITH_APPLY_COMPLETION gates applyStepCompletion per
//   step without any per-step host branch.
//
// FR-009: pane scaffolding (resizable panes, OSK, useValidator, instantiatedForBaseIdRef)
//   remain in SurveyView. StepHost only decides which container a step renders into.

import type { ReactNode, CSSProperties } from "react";
import { useEffect, useState } from "react";
import { Trans } from "@lingui/react/macro";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import {
  useSurveySessionStore,
  performManifestBack,
  expectedBackTarget,
  type ActiveStepId,
} from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { manifest } from "../steps/manifest.ts";
import type { EditorStep } from "../steps/types.ts";
import {
  applyStepCompletion,
  recordStepCompletion,
  routeAnswersThroughMutate,
  type ReducerDeps,
} from "../steps/reducer.ts";
import { advance, STEPS_WITH_APPLY_COMPLETION } from "../steps/advance.ts";
import { navigateTo } from "../lib/navigate.ts";
import { peekPendingJump, clearPendingJump, jumpToLocation } from "../lib/jumpToLocation.ts";
import type { Location } from "../lib/location.ts";
import { UnsupportedScriptStub } from "./UnsupportedScriptStub.tsx";
import type { SurveyContext } from "../steps/types.ts";
import { ACCENT, ERROR_RED, TEXT_DIM, BORDER } from "../ui/theme.ts";
import { useInventoryCoverageGate } from "../hooks/useInventoryCoverageGate.ts";

// ---------------------------------------------------------------------------
// isSurveyPhaseResult — shape guard for the generic completion path.
// Guards recordPhase + routeAnswersThroughMutate — these are only called when
// the result is SurveyPhaseResult-shaped (phase: string, answers: array).
// ---------------------------------------------------------------------------

function isSurveyPhaseResult(r: unknown): r is SurveyPhaseResult {
  return (
    typeof r === "object" &&
    r !== null &&
    typeof (r as { phase?: unknown }).phase === "string" &&
    Array.isArray((r as { answers?: unknown }).answers)
  );
}

// ---------------------------------------------------------------------------
// StepHostProps
// ---------------------------------------------------------------------------

export interface StepHostProps {
  /** Built by the survey component and injected (boundary: reducer imports no stores). */
  reducerDeps: ReducerDeps;
  /** Start-over affordance target for the terminal panels. */
  onStartOver: () => void;
  /** Optional: shared survey context to pass as EditorStepProps.ctx. */
  ctx?: SurveyContext;
}

// ---------------------------------------------------------------------------
// Deep-link revise-and-return (spec 057 FR-032/FR-033/FR-034, Q3, T043).
//
// `jumpToLocation` parks a jump's request in a module-level pending slot
// (see lib/jumpToLocation.ts's own header) precisely because a jump can only
// NAME a step — this component is "the step runner" that module's docstring
// says decides what arriving there means. `targetStepId` is captured
// alongside `returnTo` so the affordance below is gated to the ONE step the
// jump actually targeted: backing up further before confirming, or
// continuing normally after choosing "continue from here instead" (both of
// which change `activeStepId` without a new jump), must not carry a stale
// "confirming returns you to Decisions" banner onto an unrelated step.
// ---------------------------------------------------------------------------

interface DeepLinkArrival {
  readonly targetStepId: ActiveStepId;
  readonly returnTo: Location;
}

// ---------------------------------------------------------------------------
// Terminal panel styles
// ---------------------------------------------------------------------------

const TERMINAL_PANEL_STYLE: CSSProperties = {
  padding: 24,
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "flex-start",
};

const TERMINAL_HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontSize: "1.1rem",
  fontWeight: 600,
};

const TERMINAL_TEXT_STYLE: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: TEXT_DIM,
};

const START_OVER_BTN_STYLE: CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: TEXT_DIM,
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

const DEEP_LINK_BANNER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 12px",
  marginBottom: 8,
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  fontSize: 13,
};

const DEEP_LINK_BANNER_TEXT_STYLE: CSSProperties = {
  margin: 0,
  color: TEXT_DIM,
};

const DEEP_LINK_CONTINUE_BUTTON_STYLE: CSSProperties = {
  padding: "4px 10px",
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 6,
  color: ACCENT,
  fontSize: 12,
  cursor: "pointer",
  fontFamily: "inherit",
  whiteSpace: "nowrap",
};

// ---------------------------------------------------------------------------
// StepHost
// ---------------------------------------------------------------------------

export function StepHost({ reducerDeps, onStartOver, ctx }: StepHostProps): ReactNode {
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  // identityResult is read here only for the terminal panels (unsupported stub).
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const sessionAdvance = useSurveySessionStore((s) => s.advance);
  // Subscribed (not snapshotted once) so the Back affordance's gating below
  // stays live across advance/pop/reset — F7 defect 2: a stale "always show
  // Back" render made the button inert at the first step / right after
  // Start-over.
  const history = useSurveySessionStore((s) => s.history);
  const setCharactersSubStage = useSurveySessionStore((s) => s.setCharactersSubStage);

  const recordPhase = useWorkingCopyStore((s) => s.recordPhase);

  // ---------------------------------------------------------------------------
  // Phase F hard-gate inputs — derived via the SAME shared hook
  // (hooks/useInventoryCoverageGate.ts) the two galleries use for their leave-
  // warnings, so "is character X implemented" never forks across the three
  // call sites. touchLayoutJson === null means touch was never authored (or a
  // truly-untouched import-adapt needed no emission — see
  // buildTouchLayoutJson's R11 matrix) — either way, a desktop-only session
  // must not be blocked on touch.
  // ---------------------------------------------------------------------------
  const allCharactersImplemented = !useInventoryCoverageGate().blocked;

  // ---------------------------------------------------------------------------
  // Deep-link revise-and-return (spec 057 FR-032/FR-033/FR-034, Q3).
  //
  // Captured with a non-destructive PEEK into component state, not the
  // destructive `consumePendingJump` — StrictMode's development-only double
  // render invokes a `useState` lazy initializer twice (see main.tsx's
  // <StrictMode>), and peeking twice returns the same value where consuming
  // twice would lose it on the second call. The module slot is then cleared
  // in a plain effect, mirroring StudioShell.tsx's `resumeOfferConsumed`
  // idiom: setting/clearing a flag twice under StrictMode's mount/cleanup/
  // mount is harmless, unlike calling a destructive consumer twice would be.
  //
  // This only needs to run once: a decision-trail deep link always arrives
  // from a DIFFERENT route (`#trail`), so the hash round trip that lands on
  // `#survey` always mounts a fresh SurveyView/StepHost — there is no
  // continuously-mounted-StepHost case where a second jump could land on an
  // already-open survey without an intervening mount.
  const [deepLinkArrival] = useState<DeepLinkArrival | null>(() => {
    const pending = peekPendingJump();
    return pending?.returnTo !== undefined
      ? { targetStepId: activeStepId, returnTo: pending.returnTo }
      : null;
  });

  useEffect(() => {
    clearPendingJump();
  }, []);

  // FR-034: the choice is explicit, not a prompt on every revision — the
  // banner stays up until the author either confirms (returning them, per
  // Q3's default) or picks this to keep walking forward from the revised
  // point instead.
  const [continueFromHere, setContinueFromHere] = useState(false);

  // Gated to the step the jump actually targeted — see the DeepLinkArrival
  // comment above the interface for why this isn't just "a jump happened
  // this mount".
  const isDeepLinkTarget =
    deepLinkArrival !== null && activeStepId === deepLinkArrival.targetStepId;

  // ---------------------------------------------------------------------------
  // Terminal: done — survey-complete panel
  // ---------------------------------------------------------------------------

  if (activeStepId === "done") {
    return (
      <div style={TERMINAL_PANEL_STYLE}>
        <h2 style={{ ...TERMINAL_HEADING_STYLE, color: ACCENT }}>
          <Trans id="step.done.heading">Survey complete</Trans>
        </h2>
        <p style={TERMINAL_TEXT_STYLE}>
          <Trans id="step.done.detail">
            All authoring steps have been completed. Head to Output to download or
            submit your keyboard.
          </Trans>
        </p>
        <button type="button" onClick={onStartOver} style={START_OVER_BTN_STYLE}>
          <Trans id="step.startOver">Start over</Trans>
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Terminal: unsupported — §9 three-group routing not-yet-supported stub
  // ---------------------------------------------------------------------------

  if (activeStepId === "unsupported") {
    // Always render a visible panel (spec 028 edge case + FR): never null.
    // identityResult may be null if the session is in an unexpected state —
    // fall back to a generic "Script not supported" panel so there is no
    // invisible failure.
    if (identityResult !== null) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "flex-start" }}>
          <UnsupportedScriptStub script={identityResult.targetScriptRaw} />
          <button type="button" onClick={onStartOver} style={START_OVER_BTN_STYLE}>
            <Trans id="step.startOver">Start over</Trans>
          </button>
        </div>
      );
    }
    // Fallback: identityResult is null — render a generic fallback panel.
    return (
      <div style={TERMINAL_PANEL_STYLE}>
        <h2 style={{ ...TERMINAL_HEADING_STYLE, color: ERROR_RED }}>
          <Trans id="step.unsupported.fallback.heading">Script not supported</Trans>
        </h2>
        <p style={TERMINAL_TEXT_STYLE}>
          <Trans id="step.unsupported.fallback.detail">
            This script is not yet supported in v1. Please start over and choose a
            different script, or check back in a future release.
          </Trans>
        </p>
        <button type="button" onClick={onStartOver} style={START_OVER_BTN_STYLE}>
          <Trans id="step.startOver">Start over</Trans>
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Manifest step resolution
  // ---------------------------------------------------------------------------

  const step = manifest.find((s): s is EditorStep => s.id === activeStepId && s.kind === "editor-step");

  // Unknown id — visible error panel (exhaustiveness guard, FR preserved).
  if (step === undefined) {
    return (
      <div
        role="alert"
        style={{ padding: 24, color: ERROR_RED, fontFamily: "monospace", fontSize: 13 }}
      >
        {`[StepHost] unhandled step id: "${String(activeStepId)}" — wire this manifest step into registerEditorSteps.ts`}
      </div>
    );
  }

  // Capture step into a const so TypeScript's control-flow narrowing carries
  // into the nested handleComplete closure (CFA does not track narrowing of
  // outer variables across function boundaries).
  const resolvedStep = step;

  // Revise-and-return is SUPPRESSED on `layout:"full"` steps (carve,
  // mechanisms, touch, touch_seed_source) — not merely visually, but
  // functionally: `isDeepLinkTarget` alone is not enough to fire it.
  //
  // Why: the full-screen chrome contract (spec 028 FR-002/R4, guarded by
  // tests/steps/stepHost.renderSmoke.test.tsx) requires the step component's
  // DIRECT parent to be the `height:100%/overflow:hidden` div with NOTHING
  // else interposed — that div is what the four galleries size themselves
  // against. Fitting the banner into that box without breaking the contract
  // would mean overlaying it (position:absolute) atop gallery chrome none of
  // these four components were built expecting, which is a real risk across
  // four complex, un-audited components for a feature this narrow. FR-034's
  // OTHER half stays intact either way: FR-030's jump to an editor-action
  // stage (DecisionEntryRow.tsx, T042) still lands the author there — what's
  // deferred is only the "return to Decisions on confirm, with an explicit
  // opt-out" behaviour for these four steps, which fall back to the ordinary
  // forward walk instead, same as arriving any other way. A survey-answer
  // deep link (the common case) is unaffected — no manifest question step is
  // `layout:"full"`.
  const revisableViaDeepLink = isDeepLinkTarget && resolvedStep.layout !== "full";

  // ---------------------------------------------------------------------------
  // Centralized onComplete — the generic completion path (contract §2).
  // No per-step conditional: only STEPS_WITH_APPLY_COMPLETION gates the reducer.
  // ---------------------------------------------------------------------------

  function handleComplete(result: unknown): void {
    // 1. If SurveyPhaseResult-shaped: recordPhase + routeAnswersThroughMutate.
    if (isSurveyPhaseResult(result)) {
      recordPhase(result);
      routeAnswersThroughMutate(result, reducerDeps);
    }

    // 2. If step has reducer side effects: applyStepCompletion.
    //    Data-driven via STEPS_WITH_APPLY_COMPLETION (R7 effect table).
    if (STEPS_WITH_APPLY_COMPLETION.has(resolvedStep.id)) {
      applyStepCompletion(resolvedStep.id, result, reducerDeps);
    }

    // 2b. Decision audit (spec 053). AFTER the reducer, so an editor step's
    //     summary reads the working-copy state the step's own side effects just
    //     produced. Called for every step — unlike step 2 this is deliberately
    //     NOT gated on the effect table, because FR-001 records every survey
    //     answer, and most question steps have no reducer side effect at all.
    //     A no-op when no recorder is injected (see ReducerDeps.recordDecision).
    recordStepCompletion(resolvedStep.id, result, reducerDeps);

    // 3. Pure advance policy → next step + optional signals.
    //    Read selectedTrack and identityResult from getState() — NOT from the
    //    render-time closure. Adapters (e.g. TrackStepAdapter) call setSelectedTrack()
    //    synchronously BEFORE invoking onComplete, so the Zustand store already holds
    //    the post-mutation value; but the React selector closure still holds the
    //    pre-mutation snapshot. getState() returns the current committed store value.
    const postMutationState = useSurveySessionStore.getState();
    // resolvedStep.id is StepBase.id (string). The manifest guarantees all step
    // ids are valid ActiveStepId values, so the cast is safe. advance() is
    // defined in advance.ts with a local ActiveStepId mirror — not imported from
    // stores/ (depcruise boundary preserved).
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    const outcome = advance(resolvedStep.id as Parameters<typeof advance>[0], result, {
      selectedTrack: postMutationState.selectedTrack,
      identitySupported: postMutationState.identityResult?.supported ?? true,
      // Structurally identical to advance.ts's local TouchSeedSource mirror
      // (both "import-adapt" | "reseed-from-desktop" | null) — no cast needed,
      // same as selectedTrack above (Track mirror).
      touchSeedSource: postMutationState.touchSeedSource,
      allCharactersImplemented,
    });

    // 4. Session advance to next step.
    sessionAdvance(outcome.next);

    // 5. Post-advance setCharactersSubStage (ordering: after advance, before navigate).
    //    Used by adapt-track and project_name to match pre-Stage-5 handler ordering.
    if (outcome.setCharactersSubStage !== undefined) {
      setCharactersSubStage(outcome.setCharactersSubStage);
    }

    // 5b. Revise-and-return (spec 057 FR-032/FR-033/FR-034, Q3's default).
    //
    // Everything above this line already ran exactly as it would for an
    // ORDINARY revisit reached by walking Back rather than by a deep link:
    // recordStepCompletion appended the superseding entry through the
    // existing append-only path (FR-032), and applyStepCompletion/
    // sessionAdvance already re-propagated whatever the existing staleness
    // machinery re-propagates for this step (FR-033). This block decides
    // NOTHING about the record or about staleness — only where the author
    // lands next, which is the one thing FR-034 asks this component to add.
    if (revisableViaDeepLink && deepLinkArrival !== null && !continueFromHere) {
      jumpToLocation(deepLinkArrival.returnTo);
      return;
    }

    // 6. Navigate to output when help completes.
    //
    // Spec 057 FR-005/FR-008 (D-3): this hop leaves the wizard, and the way
    // back in is the Studio tab. That return used to drop the author on the
    // identity question — the walk they had just finished was thrown away by
    // `SurveyView`'s mount reset. With the reset gone the traversal still
    // records "help" (or wherever `advance` left it), so returning to Studio
    // resumes the walk rather than restarting it. No extra state is stashed
    // here: the position is already the store's job (FR-001).
    if (outcome.navigate === "output") {
      navigateTo("output");
    }
  }

  // onBack maps to the walked-history pop (FR-005, Stage 3/4 behaviour preserved),
  // with ONE special case (spec 035 R12): the "touch" step's Back-from-first-
  // character must always resurface the touch_seed_source chooser, not follow
  // the generic history pop — which would land on "mechanisms" whenever the
  // fork was skipped this pass (a recorded, non-stale choice routes advance()
  // straight from mechanisms to touch). performManifestBack (stores/
  // surveySessionStore.ts) is the ONE place that encodes this dispatch — the
  // browser-history popstate bridge (hooks/useSurveyBrowserHistorySync.ts)
  // calls the exact same function, so in-app Back and browser Back never
  // diverge (F7 defect 1).
  // resolvedStep.id is StepBase.id (string), guaranteed a valid ActiveStepId
  // by the manifest — same cast idiom as handleComplete's advance() call above.
  function handleBack(): void {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
    performManifestBack(resolvedStep.id as ActiveStepId);
  }

  // F7 defect 2: only offer the Back affordance when it can genuinely do
  // something. `expectedBackTarget` mirrors performManifestBack's own
  // decision without mutating — non-null exactly when there's a real target
  // (a non-empty sanitized history, or "touch"'s always-available
  // touch_seed_source re-entry). At activeStepId "identity" with history []
  // (first step, or right after Start-over) this is null, so `onBack` is
  // omitted below rather than handed down as an inert callback.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  const canGoBack = expectedBackTarget(resolvedStep.id as ActiveStepId, history) !== null;

  // ---------------------------------------------------------------------------
  // Render with chrome by layout (FR-002, R4).
  //
  // layout:"full" → full-screen container (carve, mechanisms, touch galleries).
  // Otherwise → left survey pane content (two-pane shell in SurveyView wraps this).
  // ---------------------------------------------------------------------------

  // Use the narrowed resolvedStep alias consistently (CFA-safe, per QC review).
  const Component = resolvedStep.component;

  const content = (
    <Component
      onComplete={handleComplete}
      {...(canGoBack ? { onBack: handleBack } : {})}
      {...(ctx !== undefined ? { ctx } : {})}
    />
  );

  // FR-034/Q3: shown exactly while the author is on the step a decision-trail
  // jump targeted and has not already opted out of the return. `role="note"`
  // rather than a live region — this is present from the moment the step
  // renders, not an update an assistive-technology user needs announced.
  // Never rendered on a `layout:"full"` step — see `revisableViaDeepLink`'s
  // own comment above for why.
  const deepLinkReturnBanner =
    revisableViaDeepLink && !continueFromHere ? (
      <div role="note" data-testid="step-deep-link-return-banner" style={DEEP_LINK_BANNER_STYLE}>
        <p style={DEEP_LINK_BANNER_TEXT_STYLE}>
          <Trans id="step.deepLinkReturn.notice">
            You jumped here from Decisions to revise this answer. Confirming
            will take you back there.
          </Trans>
        </p>
        <button
          type="button"
          data-testid="step-deep-link-continue-instead"
          style={DEEP_LINK_CONTINUE_BUTTON_STYLE}
          onClick={() => setContinueFromHere(true)}
        >
          <Trans id="step.deepLinkReturn.continueButton">Continue from here instead</Trans>
        </button>
      </div>
    ) : null;

  if (resolvedStep.layout === "full") {
    // UNCHANGED from before this feature — deliberately. The step
    // component's DIRECT parent stays this exact div (contract:
    // tests/steps/stepHost.renderSmoke.test.tsx's chrome-by-layout guard);
    // `revisableViaDeepLink` is already false here (its own gate excludes
    // "full"), so `deepLinkReturnBanner` above is always null on this path
    // and there is nothing to interpose.
    return <div style={{ height: "100%", overflow: "hidden" }}>{content}</div>;
  }

  // Pane layout: return the content directly; SurveyView renders it inside the
  // left-pane <section> element.
  return (
    <>
      {deepLinkReturnBanner}
      {content}
    </>
  );
}
