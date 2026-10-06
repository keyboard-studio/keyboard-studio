// The studio's view of the committed corpus-harness verdicts (spec 086 US4).
//
// The full record is generated offline and lives in docs/; the studio only
// needs to know which keyboards it must never offer the normalization step for.
// That slim list is derived from the record at prebuild
// (scripts/codegen-normalization-regressed.mjs), so the SPA bundle does not
// carry the whole record.
//
// The lookup is by keyboard id. The record's source hash covers the corpus
// file as shipped, whereas the studio analyses the author's current working
// copy, so a hash comparison would almost never match; a keyboard the harness
// found regressed is treated as regressed whatever the author has since edited,
// which errs towards the spec 062 fallback.

import regressedList from "./generated/normalizationRegressed.generated.json";
import type { NormalizationVerification } from "./contextToleranceAnalysis.ts";

const REGRESSED: ReadonlySet<string> = new Set(regressedList.regressed);

/** `regressed` for a keyboard the harness found worse off with the step; otherwise `unknown`. */
export function lookupNormalizationVerification(keyboardId: string): NormalizationVerification {
  return REGRESSED.has(keyboardId) ? "regressed" : "unknown";
}
