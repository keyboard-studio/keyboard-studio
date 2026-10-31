// flowWalk — the rules SurveyRunner applies as it walks a flow, lifted out of
// the component (spec 107 FR-040) so the UI and the headless author run the
// same code: what a question's seed is, how a value becomes a recorded answer,
// which saved answer a walk publishes, and how the finished walk becomes the
// step's SurveyPhaseResult.
//
// Nothing here renders. The only store reads are the ones the component made
// from the same places (the decision store, for record-first seeding).

import { devLog } from "@keyboard-studio/contracts/dev-log";
import type { DecisionProposalSource, SurveyAnswer, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveyAnswerStore, type SavedAnswer } from "../stores/surveyAnswerStore.ts";
import { runLiveExtractionFromStores } from "../decisions/liveExtraction.ts";
import { questionRegistry } from "./questions/registry.ts";
import { evalConditionGrammar } from "./conditionGrammar.ts";
import type {
  AnswerStackEntry,
  FlowDef,
  FlowGotoRule,
  FlowQuestion,
  SeedProposal,
  SurveyContext,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Value predicates and the answer shape
// ---------------------------------------------------------------------------

export function hasValue(v: string | string[] | undefined): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return v.trim() !== "";
}

/**
 * Did the author actually CHANGE this answer? The one question `advance` asks to
 * decide whether the committed answers ahead of it survive (see its `keepAhead`).
 *
 * By value, element-wise for a multi-select, because an answer value is either a
 * string or a string array and a fresh array with identical contents is the same
 * answer — reference comparison would report every re-confirmation as a change
 * and discard the downstream walk on a Back/Next that changed nothing, which is
 * exactly the blanking bug this guard exists to prevent.
 *
 * Element ORDER counts: a multi-select's order is author-visible (the character
 * lists these flows collect are rendered in the order they were built), so a
 * reorder is a change.
 */
export function answersDiffer(
  a: string | string[] | undefined,
  b: string | string[] | undefined,
): boolean {
  if (a === b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  }
  return true;
}

/**
 * The recorded `AnswerType` for a question — the same mapping `toSurveyAnswer`
 * applies, so a saved answer and its recorded entry agree on type.
 */
export function answerTypeFor(question: FlowQuestion): SurveyAnswer["answerType"] {
  if (question.type === "multi_select") return "char-list";
  if (question.type === "bool") return "boolean";
  if (question.type === "select" || question.type === "radio") return "select";
  return "text";
}

export function toSurveyAnswer(
  questionId: string,
  question: FlowQuestion,
  value: string | string[] | undefined,
): SurveyAnswer | null {
  if (value === undefined) return null;
  if (question.type === "multi_select") {
    return {
      questionId,
      answerType: "char-list",
      value: Array.isArray(value) ? value : [value],
    };
  }
  if (question.type === "bool") {
    const strVal = typeof value === "string" ? value : "";
    return {
      questionId,
      answerType: "boolean",
      value: strVal === "true",
    };
  }
  if (question.type === "select" || question.type === "radio") {
    const strVal = typeof value === "string" ? value : "";
    if (strVal === "") return null;
    return { questionId, answerType: "select", value: strVal };
  }
  if (question.type === "notice") return null;
  // text, short_text, autocomplete
  const strVal = typeof value === "string" ? value : "";
  return { questionId, answerType: "text", value: strVal };
}

// ---------------------------------------------------------------------------
// Seeds: what a question arrives pre-filled with
// ---------------------------------------------------------------------------

/** The contracts proposal-source union, for pass-through of lookup sources. */
const PROPOSAL_SOURCES: ReadonlySet<string> = new Set([
  "langtags",
  "cldr",
  "corpus",
  "axis-fill",
  "base",
  "identity",
  "region",
  "derived-from-axis",
  "analysis",
]);

