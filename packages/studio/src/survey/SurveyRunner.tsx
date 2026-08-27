// Generic paged survey runner.
// Accepts a FlowDef + SurveyContext, maintains an answer stack, drives goto
// routing, and calls onComplete with a SurveyPhaseResult when the flow ends.
//
// Routing rules:
//   - engine_resolved questions are skipped (the runner evaluates their next
//     rules without rendering them).
//   - "notice" questions advance automatically on Next without needing a value.
//   - goto chains are evaluated top-to-bottom; the first matching condition wins.
//   - Conditions support: value == 'x', ctx.field == 'x', value != 'x',
//     ctx.field != 'x', "or" (space-separated "or" tokens), "and" tokens.
//     Full boolean DSL is out of scope — these cover the actual YAML content.

import { devLog } from "@keyboard-studio/contracts/dev-log";
import { useState, useId, useMemo, useRef, useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import type { FlowDef, FlowQuestion, FlowOption, FlowGotoRule, SurveyContext, AnswerStackEntry } from "./types.ts";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding, LangtagsProvenance, LanguageSummary } from "@keyboard-studio/contracts";
import { QuestionField } from "./QuestionField.tsx";
import { debugPinsStore } from "../stores/debugPinsStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import {
  useStepWalkStore,
  peekStepCursor,
  peekAnswerDraft,
  type AnswerDraft,
} from "../stores/stepWalkStore.ts";
import type { StepWalkPositions } from "../lib/stepWalk.ts";
import {
  secondaryButton,
  primaryButton,
  surveyCard,
  FONT,
  TEXT_MAIN,
  TEXT_DIM,
  ACCENT,
  BORDER,
  CHIP_GLYPH_ACCENT,
  CHECKED_CHIP_BG,
} from "./surveyStyles.ts";
import { CSS_TEXT_SUBTLE } from "../ui/theme.ts";
import { handleEnterToAdvance } from "./enterToAdvance.ts";
import { WARNING } from "../ui/theme.ts";

// ---------------------------------------------------------------------------
// Condition evaluator
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

  // Split on " or " (lowest precedence) — any sub-clause matching means true
  const orClauses = condition.split(" or ");
  if (orClauses.length > 1) {
    return orClauses.some((c) => evalCondition(c.trim(), value, ctx));
  }

  // Split on " and " — all sub-clauses must match
  const andClauses = condition.split(" and ");
  if (andClauses.length > 1) {
    return andClauses.every((c) => evalCondition(c.trim(), value, ctx));
  }

  const eq = condition.match(/^(value|ctx\.\w+)\s*==\s*'([^']*)'$/);
  if (eq !== null) {
    // lhs is guaranteed by the regex capture group — non-null assertion is safe
    const lhs = eq[1]!;
    const rhs = eq[2]!;
    const lhsVal = lhs === "value" ? strVal : ctx[lhs.slice(4)] ?? "";
    return lhsVal === rhs;
  }

  const ne = condition.match(/^(value|ctx\.\w+)\s*!=\s*'([^']*)'$/);
  if (ne !== null) {
    // lhs is guaranteed by the regex capture group — non-null assertion is safe
    const lhs = ne[1]!;
    const rhs = ne[2]!;
    const lhsVal = lhs === "value" ? strVal : ctx[lhs.slice(4)] ?? "";
    return lhsVal !== rhs;
  }

  return false;
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
// Question index
// ---------------------------------------------------------------------------

function buildIndex(questions: FlowQuestion[]): Map<string, FlowQuestion> {
  const map = new Map<string, FlowQuestion>();
  for (const q of questions) map.set(q.id, q);
  return map;
}

// ---------------------------------------------------------------------------
// Answer -> SurveyAnswer
// ---------------------------------------------------------------------------

