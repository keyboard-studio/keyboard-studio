// journey-runner — headless replay harness for journey fixtures (spec 032).
//
// replayJourney(fixture) walks a JourneyFixture through the SAME two routing
// layers the live studio uses (research R1):
//   - cross-manifest-step transitions: steps/advance.ts's advance() +
//     steps/reducer.ts's applyStepCompletion()/recordStepCompletion().
//   - intra-step question routing: survey/SurveyRunner.tsx's exported pure
//     evalCondition/resolveNext/advanceThrough, driving loadModularFlow()
//     over the SAME steps/flowSources.ts registry the runtime/dashboard use
//     (no second flow-routing source of truth).
//
// FR-004: store-free during replay in the sense that matters — no React
// render, no Playwright, no surveySessionStore navigation state (this harness
// tracks its own step cursor / selectedTrack / touchSeedSource locally rather
// than touching that store). It DOES drive workingCopyStore's real actions
// (recordPhase/recordAssignments/instantiateFrom*/lockDesktop/...) because
// those ARE "the working copy" FR-003(c) asks the harness to apply actions
// to; workingCopyStore has no per-test-isolated factory (unlike, say, a fresh
// Zustand `create()` call per fixture), so "a fresh working copy per fixture"
// is realised the same way every other headless test in this package gets
// isolation: reset() at the top of the call and again before returning,
// exactly the beforeEach/afterEach convention already used throughout
// packages/studio/src/**/*.test.ts (e.g. stores/workingCopyStore.test.ts,
// steps/reducer.test.ts). No fixture observes another fixture's state.
//
// Non-goals honoured (spec 032 §Requirements, FR-013/014/015):
//   - no window.__ksE2E__ telemetry;
//   - no bulk-scan of the import corpus;
//   - no per-key gallery decomposition — carve/mechanisms/touch steps record
//     their fixture's action-summary events VERBATIM and apply the minimal
//     store actions those steps' completions always fire (lockDesktop,
//     setTouchLayoutJson(null), recordAssignments([])) rather than deriving
//     them from simulated per-key edits.
//
// Steps with no modular flow AND no gallery-action-summary shape in this
// harness (marks/punctuation/convenience) are completed as a no-op advance —
// this stands in for the real S0/gate auto-skip those steps' own React
// components apply when nothing applies (marks-free alphabet, no surplus
// convenience letters, etc). A fixture that needs one of these steps to carry
// a real side effect is outside this feature's scope (spec §9 loop primitive,
// FR-015).

import type {
  KeyboardIR,
  BaseKeyboard,
  VirtualFS,
  SurveyPhaseResult,
  SurveyAnswer,
  DiscoveryAxisVector,
} from "@keyboard-studio/contracts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { makeTestIR, basicKbdus, makeBaseKeyboard } from "@keyboard-studio/contracts/fixtures";
import { selectStrategy } from "@keyboard-studio/engine";
import { manifest } from "../steps/manifest.ts";
import { advance, STEPS_WITH_APPLY_COMPLETION } from "../steps/advance.ts";
import {
  applyStepCompletion,
  CHOOSE_BASE_STEP_ID,
  TOUCH_STEP_ID,
  type ReducerDeps,
  type InstantiateResult,
  type TouchCompleteResult,
} from "../steps/reducer.ts";
import { useWorkingCopyStore, bindManifest } from "../stores/workingCopyStore.ts";
import { flowSources } from "../steps/flowSources.ts";
import { loadModularFlow } from "./loadModularFlow.ts";
import { evalCondition as _evalCondition, resolveNext, advanceThrough } from "./SurveyRunner.tsx";
import type { FlowQuestion, SurveyContext } from "./types.ts";
import {
  type JourneyFixture,
  type JourneyEvent,
  type JourneySurveyAnswerEvent,
  type JourneyEditorActionEvent,
  type EditorActionType,
  type ReplayResult,
  isEditorActionEvent,
  isSurveyAnswerEvent,
} from "./journeyFixture.ts";

