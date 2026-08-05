// makeFlowStepComponent — factory for YAML-driven EditorStep components
// (spec 029 Stage 6, T004).
//
// CONTRACT (C2.1–C2.6):
//   makeFlowStepComponent(options) returns React.ComponentType<EditorStepProps>.
//   The produced component:
//     C2.2  Resolves flowSources[options.flowRef] — throws descriptive Error if absent.
//     C2.3  loadModularFlow(source.raw) once, memoised via useMemo.
//     C2.4  On completion: extract(result) → if undefined stay on step → onCommit?.(x,deps)
//           → props.onComplete(result) — the UNTOUCHED SurveyPhaseResult, not the
//           extracted x. This is the R7 ordering the golden-walk asserts. extract()/x exist
//           for THIS factory's own onCommit store effects and the no-advance guard only;
//           StepHost's generic completion path (contract §2) still needs the real,
//           answers-bearing result — that is what recordStepCompletion's isSurveyPhaseResult
//           check (createDecisionRecorder.ts) keys on to record a question's decision entry,
//           and forwarding x there instead of result silently drops the entry (spec 057 US3
//           regression: the "track" step's decision never made it into the trail).
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import { FlowStepHost } from "../../survey/FlowStepHost.tsx";
import { loadModularFlow } from "../../survey/loadModularFlow.ts";
import { flowSources } from "../../steps/flowSources.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import type { SurveyContext } from "../../survey/types.ts";

// ---------------------------------------------------------------------------
// Step-title localization (Tier A UI chrome). The heading FlowStepHost paints
// as <h2>{title}</h2> is engine-owned chrome, not flow-question content, so it
// resolves through the Lingui catalog rather than the Tier B content path. The
// map is keyed by the stable `flowRef`; a flow with no entry falls back to the
// plain options.title / flowSource.title string (unlocalized, as before). Kept
// as literal `msg` descriptors at module scope so `lingui extract` sees them —
// resolved per-render via resolveMessage(i18n, ...) inside the component.
// ---------------------------------------------------------------------------

const STEP_TITLE_MESSAGES: Record<string, MessageDescriptor> = {
  track: msg({ id: "step.track.title", message: "Authoring Track" }),
  project_name: msg({ id: "step.projectName.title", message: "Name your keyboard" }),
  phase_f_helpdocs: msg({
    id: "step.phaseF.title",
    message: "Phase F — Help documentation",
  }),
};

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
  /**
   * The session's currently-recorded track choice, or `null` before the
   * author has ever chosen one. Spec 057 FR-031: a step reached by deep link
   * (or by walking Back into it) must show the currently-recorded answer, not
   * an empty field — trackOptions.seeds.getSeedValue reads this to seed
   * track_choice's radio group on arrival (flowStepOptions.tsx).
   */
  selectedTrack: "copy" | "adapt" | null;
  /**
   * The session's currently-recorded scaffold spec (display name + keyboard
   * id), or `null` before the author has ever committed the project_name
   * step. Spec 057 FR-031: mirrors `selectedTrack` above for project_name's
   * two questions — projectNameOptions.seeds.getSeedValue prefers this over
   * the identity-derived default once it is set (flowStepOptions.tsx).
   */
  scaffoldSpec: { keyboardId: string; displayName: string } | null;
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
  // Localized heading descriptor for this flow (undefined → keep the plain
  // English title). Captured at factory-call time; resolved per-render below.
  const titleMessage = STEP_TITLE_MESSAGES[options.flowRef];

  // ---------------------------------------------------------------------------
  // The produced component — satisfies EditorStepProps (C2.1).
  // ---------------------------------------------------------------------------

  function FlowStepComponent({ onComplete, onBack }: EditorStepProps): React.ReactElement | null {
    // C2.3 — load the flow once, memoised.
    // capturedSource is bound at factory-call time; stable for this component's lifetime.
    const flow = useMemo(() => loadModularFlow(capturedSource.raw), []);

    // Resolve the heading for the active locale (Tier A chrome). Falls back to
    // the plain English title when this flow has no catalog entry.
    const { i18n } = useLingui();
    const localizedTitle = titleMessage ? resolveMessage(i18n, titleMessage) : resolvedTitle;

    // C2.5 — all store access here, never in FlowStepHost.
    const localBase = useSurveySessionStore((s) => s.localBase);
    const identityResult = useSurveySessionStore((s) => s.identityResult);
    const surveyContext = useSurveySessionStore((s) => s.surveyContext);
    const setSelectedTrack = useSurveySessionStore((s) => s.setSelectedTrack);
    const setScaffoldSpec = useSurveySessionStore((s) => s.setScaffoldSpec);
    const setStoreIdentity = useWorkingCopyStore((s) => s.setIdentity);
    const selectedTrack = useSurveySessionStore((s) => s.selectedTrack);
    const scaffoldSpec = useSurveySessionStore((s) => s.scaffoldSpec);

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
      selectedTrack,
      scaffoldSpec,
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
        // Forward the UNTOUCHED SurveyPhaseResult, not `extracted` — StepHost's
        // generic completion path (recordPhase / recordStepCompletion / advance)
        // expects the same opaque result the step actually produced (contract §2
        // in StepHost.tsx). `extracted` is this factory's own reshaping for its
        // onCommit store effects and the no-advance guard above; passing it
        // onward instead of `result` hid every answer this step recorded from
        // the decision-audit seam (isSurveyPhaseResult in createDecisionRecorder.ts
        // requires the `answers` array `extracted` does not carry).
        onComplete(result);
      },
      [onComplete],
    );

    return (
      <FlowStepHost
        flow={flow}
        title={localizedTitle}
        context={context}
        onComplete={wrappedOnComplete}
        {...(onBack ? { onBack } : {})}
        {...(options.seeds ? { getSeedValue } : {})}
        {...(options.seeds?.onAnswerCommit ? { onAnswerCommit } : {})}
        {...(options.usesFindings ? { findingsByQuestionId } : {})}
      />
    );
  }

  FlowStepComponent.displayName = `FlowStep(${options.flowRef})`;
  return FlowStepComponent;
}
