// makeFlowStepComponent — factory for YAML-driven EditorStep components
// (spec 029 Stage 6, T004).
//
// CONTRACT (C2.1–C2.6):
//   makeFlowStepComponent(options) returns React.ComponentType<EditorStepProps>.
//   The produced component:
//     C2.2  Resolves flowSources[options.flowRef] — throws descriptive Error if absent.
//     C2.3  loadFlowSourceDef(source) once, memoised via useMemo (derived
//           order when the source declares it, otherwise the thin YAML).
//     C2.4  On completion: extract(result) → if undefined stay on step →
//           props.onComplete(result) — the UNTOUCHED SurveyPhaseResult, not the
//           extracted x. extract()/x exist for the no-advance guard only; every
//           store effect of a completion lives at StepHost's boundary now
//           (spec 089: recordAnswersAsDecisions + applyDecisionEffects), never
//           in this factory. StepHost's generic completion path (contract §2)
//           still needs the real, answers-bearing result — that is what
//           recordStepCompletion's isSurveyPhaseResult check
//           (createDecisionRecorder.ts) keys on to record a question's decision
//           entry, and forwarding x there instead of result silently drops the
//           entry (spec 057 US3 regression: the "track" step's decision never
//           made it into the trail).
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

import { useMemo, useRef, useCallback, useEffect } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type {
  DecisionProposalSource,
  SurveyPhaseResult,
  LintFinding,
  HistoryEntryState,
} from "@keyboard-studio/contracts";
import { resolveMessage } from "../../lib/i18nResolve.ts";
import { FlowStepHost } from "../../survey/FlowStepHost.tsx";
import { loadFlowSourceDef, screenIdForFlow } from "../../steps/flowSources.ts";
import { flowSources } from "../../steps/flowSources.ts";
import { useSurveySessionStore } from "../../stores/surveySessionStore.ts";
import { selectTrack, useDecisionStore } from "../../stores/decisionStore.ts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import type { DecisionSet } from "../../decisions/decisionTypes.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import { useValidatorFindings } from "../../hooks/useValidatorFindings.ts";
import type { EditorStepProps } from "../../steps/types.ts";
import type { SurveyContext } from "../../survey/types.ts";

// ---------------------------------------------------------------------------
// Step-title localization (Tier A UI chrome). The heading FlowStepHost paints
// as <h2>{title}</h2> is engine-owned chrome, not flow-question content, so it
// resolves through the Lingui catalog rather than the Tier B content path. The
// map is keyed by the flow's DERIVED SCREEN id (spec 091 T020 — the screen
// label comes from the screen's structural key, not the flow's identity; the
// message ids are unchanged from when the map was keyed by flowRef); a screen
// with no entry falls back to the plain options.title / flowSource.title
// string (unlocalized, as before). Kept as literal `msg` descriptors at
// module scope so `lingui extract` sees them — resolved per-render via
// resolveMessage(i18n, ...) inside the component.
// ---------------------------------------------------------------------------

const SCREEN_TITLE_MESSAGES: Record<string, MessageDescriptor> = {
  track: msg({ id: "step.track.title", message: "Authoring Track" }),
  project_name: msg({ id: "step.projectName.title", message: "Name your keyboard" }),
  help: msg({
    id: "step.phaseF.title",
    message: "Help documentation",
  }),
};

// ---------------------------------------------------------------------------
// FlowStepDeps — live store/hook values the per-flow options consume.
// ---------------------------------------------------------------------------