/** The decision record behind a question's first provided decision, if any. */
export function recordForQuestion(questionId: string) {
  const mod = questionRegistry[questionId];
  const decisionId = mod?.provides?.[0];
  if (decisionId === undefined) return undefined;
  return useDecisionStore.getState().decisions[decisionId];
}

/**
 * Spec 092 (T031, FR-003): decision records are a flow's first seed source. A
 * record the extraction pass seeded (provenance extracted / default) IS the
 * question's seed — value from the record, source label from the record — so a
 * converted step needs no per-step seed callbacks at all.
 */
export function recordProposal(questionId: string): SeedProposal | undefined {
  let record = recordForQuestion(questionId);
  if (record === undefined) {
    // Spec 092 (G-9): a gate that opens only after setup — e.g.
    // pf_more_detail_gate answered "Yes" during the Phase F step itself —
    // can make a module's extract/lookup default applicable only now.
    // The setup pass skipped it (gated off against the pre-pass set, the
    // demo runner's semantics); re-running the idempotent pass here,
    // at question-push time, materialises its record so the seed and
    // its caption arrive exactly as if the gate had been open at setup.
    const mod = questionRegistry[questionId];
    if (mod !== undefined && (mod.extract !== undefined || mod.lookupDefault !== undefined)) {
      try {
        runLiveExtractionFromStores();
      } catch (err) {
        devLog.error(
          "[live-extraction] question-push pass re-run failed:",
          err instanceof Error ? err.message : String(err),
        );
      }
      record = recordForQuestion(questionId);
    }
  }
  if (record === undefined) return undefined;
  if (record.provenance !== "extracted" && record.provenance !== "default") {
    return undefined;
  }
  const value = record.value;
  if (typeof value !== "string" && !Array.isArray(value)) return undefined;
  // The record's free-form source names a keyboard id for extractions,
  // which the contracts proposal-source union does not carry; the label
  // rides the caption channel instead. Lookup sources that ARE in the
  // union ("langtags", "identity", "base", "analysis", …) pass through
  // so the committed answer's record keeps naming them.
  const source = record.source;
  return source !== undefined && PROPOSAL_SOURCES.has(source)
    ? { value, source: source as DecisionProposalSource }
    : { value };
}

/**
 * The seed for a question, as the proposal its entry carries: the decision
 * record first, then the caller's seed callbacks. Only a caller seed is a
 * proposal: a debug pin is a test convenience, not something the studio
 * suggested.
 */
export function seedProposal(
  questionId: string,
  getSeedValue: ((questionId: string) => string | string[] | undefined) | undefined,
  getSeedSource: ((questionId: string) => DecisionProposalSource | undefined) | undefined,
): SeedProposal | undefined {
  const fromRecord = recordProposal(questionId);
  if (fromRecord !== undefined) return fromRecord;
  const value = getSeedValue?.(questionId);
  if (value === undefined) return undefined;
  const source = getSeedSource?.(questionId);
  return source !== undefined ? { value, source } : { value };
}

// ---------------------------------------------------------------------------
// What a walk publishes and returns
// ---------------------------------------------------------------------------

/**
 * Every answer the walk holds, saved as given (spec 079 FR-001): the field's
 * raw value — the shape `buildResumeStack` replays — with the type it will be
 * recorded as. Each question is its own screen (screenId = question id), and
 * no SurveyRunner answer depends on an earlier step's evidence. `liveValues`
 * is the value of every entry, the one being edited included.
 */
export function buildSavedAnswers(
  stack: readonly AnswerStackEntry[],
  liveValues: readonly (string | string[] | undefined)[],
  index: ReadonlyMap<string, FlowQuestion>,
): Record<string, Omit<SavedAnswer, "savedAt">> {
  const saved: Record<string, Omit<SavedAnswer, "savedAt">> = {};
  stack.forEach((entry, i) => {
    const value = liveValues[i];
    // Only answered entries: an undefined value carries no information a
    // replay could use, and storing it would make `buildResumeStack` treat an
    // untouched question as deliberately blank.
    if (value === undefined) return;
    const q = index.get(entry.questionId);
    // A pre-filled answer is the studio's proposal until the author changes
    // it; only an answer that was never pre-filled is the author's outright.
    const proposal = entry.proposal;
    saved[entry.questionId] = {
      value,
      answerType: q !== undefined ? answerTypeFor(q) : "text",
      origin:
        proposal === undefined
          ? "confirmed"
          : answersDiffer(proposal.value, value)
            ? "overturned"
            : "proposed",
      ...(proposal !== undefined ? { proposal } : {}),
      stage: "draft",
      evidenceKey: null,
      screenId: entry.questionId,
    };
  });
  return saved;
}

