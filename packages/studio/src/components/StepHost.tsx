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
//   3. advance(id, result, { selectedTrack, identitySupported }) → { next, navigate?, setCharactersSubStage? }
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
// FR-009: pane scaffolding (resizable panes, OSK, useValidator, instantiatedRef)
//   remain in SurveyView. StepHost only decides which container a step renders into.

import type { ReactNode, CSSProperties } from "react";
import { useMemo } from "react";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { manifest } from "../steps/manifest.ts";
import type { EditorStep } from "../steps/types.ts";
import { applyStepCompletion, routeAnswersThroughMutate, type ReducerDeps } from "../steps/reducer.ts";
import { advance, STEPS_WITH_APPLY_COMPLETION } from "../steps/advance.ts";
import { navigateTo } from "../lib/navigate.ts";
import { UnsupportedScriptStub } from "./UnsupportedScriptStub.tsx";
import type { SurveyContext } from "../steps/types.ts";

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
// Terminal panel styles
// ---------------------------------------------------------------------------

const TERMINAL_PANEL_STYLE: CSSProperties = {
  padding: 24,
  border: "1px solid #30363d",
  borderRadius: 8,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  alignItems: "flex-start",
};

const START_OVER_BTN_STYLE: CSSProperties = {
  padding: "8px 18px",
  background: "transparent",
  border: "1px solid #30363d",
  borderRadius: 6,
  color: "#8b949e",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "inherit",
};

// ---------------------------------------------------------------------------
// StepHost
// ---------------------------------------------------------------------------

export function StepHost({ reducerDeps, onStartOver, ctx }: StepHostProps): ReactNode {
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  // identityResult is read here only for the terminal panels (unsupported stub).
  const identityResult = useSurveySessionStore((s) => s.identityResult);
  const sessionAdvance = useSurveySessionStore((s) => s.advance);
  const sessionPopHistory = useSurveySessionStore((s) => s.popHistory);
  const setCharactersSubStage = useSurveySessionStore((s) => s.setCharactersSubStage);

  const recordPhase = useWorkingCopyStore((s) => s.recordPhase);

  // ---------------------------------------------------------------------------
  // Terminal: done — survey-complete panel
  // ---------------------------------------------------------------------------

  if (activeStepId === "done") {
    return (
      <div style={TERMINAL_PANEL_STYLE}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#6ea8fe", fontWeight: 600 }}>
          Survey complete
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
          All authoring steps have been completed. Head to Output to download or
          submit your keyboard.
        </p>
        <button type="button" onClick={onStartOver} style={START_OVER_BTN_STYLE}>
          Start over
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
            Start over
          </button>
        </div>
      );
    }
    // Fallback: identityResult is null — render a generic fallback panel.
    return (
      <div style={TERMINAL_PANEL_STYLE}>
        <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#f85149", fontWeight: 600 }}>
          Script not supported
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: "#8b949e" }}>
          This script is not yet supported in v1. Please start over and choose a
          different script, or check back in a future release.
        </p>
        <button type="button" onClick={onStartOver} style={START_OVER_BTN_STYLE}>
          Start over
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
        style={{ padding: 24, color: "#f85149", fontFamily: "monospace", fontSize: 13 }}
      >
        {`[StepHost] unhandled step id: "${String(activeStepId)}" — wire this manifest step into registerEditorSteps.ts`}
      </div>
    );
  }

  // Capture step into a const so TypeScript's control-flow narrowing carries
  // into the nested handleComplete closure (CFA does not track narrowing of
  // outer variables across function boundaries).
  const resolvedStep = step;

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
    });

    // 4. Session advance to next step.
    sessionAdvance(outcome.next);

    // 5. Post-advance setCharactersSubStage (ordering: after advance, before navigate).
    //    Used by adapt-track and project_name to match pre-Stage-5 handler ordering.
    if (outcome.setCharactersSubStage !== undefined) {
      setCharactersSubStage(outcome.setCharactersSubStage);
    }

    // 6. Navigate to output when help completes.
    if (outcome.navigate === "output") {
      navigateTo("output");
    }
  }

  // onBack maps to the walked-history pop (FR-005, Stage 3/4 behaviour preserved).
  function handleBack(): void {
    sessionPopHistory();
  }

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
      onBack={handleBack}
      {...(ctx !== undefined ? { ctx } : {})}
    />
  );

  if (resolvedStep.layout === "full") {
    return <div style={{ height: "100%", overflow: "hidden" }}>{content}</div>;
  }

  // Pane layout: return the content directly; SurveyView renders it inside the
  // left-pane <section> element.
  return content;
}
