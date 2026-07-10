// makeFlowStepComponent — factory for YAML-driven EditorStep components
// (spec 029 Stage 6, T004).
//
// CONTRACT (C2.1–C2.6):
//   makeFlowStepComponent(options) returns React.ComponentType<EditorStepProps>.
//   The produced component:
//     C2.2  Resolves flowSources[options.flowRef] — throws descriptive Error if absent.
//     C2.3  loadModularFlow(source.raw) once, memoised via useMemo.
//     C2.4  On completion: extract(result) → if undefined stay on step → onCommit?.(x,deps)
//           → props.onComplete(x). This is the R7 ordering the golden-walk asserts.
//     C2.5  ALL store / hook access confined here (FlowStepHost is pure).
//     C2.6  New editors → steps/flowSources runtime edge is acyclic (R1 verified).
//
// LAYER: editors/adapters/ (allowed to import steps/, stores/, survey/, and lint/).
// NOT: survey/FlowStepHost (which must not import stores or steps).
//
// FR-012: adding a new YAML-driven step requires ONLY:
//   1. A flowSources entry (steps/flowSources.ts)
//   2. A manifest flowRefs declaration
//   3. One FlowStepOptions record passed to makeFlowStepComponent

import { useMemo, useRef, useCallback } from "react";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { FlowStepHost } from "../../survey/FlowStepHost.tsx";
import { loadModularFlow } from "../../survey/loadModularFlow.ts";
import { flowSources } from "../../steps/flowSources.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import type { SurveyContext } from "../../survey/types.ts";

// ---------------------------------------------------------------------------
// FlowStepDeps — live store/hook values the per-flow options consume.
// ---------------------------------------------------------------------------

export interface FlowStepDeps {
  localBase: { displayName: string } | null;
  identityResult: { autonym: string; english: string } | null;
  surveyContext: SurveyContext;
  setSelectedTrack: (t: "copy" | "adapt" | null) => void;
  setScaffoldSpec: (s: { keyboardId: string; displayName: string } | null) => void;
  setIdentity: (patch: { keyboardId: string; displayName: string }) => void;
  findingsByQuestionId: Record<string, LintFinding[]>;
  /**
   * Per-mount mutable ref for tracking the committed display name across
   * Back→forward navigation within the project_name step.
   * Allocated by makeFlowStepComponent (useRef) — never module-level — so
   * each mount starts with an empty string and re-entry resets correctly.
   */
  displayNameRef: { current: string };
}

// ---------------------------------------------------------------------------
// FlowStepOptions<Extracted> — per-flow configuration record.
// ---------------------------------------------------------------------------

export interface FlowStepOptions<Extracted = unknown> {
  /** Key into flowSources (flow_id). Validated at factory call time — throws if absent. */
  flowRef: string;
  /** Header title. Falls back to flowSources[flowRef].title if omitted. */
  title?: string;
  /**
   * Build the SurveyContext from live store/hook deps.
   */
  buildContext: (deps: FlowStepDeps) => SurveyContext;
  /**
   * Shape the runner result into the step payload.
   * Return undefined to stay on the step (no-advance guard — C2.4).
   */
  extract: (result: SurveyPhaseResult) => Extracted | undefined;
  /**
   * Fire step-specific store effects BEFORE onComplete (R7 ordering).
   * Optional — some flows have no pre-completion store writes.
   */
  onCommit?: (extracted: Extracted, deps: FlowStepDeps) => void;
  /**
   * Optional seeding hooks (e.g. project_name slug derivation).
   */
  seeds?: {
    getSeedValue: (questionId: string, deps: FlowStepDeps) => string | string[] | undefined;
    onAnswerCommit?: (questionId: string, value: string | string[] | undefined, deps: FlowStepDeps) => void;
  };
  /**
   * When true, the factory reads findingsByQuestionId from workingCopyStore
   * and forwards it to FlowStepHost (used by phase_f_helpdocs).
   */
  usesFindings?: boolean;
}

// ---------------------------------------------------------------------------
// makeFlowStepComponent — the factory (C2.1)
// ---------------------------------------------------------------------------

/**
 * Produce a React.ComponentType<EditorStepProps> that renders the named flow
 * through FlowStepHost with the supplied per-flow options record.
 *
 * All store / hook deps are read inside the produced component (C2.5).
 * FlowStepHost receives only plain values (store-agnostic, C1.3).
 *
 * Throws a descriptive Error at call time if flowRef is not in flowSources
 * (C2.2 / FR-010 — "no default is a defect").
 */
