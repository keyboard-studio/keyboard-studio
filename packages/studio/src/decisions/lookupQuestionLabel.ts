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

import type { I18n } from "@lingui/core";
import { resolveContentString } from "../lib/contentI18n.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { FlowQuestion } from "../survey/types.ts";

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
    if (source === undefined) return undefined;

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
