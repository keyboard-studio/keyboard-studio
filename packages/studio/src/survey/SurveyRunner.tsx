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

import { useState, useId, useMemo, useRef, useEffect } from "react";
import type { FlowDef, FlowQuestion, FlowOption, FlowGotoRule, SurveyContext, AnswerStackEntry } from "./types.ts";
import type { SurveyAnswer, SurveyPhaseResult, LintFinding, LangtagsProvenance, LanguageSummary } from "@keyboard-studio/contracts";
import { QuestionField } from "./QuestionField.tsx";
import { debugPinsStore } from "../stores/debugPinsStore.ts";
import { secondaryButton, primaryButton } from "./surveyStyles.ts";
import { handleEnterToAdvance } from "./enterToAdvance.ts";

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
  getSeedOptions,
  getNextOverride,
  onEntryResolved,
  advanceOnSelect,
  contentMinHeight,
  resumeAnswers,
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
  const getSeedProvenanceRef = useRef(getSeedProvenance);
  getSeedProvenanceRef.current = getSeedProvenance;
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
  const [stack, setStack] = useState<AnswerStackEntry[]>(() => {
    // Resume: rebuild the walked stack from a prior completed run so the
    // author lands on the flow's last question, not question 1.
    if (resumeAnswers !== undefined) {
      const resumed = buildResumeStack(firstId, resumeAnswers, context, index);
      if (resumed !== null) return resumed;
    }
    return [{ questionId: firstId ?? "", value: firstSeed }];
  });
  const [currentValue, setCurrentValue] = useState<string | string[] | undefined>(undefined);

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

  const baseDisplayQ = interpolateQuestion(currentQ, context);
  // Dynamic datalist options (spec 030 US2): when the caller supplies non-empty
  // options for this question (e.g. the resolved entry's local names), they
  // override the static options; the field still accepts free text.
  const dynamicOptions = getSeedOptionsRef.current?.(currentQId);
  const displayQ: FlowQuestion =
    dynamicOptions !== undefined && dynamicOptions.length > 0
      ? { ...baseDisplayQ, options: dynamicOptions }
      : baseDisplayQ;
  const stepNum = stack.length;

  const canGoBack = stack.length > 1 || onBack !== undefined;

  const value = currentValue ?? currentEntry?.value;
  const isNotice = displayQ.type === "notice";
  const canAdvance = isNotice || !displayQ.required || hasValue(value);
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
      // End of flow — build the result. The current (last) entry is excluded
      // from the loop: its answer is appended from `committedValue` below.
      // Including it here too would duplicate the final answer whenever the last
      // entry already carries a value (a seeded or resumed final question).
      const answers: SurveyAnswer[] = [];
      for (const entry of stack.slice(0, -1)) {
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

    // Resolve a seed value for the incoming question. getSeedValue is read via
    // ref so callers can update their seed source synchronously in onAnswerCommit
    // (above) and have the updated value visible here in the same tick.
    // Caller-provided seed takes precedence; debug pin is the fallback so that
    // the "default once, then user owns it" contract is preserved.
    const callerSeed = getSeedValueRef.current?.(nextId);
    const seedValue =
      callerSeed !== undefined
        ? callerSeed
        : debugEnabled
          ? debugPinsStore.getPinned(nextId)
          : undefined;

    // Save committed value onto the current stack entry, then push the next.
    // The new entry starts with the seed value (may be undefined) so the
    // question's input is pre-filled when the user first arrives.
    setStack((prev) => {
      const updated = prev.map((e, i) =>
        i === prev.length - 1 ? { ...e, value: committedValue } : e,
      );
      return [...updated, { questionId: nextId, value: seedValue }];
    });
    // If there is a seed, start currentValue from it so the input is populated
    // immediately and Next is enabled (satisfies canAdvance for required fields).
    setCurrentValue(seedValue);
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
    if (stack.length <= 1) {
      onBack?.();
      return;
    }
    setStack((prev) => prev.slice(0, -1));
    // Restore the value of the question we're going back to
    const prevEntry = stack[stack.length - 2];
    setCurrentValue(prevEntry?.value);
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
    <div
      role="form"
      aria-label={`Survey phase ${flow.phase}`}
      onKeyDown={handleContainerKeyDown}
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
            }}
          >
            <button
              type="button"
              aria-pressed={pinned}
              aria-label={
                pinned
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
                background: pinned ? "#2d3748" : "transparent",
                border: `1px solid ${pinned ? "#6ea8fe" : "#484f58"}`,
                borderRadius: 12,
                color: pinned ? "#6ea8fe" : "#8b949e",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "inherit",
                userSelect: "none",
              }}
            >
              {pinned ? "[PIN] Pinned" : "[+] Pin this answer"}
            </button>
          </div>
        );
      })()}

      {/* Question + caption block. When contentMinHeight is set (identity-lite),
          the block reserves a fixed minimum height so the Back/Next controls
          below sit at a stable vertical position across questions whose help
          text differs in length. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          ...(contentMinHeight !== undefined ? { minHeight: contentMinHeight } : {}),
        }}
      >
        <QuestionField
          question={displayQ}
          value={value}
          onChange={(v) => setCurrentValue(v)}
          onEntryResolved={(entry) => onEntryResolvedRef.current?.(currentQId, entry)}
          {...(advanceOnSelect === true ? { onSelectAdvance: requestAdvance } : {})}
          {...(findingsByQuestionId !== undefined ? { findingsByQuestionId } : {})}
        />

        {/* Provenance caption — only rendered when the current question was seeded
            from langtags (FR-007). The aria-live region announces the caption to
            screen readers when it appears. The caption is purely informational;
            it does not block or gate the input (FR-008). */}
        {(() => {
          const provenance = getSeedProvenanceRef.current?.(currentQId);
          if (provenance === undefined) return null;
          return (
            <p
              aria-live="polite"
              style={{
                margin: 0,
                fontSize: 12,
                color: "#8b949e",
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
            >
              {provenance.caption}
            </p>
          );
        })()}
      </div>

      {/* Navigation */}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {canGoBack && (
          <button
            type="button"
            data-testid="survey-back"
            onClick={handleBack}
            className="ks-focus-ring ks-hit-target"
            style={secondaryButton}
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
          className="ks-focus-ring ks-hit-target"
          style={{ ...primaryButton(!canAdvance), transition: "background 120ms ease" }}
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