/**
 * Publish a walk to the answer store: the step's saved answers (replacing the
 * set, so a tail a changed answer invalidated is dropped) and, when the walk is
 * on a question, its position. The decision recorder reads both at completion.
 */
export function publishSavedAnswers(
  stepId: string,
  saved: Record<string, Omit<SavedAnswer, "savedAt">>,
  position: string | null,
): void {
  const answers = useSurveyAnswerStore.getState();
  answers.setStepAnswers(stepId, saved);
  if (position !== null) answers.setPosition(stepId, position);
}

/**
 * The step result a finished walk hands to `onComplete`. The CURRENT entry is
 * excluded from `earlier`: its answer is appended from `committedValue`.
 * Including it there too would duplicate the final answer whenever the entry
 * already carries a value (a seeded or resumed final question). `earlier` is
 * the entries up to, not including, the cursor: entries after the cursor are
 * the walk the author has since backed out of, and must not contribute answers
 * to a result they are no longer part of.
 */
export function assembleFlowResult(
  flow: Pick<FlowDef, "phase">,
  earlier: readonly AnswerStackEntry[],
  index: ReadonlyMap<string, FlowQuestion>,
  current: { questionId: string; question: FlowQuestion },
  committedValue: string | string[] | undefined,
): SurveyPhaseResult {
  const answers: SurveyAnswer[] = [];
  for (const entry of earlier) {
    if (entry.value === undefined) continue;
    const q = index.get(entry.questionId);
    if (q === undefined) continue;
    const answer = toSurveyAnswer(entry.questionId, q, entry.value);
    if (answer !== null) answers.push(answer);
  }
  // Include the current answer too
  if (committedValue !== undefined) {
    const answer = toSurveyAnswer(current.questionId, current.question, committedValue);
    if (answer !== null) answers.push(answer);
  }
  const phase = flow.phase as SurveyPhaseResult["phase"];
  return { phase, answers };
}

// ---------------------------------------------------------------------------
// The flow's index and the Continue gate
// ---------------------------------------------------------------------------

/**
 * A flow's questions (the provenance questions included), by id, and the first
 * one a runner renders (the first that is not engine-resolved).
 */
export function indexFlow(flow: Pick<FlowDef, "questions" | "provenance_questions">): {
  all: FlowQuestion[];
  index: Map<string, FlowQuestion>;
  firstId: string | null;
} {
  const all = [...flow.questions, ...(flow.provenance_questions ?? [])];
  const index = new Map<string, FlowQuestion>();
  for (const q of all) index.set(q.id, q);
  const first = all.find((q) => q.engine_resolved !== true);
  return { all, index, firstId: first === undefined ? null : first.id };
}

// Basic structural check (local@domain.tld), not RFC 5322 — good enough to
// catch "forgot the @" / pasted-the-wrong-thing without rejecting anything a
// real address could look like.
const EMAIL_FORMAT_RE = /^[^s@]+@[^s@]+.[^s@]+$/;

/**
 * Does `v` satisfy `format`? Blank always passes here — required/hasValue
 * already gates blank separately, so an optional format-checked field stays
 * skippable rather than becoming implicitly required.
 */
export function hasValidFormat(v: string | string[] | undefined, format: FlowQuestion["format"]): boolean {
  if (format === undefined) return true;
  const s = typeof v === "string" ? v.trim() : Array.isArray(v) ? v.join("").trim() : "";
  if (s === "") return true;
  if (format === "email") return EMAIL_FORMAT_RE.test(s);
  return true;
}