export function makeFlowStepComponent<Extracted>(
  options: FlowStepOptions<Extracted>,
): React.ComponentType<EditorStepProps> {
  // C2.2 — validate at factory call time (not at render time — fail fast, loud).
  const source = flowSources[options.flowRef];
  if (source === undefined) {
    throw new Error(
      `[makeFlowStepComponent] unknown flowRef "${options.flowRef}". ` +
      `Known refs: ${Object.keys(flowSources).join(", ")}. ` +
      `Add an entry to steps/flowSources.ts before mounting this step.`,
    );
  }

  // Capture at factory-call time so the produced component closure is stable.
  const capturedSource = source;
  const resolvedTitle = options.title ?? capturedSource.title;

  // ---------------------------------------------------------------------------
  // The produced component — satisfies EditorStepProps (C2.1).
  // ---------------------------------------------------------------------------

  function FlowStepComponent({ onComplete, onBack }: EditorStepProps): React.ReactElement | null {
    // C2.3 — load the flow once, memoised.
    // capturedSource is bound at factory-call time; stable for this component's lifetime.
    const flow = useMemo(() => loadModularFlow(capturedSource.raw), []);

    // C2.5 — all store access here, never in FlowStepHost.
    const localBase = useSurveySessionStore((s) => s.localBase);
    const identityResult = useSurveySessionStore((s) => s.identityResult);
    const surveyContext = useSurveySessionStore((s) => s.surveyContext);
    const setSelectedTrack = useSurveySessionStore((s) => s.setSelectedTrack);
    const setScaffoldSpec = useSurveySessionStore((s) => s.setScaffoldSpec);
    const setStoreIdentity = useWorkingCopyStore((s) => s.setIdentity);

    // Unconditional hook call (hooks must not be conditional). When the flow
    // does not use findings, the derived record is computed but ignored below.
    // This retires the FIX-2 conditional-deps-array workaround.
    const allFindings = useValidatorFindings();
    const findingsByQuestionId = options.usesFindings ? allFindings : {};

    // Per-mount display-name ref: allocated here (useRef) so each mount starts
    // with "" and re-entry resets correctly. Threaded through depsRef so
    // projectNameOptions.seeds can read/write it without module-level state.
    const displayNameRef = useRef("");

    // Mutable ref so seed callbacks always read current store values.
    const depsRef = useRef<FlowStepDeps>({} as FlowStepDeps);
    depsRef.current = {
      localBase,
      identityResult,
      surveyContext,
      setSelectedTrack,
      setScaffoldSpec,
      setIdentity: setStoreIdentity,
      findingsByQuestionId,
      displayNameRef,
    };

    // Context derived from current deps.
    const context = options.buildContext(depsRef.current);

    // Stable seeding callbacks (reads deps via ref on each call — no stale closure).
    const getSeedValue = useCallback(
      options.seeds
        ? (questionId: string) => options.seeds!.getSeedValue(questionId, depsRef.current)
        : (_questionId: string) => undefined,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const onAnswerCommit = useCallback(
      options.seeds?.onAnswerCommit
        ? (questionId: string, value: string | string[] | undefined) =>
            options.seeds!.onAnswerCommit!(questionId, value, depsRef.current)
        : (_questionId: string, _value: string | string[] | undefined) => undefined,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // C2.4 — completion wrapper: extract → guard → onCommit → onComplete (R7 ordering).
    const wrappedOnComplete = useCallback(
      (result: SurveyPhaseResult): void => {
        const extracted = options.extract(result);
        // Stay on step when extract returns undefined (no-advance guard).
        if (extracted === undefined) return;
        // R7: store effects fire BEFORE props.onComplete → StepHost advance.
        options.onCommit?.(extracted, depsRef.current);
        // EditorStepProps.onComplete is unknown-typed; the Extracted generic is
        // intentionally erased at this boundary (the host receives the raw payload).
        onComplete(extracted as unknown);
      },
      [onComplete],
    );

    return (
      <FlowStepHost
        flow={flow}
        title={resolvedTitle}
        context={context}
        onComplete={wrappedOnComplete}
        onBack={onBack}
        getSeedValue={options.seeds ? getSeedValue : undefined}
        onAnswerCommit={options.seeds?.onAnswerCommit ? onAnswerCommit : undefined}
        findingsByQuestionId={options.usesFindings ? findingsByQuestionId : undefined}
      />
    );
  }

  FlowStepComponent.displayName = `FlowStep(${options.flowRef})`;
  return FlowStepComponent;
}