// Re-exported so callers (journey-runner.test.ts, journeyCoverage.ts) can
// import evalCondition from one place if they need it; keeps the "drives
// SurveyRunner's exported pure functions" contract visible from this module.
export { _evalCondition as evalCondition, resolveNext, advanceThrough };
export type { ReplayResult } from "./journeyFixture.ts";

// ---------------------------------------------------------------------------
// Manifest step <-> live modular flow (steps/flowSources.ts, "live" entries
// only — status:"proposed" flows, e.g. the demoted phase_a_identity, are
// intentionally unreachable here, same as the live survey).
// ---------------------------------------------------------------------------

const STEP_FLOW_IDS: Readonly<Record<string, string>> = {
  identity: "identity_lite",
  track: "track",
  project_name: "project_name",
  characters: "phase_b_characters",
  help: "phase_f_helpdocs",
};

// ---------------------------------------------------------------------------
// Base-keyboard fixtures for the "choose_base" step (T008/T009's persona
// source_keyboard field). basic_kbdus reuses the real BaseKeyboard fixture
// (@keyboard-studio/contracts/fixtures); bj_cree_woods carries the REAL
// identity from docs/keyboard-index.md row 41 (id/path/languages) but a
// representative SYNTHETIC IR built with makeTestIR — the same convention
// packages/studio's other headless tests use throughout (e.g.
// hooks/useInventoryDiff.test.ts's seedBaseWithChars) — rather than invoking
// the engine codec against the ../keyboards checkout, which FR-014 rules out
// as bulk-corpus work and which this single-fixture harness has no need for.
// ---------------------------------------------------------------------------

interface BaseFixture {
  base: BaseKeyboard;
  vfs: VirtualFS;
  ir: KeyboardIR;
}

const BASE_FIXTURES: Readonly<Record<string, BaseFixture>> = {
  basic_kbdus: {
    base: basicKbdus,
    vfs: createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c basic_kbdus\n", isBinary: false }]),
    ir: makeTestIR([]),
  },
  bj_cree_woods: {
    base: makeBaseKeyboard({
      id: "bj_cree_woods",
      path: "release/bj/bj_cree_woods",
      script: "Cans",
      targets: ["windows", "macosx", "linux", "web"],
      displayName: "Western Cree (TH-Woods)",
      version: "1.0",
      sourceUrl: "https://github.com/keymanapp/keyboards/tree/master/release/bj/bj_cree_woods",
      languages: ["cr"],
    }),
    vfs: createVirtualFS([{ path: "source/bj_cree_woods.kmn", content: "c bj_cree_woods\n", isBinary: false }]),
    ir: makeTestIR([
      {
        nodeId: "g0",
        name: "main",
        usingKeys: false,
        readonly: false,
        rules: [{ nodeId: "rule#1", context: [], output: [{ kind: "char", value: "᙮" }] }],
      },
    ]),
  },
};

function resolveBaseFixture(id: string): BaseFixture {
  const known = BASE_FIXTURES[id];
  if (known === undefined) {
    throw new Error(
      `journey-runner: no fixture base keyboard registered for "${id}" — add one to BASE_FIXTURES in journey-runner.ts`,
    );
  }
  return known;
}

// ---------------------------------------------------------------------------
// Local re-implementations of two SurveyRunner.tsx PRIVATE helpers.
//
// hasValue/toSurveyAnswer are not exported (only evalCondition/resolveNext/
// advanceThrough/buildResumeStack are) — the contract this feature drives.
// Reproduced verbatim (same logic, same shape) rather than exporting them
// from SurveyRunner.tsx, which the programmer-agent scope for spec 032 does
// not ask for and which would touch a file outside this feature's listed
// surface.
// ---------------------------------------------------------------------------

function hasAnswerValue(v: string | string[] | undefined): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return v.trim() !== "";
}

