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

import { useState, useId, useMemo } from "react";
import type { FlowDef, FlowQuestion, FlowGotoRule, SurveyContext, AnswerStackEntry } from "./types.ts";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding } from "@keyboard-studio/contracts";
import { QuestionField } from "./QuestionField.tsx";

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
function evalCondition(
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

function resolveNext(
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
  // text, short_text, autocomplete, notice
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
// SurveyRunner component
// ---------------------------------------------------------------------------

export interface SurveyRunnerProps {
  flow: FlowDef;
  context?: SurveyContext;
  onComplete: (result: SurveyPhaseResult) => void;
  onBack?: () => void;
  findings?: LintFinding[];
}

export function SurveyRunner({
  flow,
  context = {},
  onComplete,
  onBack,
  findings = [],
}: SurveyRunnerProps) {
  // Derive flow-level constants once per flow identity change.
  // findFirstRenderable receives context but does not read it (params are
  // underscore-prefixed), so keying on [flow] alone is correct.
  const { allQuestions, index, firstId, approxTotal } = useMemo(() => {
    const all = [...flow.questions, ...(flow.provenance_questions ?? [])];
    const idx = buildIndex(all);
    return {
      allQuestions: all,
      index: idx,
      firstId: findFirstRenderable(all, idx, context),
      approxTotal: all.filter((q) => q.engine_resolved !== true).length,
    };
  }, [flow]);

  const [stack, setStack] = useState<AnswerStackEntry[]>([
    { questionId: firstId ?? "", value: undefined },
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

  function handleNext() {
    if (currentQ === undefined) return;
    const value = currentValue ?? currentEntry?.value;

    // Build the next question id, resolving engine_resolved nodes silently
    const nextId = advanceThrough(currentQ, value, context, index);

    if (nextId === null) {
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

    // Save current value onto the current stack entry, then push the next
    setStack((prev) => {
      const updated = prev.map((e, i) =>
        i === prev.length - 1 ? { ...e, value } : e,
      );
      return [...updated, { questionId: nextId, value: undefined }];
    });
    setCurrentValue(undefined);
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

  const value = currentValue ?? currentEntry?.value;
  const isNotice = displayQ.type === "notice";
  const canAdvance = isNotice || !displayQ.required || hasValue(value);

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

      {/* Question */}
      <QuestionField
        question={displayQ}
        value={value}
        onChange={(v) => setCurrentValue(v)}
        findings={findings}
      />

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {canGoBack && (
          <button
            type="button"
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
          {displayQ.next === null || displayQ.next === undefined
            ? "Finish"
            : "Next"}
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

/**
 * Resolve the next question id starting from `currentQ`, skipping over any
 * `engine_resolved` nodes by following their routing rules with the given context.
 * Returns null when the flow has ended.
 */
function advanceThrough(
  currentQ: FlowQuestion,
  value: string | string[] | undefined,
  ctx: SurveyContext,
  index: Map<string, FlowQuestion>,
): string | null {
  let nextId = resolveNext(currentQ, value, ctx);
  while (nextId !== null) {
    const next = index.get(nextId);
    if (next === undefined) {
      console.error("SurveyRunner: unresolved goto target", nextId);
      return null;
    }
    if (next.engine_resolved !== true) return nextId;
    // Skip engine_resolved: evaluate its routing without a user value
    nextId = resolveNext(next, undefined, ctx);
  }
  return null;
}
