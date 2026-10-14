// Checks 12.4 / 10.6 — BCP47 region-subtag checks (spec 084 Batch 1
// and the 10.6 catch-up).
//
// Region subtag `001` (the UN M.49 "world" region) must never appear in
// a BCP47 tag — the criterion has no exception clause. Sources: the
// parsed tags of the judged keyboard (IR header.bcp47 plus the .kps
// language list, both handed to the caller). `001` is only ever valid
// as a region subtag, so any occurrence past the primary language
// subtag is a region use.
//
// 10.6 is the wider rule for the .kps-declared tags: ANY 3-digit M.49
// region subtag present is flagged (the criterion is the flag itself —
// "should not accidentally use"). A 3-digit subtag past the primary
// language subtag can only be a region (scripts are 4 alpha chars,
// variants are 5+ or digit-led alphanumeric), so the same scan
// position applies.

import type { LintFinding } from "@keyboard-studio/contracts";
import { criteriaFinding, kmnPath } from "./_shared.js";

/** True when a BCP47 tag uses region subtag 001. */
export function tagUsesRegion001(tag: string): boolean {
  const subtags = tag.split("-");
  return subtags.slice(1).some((s) => s === "001");
}

/** The tag's region subtag (alpha-2 or 3-digit M.49), when present. */
export function regionSubtagOf(tag: string): string | undefined {
  const subtags = tag.split("-");
  for (const s of subtags.slice(1)) {
    if (/^[A-Za-z]{2}$/.test(s) || /^[0-9]{3}$/.test(s)) return s;
    // A 4-alpha script subtag precedes the region; keep scanning.
    if (/^[A-Za-z]{4}$/.test(s)) continue;
    // Anything else (variants, extensions) means no region precedes it.
    return undefined;
  }
  return undefined;
}

/** True when a BCP47 tag uses a 3-digit M.49 region subtag. */
export function tagUsesNumericRegion(tag: string): boolean {
  const region = regionSubtagOf(tag);
  return region !== undefined && /^[0-9]{3}$/.test(region);
}

/** 10.6 — any judged tag using a 3-digit region subtag → one finding naming them. */
export function checkNumericRegionTag(
  tags: readonly string[],
  keyboardId: string,
): LintFinding[] {
  const offenders = [...new Set(tags.filter(tagUsesNumericRegion))];
  if (offenders.length === 0) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPS_NUMERIC_REGION_TAG",
      file: kmnPath(keyboardId),
      message: `BCP47 tag(s) use a 3-digit (M.49) region subtag: ${offenders.join(", ")}.`,
      hint: "Use the ISO alpha-2 region code instead of the numeric M.49 code, unless the numeric region is deliberate.",
    }),
  ];
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