function toSurveyAnswerLocal(
  questionId: string,
  question: FlowQuestion,
  value: string | string[] | undefined,
): SurveyAnswer | null {
  if (value === undefined) return null;
  if (question.type === "multi_select") {
    return { questionId, answerType: "char-list", value: Array.isArray(value) ? value : [value] };
  }
  if (question.type === "bool") {
    const strVal = typeof value === "string" ? value : "";
    return { questionId, answerType: "boolean", value: strVal === "true" };
  }
  if (question.type === "select" || question.type === "radio") {
    const strVal = typeof value === "string" ? value : "";
    if (strVal === "") return null;
    return { questionId, answerType: "select", value: strVal };
  }
  if (question.type === "notice") return null;
  const strVal = typeof value === "string" ? value : "";
  return { questionId, answerType: "text", value: strVal };
}

// ---------------------------------------------------------------------------
// walkFlowFromAnswers — the intra-step routing layer (research R1's second
// layer). Walks a live modular flow from its first question using
// SurveyRunner.tsx's exported advanceThrough/resolveNext, taking each
// question's answer from a fixture-supplied lookup rather than an ordered
// stack — equivalent to SurveyRunner's own walk for any flow this feature's
// four fixtures exercise (none revisit a question within one pass), and the
// natural fit for both the forward walk (built from `events`) and the
// backtrack re-walk (built from previously-given answers, T007).
// ---------------------------------------------------------------------------

interface FlowWalkResult {
  phase: SurveyPhaseResult["phase"];
  answers: SurveyAnswer[];
  visitedQuestionIds: string[];
}

function walkFlowFromAnswers(
  flowId: string,
  ctx: SurveyContext,
  answersById: ReadonlyMap<string, string | string[]>,
  options: { strict?: boolean } = {},
): FlowWalkResult {
  const strict = options.strict ?? true;
  const source = flowSources[flowId];
  if (source === undefined) {
    throw new Error(`journey-runner: unknown flow id "${flowId}" — not a live entry in steps/flowSources.ts`);
  }
  const flow = loadModularFlow(source.raw);
  const index = new Map<string, FlowQuestion>();
  for (const q of flow.questions) index.set(q.id, q);
  for (const q of flow.provenance_questions ?? []) index.set(q.id, q);

  const firstId = flow.questions[0]?.id;
  if (firstId === undefined) {
    throw new Error(`journey-runner: flow "${flowId}" has no questions`);
  }

  const answers: SurveyAnswer[] = [];
  const visited: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = firstId;

  while (currentId !== null) {
    if (seen.has(currentId)) {
      throw new Error(`journey-runner: cycle detected walking flow "${flowId}" at question "${currentId}"`);
    }
    seen.add(currentId);
    const q = index.get(currentId);
    if (q === undefined) {
      throw new Error(`journey-runner: flow "${flowId}" routes to unknown question "${currentId}"`);
    }
    if (q.engine_resolved === true) {
      // Never rendered — no fixture answer to consume; advanceThrough's own
      // internal handling of these nodes mirrors this same resolveNext call.
      currentId = resolveNext(q, undefined, ctx);
      continue;
    }
    visited.push(currentId);
    const value = answersById.get(currentId);
    if (q.required === true && !hasAnswerValue(value)) {
      throw new Error(
        `journey-runner: routing error — required question "${currentId}" (flow "${flowId}") has no fixture answer`,
      );
    }
    const answer = toSurveyAnswerLocal(currentId, q, value);
    if (answer !== null) answers.push(answer);
    currentId = advanceThrough(q, value, ctx, index);
  }

  if (strict) {
    const unconsumed = [...answersById.keys()].filter((id) => !seen.has(id));
    if (unconsumed.length > 0) {
      throw new Error(
        `journey-runner: fixture supplied answer(s) for question(s) never reached by flow "${flowId}" routing: ${unconsumed.join(", ")}`,
      );
    }
  }

  return { phase: flow.phase as SurveyPhaseResult["phase"], answers, visitedQuestionIds: visited };
}

