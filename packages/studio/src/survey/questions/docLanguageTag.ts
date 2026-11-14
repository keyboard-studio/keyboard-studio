// Shared validation for the "another language" pickers (pf_doc_language_other,
// pf_doc_language_second_other). The langtags picker commits a canonical bare
// language subtag ("fr", "es", "zh"); a typed value may carry script/region
// subtags ("zh-Hans", "es-419"). Either way the answer must be a well-formed
// BCP 47 tag, because it becomes the help page's `lang` attribute. Blank is
// allowed: Phase F's only required question is pf_welcome_paragraph, and a
// blank picker just leaves that language out.

import { isWellFormedBcp47 } from "@keyboard-studio/contracts";
import type { ValidationResult } from "../types.ts";


// A picked or typed language leads with a 2-3 letter ISO 639 subtag; a longer
// registered-language shape (e.g. a spelled-out name) is rejected here.
export function validateDocLanguageTag(
  value: string | string[] | undefined,
): ValidationResult {
  const v = typeof value === "string" ? value.trim() : "";
  if (v.length === 0) {
    return { ok: true };
  }
  if (!isWellFormedBcp47(v) || !/^[a-z]{2,3}(-|$)/i.test(v)) {
    return {
      ok: false,
      code: "invalid_tag",
      message: "Please pick a language from the list.",
    };
  }
  return { ok: true };
}
