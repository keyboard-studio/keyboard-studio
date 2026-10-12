// lookupQuestionLabel — production resolver for the `HeadlineDeps.lookupQuestionLabel`
// seam declared in headline.ts (specs/055-legible-decision-trail
// contracts/headline-spec.contract.md §1; contracts/catalog-audit-label.contract.md).
//
// Resolution order (FR-009): `audit_label` -> `prompt` -> `undefined`, both
// resolved through the SAME `resolveContentString("flowQuestions", id, field,
// englishValue, i18n)` seam QuestionField.tsx already uses for these two
// fields. No second per-question label store is introduced here: the English
// seed values come from the existing flow-question module registry
// (`definition.audit_label` / `definition.prompt`) — the same source
// utilities/i18n-content-extract/extract.ts's `extractFlowQuestionStrings`
// reads from when it builds the catalog `resolveContentString` looks up
// against.

import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { resolveContentString } from "../lib/contentI18n.ts";
import { decisionIndex, questionRegistry } from "../survey/questions/registry.ts";
import type { FlowQuestion } from "../survey/types.ts";
import type { DecisionId } from "./decisionTypes.ts";

/**
 * The two prose fields this module ever reads off a flow-question definition
 * — a narrow view of `FlowQuestion` rather than the whole definition.
 */
export type QuestionLabelSource = Pick<FlowQuestion, "prompt" | "audit_label">;

/**
 * Injection seam for the flow-question source. Defaults to reading the real
 * question registry (production); tests supply a stub so they don't depend on
 * which questions happen to declare an `audit_label` today (sparse, and still
 * being authored — spec 055 task T016).
 */
export type GetQuestionLabelSource = (questionId: string) => QuestionLabelSource | undefined;

function defaultGetQuestionLabelSource(questionId: string): QuestionLabelSource | undefined {
  const mod = questionRegistry[questionId];
  if (mod === undefined) return undefined;
  const { definition } = mod;
  return {
    ...(definition.prompt !== undefined && { prompt: definition.prompt }),
    ...(definition.audit_label !== undefined && { audit_label: definition.audit_label }),
  };
}

// The station and the question it records read the same way to the author.
const MARKS_CONTEXT_TOLERANCE_LABEL = msg({
  id: "trail.question.marksContextTolerance",
  message: "Diacritics typed as separate characters",
});

/**
 * Labels for questions an editor step records itself, which have no flow-question
 * module to read a prompt from (spec 078: the marks series' context-tolerance
 * decision). Consulted only when the registry has no entry for the id.
 */
const EDITOR_QUESTION_LABELS: Readonly<Record<string, MessageDescriptor>> = {
  // The marks series' stations — each is one screen (and one footer / Contents
  // mark) that has no flow-question module. Labels follow each station's
  // heading, shortened to a topic.
  "marks_attachment": msg({
    id: "trail.question.marksAttachment",
    message: "Which letters take each mark",
  }),
  "marks_treatment": msg({
    id: "trail.question.marksTreatment",
    message: "How marks are typed",
  }),
  "marks_output_form": msg({
    id: "trail.question.marksOutputForm",
    message: "What backspace does to an accented letter",
  }),
  "marks_stacking": msg({
    id: "trail.question.marksStacking",
    message: "Two marks on one letter",
  }),
  "marks_context_tolerance": MARKS_CONTEXT_TOLERANCE_LABEL,
  "marks.context_tolerance": MARKS_CONTEXT_TOLERANCE_LABEL,
  "marks.context_tolerance.sites": msg({
    id: "trail.question.marksContextToleranceSites",
    message: "Rules fixed for diacritics typed as separate characters",
  }),
};

/** Same trim guard the extractor uses to decide a field counts as "authored" (contract §2). */
function nonEmpty(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build the production `lookupQuestionLabel` function for {@link HeadlineDeps}
 * (the type lives in headline.ts; not re-declared here to avoid a second copy
 * of that contract). Curries `i18n` because the injected shape headline.ts
 * expects is a plain `(questionId: string) => string | undefined` with no
 * i18n parameter of its own.
 */
export function createLookupQuestionLabel(
  i18n?: I18n,
  getQuestionLabelSource: GetQuestionLabelSource = defaultGetQuestionLabelSource,
): (questionId: string) => string | undefined {
  return (questionId: string): string | undefined => {
    const source = getQuestionLabelSource(questionId);
    if (source === undefined) {
      const editorLabel = EDITOR_QUESTION_LABELS[questionId];
      if (editorLabel === undefined) return undefined;
      return i18n !== undefined ? i18n._(editorLabel) : (editorLabel.message ?? editorLabel.id);
    }

    const auditLabel = nonEmpty(source.audit_label);
    if (auditLabel !== undefined) {
      return resolveContentString("flowQuestions", questionId, "audit_label", auditLabel, i18n);
    }

    const prompt = nonEmpty(source.prompt);
    if (prompt !== undefined) {
      return resolveContentString("flowQuestions", questionId, "prompt", prompt, i18n);
    }

    return undefined;
  };
}

/**
 * Build the decision-id counterpart of {@link createLookupQuestionLabel}
 * (decisions-page enrichment).
 *
 * A `decision` payload's `decisionId` lives in the DECISION id space — a
 * module's `provides` — not in the question id space `questionRegistry`
 * is keyed by, so the lookup bridges through the registry's canonical
 * `decisionIndex` (decisionId -> providing module) and then resolves that
 * module's label through the same source seam as a question's: audit
 * label, then prompt, localized identically. Returns `undefined` when no
 * module provides the decision or the module names neither field — the
 * caller renders the FR-014 prose fallback, never the raw decisionId
 * (`recordGalleryDecisions.summarizeGalleryDecision`'s record-time
 * fallback to the raw id is exactly what this lookup exists to avoid at
 * render time).
 */
export function createLookupDecisionLabel(
  i18n?: I18n,
  getQuestionLabelSource: GetQuestionLabelSource = defaultGetQuestionLabelSource,
): (decisionId: string) => string | undefined {
  const lookupQuestionLabel = createLookupQuestionLabel(i18n, getQuestionLabelSource);
  return (decisionId: string): string | undefined => {
    const mod = decisionIndex[decisionId as DecisionId];
    if (mod === undefined) return undefined;
    return lookupQuestionLabel(mod.definition.id);
  };
}