// ---------------------------------------------------------------------------
// Fixture-event grouping + small typed accessors.
// ---------------------------------------------------------------------------

interface EventGroup {
  stepId: string;
  events: JourneyEvent[];
}

function groupContiguousByStep(events: readonly JourneyEvent[]): EventGroup[] {
  const groups: EventGroup[] = [];
  for (const e of events) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.stepId === e.stepId) {
      last.events.push(e);
    } else {
      groups.push({ stepId: e.stepId, events: [e] });
    }
  }
  return groups;
}

function answerMapFromEvents(
  events: readonly JourneySurveyAnswerEvent[],
): Map<string, string | string[]> {
  const m = new Map<string, string | string[]>();
  for (const e of events) m.set(e.questionId, e.value);
  return m;
}

function answerMapFromGroup(group: EventGroup | undefined, stepId: string): Map<string, string | string[]> {
  if (group === undefined) return new Map();
  if (group.stepId !== stepId) {
    throw new Error(
      `journey-runner: internal error — event group stepId "${group.stepId}" does not match current step "${stepId}"`,
    );
  }
  const answerEvents = group.events.filter(isSurveyAnswerEvent);
  if (answerEvents.length !== group.events.length) {
    throw new Error(
      `journey-runner: step "${stepId}" mixes survey-answer and editor-action events in one visit`,
    );
  }
  return answerMapFromEvents(answerEvents);
}

function requireStringAnswer(
  answers: ReadonlyMap<string, string | string[]>,
  questionId: string,
  stepId: string,
): string {
  const v = answers.get(questionId);
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`journey-runner: step "${stepId}" requires a string answer for "${questionId}"`);
  }
  return v;
}

/** FR-002(b)/FR-015 — verbatim pass-through; the harness records but never decomposes these. */
function collectEditorActionEvents(
  group: EventGroup | undefined,
  expected: EditorActionType,
): JourneyEditorActionEvent[] {
  if (group === undefined) return [];
  const actionEvents = group.events.filter(isEditorActionEvent);
  for (const e of actionEvents) {
    if (e.action_type !== expected) {
      throw new Error(
        `journey-runner: step "${group.stepId}" expected action_type "${expected}", got "${e.action_type}"`,
      );
    }
  }
  return actionEvents;
}

// ---------------------------------------------------------------------------
// ReducerDeps wired to the REAL workingCopyStore actions (contract: "Applies
// workingCopyStore's recordPhase/recordAssignments for survey-answer events").
// ---------------------------------------------------------------------------

function buildReplayReducerDeps(): ReducerDeps {
  return {
    lockDesktop: () => useWorkingCopyStore.getState().lockDesktop(),
    clearStale: (stepId) => useWorkingCopyStore.getState().clearStale(stepId),
    setTouchLayoutJson: (json) => useWorkingCopyStore.getState().setTouchLayoutJson(json),
    instantiateFromBase: (base, opts) => useWorkingCopyStore.getState().instantiateFromBase(base, opts),
    instantiateFromExisting: (base, opts) =>
      useWorkingCopyStore.getState().instantiateFromExisting(base, opts),
    // FR-015: no per-key decomposition — the harness never builds a real
    // touch layout; this mirrors the R11 emission matrix's own "don't emit"
    // outcome rather than a build failure.
    buildTouchLayoutJson: () => ({ json: null, warnings: [] }),
    resolveBaseTouchJson: () => undefined,
    instantiateFromBaseIfConfirmed: (base, opts) => {
      // The real dep's declared signature allows a null vfs/ir (the pre-parse
      // state a real base resolution can transiently be in); this harness
      // only ever calls it with the already-parsed BaseFixture, so vfs/ir are
      // always non-null in practice — guarded here rather than widening
      // instantiateFromBase's own (correctly strict) signature.
      if (opts.vfs === null || opts.ir === null) {
        throw new Error("journey-runner: instantiateFromBaseIfConfirmed called with a null vfs/ir");
      }
      useWorkingCopyStore.getState().instantiateFromBase(base, {
        vfs: opts.vfs,
        ir: opts.ir,
        ...(opts.removalCapabilities !== undefined ? { removalCapabilities: opts.removalCapabilities } : {}),
      });
      return true;
    },
    getWorkingIR: () => useWorkingCopyStore.getState().ir,
    setWorkingIR: (ir) => useWorkingCopyStore.getState().setWorkingIR(ir),
    getStaleSteps: () => useWorkingCopyStore.getState().staleSteps,
  };
}

