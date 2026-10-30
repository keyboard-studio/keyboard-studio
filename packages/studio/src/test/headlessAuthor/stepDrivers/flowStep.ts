// Completing a YAML flow step headlessly (spec 107 T026/T027): the walk a
// SurveyRunner does, minus rendering. Shared by every driver whose step is a
// flow (identity, track, attribution, project_name, and the characters / help
// steps that reuse it).
//
// What the runner does, and which product function this calls for it:
//   - first question and the question index  -> indexFlow
//   - the field arrives pre-filled           -> seedProposal (decision record
//                                               first, then the flow's seed callbacks)
//   - Continue enabled?                      -> canAdvanceFrom
//   - next question (engine-resolved skipped)-> advanceThrough
//   - the answers a walk saves (origin and proposal, which the decision record
//     reads to name agency and source)       -> buildSavedAnswers, published
//                                               through publishSavedAnswers
//   - each non-final Next is recorded        -> toSurveyAnswer, then the loop's
//                                               recorder (what StepHost binds)
//   - the finished walk's result             -> assembleFlowResult
// The one choice the author makes is the walk policy's (walkPolicy.ts): the
// case's override, else the product's pre-filled value, else a placeholder the
// caller names, else (optional questions only) leave it blank, as pressing
// Continue on an empty optional field does. An unanswerable required question
// fails the walk with a descriptive error; nothing is invented.
//
// `completeFlowStep` is the form for a flow hosted by makeFlowStepComponent:
// the options record's seed callbacks, context and completion guard are the
// product's own, composed with buildFlowStepDeps from the same live values the
// component reads. `completeFlow` is the lower level for a flow with its own
// host (identity).

import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { FlowDef, FlowQuestion, SurveyContext, AnswerStackEntry } from "../../../survey/types.ts";
import type { FlowStepOptions } from "../../../editors/adapters/flowStepDeps.ts";
import {
  advanceThrough,
  assembleFlowResult,
  buildSavedAnswers,
  canAdvanceFrom,
  indexFlow,
  publishSavedAnswers,
  seedProposal,
  toSurveyAnswer,
} from "../../../survey/flowWalk.ts";
import { buildFlowStepDeps, flowStepCompletion } from "../../../editors/adapters/flowStepDeps.ts";
import { flowSources, loadFlowSourceDef } from "../../../steps/flowSources.ts";
import { useSurveySessionStore } from "../../../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../../../stores/workingCopyStore.ts";
import { getDecisionSnapshot } from "../../../stores/decisionStore.ts";
import { chooseByPolicy } from "../walkPolicy.ts";
import type { PolicyStep } from "../caseTypes.ts";
import type { DriverContext } from "./types.ts";

type Value = string | string[];

/** The author's side of the walk: what the case supplies, per question id. */
export interface FlowChoices {
  /** Case-supplied answers (harness overrides). */
  overrides?: Readonly<Record<string, Value>>;
  /** Typed where the product offers nothing for a question. Absent for most. */
  placeholders?: Readonly<Record<string, () => Value>>;
  /**
   * Applies the author's typing to a field the way its control does, for
   * controls whose typing has a side effect (the language-name picker resolves
   * the typed name to an entry). Called only for a value the author typed, an
   * override or a placeholder; accepting the pre-filled value types nothing.
   */
  typed?: (question: FlowQuestion, text: Value) => void | Promise<void>;
}

/** How the host wires the runner: the callbacks SurveyRunner takes as props. */
export interface FlowHost {
  /** The survey context, re-read for every question (the host re-renders it). */
  context: () => SurveyContext;
  getSeedValue?: (questionId: string) => Value | undefined;
  getSeedSource?: Parameters<typeof seedProposal>[2];
  getNextOverride?: (questionId: string, value: Value | undefined) => string | undefined;
  getRequiredOverride?: (questionId: string) => boolean | undefined;
  onAnswerCommit?: (questionId: string, value: Value | undefined) => void;
}

/** Bound on questions per flow: more means the routing is cycling. */
const MAX_QUESTIONS = 100;

/**
 * Walk `flow` from its first question, answering each by the walk policy, and
 * return the SurveyPhaseResult the runner hands to `onComplete`. The step id the
 * walk is published under is the session's active step, as in the runner.
 */
export async function completeFlow(
  flow: FlowDef,
  host: FlowHost,
  choices: FlowChoices,
  ctx: Pick<DriverContext, "report" | "recorder">,
): Promise<SurveyPhaseResult> {
  const stepId = useSurveySessionStore.getState().activeStepId;
  const { index, firstId } = indexFlow(flow);
  const stack: AnswerStackEntry[] = [];
  let questionId = firstId;

  for (let n = 0; questionId !== null; n++) {
    if (n >= MAX_QUESTIONS) {
      throw new Error(`flow ${flow.flow_id}: still routing after ${MAX_QUESTIONS} questions`);
    }
    const question = index.get(questionId);
    if (question === undefined) throw new Error(`flow ${flow.flow_id}: no question "${questionId}"`);

    // The question as the field renders it: `required` may be overridden by the host.
    const requiredOverride = host.getRequiredOverride?.(questionId);
    const shown: FlowQuestion = requiredOverride !== undefined ? { ...question, required: requiredOverride } : question;

    const proposal = seedProposal(questionId, host.getSeedValue, host.getSeedSource);
    const value = await choose(shown, proposal, choices, ctx);

    const entry: AnswerStackEntry = proposal !== undefined ? { questionId, value, proposal } : { questionId, value };
    stack.push(entry);
    // The runner's publishing effect: the walk's saved answers (origin, proposal)
    // and the position, which the decision recorder reads at completion.
    publishSavedAnswers(stepId, buildSavedAnswers(stack, stack.map((e) => e.value), index), questionId);

    const next = advanceThrough(question, value, host.context(), index, host.getNextOverride);
    if (next === null) {
      return assembleFlowResult(flow, stack.slice(0, -1), index, { questionId, question }, value);
    }

    // A non-final Next records its own screen, then tells the host the answer is committed.
    const recorded = toSurveyAnswer(questionId, question, value);
    if (recorded !== null) ctx.recorder?.recordQuestionAnswers(stepId, questionId, [recorded]);
    host.onAnswerCommit?.(questionId, value);
    questionId = next;
  }
  throw new Error(`flow ${flow.flow_id} has no renderable question`);
}