function toSurveyAnswer(
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
// Template interpolation
// ---------------------------------------------------------------------------
// `{{token}}` interpolation of a question's prompt/label/help_text/body and
// option labels happens in QuestionField (see its `resolveFlowText`), AFTER
// Tier-B content-i18n catalog resolution — a translated catalog value carries
// its own tokens, so only the resolved string may be interpolated. SurveyRunner
// therefore hands QuestionField the RAW question (plus any dynamic options) and
// does NOT pre-interpolate it here: doing so would redundantly process the
// English fallback and cannot see the translated string's tokens at all.

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

// ---------------------------------------------------------------------------
// SurveyRunner component
// ---------------------------------------------------------------------------

export interface SurveyRunnerProps {
  flow: FlowDef;
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findingsByQuestionId?: Record<string, LintFinding[]>;
  /**
   * Called when the user advances past a question, committing its answered value
   * to the stack. Fires synchronously inside handleNext before the new question
   * is pushed. Callers can use this to maintain a ref-based seed map for
   * getSeedValue — the synchronous call guarantees the ref is current when
   * getSeedValue is read for the very next push.
   */
  onAnswerCommit?: (questionId: string, value: string | string[] | undefined) => void;
  /**
   * Called when SurveyRunner needs a value for a question it has no COMMITTED
   * answer for. Return a seed value to pre-fill the input, or undefined to leave
   * it empty.
   *
   * "Default once, then user owns it": the seed populates the input on first
   * arrival and the author may edit it freely. Pressing Next commits the value
   * onto the walk, and a committed value is never re-seeded over — walking Back
   * and forward again restores what the author committed, NOT a fresh seed.
   *
   * (That last sentence is a deliberate change from the original behaviour, in
   * which Back truncated the walk and re-arrival always re-seeded. The bug it
   * caused: a seed sourced from state that does not survive a remount — the
   * langtags refs behind `il_language_code` and `il_target_script`, held in
   * IdentityLite refs populated only by the name picker — came back `undefined`
   * after a tab switch, so Back-then-Next silently BLANKED an answer the author
   * had already given. Preserving the committed value is what makes the walk
   * survive a remount; see `answersDiffer` for the one case that still discards.)
   */
  getSeedValue?: (questionId: string) => string | string[] | undefined;
  /**
   * Called when rendering a question to retrieve its provenance label, if any.
   * Returns a LangtagsProvenance when the question's current value was seeded
   * from langtags, or undefined when no provenance applies.
   *
   * SurveyRunner renders the provenance caption beneath the field when a
   * non-undefined provenance is returned (FR-007). The caption indicates the
   * value is a suggestion — the author can edit it freely (FR-008).
   */
  getSeedProvenance?: (questionId: string) => LangtagsProvenance | undefined;
  /**
   * Called at render with the current question id and its LIVE value (the
   * same value passed to QuestionField, including uncommitted typing — not
   * just the last committed answer) to surface a non-blocking warning caption
   * beneath the field. Return a message to show it, or undefined for none.
   *
   * Purely advisory, like getSeedProvenance's caption: it never gates Next or
   * blocks auto-advance. Introduced for il_language_code (spec discussion,
   * not yet a numbered spec item) to flag when a typed/selected code resolves
   * to a different language than the one already picked at
   * il_language_english — a mistake nothing else in the validator layers
   * catches, since Layer A' only checks bcp47 presence, not correctness.
   *
   * Takes priority over getSeedProvenance's caption when both would fire —
   * showing "this code looks wrong" is more actionable than "this was
   * suggested from langtags" for the same field at the same time.
   */
  getFieldWarning?: (questionId: string, value: string | string[] | undefined) => string | undefined;
  /**
   * Called when rendering a question to retrieve DYNAMIC datalist options — e.g.
   * the resolved langtags entry's local names for il_language_autonym (spec 030
   * US2). When it returns a non-empty array, SurveyRunner uses it as the field's
   * options (overriding any static options); the field still accepts free text.
   * Returns undefined/[] when no dynamic options apply — the field falls back to
   * its static options (or plain free text), which is the common case since most
   * languages carry no local name (T008).
   */
  getSeedOptions?: (questionId: string) => FlowOption[] | undefined;
  /**
   * Called at render to optionally override the current question's next target
   * based on state no static `next`/condition can see — e.g. routing
   * il_language_code to il_language_region only when the picked language is
   * region-ambiguous (spec 030 US3). Receives the current question id + value;
   * returns a question id to route there, or undefined to use the static next.
   * Evaluated during render (before onAnswerCommit), so it must resolve
   * synchronously from the value.
   */
  getNextOverride?: (questionId: string, value: string | string[] | undefined) => string | undefined;
  /**
   * Called by the `@langtags_names` picker when the author selects (or clears)
   * a concrete langtags entry for a question. The answer value stays the English
   * NAME; this side-channel carries which entry that name resolved to (or null
   * for unresolved free text) so the caller can seed downstream fields and
   * decide region disambiguation (spec 030 US1/US3). Fires during the field's
   * own event handling, before Next is pressed, so a ref updated here is current
   * when getNextOverride / getSeedValue run on the next render.
   */
  onEntryResolved?: (questionId: string, entry: LanguageSummary | null) => void;
  /**
   * When true, picking a concrete option from a dropdown/combobox field
   * auto-advances to the next question (no explicit Next click). Only discrete
   * selections advance; free-text typing does not. Opt-in per flow so other
   * flows keep the review-then-Next behavior. Used by the identity-lite flow.
   */
  advanceOnSelect?: boolean;
  /**
   * Minimum height (px) reserved for the question + provenance-caption block so
   * the Back/Next controls sit at a stable vertical position across questions
   * whose help text differs in length. Undefined leaves the block un-padded.
   */
  contentMinHeight?: number;
  /**
   * Answers from a previously completed run of this flow, keyed by questionId.
   * When provided, the runner rebuilds the walked stack by replaying the flow
   * with these answers and mounts on the LAST reachable question (values
   * restored) instead of question 1. Used when back-navigation re-enters a
   * step whose flow already completed — Back then walks the replayed stack
   * question by question, exactly as if the author had just finished it.
   */
  resumeAnswers?: Readonly<Record<string, string | string[]>>;
}

export function SurveyRunner({
  flow,
  context = {},
  onComplete,
  onBack,
  findingsByQuestionId,
  onAnswerCommit,
  getSeedValue,
  getSeedProvenance,
  getFieldWarning,
  getSeedOptions,
  getNextOverride,
  onEntryResolved,
  advanceOnSelect,
  contentMinHeight,
  resumeAnswers,
}: SurveyRunnerProps) {
  const { t } = useLingui();
  // Single gate for all debug-mode behaviour — evaluated once per render so all
  // branches are driven by the same boolean, not scattered checks.
  const debugEnabled = debugPinsStore.isDebugEnabled();
  // Bump this counter to force a re-render when pin state changes (chip label/style).
  const [, setDebugPinTick] = useState(0);

  // Keep stable refs to the latest callback props so handleNext closures don't
  // need these in dep arrays and don't capture stale values.
  const onAnswerCommitRef = useRef(onAnswerCommit);
  onAnswerCommitRef.current = onAnswerCommit;
  const getSeedValueRef = useRef(getSeedValue);
  getSeedValueRef.current = getSeedValue;
  const getSeedProvenanceRef = useRef(getSeedProvenance);
  getSeedProvenanceRef.current = getSeedProvenance;
  const getFieldWarningRef = useRef(getFieldWarning);
  getFieldWarningRef.current = getFieldWarning;
  const getSeedOptionsRef = useRef(getSeedOptions);
  getSeedOptionsRef.current = getSeedOptions;
  const getNextOverrideRef = useRef(getNextOverride);
  getNextOverrideRef.current = getNextOverride;
  const onEntryResolvedRef = useRef(onEntryResolved);
  onEntryResolvedRef.current = onEntryResolved;

  // Derive flow-level constants once per flow identity change.
  // context is intentionally excluded from the deps array: findFirstRenderable
  // ignores it (underscore-prefixed params), so keying on [flow] alone is correct.
  const { index, firstId, approxTotal } = useMemo(() => {
    const all = [...flow.questions, ...(flow.provenance_questions ?? [])];
    const idx = buildIndex(all);
    return {
      index: idx,
      firstId: findFirstRenderable(all, idx, context),
      approxTotal: all.filter((q) => q.engine_resolved !== true).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow]);

  // Callers must provide key={flow.flow_id} so React remounts this component
  // when the flow identity changes — useState does not re-run its initialiser on re-renders.
  // For the first question, check both getSeedValue (caller) and debugPinsStore (fallback).
  const firstSeed: string | string[] | undefined = (() => {
    if (firstId === null) return undefined;
    const callerFirst = getSeedValue?.(firstId);
    if (callerFirst !== undefined) return callerFirst;
    return debugEnabled ? debugPinsStore.getPinned(firstId) : undefined;
  })();
  // The step this runner is the walk for. Read from the traversal store rather
  // than threaded through five call sites (FlowStepHost, IdentityLite, PhaseA,
  // PhaseB) as a prop: a runner is only ever rendered INSIDE the active step, so
  // `activeStepId` is that step by construction, and a prop would be a second
  // way to say the same thing that could disagree.
  const walkStepId = useSurveySessionStore((s) => s.activeStepId);
  const publishStepWalk = useStepWalkStore((s) => s.publishStepWalk);
  const setStepCursor = useStepWalkStore((s) => s.setStepCursor);
  const setAnswerDraft = useStepWalkStore((s) => s.setAnswerDraft);
  const externalCursor = useStepWalkStore((s) => s.cursors[walkStepId]);

  // The walk: every question this run has visited, in order, plus WHICH ONE is
  // showing. One state object rather than two so the index can never point past
  // the array it indexes.
  //
  // `cursor` replaced "the last entry is the current one". Back used to TRUNCATE
  // (`stack.slice(0, -1)`), which threw away the committed answers of every
  // question ahead of the landing point — see getSeedValue's docstring for the
  // blanked-answer bug that caused. Moving an index instead keeps them.
  const [walk, setWalk] = useState<{ stack: AnswerStackEntry[]; cursor: number }>(() => {
    // Replay source, in precedence order:
    //   1. this step's IN-PROGRESS answers (stores/stepWalkStore.ts) — what the
    //      author has typed on this visit but not yet submitted. Highest
    //      precedence because it is the most recent thing they did, and because
    //      recovering it is the whole point: a tab switch destroys this
    //      component, and without the draft a half-answered step came back as
    //      question one with an empty form.
    //   2. `resumeAnswers` — a PRIOR COMPLETED run of this flow.
    // Merged, not chosen between: the draft may hold a revision of one question
    // while the rest of a completed run is still valid, and replaying the union
    // through the SAME `buildResumeStack` keeps one restoration path rather than
    // two that could disagree about routing.
    const draft = peekAnswerDraft(walkStepId);
    const replay =
      draft === undefined
        ? resumeAnswers
        : resumeAnswers === undefined
          ? draft
          : { ...resumeAnswers, ...draft };
    const resumed =
      replay !== undefined ? buildResumeStack(firstId, replay, context, index) : null;
    const stack = resumed ?? [{ questionId: firstId ?? "", value: firstSeed }];
    // Arrival position: honour a cursor a jump parked for this step BEFORE this
    // component existed (lib/jumpToLocation.ts writes it, see its own comment on
    // ordering). Read in the initializer, not an effect, so the first render is
    // already correct and the publishing effect below does not overwrite the
    // request with the stack's tail. A pure read, so StrictMode's double
    // invocation is harmless.
    const requested = peekStepCursor(walkStepId);
    const requestedIndex =
      requested === undefined ? -1 : stack.findIndex((e) => e.questionId === requested);
    return { stack, cursor: requestedIndex === -1 ? stack.length - 1 : requestedIndex };
  });
  const { stack, cursor } = walk;
  const [currentValue, setCurrentValue] = useState<string | string[] | undefined>(undefined);
  // Mirrors `currentValue` for the two navigation paths that must bank the
  // in-flight edit from OUTSIDE a render closure that can see it: `handleBack`
  // (called from an event handler that runs before the next render) and the
  // external-cursor effect (whose dependency list deliberately excludes the
  // value, see its own comment). Same ref-mirroring idiom the callback props
  // above use.
  const currentValueRef = useRef(currentValue);
  currentValueRef.current = currentValue;

  /**
   * A `setWalk` updater that banks the in-flight field edit onto the entry being
   * LEFT, then moves the cursor to `nextCursor(prev)`.
   *
   * Banking it is the difference between "the walk remembers what you typed" and
   * "navigating away is a discard". The original implementation discarded it —
   * and, because Back also truncated the stack, re-arrival fell back to a seed
   * that could be `undefined`, which is how an already-answered question came
   * back blank. After this there is no navigation that loses a value the author
   * entered: only SUBMITTING (Next) has consequences, and only CHANGING an
   * answer invalidates what follows it.
   */
  function bankInFlightEdit(
    nextCursor: (prev: { stack: AnswerStackEntry[]; cursor: number }) => number,
  ): (prev: { stack: AnswerStackEntry[]; cursor: number }) => {
    stack: AnswerStackEntry[];
    cursor: number;
  } {
    return (prev) => {
      const edit = currentValueRef.current;
      const stackWithEdit =
        edit === undefined
          ? prev.stack
          : prev.stack.map((e, i) => (i === prev.cursor ? { ...e, value: edit } : e));
      return { stack: stackWithEdit, cursor: nextCursor(prev) };
    };
  }

  // Auto-advance on option select (advanceOnSelect flows only): a field reports a
  // discrete selection via onSelectAdvance → requestAdvance stashes the picked
  // value and bumps this tick; the effect runs AFTER the ensuing render commit —
  // by which point synchronous onEntryResolved side-effects (e.g. IdentityLite's
  // langtags seed refs) have settled — so advance() sees the correct routing and
  // seeds. Declared here, BEFORE the early return below, so the hook call order is
  // identical on every render (rules-of-hooks).
  const pendingAdvanceValueRef = useRef<string | string[] | undefined>(undefined);
  const [advanceTick, setAdvanceTick] = useState(0);
  useEffect(() => {
    if (advanceTick === 0) return;
    advance(pendingAdvanceValueRef.current);
    pendingAdvanceValueRef.current = undefined;
    // advance is intentionally excluded: it is re-created each render and the
    // effect must run only when a new selection ticks, using the current render's
    // closure (fresh stack/currentQ). Adding it would fire on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceTick]);

  const progressDescId = useId();

  const currentEntry = stack[cursor];
  const currentQId = currentEntry?.questionId ?? "";
  const currentQ = currentQId !== "" ? index.get(currentQId) : undefined;

  // ---------------------------------------------------------------------------
  // Publish this walk (see lib/stepWalk.ts) so the footer can render one dot per
  // question instead of one per stage, and so leaving the step and coming back
  // resumes where the author was rather than at question 1.
  //
  // No labels: a question's label has exactly one resolver
  // (decisions/lookupQuestionLabel.ts) and the consumer applies it — see
  // StepWalkPosition.label.
  //
  // Declared BEFORE the "Survey complete" early return below, so hook order is
  // identical on every render (rules-of-hooks).
  // ---------------------------------------------------------------------------
  // The live value of every entry, current one included — `currentValue` holds
  // the edit in flight, which has not landed on the stack yet. Shared by the
  // positions and the answer draft below so a dot and a restored answer can
  // never disagree about what the author has typed.
  const liveValues = useMemo(
    () => stack.map((entry, i) => (i === cursor ? (currentValue ?? entry.value) : entry.value)),
    [stack, cursor, currentValue],
  );

  const positions: StepWalkPositions = useMemo(
    () => stack.map((entry, i) => ({ id: entry.questionId, done: hasValue(liveValues[i]) })),
    [stack, liveValues],
  );

  const answerDraft: AnswerDraft = useMemo(() => {
    const draft: Record<string, string | string[]> = {};
    stack.forEach((entry, i) => {
      const value = liveValues[i];
      // Only answered entries: an undefined value carries no information a
      // replay could use, and storing it would make `buildResumeStack` treat an
      // untouched question as deliberately blank.
      if (value !== undefined) draft[entry.questionId] = value;
    });
    return draft;
  }, [stack, liveValues]);

  useEffect(() => {
    publishStepWalk(walkStepId, positions);
    setAnswerDraft(walkStepId, answerDraft);
    // "" is the completed-flow sentinel (no entry to be at) — never publish it
    // as a position, or the footer would mark a stop that does not exist.
    if (currentQId !== "") setStepCursor(walkStepId, currentQId);
  }, [
    walkStepId,
    positions,
    answerDraft,
    currentQId,
    publishStepWalk,
    setAnswerDraft,
    setStepCursor,
  ]);

  // Honour a cursor written while this runner is already mounted — a footer dot
  // for another question in the step the author is CURRENTLY on. That jump
  // changes no route and no step, so nothing remounts and the arrival-position
  // read in the state initializer above never re-runs.
  useEffect(() => {
    if (externalCursor === undefined) return;
    // Already there — the common case, since the publishing effect above keeps
    // the store cursor equal to this walk's own position.
    if (stack[cursor]?.questionId === externalCursor) return;
    const target = stack.findIndex((e) => e.questionId === externalCursor);
    // Not in this walk: a stop the author has not reached in this run. Ignored
    // rather than forced — `resolveLocation` refuses such a jump upstream, so
    // reaching here at all means the walk changed underneath it.
    if (target === -1) return;
    // Decided OUTSIDE the updater, not inside it: React may run an updater during
    // a later render, so a flag set inside one is not readable on the line after
    // `setWalk`. `stack`/`cursor` come from the render this effect re-ran on,
    // which is current by construction.
    setWalk(bankInFlightEdit(() => target));
    // The banked edit belongs to the question being LEFT; the
    // `currentValue ?? currentEntry.value` fallback then shows the value of
    // wherever we landed.
    setCurrentValue(undefined);
    // Deliberately keyed on the cursor alone: adding `stack`/`cursor` would
    // re-run this on every keystroke and fight the walk's own Next/Back in the
    // window before the publishing effect above has caught up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalCursor]);

  if (currentQ === undefined || currentQId === "") {
    return (
      <div
        style={{
          padding: 32,
          color: TEXT_DIM,
          fontFamily: FONT,
        }}
      >
        <Trans id="survey.surveyRunner.complete">Survey complete.</Trans>
      </div>
    );
  }

  // Dynamic datalist options (spec 030 US2): when the caller supplies non-empty
  // options for this question (e.g. the resolved entry's local names), they
  // override the static options; the field still accepts free text. The raw
  // question is handed to QuestionField as-is — it resolves the active-locale
  // Tier-B catalog string and interpolates `{{token}}`s itself (see above).
  const dynamicOptions = getSeedOptionsRef.current?.(currentQId);
  const displayQ: FlowQuestion =
    dynamicOptions !== undefined && dynamicOptions.length > 0
      ? { ...currentQ, options: dynamicOptions }
      : currentQ;
  const stepNum = cursor + 1;

  const canGoBack = cursor > 0 || onBack !== undefined;

  const value = currentValue ?? currentEntry?.value;
  const isNotice = displayQ.type === "notice";
  const canAdvance =
    isNotice ||
    ((!displayQ.required || hasValue(value)) && hasValidFormat(value, displayQ.format));
  // Derive the next question id once so that both the button label and handleNext
  // share the same result — avoids a second advanceThrough call that would cause
  // a brief button-label flicker when value changes mid-render.
  const nextIdForCurrent = advanceThrough(currentQ, value, context, index, getNextOverrideRef.current);
  const isLastQuestion = nextIdForCurrent === null;

  // Advance past the current question with an EXPLICIT committed value. Shared by
  // the Next button (handleNext, committing the live field value) and the
  // auto-advance-on-select path (requestAdvance, committing the picked option's
  // value). Taking the value as a parameter — rather than reading `value` — lets
  // the auto-advance effect commit exactly what was selected without racing the
  // setCurrentValue re-render.
  function advance(committedValue: string | string[] | undefined) {
    if (currentQ === undefined) return;

    const nextId = advanceThrough(currentQ, committedValue, context, index, getNextOverrideRef.current);

    if (nextId === null) {
      // End of flow — build the result. The CURRENT entry is excluded from the
      // loop: its answer is appended from `committedValue` below. Including it
      // here too would duplicate the final answer whenever the entry already
      // carries a value (a seeded or resumed final question).
      //
      // `slice(0, cursor)`, not `slice(0, -1)`: entries AFTER the cursor are the
      // walk the author has since backed out of. If a revised answer routes the
      // flow to an earlier ending, those stale entries must not contribute
      // answers to a result they are no longer part of.
      const answers: SurveyAnswer[] = [];
      for (const entry of stack.slice(0, cursor)) {
        if (entry.value === undefined) continue;
        const q = index.get(entry.questionId);
        if (q === undefined) continue;
        const answer = toSurveyAnswer(entry.questionId, q, entry.value);
        if (answer !== null) answers.push(answer);
      }
      // Include the current answer too
      if (committedValue !== undefined) {
        const answer = toSurveyAnswer(currentQId, currentQ, committedValue);
        if (answer !== null) answers.push(answer);
      }
      const phase = flow.phase as SurveyPhaseResult["phase"];
      onComplete({ phase, answers });
      return;
    }

    // Notify the caller that this answer has been committed. Fires synchronously
    // before the stack update so that any ref-based seed map the caller maintains
    // (e.g. IdentityLite's autonymRef) is current when getSeedValue is called
    // for the very next push below.
    onAnswerCommitRef.current?.(currentQId, committedValue);

    // Can the walk ahead of this question be KEPT?
    //
    // Two conditions, both necessary:
    //   1. the answer just committed is unchanged from what this entry already
    //      held — a CHANGED answer invalidates everything downstream of it,
    //      including seeds derived from it (the region pick at
    //      il_language_region reseeds the autonym and script for the chosen
    //      variant, spec 030 US3), so those must be re-derived, not preserved;
    //   2. the existing next entry is for the SAME question the routing now
    //      leads to — otherwise the author has taken a different branch and the
    //      old branch's answers are not theirs to inherit.
    // When both hold, the whole tail is kept, so walking Back several questions
    // and forward again restores every answer, not just the next one.
    const previousValue = stack[cursor]?.value;
    const existingNext = stack[cursor + 1];
    const keepAhead =
      !answersDiffer(previousValue, committedValue) &&
      existingNext !== undefined &&
      existingNext.questionId === nextId;

    // Resolve a seed value for the incoming question. getSeedValue is read via
    // ref so callers can update their seed source synchronously in onAnswerCommit
    // (above) and have the updated value visible here in the same tick.
    // Caller-provided seed takes precedence; debug pin is the fallback so that
    // the "default once, then user owns it" contract is preserved. Skipped
    // entirely when the committed answer ahead is being kept — a seed must never
    // overwrite an answer the author already gave.
    const nextValue = keepAhead
      ? existingNext.value
      : (() => {
          const callerSeed = getSeedValueRef.current?.(nextId);
          return callerSeed !== undefined
            ? callerSeed
            : debugEnabled
              ? debugPinsStore.getPinned(nextId)
              : undefined;
        })();

    // Save the committed value onto the current entry, then move forward onto
    // either the preserved tail or a freshly seeded entry.
    setWalk((prev) => {
      const updated = prev.stack.map((e, i) =>
        i === prev.cursor ? { ...e, value: committedValue } : e,
      );
      const ahead = keepAhead
        ? updated.slice(prev.cursor + 1)
        : [{ questionId: nextId, value: nextValue }];
      return {
        stack: [...updated.slice(0, prev.cursor + 1), ...ahead],
        cursor: prev.cursor + 1,
      };
    });
    // Start currentValue from the incoming entry's value so the input is
    // populated immediately and Next is enabled (satisfies canAdvance for
    // required fields).
    setCurrentValue(nextValue);
  }

  function handleNext() {
    advance(value);
  }

  // Field → survey signal that a discrete option was picked (see the auto-advance
  // hook block above the early return). Stashes the value and bumps the tick that
  // drives the advance effect.
  function requestAdvance(picked: string | string[]) {
    setCurrentValue(picked);
    pendingAdvanceValueRef.current = picked;
    setAdvanceTick((n) => n + 1);
  }

  function handleBack() {
    if (cursor <= 0) {
      onBack?.();
      return;
    }
    // Move the cursor; do NOT truncate. The questions ahead keep their answers,
    // so walking forward again restores them (see `advance`'s `keepAhead`).
    setWalk(bankInFlightEdit((prev) => prev.cursor - 1));
    // Show the value of the question we're going back to, via the
    // `currentValue ?? currentEntry.value` fallback rather than a second read of
    // the same entry.
    setCurrentValue(undefined);
  }

  // Enter-to-advance (issue #536): the single keyboard-driven "do the obvious
  // thing" handler for this runner, attached once at the container so every
  // question type gets it for free — no per-field wiring, no second timer. The
  // guard logic is the shared `handleEnterToAdvance` helper, wired here with the
  // two container-only behaviours turned on:
  //
  //   - `multiline`: a genuinely multiline field (<textarea>) treats plain Enter
  //     as "advance" (native newline suppressed); Shift+Enter still inserts a
  //     newline.
  //   - `deferIfDefaultPrevented`: the langtags/options combobox (QuestionField's
  //     StyledCombobox) owns Enter when a row is highlighted — it calls
  //     preventDefault() itself (before this handler runs, since it fires on the
  //     bubble path from the focused input), so we stand down. When nothing is
  //     highlighted the combobox does NOT preventDefault, so Enter with
  //     unresolved free text still submits the step.
  //
  // Back/Next buttons are covered by the helper's default BUTTON skip.
  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    handleEnterToAdvance(e, {
      advance: () => {
        if (canAdvance) handleNext();
      },
      multiline: true,
      deferIfDefaultPrevented: true,
    });
  }

  return (
    /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions --
       the bubbled keydown only ADDS a keyboard capability (Enter-to-advance
       convenience); every control inside the form remains independently
       keyboard-operable, and the container is not made pointer-interactive. */
    <div
      role="form"
      aria-label={t({ id: "survey.surveyRunner.formAriaLabel", message: `Survey phase ${{ phase: flow.phase }}` })}
      onKeyDown={handleContainerKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
        color: TEXT_MAIN,
      }}
    >
      {/* Progress indicator */}
      <div
        id={progressDescId}
        aria-label={t({
          id: "survey.surveyRunner.progressAriaLabel",
          message: `Step ${{ stepNum }} of approximately ${{ approxTotal }}`,
        })}
        style={{
          fontSize: 12,
          color: CSS_TEXT_SUBTLE,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 22,
        }}
      >
        <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
          <Trans id="survey.surveyRunner.progressLabel">Step {stepNum} of ~{approxTotal}</Trans>
        </span>
        <div
          aria-hidden="true"
          style={{
            flex: 1,
            height: 4,
            background: BORDER,
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (stepNum / approxTotal) * 100)}%`,
              background: ACCENT,
              borderRadius: 2,
              transition: "width 200ms ease",
            }}
          />
        </div>
      </div>

      {/* Debug pin chip — only rendered when debug mode is active */}
      {debugEnabled && (() => {
        // Computed once per render — isPinned re-reads sessionStorage on every
        // call, and the render below previously called it six times for the
        // same questionId/tick.
        const pinned = debugPinsStore.isPinned(currentQId);
        return (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              aria-pressed={pinned}
              aria-label={
                pinned
                  ? t({
                      id: "survey.surveyRunner.debugPin.unpinAriaLabel",
                      message: `Unpin default answer for question ${{ currentQId }}`,
                    })
                  : t({
                      id: "survey.surveyRunner.debugPin.pinAriaLabel",
                      message: `Pin current answer as default for question ${{ currentQId }}`,
                    })
              }
              onClick={() => {
                if (debugPinsStore.isPinned(currentQId)) {
                  debugPinsStore.unpin(currentQId);
                } else {
                  debugPinsStore.pin(currentQId, value);
                }
                // Force a re-render so aria-pressed and label update
                setDebugPinTick((n) => n + 1);
              }}
              style={{
                padding: "3px 10px",
                background: pinned ? CHECKED_CHIP_BG : "transparent",
                border: `1px solid ${pinned ? ACCENT : BORDER}`,
                borderRadius: 12,
                color: pinned ? CHIP_GLYPH_ACCENT : TEXT_DIM,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                userSelect: "none",
              }}
            >
              {pinned ? (
                <Trans id="survey.surveyRunner.debugPin.pinnedLabel">[PIN] Pinned</Trans>
              ) : (
                <Trans id="survey.surveyRunner.debugPin.pinLabel">[+] Pin this answer</Trans>
              )}
            </button>
          </div>
        );
      })()}

      {/* Question + caption block. When contentMinHeight is set (identity-lite),
          the block reserves a fixed minimum height so the Back/Next controls
          below sit at a stable vertical position across questions whose help
          text differs in length. Wrapped in the shared surveyCard shape (epic
          #533) so the card marks only the current question, not the whole
          runner. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          ...(contentMinHeight !== undefined ? { minHeight: contentMinHeight } : {}),
          ...surveyCard,
        }}
      >
        <QuestionField
          question={displayQ}
          value={value}
          context={context}
          onChange={(v) => setCurrentValue(v)}
          onEntryResolved={(entry) => onEntryResolvedRef.current?.(currentQId, entry)}
          {...(advanceOnSelect === true ? { onSelectAdvance: requestAdvance } : {})}
          {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
        />

        {/* Field warning / provenance caption — at most one renders. The warning
            (getFieldWarning) takes priority when both apply: it is the more
            actionable message, and it recomputes on every keystroke since it
            reads the LIVE value, not just the seed. The provenance caption
            (FR-007) is purely informational and does not block or gate the
            input (FR-008); the warning is equally non-gating — it flags a
            likely mistake without preventing Next or auto-advance. Both ride
            the same aria-live region so only one is ever announced. */}
        {(() => {
          const warning = getFieldWarningRef.current?.(currentQId, value);
          if (warning !== undefined) {
            return (
              <p
                role="status"
                aria-live="polite"
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: WARNING,
                  fontStyle: "italic",
                  lineHeight: 1.5,
                }}
              >
                {warning}
              </p>
            );
          }
          const provenance = getSeedProvenanceRef.current?.(currentQId);
          if (provenance === undefined) return null;
          return (
            <p
              aria-live="polite"
              style={{
                margin: 0,
                fontSize: 12,
                color: TEXT_DIM,
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              {provenance.caption}
            </p>
          );
        })()}
      </div>

      {/* Navigation (epic #533): the primary button dims via opacity when
          disabled (rather than swapping to the disabled background/text
          colors), and sits at the row's right edge behind a flex:1 spacer —
          Back (when present) stays pinned left. */}
      {(() => {
        const nextButtonStyle: React.CSSProperties = {
          ...primaryButton(false),
          transition: "background 120ms ease",
          ...(!canAdvance ? { opacity: 0.5, cursor: "not-allowed" } : {}),
        };

        const backButtonEl = canGoBack ? (
          <button
            type="button"
            data-testid="survey-back"
            onClick={handleBack}
            className="ks-focus-ring ks-hit-target"
            style={secondaryButton}
          >
            <Trans id="survey.surveyRunner.backButton">Back</Trans>
          </button>
        ) : null;

        const nextButtonEl = (
          <button
            type="button"
            data-testid="survey-advance"
            onClick={handleNext}
            disabled={!canAdvance}
            aria-describedby={progressDescId}
            className="ks-focus-ring ks-hit-target"
            style={nextButtonStyle}
          >
            {isLastQuestion ? (
              <Trans id="survey.surveyRunner.finishButton">Finish</Trans>
            ) : (
              <Trans id="survey.surveyRunner.nextButton">Next</Trans>
            )}
          </button>
        );

        return (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 22 }}>
            {backButtonEl}
            <div aria-hidden="true" style={{ flex: 1 }} />
            {nextButtonEl}
          </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasValue(v: string | string[] | undefined): boolean {
  if (v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  return v.trim() !== "";
}

// Basic structural check (local@domain.tld), not RFC 5322 — good enough to
// catch "forgot the @" / pasted-the-wrong-thing without rejecting anything a
// real address could look like.
const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Does `v` satisfy `format`? Blank always passes here — required/hasValue
 * already gates blank separately, so an optional format-checked field stays
 * skippable rather than becoming implicitly required.
 */
function hasValidFormat(v: string | string[] | undefined, format: FlowQuestion["format"]): boolean {
  if (format === undefined) return true;
  const s = typeof v === "string" ? v.trim() : Array.isArray(v) ? v.join("").trim() : "";
  if (s === "") return true;
  if (format === "email") return EMAIL_FORMAT_RE.test(s);
  return true;
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
function answersDiffer(
  a: string | string[] | undefined,
  b: string | string[] | undefined,
): boolean {
  if (a === b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  }
  return true;
}

function findFirstRenderable(
  questions: FlowQuestion[],
  _index: Map<string, FlowQuestion>,
  _ctx: SurveyContext,
): string | null {
  for (const q of questions) {
    if (q.engine_resolved !== true) return q.id;
  }
  return null;
}

/**
 * Resume-time dynamic-branch resolver. buildResumeStack runs synchronously in
 * SurveyRunner's useState initializer — before any effect fires — so an async
 * getNextOverride authority (e.g. IdentityLite's langtags lookup, which routes
 * il_language_code → il_language_region only for region-ambiguous languages)
 * cannot resolve at replay time. Re-deriving the branch there would
 * deterministically drop the region step from a completed run.
 *
 * Instead, trust the recorded answers: a conditional edge whose target question
 * carries a recorded answer is one the original walk actually took, so follow
 * it. Non-conditional (default) edges are left to the static resolveNext path
 * inside advanceThrough. Returns undefined when no dynamic branch applies.
 */
function resumeBranchOverride(
  questionId: string,
  answers: Readonly<Record<string, string | string[]>>,
  index: Map<string, FlowQuestion>,
): string | undefined {
  const { next } = index.get(questionId) ?? {};
  if (next === undefined || next === null || typeof next === "string") return undefined;
  for (const rule of next as FlowGotoRule[]) {
    if (rule.condition !== undefined && rule.goto !== null && answers[rule.goto] !== undefined) {
      return rule.goto;
    }
  }
  return undefined;
}

/**
 * Rebuild the walked answer stack by replaying the flow with previously
 * committed answers. Walks from the first renderable question, restoring each
 * question's recorded answer and following the same goto routing the original
 * walk took. Stops ON the last reachable question — end of flow, or the first
 * required question with no recorded answer (as far as the original walk can
 * be faithfully replayed). Returns null when there is nothing to replay.
 */
export function buildResumeStack(
  firstId: string | null,
  answers: Readonly<Record<string, string | string[]>>,
  ctx: SurveyContext,
  index: Map<string, FlowQuestion>,
): AnswerStackEntry[] | null {
  if (firstId === null) return null;
  const stack: AnswerStackEntry[] = [];
  const visited = new Set<string>();
  let qId: string | null = firstId;
  while (qId !== null && !visited.has(qId)) {
    visited.add(qId);
    const q = index.get(qId);
    if (q === undefined) break;
    const value = answers[qId];
    stack.push({ questionId: qId, value });
    if (q.type !== "notice" && q.required === true && !hasValue(value)) break;
    // Dynamic branches (e.g. spec 030 US3 region step) are reconstructed from
    // the recorded answers, not re-derived via the async getNextOverride, which
    // is unavailable in this synchronous initializer.
    qId = advanceThrough(q, value, ctx, index, (id) => resumeBranchOverride(id, answers, index));
  }
  return stack.length > 0 ? stack : null;
}

