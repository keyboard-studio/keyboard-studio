// Check 15.3 — KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING (spec 084 Batch 1).
//
// When a deprecation is in play, the legacy package ID must be listed
// in the new keyboard's .kps Related packages as Deprecated:
// `<RelatedPackage ID="…" Relationship="deprecates"/>`. The deciding
// state is inside the judged bundle itself — its own .kps text — so
// this is decidable here (verified against real corpus .kps files:
// sil_euro_latin, sil_cameroon_qwerty). What it proves is that a
// deprecation linkage exists; that the named ID is the *correct*
// legacy keyboard is not bundle-decidable and is not claimed.
//
// Gating: the check fires only when the caller states a deprecation is
// in play (CriteriaLintInput.deprecationInPlay, mirroring the
// resolver's §15 applicability gate — when not deprecated, §15 already
// resolves Not applicable and this check stays silent).

import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/**
 * The legacy package IDs a .kps lists as deprecated: every
 * `<RelatedPackage>` element whose Relationship attribute is
 * "deprecates" (attribute order in the element is irrelevant).
 */
export function deprecatedRelatedPackageIds(kpsText: string): string[] {
  const ids: string[] = [];
  for (const m of kpsText.matchAll(/<RelatedPackage\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/Relationship\s*=\s*"deprecates"/i.test(tag)) continue;
    const id = /ID\s*=\s*"([^"]+)"/i.exec(tag)?.[1];
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

/** 15.3 — deprecation in play but no legacy package listed as deprecated → finding. */
export function checkDeprecatedKpsLinkage(
  kpsText: string | undefined,
  deprecationInPlay: boolean,
  kpsPath: string,
): CheckResult {
  if (!deprecationInPlay)
    return checkPassed("KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING", [
      "No deprecation in play: linkage check is moot.",
    ]);
  const ids = kpsText === undefined ? [] : deprecatedRelatedPackageIds(kpsText);
  if (ids.length > 0)
    return checkPassed("KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING", [
      `Deprecated package(s) linked: ${ids.join(", ")}.`,
    ]);
  return checkFailed("KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING", [
    criteriaFinding({
      code: "KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING",
      file: kpsPath,
      message:
        'This keyboard deprecates a legacy keyboard, but its .kps Related packages list no package with Relationship="deprecates".',
      hint: 'Add a <RelatedPackage ID="<legacy package id>" Relationship="deprecates"/> entry to the .kps.',
    }),
  ]);
}