/**
 * Whether Continue is enabled for `question` showing `value`: a notice always
 * is; any other question needs a value when required, and a valid format.
 * `question` is the one the field renders (dynamic options and a required
 * override already applied).
 */
export function canAdvanceFrom(question: FlowQuestion, value: string | string[] | undefined): boolean {
  return (
    question.type === "notice" ||
    ((!question.required || hasValue(value)) && hasValidFormat(value, question.format))
  );
}

// ---------------------------------------------------------------------------
// Routing: conditions, next question, engine-resolved skipping
// ---------------------------------------------------------------------------

/**
 * Evaluate a YAML condition string against the current answer value and context.
 *
 * Supported patterns (drawn from actual YAML content):
 *   value == 'x'
 *   value != 'x'
 *   ctx.field == 'x'
 *   ctx.field != 'x'
 *   <expr> or <expr>
 *   <expr> and <expr>
 */
export function evalCondition(
  condition: string,
  value: string | string[] | undefined,
  ctx: SurveyContext,
): boolean {
  const strVal = typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : "";
  return (
    evalConditionGrammar(
      condition,
      (lhs) => (lhs === "value" ? strVal : ctx[lhs.slice(4)] ?? ""),
      false,
    ) === true
  );
}

// ---------------------------------------------------------------------------
// Next-question resolver
// ---------------------------------------------------------------------------

export function resolveNext(
  question: FlowQuestion,
  value: string | string[] | undefined,
  ctx: SurveyContext,
): string | null {
  const { next } = question;
  if (next === undefined || next === null) return null;
  if (typeof next === "string") return next;

  for (const rule of next as FlowGotoRule[]) {
    if (rule.condition !== undefined) {
      if (evalCondition(rule.condition, value, ctx)) return rule.goto;
    } else {
      // default branch
      return rule.goto;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// advanceThrough — moved before SurveyRunner so it is in scope for render-time
// isLastQuestion computation (Fix 2). Function declarations are hoisted in JS
// but TypeScript strict mode may flag use-before-declaration, so we keep the
// definition here.
// ---------------------------------------------------------------------------

/**
 * Resolve the next question id starting from `currentQ`, skipping over any
 * `engine_resolved` nodes by following their routing rules with the given context.
 * Returns null when the flow has ended.
 *
 * A Set<string> visited guard prevents an infinite loop if a YAML author
 * creates a cycle (A→B→A, both engine_resolved).
 */
export function advanceThrough(
  currentQ: FlowQuestion,
  value: string | string[] | undefined,
  ctx: SurveyContext,
  index: Map<string, FlowQuestion>,
  getNextOverride?: (questionId: string, value: string | string[] | undefined) => string | undefined,
): string | null {
  const visited = new Set<string>();
  // Dynamic-next override (spec 030 US3): lets the caller route based on
  // resolved-entry state that no static `next`/condition can express — e.g. send
  // il_language_code to il_language_region only when the picked language is
  // region-ambiguous. Evaluated at render from the current value, so it does not
  // depend on onAnswerCommit ordering. Returns undefined ⇒ use the static next.
  const overridden = getNextOverride?.(currentQ.id, value);
  let nextId =
    overridden !== undefined && overridden !== ""
      ? overridden
      : resolveNext(currentQ, value, ctx);
  while (nextId !== null) {
    const next = index.get(nextId);
    if (next === undefined) {
      devLog.error("SurveyRunner: unresolved goto target", nextId);
      return null;
    }
    if (next.engine_resolved !== true) return nextId;
    if (visited.has(nextId)) {
      devLog.error("SurveyRunner: cycle detected in engine_resolved chain", nextId);
      return null;
    }
    visited.add(nextId);
    nextId = resolveNext(next, undefined, ctx);
  }
  return null;
}

