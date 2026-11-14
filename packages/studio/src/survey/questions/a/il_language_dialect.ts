// Per-question module: il_language_dialect (identity-lite)
//
// CONDITIONAL question (spec 115 US2): shown when the language was reached
// through a search match that carries a dialect — a Glottolog dialect, a
// registered-variant description, a langtags tagset, or the Customize
// panel's dialect field — and NOT merely because the language has
// registered variants (French, English, German gain no new screen).
// IdentityLite reaches it via IdentityLite's getNextOverride
// (il_target_script -> il_language_dialect); when nothing carries a
// dialect the static next is used and this question never appears.
//
// The question shows the dialect the match implies as a confirmable
// proposal (spec 115 FR-008's preference order: registered variant, then
// the langtags tagset, then a private-use subtag made from the name), with
// Edit and "No dialect" alongside. Confirming writes the dialect subtag
// plus its source and the dialect's Glottocode (rendererWrites); the
// composed tag then carries exactly one <Language> (FR-018).
//
// optional (required: false) — the author may skip or answer "No dialect";
// the flow then composes the tag without a dialect subtag.

import type { QuestionModule, ValidationResult } from "../../types.ts";
import { proposeDialect, validateDialectSubtag } from "../../dialectProposal.ts";

export const definition = {
  id: "il_language_dialect",
  prompt: "Which dialect is this keyboard for?",
  // CONTENT REVIEW (Article VI): this help text is survey text owned by the
  // content team.
  help_text:
    "A tag names a dialect only when your keyboard is for one variety of the " +
    "language. Confirm the dialect we found, type a different one, or choose " +
    "\"No dialect\" — the tag then has no dialect subtag. Skip if you are unsure.",
  type: "autocomplete" as const,
  required: false,
  next: [],
} satisfies import("../../types.ts").FlowQuestion;

// A blank answer is allowed (no dialect); a non-blank one must be a
// well-formed dialect subtag — a registered variant or a private-use tail.
function validate(value: string | string[] | undefined): ValidationResult {
  const text = (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  if (text === "") return { ok: true };
  const check = validateDialectSubtag(text);
  if (check.ok) return { ok: true };
  return {
    ok: false,
    code: "invalid_dialect_subtag",
    message: `"${text}" is not a valid dialect subtag (${check.reason}). Use a subtag like "gascon" or "x-rabinal".`,
  };
}

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "gascon", note: "a registered variant (Occitan → oc-gascon)" },
    { value: "x-rabinal", note: "a langtags private-use dialect (Achi → acr-x-rabinal)" },
    { value: "x-yabekolo", note: "a private-use subtag made from the name (Ewondo → ewo-x-yabekolo)" },
    { value: undefined, note: "blank is allowed (required: false) — no dialect subtag" },
    { value: "", note: "empty string is acceptable for an optional question" },
  ],
  invalid: [
    { value: "gas con", expectedCode: "invalid_dialect_subtag", note: "a subtag may not contain a space" },
    { value: "gheg", expectedCode: "invalid_dialect_subtag", note: "too short to be a variant (needs 5-8 characters)" },
    { value: "x-", expectedCode: "invalid_dialect_subtag", note: "a private-use tail may not be empty" },
  ],
};

// Output reach (spec 059 FR-016): `writes` stays `[]` — this question writes no
// KeyboardIR — while `outputs` states that the answer nevertheless reaches an
// emitted artifact. Here, the answer contributes the dialect subtag to the
// composed tag the descriptor declares.
const mod: QuestionModule = {
  definition,
  fixtures,
  validate,
  // The proposal comes from the search match the language was reached
  // through (ctx.identity.searchMatch), the language, its script, and its
  // region. Nothing is proposed until the langtags module has loaded.
  lookupDefault: (ctx) => {
    const identity = ctx.identity;
    if (identity === undefined || identity.languageCode === undefined || identity.languageCode === "") {
      return undefined;
    }
    const proposal = proposeDialect(
      {
        language: identity.languageCode,
        ...(identity.targetScript !== undefined && identity.targetScript !== ""
          ? { script: identity.targetScript }
          : {}),
        ...(identity.languageRegion !== undefined && identity.languageRegion !== ""
          ? { region: identity.languageRegion }
          : {}),
      },
      identity.searchMatch ?? null,
    );
    return proposal === null
      ? undefined
      : { value: proposal.subtag, source: "langtags" };
  },
  inputs: [],
  writes: [],
  outputs: [{ target: "package-descriptor", field: "bcp47" }],
  specRef: "specs/115-dialect-language-tags",
  // Decision spike (km/decisions-spike).
  provides: ["language-dialect", "language-dialect-source", "dialect-glottocode"],
  requires: ["language-code", "target-script", "language-region"],
  // The renderer records the proposal's source and the dialect's Glottolog
  // code alongside the answer (LanguageChooser.enterDialectMode precedent):
  // those two records are renderer-owned, never seeded by a default.
  rendererWrites: ["language-dialect-source", "dialect-glottocode"],
};
export default mod;