/** One question: the walk policy's choice, typed the way the control types it, gated like Continue. */
async function choose(
  question: FlowQuestion,
  proposal: ReturnType<typeof seedProposal>,
  choices: FlowChoices,
  ctx: Pick<DriverContext, "report">,
): Promise<Value | undefined> {
  const questionId = question.id;
  // A notice has nothing to answer.
  if (question.type === "notice") return undefined;

  const override = choices.overrides?.[questionId];
  const placeholder = choices.placeholders?.[questionId];
  let step: (PolicyStep & { value: Value }) | undefined;
  try {
    step = chooseByPolicy<Value>({
      decisionId: questionId,
      ...(override !== undefined ? { override } : {}),
      suggestions: proposal !== undefined ? [proposal.value] : [],
      ...(placeholder !== undefined ? { placeholder } : {}),
      proposalSource: proposal?.source ?? "survey/flowWalk.ts seedProposal",
    });
  } catch {
    step = undefined;
  }

  if (step === undefined) {
    // Nothing offered and nothing supplied: Continue on an empty field.
    if (!canAdvanceFrom(question, undefined)) {
      throw new Error(`question "${questionId}" is required, the product offers no value and the case supplies none`);
    }
    ctx.report.addSkippedStep({ step: questionId, reason: "optional question, nothing offered, left blank" });
    return undefined;
  }

  if (step.rule === "override" || step.rule === "placeholder") await choices.typed?.(question, step.value);
  if (step.rule === "placeholder") {
    ctx.report.addPlaceholder({ char: "", sequence: String(step.value), decisionId: questionId });
  }
  if (!canAdvanceFrom(question, step.value)) {
    throw new Error(`question "${questionId}": Continue is disabled for the chosen value ${JSON.stringify(step.value)}`);
  }
  ctx.report.addStep(step);
  return step.value;
}

/** A guest session's profile: the authenticated-profile hook yields nulls until the author connects. */
const GUEST_PROFILE = { name: null, email: null } as const;

export interface FlowStepOptionsChoices extends FlowChoices {
  /** Validator findings for the flow's questions (a flow with `usesFindings`); empty otherwise. */
  findingsByQuestionId?: Parameters<typeof buildFlowStepDeps>[0]["findingsByQuestionId"];
}

/**
 * Complete a step hosted by makeFlowStepComponent: the options record's seed
 * callbacks, survey context, mount hook and completion guard, over deps composed
 * from the live stores exactly as the component composes them. Returns what the
 * component passes to `onComplete`.
 */
export async function completeFlowStep<Extracted>(
  options: FlowStepOptions<Extracted>,
  choices: FlowStepOptionsChoices,
  ctx: Pick<DriverContext, "report" | "recorder">,
): Promise<SurveyPhaseResult> {
  const source = flowSources[options.flowRef];
  if (source === undefined) throw new Error(`unknown flowRef "${options.flowRef}"`);
  const flow = loadFlowSourceDef(source);

  // The component's per-mount ref (the project_name step's committed display name).
  const displayNameRef = { current: "" };
  const deps = () =>
    buildFlowStepDeps({
      localStart: useSurveySessionStore.getState().localStart,
      decisions: getDecisionSnapshot(),
      findingsByQuestionId: choices.findingsByQuestionId ?? {},
      displayNameRef,
      historyEntryState: useWorkingCopyStore.getState().historyEntryState,
      authorProfile: GUEST_PROFILE,
    });

  // Fires once per mount, before the first question reads a derived value.
  options.onMount?.(deps());

  const seeds = options.seeds;
  const result = await completeFlow(
    flow,
    {
      context: () => options.buildContext(deps()),
      ...(seeds?.getSeedValue ? { getSeedValue: (q: string) => seeds.getSeedValue!(q, deps()) } : {}),
      ...(seeds?.getSeedSource ? { getSeedSource: (q: string) => seeds.getSeedSource!(q, deps()) } : {}),
      ...(seeds?.getRequiredOverride
        ? { getRequiredOverride: (q: string) => seeds.getRequiredOverride!(q, deps()) }
        : {}),
      ...(seeds?.onAnswerCommit
        ? { onAnswerCommit: (q: string, v: Value | undefined) => seeds.onAnswerCommit!(q, v, deps()) }
        : {}),
    },
    choices,
    ctx,
  );
  const completion = flowStepCompletion(options, result);
  if (completion === undefined) {
    throw new Error(`flow "${options.flowRef}" finished without the answers its step needs to advance`);
  }
  return completion;
}
