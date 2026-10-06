// Per-question module: il_language_english (identity-lite)
//
// FIRST question of the identity-lite flow (spec 030 US1, FR-009): the author
// finds their language by its ENGLISH name. As they type, the `@langtags_names`
// picker offers matching langtags languages; selecting one resolves a single
// entry (its script, own-language names, and code) which seeds the downstream
// steps. The answer VALUE is the English name string; the resolved entry is
// carried out-of-band via IdentityLite's onEntryResolved handler so homonyms
// (same English name, different code — e.g. "Ainu" → ain / aib) can be told
// apart at the point of selection (spec 030 US1).
//
// Free text is always accepted (FR-003/FR-013): a name that matches nothing (or
// is ambiguous and left unselected) resolves to no entry, and the flow
// continues with no pre-filled defaults (graceful degradation).
//
// Region-disambiguation branch (spec 030 US3): when the resolved entry has more
// than one region variant, the picker routes to il_language_region. That
// decision depends on the resolved entry's regionVariants — state no static
// value/ctx condition can express — so IdentityLite.getNextOverride is the
// runtime authority that fires the branch (it wins over this static `next`). The
// conditional `next` below DECLARES the edge so the Flow Map paints the branch
// and the reachability guardrail sees il_language_region; the ctx guard is never
// set on the resolveNext path, so the static fallback resolves to
// il_language_autonym.

import type { QuestionModule, ValidationResult } from "../../types.ts";
import type { ExtractContext } from "../../../decisions/extractContext.ts";

export const definition = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  audit_label: "Language name (English)",
  help_text:
    "Start typing your language's English name and pick it from the list " +
    "(for example: Hausa, Swahili, Hindi). When two languages share a name, " +
    "the list shows the region and local name so you can choose the right one. " +
    "If your language is not listed, just type its English name and continue — " +
    "free text is always accepted.",
  type: "autocomplete" as const,
  options_source: "@langtags_names" as const,
  required: true,
  next: [
    // Taken at runtime by IdentityLite.getNextOverride when the picked language
    // is region-ambiguous; declared here for the flow graph.
    { condition: "ctx.ilRegionAmbiguous == 'true'", goto: "il_language_region" },
    { default: true, goto: "il_language_autonym" },
  ],
} satisfies import("../../types.ts").FlowQuestion;

export function validate(
  value: string | string[] | undefined,
): ValidationResult {
  const trimmed = typeof value === "string"
    ? value.trim()
    : Array.isArray(value)
      ? value.join("").trim()
      : "";

  if (trimmed.length === 0) {
    return { ok: false, code: "required", message: "English language name is required." };
  }
  return { ok: true };
}

// Decision spike (km/decisions-spike): base-keyboard probe. The catalog entry
// carries language TAGS, not names, so the primary (first) tag — the same one
// il_language_code extracts — is resolved to its English name through the
// langtags dataset via ctx.resolveLanguageName (question modules may not import
// lib/). The dataset loads lazily (FR-011) and extract() is synchronous, so the
// resolver reads the already-loaded module; undefined (author is asked) when it
// has not loaded or the tag is absent. The IR's
// &NAME is the KEYBOARD's name, not the language's, so it is deliberately not
// used as a fallback. The result must pass this module's own validate().
export function extractLanguageName(ctx: ExtractContext): string | undefined {
  const tag = ctx.catalog?.languages?.[0] ?? ctx.ir?.header.bcp47[0];
  const subtag = tag?.split("-")[0]?.toLowerCase();
  if (!subtag) return undefined;
  const name = ctx.resolveLanguageName?.(subtag)?.trim();
  return name && validate(name).ok ? name : undefined;
}

// mutate: STUB — KeyboardIR mutation surface is not yet a real contract.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "Hausa", note: "resolves an unambiguous langtags entry" },
    { value: "Swahili", note: "common English name" },
    { value: "  Hindi  ", note: "leading/trailing whitespace trimmed" },
    { value: "Ainu", note: "ambiguous name — resolution comes from the picked row, not the string" },
    { value: "Nooteka", note: "free-text name absent from langtags — accepted (FR-003)" },
  ],
  invalid: [
    { value: "", expectedCode: "required" },
    { value: "   ", expectedCode: "required", note: "whitespace-only" },
    { value: undefined, expectedCode: "required" },
  ],
};

// Output reach (spec 059 FR-016): `writes` stays `[]` — this question writes no
// KeyboardIR — while `outputs` states that the answer nevertheless reaches an
// emitted artifact. Here, the English name is the `<Language>` element's display
// text.
const mod: QuestionModule = {
  definition,
  validate,
  fixtures,
  inputs: [],
  writes: [],
  outputs: [{ target: "package-descriptor", field: "languageName" }],
  specRef: "specs/030-langtags-identity-autocomplete",
  // Decision spike (km/decisions-spike): anchor of the dependency chain.
  provides: ["language-name"],
  extract: extractLanguageName,
};
export default mod;
