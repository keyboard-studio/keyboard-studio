// Check 12.4 — KM_LINT_REGION_001_TAG (spec 084 Batch 1).
//
// Region subtag `001` (the UN M.49 "world" region) must never appear in
// a BCP47 tag — the criterion has no exception clause. Sources: the
// parsed tags of the judged keyboard (IR header.bcp47 plus the .kps
// language list, both handed to the caller). `001` is only ever valid
// as a region subtag, so any occurrence past the primary language
// subtag is a region use.

import type { LintFinding } from "@keyboard-studio/contracts";
import { criteriaFinding, kmnPath } from "./_shared.js";

/** True when a BCP47 tag uses region subtag 001. */
export function tagUsesRegion001(tag: string): boolean {
  const subtags = tag.split("-");
  return subtags.slice(1).some((s) => s === "001");
}

/** 12.4 — any judged tag using region 001 → one finding naming them. */
export function checkRegion001(
  tags: readonly string[],
  keyboardId: string,
): LintFinding[] {
  const offenders = [...new Set(tags.filter(tagUsesRegion001))];
  if (offenders.length === 0) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_REGION_001_TAG",
      file: kmnPath(keyboardId),
      message: `BCP47 tag(s) use region code 001: ${offenders.join(", ")}.`,
      hint: 'Replace region 001 ("world") with the specific region the keyboard targets, or drop the region subtag.',
    }),
  ];
}