export interface FlowStepDeps {
  localBase: { displayName: string } | null;
  /**
   * The live decision set (spec 089 FR-005). Everything the per-flow options
   * used to read from stored session fields — the identity result, the
   * recorded scaffold spec, the survey context — is derived from this, via
   * decisions/identitySelectors.ts, at the point of use. The factory reads
   * it from the decision store; the options records never touch a store for
   * it (flowStepOptions.tsx's working-copy reads are the documented
   * exception, for seed-time slices — see readAdaptiveDescriptionContext).
   */
  decisions: DecisionSet;
  surveyContext: SurveyContext;
  findingsByQuestionId: Record<string, LintFinding[]>;
  /**
   * Per-mount mutable ref for tracking the committed display name across
   * Back→forward navigation within the project_name step.
   * Allocated by makeFlowStepComponent (useRef) — never module-level — so
   * each mount starts with an empty string and re-entry resets correctly.
   */
  displayNameRef: { current: string };
  /**
   * The currently-recorded track choice (`selectTrack` over `decisions`),
   * or `null` before the author has ever chosen one. Spec 057 FR-031: a step
   * reached by deep link (or by walking Back into it) must show the
   * currently-recorded answer, not an empty field —
   * trackOptions.seeds.getSeedValue reads this to seed track_choice's radio
   * group on arrival (flowStepOptions.tsx).
   */
  selectedTrack: "copy" | "adapt" | null;
  /**
   * The working copy's currently-derived HISTORY-entry proposal state
   * (spec 079 US5), or `null` before it has ever been derived.
   * `phaseFOptions.onMount` reads this as `deriveHistoryEntryState`'s
   * `previous` (so a re-derivation with an unchanged version is a no-op,
   * never re-stamping `dateIso` — research R12), and
   * `phaseFOptions.buildContext` reads it to inject the proposal's
   * heading/bullets into `pf_history_entry`'s `{{token}}`s. The onMount
   * WRITE goes through the working-copy store directly (flowStepOptions.tsx
   * reads/writes those slices via getState(), as its seed functions already
   * did) — no setter is plumbed through here since spec 089.
   */
  historyEntryState: HistoryEntryState | null;
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
   * Fires once per mount (spec 079 US5) — BEFORE the first `buildContext`
   * consumer sees a derived value, since it runs in a `useEffect` after the
   * mount render commits, same as every other React effect. Used by
   * `phaseFOptions` to derive (and identity-guard-store) the HISTORY-entry
   * proposal on entering the Phase F step; optional because most flows need
   * no mount-time derivation at all.
   */
  onMount?: (deps: FlowStepDeps) => void;
  /**
   * Optional seeding hooks (e.g. project_name slug derivation).
   */
  seeds?: {
    /**
     * Optional: a flow whose seeds are decision records (spec 092 — the
     * extraction pass seeds them, SurveyRunner reads the records) omits
     * this; the factory then passes an always-undefined seed callback.
     */
    getSeedValue?: (questionId: string, deps: FlowStepDeps) => string | string[] | undefined;
    /**
     * Where `getSeedValue`'s seed for a question came from, recorded with the
     * saved answer so the decision trail can name it. Optional: without it a
     * seed is still saved as a proposal, just with no source.
     */
    getSeedSource?: (questionId: string, deps: FlowStepDeps) => DecisionProposalSource | undefined;
    onAnswerCommit?: (questionId: string, value: string | string[] | undefined, deps: FlowStepDeps) => void;
    /**
     * Optional per-question `required` override (spec 079 FR-009). Forwarded
     * to FlowStepHost -> SurveyRunner's own `getRequiredOverride` prop —
     * see its doc there for the override contract. Absent for every flow
     * that has no conditionally-required question (the common case).
     */
    getRequiredOverride?: (questionId: string, deps: FlowStepDeps) => boolean | undefined;
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
  // Localized heading descriptor for this flow's derived screen (undefined →
  // keep the plain English title). Captured at factory-call time; resolved
  // per-render below.
  const titleMessage = SCREEN_TITLE_MESSAGES[screenIdForFlow(options.flowRef) ?? options.flowRef];

  // ---------------------------------------------------------------------------
  // The produced component — satisfies EditorStepProps (C2.1).
  // ---------------------------------------------------------------------------

  function FlowStepComponent({ onComplete, onBack }: EditorStepProps): React.ReactElement | null {
    // C2.3 — load the flow once, memoised. Derived order when the source
    // declares it (spec 087 T040), otherwise the thin YAML.
    // capturedSource is bound at factory-call time; stable for this component's lifetime.
    const flow = useMemo(() => loadFlowSourceDef(capturedSource), []);

    // Resolve the heading for the active locale (Tier A chrome). Falls back to
    // the plain English title when this flow has no catalog entry.
    const { i18n } = useLingui();
    const localizedTitle = titleMessage ? resolveMessage(i18n, titleMessage) : resolvedTitle;

    // C2.5 — all store access here, never in FlowStepHost.
    const localBase = useSurveySessionStore((s) => s.localBase);
    // Spec 089 FR-005: the identity result, scaffold spec, survey context,
    // and selected track are no longer stored session fields — they derive
    // from the decision store's live set, here at the factory boundary.
    const decisions = useDecisionStore((s) => s.decisions);
    const surveyContext = deriveSurveyContext(decisions);
    const selectedTrack = selectTrack(decisions);
    const historyEntryState = useWorkingCopyStore((s) => s.historyEntryState);

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
      decisions,
      surveyContext,
      findingsByQuestionId,
      displayNameRef,
      selectedTrack,
      historyEntryState,
    };

    // Fires once per mount (C2.5 — store access confined to this factory).
    // depsRef.current is current for THIS render by the time the effect runs
    // (effects fire after commit, and the assignment above is synchronous),
    // so options.onMount sees the freshest deps without needing them in the
    // dependency array (which would re-fire on every store change instead of
    // once per mount).
    useEffect(() => {
      options.onMount?.(depsRef.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Context derived from current deps.
    const context = options.buildContext(depsRef.current);

    // Stable seeding callbacks (reads deps via ref on each call — no stale closure).
    const getSeedValue = useCallback(
      options.seeds?.getSeedValue
        ? (questionId: string) => options.seeds!.getSeedValue!(questionId, depsRef.current)
        : (_questionId: string) => undefined,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    const getSeedSource = useCallback(
      options.seeds?.getSeedSource
        ? (questionId: string) => options.seeds!.getSeedSource!(questionId, depsRef.current)
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

    const getRequiredOverride = useCallback(
      options.seeds?.getRequiredOverride
        ? (questionId: string) => options.seeds!.getRequiredOverride!(questionId, depsRef.current)
        : (_questionId: string) => undefined,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    );

    // C2.4 — completion wrapper: extract → guard → onComplete. The factory
    // performs NO store writes on completion (spec 089): the completion's
    // effects are the question modules' applies, run by StepHost's
    // applyDecisionEffects after the answers are recorded as decisions.
    const wrappedOnComplete = useCallback(
      (result: SurveyPhaseResult): void => {
        const extracted = options.extract(result);
        // Stay on step when extract returns undefined (no-advance guard).
        if (extracted === undefined) return;
        // Forward the UNTOUCHED SurveyPhaseResult, not `extracted` — StepHost's
        // generic completion path (recordPhase / recordStepCompletion / advance)
        // expects the same opaque result the step actually produced (contract §2
        // in StepHost.tsx). `extracted` is this factory's own reshaping for the
        // no-advance guard above; passing it onward instead of `result` hid
        // every answer this step recorded from the decision-audit seam
        // (isSurveyPhaseResult in createDecisionRecorder.ts requires the
        // `answers` array `extracted` does not carry).
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
        {...(options.seeds?.getSeedSource ? { getSeedSource } : {})}
        {...(options.seeds?.onAnswerCommit ? { onAnswerCommit } : {})}
        {...(options.seeds?.getRequiredOverride ? { getRequiredOverride } : {})}
        {...(options.usesFindings ? { findingsByQuestionId } : {})}
      />
    );
  }

  FlowStepComponent.displayName = `FlowStep(${options.flowRef})`;
  return FlowStepComponent;
}
