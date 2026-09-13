// Per-question module: pf_welcome_paragraph (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { BaseDocumentationProfile } from "@keyboard-studio/contracts";
import { extractUsableBaseDescription } from "@keyboard-studio/engine";
import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pf_welcome_paragraph",
  // spec 076 T038: FlowQuestion.prompt is a static string — this module has
  // no context-dependent prompt-override channel (unlike `required`, which
  // gained one via SurveyRunner's getRequiredOverride prop for this same
  // feature; a second override channel just for prompt text was judged not
  // worth the added surface for one sentence). So this ONE prompt is worded
  // to read correctly whether or not the field arrives prefilled: the first
  // sentence is the original ask (net-new / copy / adapt-none, unfilled); the
  // second names the propose-then-confirm case (adapt-full, prefilled) without
  // being confusing when it doesn't apply.
  prompt:
    "In 1–3 sentences, what is this keyboard for? If we found a description " +
    "in the base keyboard, it's already filled in below — keep it, edit it, " +
    "or replace it.",
  audit_label: "Keyboard description",
  help_text:
    "Describe what the keyboard does and who uses it. This text appears at the " +
    "very top of the keyboard's help page, so write it in plain language that " +
    "any user can understand. Avoid technical terms. For example: \"This " +
    "keyboard lets you type Bafut (Fa') on any computer. It includes all the " +
    "tone marks and special letters used in the Bafut alphabet.\" This is the " +
    "only answer the help page really needs — everything after it is optional.",
  type: "text" as const,
  // Static default: required, unfilled. Net-new, copy (Track 1), and an
  // adaptation whose base has no usable description all keep this behavior
  // unchanged (spec 076 FR-009). An adaptation WITH a usable base description
  // waives this at RUNTIME — see `requiredWhen`/`prefill` below, applied onto
  // the live FlowQuestion by phaseFOptions.seeds in
  // editors/adapters/flowStepOptions.tsx (getSeedValue / getRequiredOverride),
  // which SurveyRunner reads via its own `getRequiredOverride` prop. This
  // static default is what a caller that supplies neither override still
  // sees — the value this module's own fixtures/tests exercise directly.
  required: true,
  next: "pf_usage_tip_1",
} satisfies import("../../types.ts").FlowQuestion;

// ---------------------------------------------------------------------------
// Adaptive description proposal (spec 076 FR-009, US4, §3c propose-then-confirm)
// ---------------------------------------------------------------------------

/**
 * The subset of live working-copy state this question's adaptive prefill
 * needs, named to match workingCopyStore's own slices 1:1 (instantiationMode,
 * baseDocProfile, baseWelcomeHtmText, baseHelpPhpText) so a caller building
 * this from store reads can pass them straight through.
 */
export interface AdaptiveDescriptionContext {
  instantiationMode: "new-from-base" | "adapt-existing" | null;
  baseDocProfile: BaseDocumentationProfile | null;
  baseWelcomeHtmText: string | null;
  baseHelpPhpText: string | null;
}

/**
 * `prefill(ctx)` — the smallest additive hook this module offers beyond the
 * locked `QuestionModule` contract (types.ts has no generic prefill/
 * conditional-required mechanism today; adding one here rather than widening
 * that shared interface keeps the change scoped to this one question). Not a
 * `QuestionModule` field — a plain named export the flow-assembly layer reads
 * directly: `phaseFOptions.seeds.getSeedValue` in
 * editors/adapters/flowStepOptions.tsx calls this (reading the four context
 * fields off `useWorkingCopyStore.getState()`) to seed `pf_welcome_paragraph`
 * when SurveyRunner asks for a value for it.
 *
 * Returns the base's usable description text ONLY on an adaptation
 * (`instantiationMode === "adapt-existing"`) whose profile reports
 * `hasUsableDescription`; `undefined` otherwise (net-new, copy/Track 1, or a
 * base classified none/minimal) — the question then behaves exactly as
 * before: required, unfilled.
 */
export function prefill(ctx: AdaptiveDescriptionContext): string | undefined {
  if (ctx.instantiationMode !== "adapt-existing") return undefined;
  if (ctx.baseDocProfile === null || !ctx.baseDocProfile.hasUsableDescription) return undefined;
  return extractUsableBaseDescription(ctx.baseWelcomeHtmText, ctx.baseHelpPhpText) ?? undefined;
}

/**
 * `requiredWhen(ctx)` — companion to `prefill` above: `false` in exactly the
 * case `prefill` proposes a value (so the author's single-action accept/edit/
 * replace is never blocked by a "required" gate on a field that already has
 * something in it), `true` otherwise. Deliberately re-derives from `prefill`
 * rather than caching its result, so the two can never disagree about which
 * case they are in.
 */
export function requiredWhen(ctx: AdaptiveDescriptionContext): boolean {
  return prefill(ctx) === undefined;
}

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const text =
    typeof value === "string"
      ? value.trim()
      : Array.isArray(value)
        ? value.join("").trim()
        : "";
  if (text.length === 0) {
    return {
      ok: false,
      code: "required",
      message: "Please write a short description of what this keyboard is for.",
    };
  }
  return { ok: true };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    {
      value:
        "This keyboard lets you type Bafut (Fa') on any computer. It includes all the tone marks and special letters used in the Bafut alphabet.",
      note: "canonical example from YAML",
    },
    {
      value: "Keyboard for typing Ewondo on Windows, macOS, and Linux.",
      note: "minimal valid description",
    },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace only" },
    { value: undefined, expectedCode: "required" },
  ],
};


const mod: QuestionModule = { definition, validate, fixtures, inputs: [], writes: [] };
export default mod;
