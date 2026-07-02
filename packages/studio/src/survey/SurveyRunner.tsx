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

import { useState, useId, useMemo, useRef } from "react";
import type { FlowDef, FlowQuestion, FlowGotoRule, SurveyContext, AnswerStackEntry } from "./types.ts";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { QuestionField } from "./QuestionField.tsx";
import { debugPinsStore } from "../stores/debugPinsStore.ts";

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

function interpolate(text: string, ctx: SurveyContext): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => ctx[key] ?? `{{${key}}}`);
}

function interpolateQuestion(q: FlowQuestion, ctx: SurveyContext): FlowQuestion {
  return {
    ...q,
    ...(q.prompt !== undefined ? { prompt: interpolate(q.prompt, ctx) } : {}),
    ...(q.help_text !== undefined ? { help_text: interpolate(q.help_text, ctx) } : {}),
    ...(q.body !== undefined ? { body: interpolate(q.body, ctx) } : {}),
    ...(q.options !== undefined ? {
      options: q.options.map((opt) => ({
        ...opt,
        label: interpolate(opt.label, ctx),
      })),
    } : {}),
  };
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
): string | null {
  const visited = new Set<string>();
  let nextId = resolveNext(currentQ, value, ctx);
  while (nextId !== null) {
    const next = index.get(nextId);
    if (next === undefined) {
      console.error("SurveyRunner: unresolved goto target", nextId);
      return null;
    }
    if (next.engine_resolved !== true) return nextId;
    if (visited.has(nextId)) {
      console.error("SurveyRunner: cycle detected in engine_resolved chain", nextId);
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
   * Called when SurveyRunner is about to push a new question onto the stack.
   * Return a seed value to pre-fill the question's input, or undefined to leave
   * the input empty. The seed is only applied the first time a question is pushed
   * (i.e., when arriving forward, not when restoring via Back — Back restores the
   * previously-saved stack entry value instead).
   *
   * "Default once, then user owns it" contract: the seed populates the input on
   * first arrival; the user can edit it freely; if the user goes Back and returns,
   * Back discards the unsaved edit so the seed fires again on re-arrival. This is
   * the expected behavior — Back is an explicit discard.
   */
  getSeedValue?: (questionId: string) => string | string[] | undefined;
}

export function SurveyRunner({
  flow,
  context = {},
  onComplete,
  onBack,
  findingsByQuestionId,
  onAnswerCommit,
  getSeedValue,
}: SurveyRunnerProps) {
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
  const [stack, setStack] = useState<AnswerStackEntry[]>([
    { questionId: firstId ?? "", value: firstSeed },
  ]);
  const [currentValue, setCurrentValue] = useState<string | string[] | undefined>(undefined);

  const progressDescId = useId();

  const currentEntry = stack[stack.length - 1];
  const currentQId = currentEntry?.questionId ?? "";
  const currentQ = currentQId !== "" ? index.get(currentQId) : undefined;

  if (currentQ === undefined || currentQId === "") {
    return (
      <div
        style={{
          padding: 32,
          color: "#8b949e",
          fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        Survey complete.
      </div>
    );
  }

  const displayQ = interpolateQuestion(currentQ, context);
  const stepNum = stack.length;

  const canGoBack = stack.length > 1 || onBack !== undefined;

  const value = currentValue ?? currentEntry?.value;
  const isNotice = displayQ.type === "notice";
  const canAdvance = isNotice || !displayQ.required || hasValue(value);
  // Derive the next question id once so that both the button label and handleNext
  // share the same result — avoids a second advanceThrough call that would cause
  // a brief button-label flicker when value changes mid-render.
  const nextIdForCurrent = advanceThrough(currentQ, value, context, index);
  const isLastQuestion = nextIdForCurrent === null;

  function handleNext() {
    if (currentQ === undefined) return;

    if (nextIdForCurrent === null) {
      // End of flow — build the result
      const answers: SurveyAnswer[] = [];
      for (const entry of stack) {
        if (entry.value === undefined) continue;
        const q = index.get(entry.questionId);
        if (q === undefined) continue;
        const answer = toSurveyAnswer(entry.questionId, q, entry.value);
        if (answer !== null) answers.push(answer);
      }
      // Include the current answer too
      if (value !== undefined) {
        const answer = toSurveyAnswer(currentQId, currentQ, value);
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
    onAnswerCommitRef.current?.(currentQId, value);

    // Resolve a seed value for the incoming question. getSeedValue is read via
    // ref so callers can update their seed source synchronously in onAnswerCommit
    // (above) and have the updated value visible here in the same tick.
    // Caller-provided seed takes precedence; debug pin is the fallback so that
    // the "default once, then user owns it" contract is preserved.
    const callerSeed = getSeedValueRef.current?.(nextIdForCurrent);
    const seedValue =
      callerSeed !== undefined
        ? callerSeed
        : debugEnabled
          ? debugPinsStore.getPinned(nextIdForCurrent)
          : undefined;

    // Save current value onto the current stack entry, then push the next.
    // The new entry starts with the seed value (may be undefined) so the
    // question's input is pre-filled when the user first arrives.
    setStack((prev) => {
      const updated = prev.map((e, i) =>
        i === prev.length - 1 ? { ...e, value } : e,
      );
      return [...updated, { questionId: nextIdForCurrent, value: seedValue }];
    });
    // If there is a seed, start currentValue from it so the input is populated
    // immediately and Next is enabled (satisfies canAdvance for required fields).
    setCurrentValue(seedValue);
  }

  function handleBack() {
    if (stack.length <= 1) {
      onBack?.();
      return;
    }
    setStack((prev) => prev.slice(0, -1));
    // Restore the value of the question we're going back to
    const prevEntry = stack[stack.length - 2];
    setCurrentValue(prevEntry?.value);
  }

  return (
    <div
      role="form"
      aria-label={`Survey phase ${flow.phase}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 24,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        color: "#e6edf3",
      }}
    >
      {/* Progress indicator */}
      <div
        id={progressDescId}
        aria-label={`Step ${stepNum} of approximately ${approxTotal}`}
        style={{
          fontSize: 12,
          color: "#8b949e",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span>Step {stepNum} of ~{approxTotal}</span>
        <div
          aria-hidden="true"
          style={{
            flex: 1,
            height: 3,
            background: "#30363d",
            borderRadius: 2,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.min(100, (stepNum / approxTotal) * 100)}%`,
              background: "#6ea8fe",
              borderRadius: 2,
              transition: "width 200ms ease",
            }}
          />
        </div>
      </div>

      {/* Debug pin chip — only rendered when debug mode is active */}
      {debugEnabled && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            type="button"
            aria-pressed={debugPinsStore.isPinned(currentQId)}
            aria-label={
              debugPinsStore.isPinned(currentQId)
                ? `Unpin default answer for question ${currentQId}`
                : `Pin current answer as default for question ${currentQId}`
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
              background: debugPinsStore.isPinned(currentQId) ? "#2d3748" : "transparent",
              border: `1px solid ${debugPinsStore.isPinned(currentQId) ? "#6ea8fe" : "#484f58"}`,
              borderRadius: 12,
              color: debugPinsStore.isPinned(currentQId) ? "#6ea8fe" : "#8b949e",
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
              userSelect: "none",
            }}
          >
            {debugPinsStore.isPinned(currentQId) ? "[PIN] Pinned" : "[+] Pin this answer"}
          </button>
        </div>
      )}

      {/* Question */}
      <QuestionField
        question={displayQ}
        value={value}
        onChange={(v) => setCurrentValue(v)}
        {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
      />

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {canGoBack && (
          <button
            type="button"
            data-testid="survey-back"
            onClick={handleBack}
            style={{
              padding: "8px 18px",
              background: "transparent",
              border: "1px solid #30363d",
              borderRadius: 6,
              color: "#8b949e",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          data-testid="survey-advance"
          onClick={handleNext}
          disabled={!canAdvance}
          aria-describedby={progressDescId}
          style={{
            padding: "8px 18px",
            background: canAdvance ? "#1f6feb" : "#161b22",
            border: "1px solid #30363d",
            borderRadius: 6,
            color: canAdvance ? "#e6edf3" : "#484f58",
            fontSize: 13,
            cursor: canAdvance ? "pointer" : "not-allowed",
            fontFamily: "inherit",
            transition: "background 120ms ease",
          }}
        >
          {isLastQuestion ? "Finish" : "Next"}
        </button>
      </div>
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

