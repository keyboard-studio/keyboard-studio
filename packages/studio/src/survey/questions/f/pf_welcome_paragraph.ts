// Per-question module: pf_welcome_paragraph (Phase F)
// Ported verbatim from content/flows/phase_f_helpdocs.yaml.

import type { QuestionModule, ValidationResult } from "../../types.ts";

export const definition = {
  id: "pf_welcome_paragraph",
  // spec 079 T038: FlowQuestion.prompt is a static string — this module has
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
  // unchanged (spec 079 FR-009). An adaptation WITH a usable base description
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
// Adaptive description proposal (spec 079 FR-009, US4, §3c propose-then-confirm)
// ---------------------------------------------------------------------------

// spec 079 FR-009: the adaptive prefill / conditional-required rule
// (`prefill`, `requiredWhen`, `AdaptiveDescriptionContext`) lives in
// lib/adaptiveDescription.ts — it needs the engine's
// extractUsableBaseDescription, and question modules stay engine-free so the
// standalone content-i18n extractor can load them. flowStepOptions.tsx's
// phaseFOptions applies it to this question at seed time.

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
