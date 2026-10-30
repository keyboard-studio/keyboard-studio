// flowStepDeps — the types behind a YAML-driven flow step (FlowStepDeps,
// FlowStepOptions) and the two rules the step component applies around its
// runner: how the live deps are composed, and when a runner result may advance
// the step. Lifted out of makeFlowStepComponent (spec 107 FR-040) so the UI and
// the headless author share them; makeFlowStepComponent re-exports the types.

import type {
  DecisionProposalSource,
  SurveyPhaseResult,
  LintFinding,
  HistoryEntryState,
} from "@keyboard-studio/contracts";
import { selectTrack } from "../../stores/decisionStore.ts";
import type { DecisionSet } from "../../decisions/decisionTypes.ts";
import { deriveSurveyContext } from "../../decisions/identitySelectors.ts";
import type { SurveyContext } from "../../survey/types.ts";

// ---------------------------------------------------------------------------
// FlowStepDeps — live store/hook values the per-flow options consume.
// ---------------------------------------------------------------------------

export interface FlowStepDeps {
  localStart: { displayName: string; languages?: string[] } | null;
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
   * The authenticated author's profile (spec 064 D7), or nulls for a
   * guest / a profile that does not publish them. Read once here (the
   * factory owns all hook access, C2.5) for the options records whose
   * seeders evaluate profile lookup defaults — the attribution flow's
   * author name / email (#1901): the modules declare the rule
   * (`lookupDefault`); the seed callback only supplies this input.
   */
  authorProfile: { name: string | null; email: string | null };
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
    /**
     * Optional one-line reason for a seed, shown under the field as the
     * seed's provenance caption (forwarded to SurveyRunner's
     * getSeedProvenance). A flow supplies this when its proposal has a
     * human-readable "why" the author should see before confirming it.
     */
    getSeedCaption?: (questionId: string, deps: FlowStepDeps) => string | undefined;
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


/**
 * Compose a flow step's live deps from the values the step component reads
 * (hooks in the UI, store snapshots in the headless author). Everything the
 * per-flow options used to read from stored session fields — the survey
 * context, the selected track — is derived from `decisions` here.
 */
export function buildFlowStepDeps(live: {
  localStart: FlowStepDeps["localStart"];
  decisions: DecisionSet;
  findingsByQuestionId: Record<string, LintFinding[]>;
  displayNameRef: { current: string };
  historyEntryState: HistoryEntryState | null;
  authorProfile: FlowStepDeps["authorProfile"];
}): FlowStepDeps {
  return {
    localStart: live.localStart,
    decisions: live.decisions,
    surveyContext: deriveSurveyContext(live.decisions),
    findingsByQuestionId: live.findingsByQuestionId,
    displayNameRef: live.displayNameRef,
    selectedTrack: selectTrack(live.decisions),
    historyEntryState: live.historyEntryState,
    authorProfile: live.authorProfile,
  };
}

/**
 * C2.4 — the completion guard: `extract(result)` returning undefined keeps the
 * step on screen (no advance). Otherwise the UNTOUCHED runner result is what the
 * step hands to its host, not the extracted payload (see the contract note in
 * makeFlowStepComponent). Returns the result to complete with, or undefined to
 * stay.
 */
export function flowStepCompletion<Extracted>(
  options: Pick<FlowStepOptions<Extracted>, "extract">,
  result: SurveyPhaseResult,
): SurveyPhaseResult | undefined {
  return options.extract(result) === undefined ? undefined : result;
}
