// Per-question module: iso_code (Phase A)
// Ported verbatim from content/flows/phase_a_identity.yaml.
//
// required: false — user may leave blank if unsure.
// No validate(): the YAML implies no client-side gating on an autocomplete
// with options_source. The autocomplete widget enforces selection from a list;
// free-text shape-validation would be redundant and is not implied by the YAML.

import type { QuestionModule, MutateContext } from "../../types.ts";
import type { KeyboardIR } from "@keyboard-studio/contracts";

import { irPath } from "@keyboard-studio/contracts";

export const definition = {
  id: "iso_code",
  prompt: "Does your language have a three-letter language code?",
  help_text:
    "Language codes are short tags used by linguists to identify languages " +
    "uniquely, for example: bfd for Bafut, swa for Swahili. " +
    "Search the list to find yours. Leave blank if you are unsure.",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639",
  required: false,
  next: "region",
} satisfies import("../../types.ts").FlowQuestion;

// No validate() — optional autocomplete; the widget enforces valid selection.

export const fixtures: QuestionModule["fixtures"] = {
  valid: [
    { value: "bfd", note: "ISO 639-3 code for Bafut" },
    { value: "swa", note: "ISO 639-3 code for Swahili" },
    { value: undefined, note: "blank is explicitly allowed (required: false)" },
    { value: "", note: "empty string is acceptable for optional question" },
  ],
  invalid: [],
};


/** Normalize the answer to a single trimmed lowercase language subtag. */
function asLangSubtag(value: string | string[] | undefined): string {
  const raw =
    typeof value === "string"
      ? value
      : Array.isArray(value)
        ? value[0] ?? ""
        : "";
  return raw.trim().toLowerCase();
}

/**
 * Write the BCP-47 language subtag (the language part of `header.bcp47`) —
 * spec-014 FR-006b. Scoped to the declared `writes` path `header.bcp47`.
 *
 * Preserves any script subtag already present on the current first tag (set by
 * `primary_script`): given a current tag like `xx-Latn` and answer `swa`, the
 * result is `swa-Latn`. An empty/blank answer is a no-op (M5) — this question
 * is optional (`required: false`).
 */
export function mutate(
  value: string | string[] | undefined,
  ctx: MutateContext,
): Partial<KeyboardIR> {
  const lang = asLangSubtag(value);
  if (lang === "") return {};

  const current = ctx.ir.header.bcp47[0];
  // Carry over the existing script/variant subtags (everything after the lang).
  const rest = current !== undefined && current.includes("-")
    ? current.slice(current.indexOf("-"))
    : "";
  return { header: { bcp47: [`${lang}${rest}`] } as KeyboardIR["header"] };
}

const mod: QuestionModule = {
  definition,
  mutate,
  fixtures,
  inputs: [],
  writes: [irPath("header", "bcp47")],
};
export default mod;
