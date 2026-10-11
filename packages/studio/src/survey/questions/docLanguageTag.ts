// Shared validation for the "another language" pickers (pf_doc_language_other,
// pf_doc_language_second_other). The langtags picker commits a canonical bare
// language subtag ("fr", "es", "zh"); a typed value may carry script/region
// subtags ("zh-Hans", "es-419"). Either way the answer must be a well-formed
// BCP 47 tag, because it becomes the help page's `lang` attribute. Blank is
// allowed: Phase F's only required question is pf_welcome_paragraph, and a
// blank picker just leaves that language out.

import type { ValidationResult } from "../types.ts";

const BCP47_SHAPE = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/i;

export function validateDocLanguageTag(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length === 0) {
    return { ok: true };
  }
  if (!BCP47_SHAPE.test(v)) {
    return {
      ok: false,
      code: "invalid_tag",
      message: "Please pick a language from the list.",
    };
  }
  return { ok: true };
}