// ---------------------------------------------------------------------------
// expected_outcomes.axes — an OPTIONAL, additive extension of the locked
// expected_outcomes shape (data-model.md declares it `[key: string]: unknown`
// specifically so fixtures can carry fixture-specific assertions like this
// one). Lets a fixture assert a REAL selectStrategy() outcome rather than a
// hand-typed string nothing re-derives.
// ---------------------------------------------------------------------------

function isPartialAxisVector(v: unknown): v is Partial<DiscoveryAxisVector> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Fills the two axes (A5/A6) §7.2 rule 7 (and this feature's fixtures) never
 *  elicit, with the decision tree's "nothing special" values, so a fixture
 *  only has to declare the axes its own scenario actually turns on. */
function fillAxisDefaults(partial: Partial<DiscoveryAxisVector>): DiscoveryAxisVector {
  return {
    scale: partial.scale ?? "small",
    scriptClass: partial.scriptClass ?? "alphabetic",
    phoneticIntuition: partial.phoneticIntuition ?? "weak",
    diacriticBehavior: partial.diacriticBehavior ?? "none",
    multiMode: partial.multiMode ?? "single",
    constraintEnforcement: partial.constraintEnforcement ?? "none",
    spareKeyAvailability: partial.spareKeyAvailability ?? "many",
    ...(partial.clusterSensitivity !== undefined ? { clusterSensitivity: partial.clusterSensitivity } : {}),
    ...(partial.markInputOrder !== undefined ? { markInputOrder: partial.markInputOrder } : {}),
    ...(partial.remapPosture !== undefined ? { remapPosture: partial.remapPosture } : {}),
  };
}

// ---------------------------------------------------------------------------
// replayJourney — the public API (contracts/journey-fixture-schema.md).
// ---------------------------------------------------------------------------

export async function replayJourney(fixture: JourneyFixture): Promise<ReplayResult> {
  const errors: string[] = [];
  const exercisedStepIds: string[] = [];
  const exercisedEdges: string[] = [];

  // FR-004: fresh working copy per call (see module header for the isolation
  // rationale) — reset before use and again before returning.
  useWorkingCopyStore.getState().reset();
  bindManifest(manifest); // idempotent; required before markStale/clearStale.

  const deps = buildReplayReducerDeps();

  let selectedTrack: "copy" | "adapt" | null = null;
  let touchSeedSource: "import-adapt" | "reseed-from-desktop" | null = null;
  let surveyContext: SurveyContext =
    fixture.persona.routing_group !== undefined
      ? { routing_group: fixture.persona.routing_group }
      : {};
  let pendingBase: BaseFixture | null = null;

  const groups = groupContiguousByStep(fixture.events);
  let groupCursor = 0;
  let currentStepId = "identity";

  try {
    while (currentStepId !== "done" && currentStepId !== "unsupported") {
      exercisedStepIds.push(currentStepId);
      const group =
        groups[groupCursor]?.stepId === currentStepId ? groups[groupCursor++] : undefined;

      let result: unknown;

      switch (currentStepId) {
        case "identity": {
          const answers = answerMapFromGroup(group, "identity");
          const walked = walkFlowFromAnswers(STEP_FLOW_IDS["identity"]!, surveyContext, answers);
          const phaseResult: SurveyPhaseResult = { phase: walked.phase, answers: walked.answers };
          useWorkingCopyStore.getState().recordPhase(phaseResult);
          result = phaseResult;
          break;
        }

        case "choose_base": {
          const answers = answerMapFromGroup(group, "choose_base");
          const baseId = requireStringAnswer(answers, "base_keyboard_id", "choose_base");
          pendingBase = resolveBaseFixture(baseId);
          result = undefined;
          break;
        }

        case "track": {
          const answers = answerMapFromGroup(group, "track");
          const walked = walkFlowFromAnswers(STEP_FLOW_IDS["track"]!, surveyContext, answers);
          const trackValue = requireStringAnswer(answers, "track_choice", "track");
          if (trackValue !== "copy" && trackValue !== "adapt") {
            throw new Error(`journey-runner: track_choice must be "copy" or "adapt", got "${trackValue}"`);
          }
          selectedTrack = trackValue;
          const phaseResult: SurveyPhaseResult = { phase: walked.phase, answers: walked.answers };
          useWorkingCopyStore.getState().recordPhase(phaseResult);
          // R3 (steps/reducer.ts): the real onInstantiate callback fires once
          // track is known — mirrored here rather than at "choose_base"
          // itself, matching reducer.ts's own comment on where this fires today.
          if (pendingBase === null) {
            throw new Error(`journey-runner: "track" completed with no base chosen at "choose_base"`);
          }
          const instantiateResult: InstantiateResult = {
            base: pendingBase.base,
            vfs: pendingBase.vfs,
            ir: pendingBase.ir,
            track: trackValue,
          };
          applyStepCompletion(CHOOSE_BASE_STEP_ID, instantiateResult, deps);
          result = phaseResult;
          break;
        }

        case "project_name": {
          const answers = answerMapFromGroup(group, "project_name");
          const walked = walkFlowFromAnswers(STEP_FLOW_IDS["project_name"]!, surveyContext, answers);
          const phaseResult: SurveyPhaseResult = { phase: walked.phase, answers: walked.answers };
          useWorkingCopyStore.getState().recordPhase(phaseResult);
          result = phaseResult;
          break;
        }

        case "characters": {
          const answers = answerMapFromGroup(group, "characters");
          const walked = walkFlowFromAnswers(STEP_FLOW_IDS["characters"]!, surveyContext, answers);
          const phaseResult: SurveyPhaseResult = { phase: walked.phase, answers: walked.answers };
          useWorkingCopyStore.getState().recordPhase(phaseResult);
          applyStepCompletion("characters", phaseResult, deps); // no-op per reducer's default case
          result = phaseResult;
          break;
        }

        case "marks":
        case "punctuation":
        case "convenience": {
          // No modular flow and no gallery-action-summary shape for these —
          // see module header. applyStepCompletion("marks", {}, deps) is a
          // genuine no-op here (an empty payload has no marksWorklist, so
          // reducer.ts's MARKS_STEP_ID case breaks early), mirroring a
          // marks-free alphabet's real auto-skip.
          if (currentStepId === "marks") applyStepCompletion("marks", {}, deps);
          result = undefined;
          break;
        }

        case "carve": {
          collectEditorActionEvents(group, "gallery_edit");
          // Consult the real STEPS_WITH_APPLY_COMPLETION set rather than
          // hand-asserting membership — "carve" IS listed there (a prior
          // draft of this comment claimed otherwise, which was simply wrong
          // and the harness silently skipped calling applyStepCompletion for
          // it). reducer.ts currently has no case for "carve" so this call
          // hits its default no-op branch today, but consulting the set
          // means the harness stays faithful if a real handler is added.
          if (STEPS_WITH_APPLY_COMPLETION.has("carve")) {
            applyStepCompletion("carve", undefined, deps);
          }
          result = undefined;
          break;
        }

        case "mechanisms": {
          collectEditorActionEvents(group, "mechanism_edit");
          // FR-015: no per-key decomposition — record an empty assignment set.
          useWorkingCopyStore.getState().recordAssignments([]);
          applyStepCompletion("mechanisms", undefined, deps); // fires lockDesktop (R1)
          result = undefined;
          break;
        }

        case "touch_seed_source": {
          const answers = answerMapFromGroup(group, "touch_seed_source");
          const v = answers.get("touch_seed_source");
          if (v !== undefined) {
            const strVal = typeof v === "string" ? v : "";
            if (strVal !== "import-adapt" && strVal !== "reseed-from-desktop") {
              throw new Error(
                `journey-runner: touch_seed_source must be "import-adapt" or "reseed-from-desktop", got "${strVal}"`,
              );
            }
            touchSeedSource = strVal;
          } else {
            touchSeedSource = "import-adapt";
          }
          result = undefined;
          break;
        }

        case "touch": {
          collectEditorActionEvents(group, "touch_edit");
          const touchResult: TouchCompleteResult = {
            assignments: [],
            baseIr: useWorkingCopyStore.getState().ir,
            baseVfs: pendingBase?.vfs ?? null,
            seedSource: touchSeedSource,
          };
          applyStepCompletion(TOUCH_STEP_ID, touchResult, deps); // fires setTouchLayoutJson (R2)
          result = undefined;
          break;
        }

        case "help": {
          const answers = answerMapFromGroup(group, "help");
          const walked = walkFlowFromAnswers(STEP_FLOW_IDS["help"]!, surveyContext, answers);
          const phaseResult: SurveyPhaseResult = { phase: walked.phase, answers: walked.answers };
          useWorkingCopyStore.getState().recordPhase(phaseResult);
          applyStepCompletion("help", phaseResult, deps); // no-op per reducer's default case
          result = phaseResult;
          break;
        }

        default:
          throw new Error(`journey-runner: no replay handler for manifest step "${currentStepId}"`);
      }

      const outcome = advance(currentStepId as Parameters<typeof advance>[0], result, {
        selectedTrack,
        identitySupported: true,
        touchSeedSource,
        // FR-015: the harness records gallery/mechanism/touch action
        // summaries verbatim rather than decomposing per-key coverage, so it
        // cannot compute the REAL allCharactersImplemented gate
        // (hooks/useInventoryCoverageGate.ts) — that needs exactly the
        // per-key data this feature deliberately does not build. A curated
        // fixture that reaches "help" represents a workflow its author
        // intends to complete, so the gate is treated as satisfied here.
        allCharactersImplemented: true,
      });
      exercisedEdges.push(`${currentStepId}->${outcome.next}`);
      currentStepId = outcome.next;
    }

    // T007 — backtrack handling.
    for (const bt of fixture.backtrack_events ?? []) {
      const wc = useWorkingCopyStore.getState();
      wc.markStale(bt.revisit_step);
      const staleAfterMark = new Set(useWorkingCopyStore.getState().staleSteps);

      if (bt.revisit_step === "characters" && bt.new_answer.questionId === "routing_group") {
        // "routing_group" is a harness-level sentinel, not a live question id
        // (spec §7's routing_group axis is derived/computed in the live
        // survey, not a re-askable question — the "layout_family" question
        // this scenario's spec prose describes was demoted out of the live
        // registry; see steps/flowSources.ts's phase_a_identity: "proposed").
        // It re-points the SurveyContext the "characters" flow routes on.
        const v = bt.new_answer.value;
        const newRoutingGroup = typeof v === "string" ? v : v[0];
        if (newRoutingGroup === undefined) {
          throw new Error(
            `journey-runner: backtrack new_answer for "routing_group" must be a non-empty value`,
          );
        }
        surveyContext = { ...surveyContext, routing_group: newRoutingGroup };

        // Re-derive using the SAME answers already given for "characters" —
        // only the branch the changed context reroutes needs different
        // answers, and every question unique to the new branch in this
        // fixture's flow is optional (see content/journeys/backtrack-journey.yaml),
        // so an absent value there is a legitimate "not answered", not a
        // routing error. strict:false because the ORIGINAL branch's own
        // branch-specific questions are now unreachable by design and must
        // not be reported as unconsumed.
        const priorAnswers = answerMapFromEvents(
          fixture.events.filter(
            (e): e is JourneySurveyAnswerEvent => e.stepId === "characters" && isSurveyAnswerEvent(e),
          ),
        );
        const walked = walkFlowFromAnswers(STEP_FLOW_IDS["characters"]!, surveyContext, priorAnswers, {
          strict: false,
        });
        const phaseResult: SurveyPhaseResult = { phase: walked.phase, answers: walked.answers };
        useWorkingCopyStore.getState().recordPhase(phaseResult);
      } else {
        throw new Error(
          `journey-runner: backtrack revisit_step "${bt.revisit_step}" / questionId "${bt.new_answer.questionId}" is not supported by this harness`,
        );
      }

      useWorkingCopyStore.getState().clearStale(bt.revisit_step);

      if (bt.expected_staleness !== undefined) {
        for (const id of bt.expected_staleness) {
          if (!staleAfterMark.has(id)) {
            errors.push(
              `backtrack: expected "${id}" to go stale after revisiting "${bt.revisit_step}", but observed stale set was {${[...staleAfterMark].join(", ")}}`,
            );
          }
        }
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : String(err));
  }

  // expected_outcomes.routing_group — the one outcome always checkable
  // without engine-level axis data.
  const expected = fixture.expected_outcomes;
  if (
    errors.length === 0 &&
    expected.routing_group !== undefined &&
    expected.routing_group !== surveyContext.routing_group
  ) {
    errors.push(
      `expected_outcomes.routing_group "${expected.routing_group}" does not match replayed routing_group "${String(surveyContext.routing_group)}"`,
    );
  }

  // expected_outcomes.strategy — checked for real via the engine's §7.2
  // decision tree (selectStrategy) when the fixture supplies enough axis data
  // to run it (expected_outcomes.axes, a Partial<DiscoveryAxisVector> the
  // fixture author derived from its own Phase B answers — see
  // content/journeys/*.yaml's comments for the per-fixture derivation). A
  // fixture that omits `axes` still MUST declare `strategy` (fixture-schema.md)
  // but is treated as descriptive metadata only — this harness does not
  // reimplement the axis-derivation the real survey performs from raw
  // answers (that is Content/Engine's §7.1 elicitation logic, not this
  // feature's job).
  if (errors.length === 0 && expected.strategy !== undefined && isPartialAxisVector(expected.axes)) {
    const axes = fillAxisDefaults(expected.axes);
    const recommendation = selectStrategy(axes);
    if (recommendation.primary !== expected.strategy) {
      errors.push(
        `expected_outcomes.strategy "${expected.strategy}" does not match selectStrategy()'s primary "${recommendation.primary}" (rule ${recommendation.triggeredRule}) for the fixture's declared axes`,
      );
    }
    const expectedSecondary = fixture.expected_outcomes["secondary_strategies"];
    if (Array.isArray(expectedSecondary)) {
      const actualSet: ReadonlySet<string> = new Set(recommendation.secondaries);
      for (const s of expectedSecondary) {
        if (typeof s === "string" && !actualSet.has(s)) {
          errors.push(
            `expected_outcomes.secondary_strategies expected "${s}", but selectStrategy() returned [${recommendation.secondaries.join(", ")}]`,
          );
        }
      }
    }
  }

  const finalIR = useWorkingCopyStore.getState().ir;

  // FR-004: discard the working copy — no state observable by the next call.
  useWorkingCopyStore.getState().reset();

  return {
    journeyId: fixture.journey_id,
    exercisedStepIds,
    exercisedEdges,
    finalIR,
    assertionsPassed: errors.length === 0,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
