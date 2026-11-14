// dialects — the langtags variant and `-x-` tagsets for one language
// (spec 115 R3, data-model.md § DialectTagset). Pure lookups over the
// generated rows; the raw data is exported as-is for the chooser.

import type { DialectTagset } from "@keyboard-studio/contracts";
import { dialects } from "./generated/dialects.js";
import { canonicalLanguage } from "./minimalTag.js";

/** Every langtags dialect tagset of a language, in tag order. */
export function dialectTagsetsFor(language: string): readonly DialectTagset[] {
  const key = canonicalLanguage(language.trim());
  return dialects.filter((row) => row.language === key);
}
