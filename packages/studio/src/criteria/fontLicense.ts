// Font-license attestation path (spec 084 Batch 5) — criteria 9.1/9.2.
//
//   9.1  KM_LINT_FONT_LICENSE_EMPTY     — <<kps font license not empty>>
//   9.2  KM_LINT_FONT_LICENSE_NOT_OPEN  — <<kps font license is open>>
//
// Neither code has a lint producer, and none can: the corpus .kps has
// NO per-font license field (verified across the triage corpus), so
// there is nothing for a check to read. The honest form is a per-font
// AUTHOR ATTESTATION in criteriaRecordStore — for each bundled font
// the author asserts the license and (for 9.2) confirms it is open:
//
//   no fonts bundled           → Not applicable (§9 predicate)
//   fonts + all attested       → Met (evidence names the attestation)
//   fonts + any unattested     → Needs human (authored AND foreign) —
//                                deliberately NOT Not yet checkable:
//                                the input exists and is named; in
//                                authored mode the author records it
//                                on this page, in foreign mode no one
//                                can record it for someone else's
//                                keyboard, which is a human's call.
//
// That is also why the two codes are NOT in IMPLEMENTED_LINT_CODES
// and NOT in ASSEMBLY_SYNTHESIZED_CODES: no check and no synthesis
// emits them. They resolve here, through the record path — the
// exclusion is documented in implementedChecks.ts and the triage doc.
//
// A LICENSE.md scan for open-license strings (licenseTextHints) is
// shown as SUPPORTING evidence on 9.2 only. It never decides the row:
// a LICENSE.md that says "OFL" does not prove THIS font is the one
// it covers.

import type { Criterion } from "@keyboard-studio/contracts";

import type { CriteriaInput, ResolvedRow } from "./criteriaTypes.ts";

export const FONT_LICENSE_EMPTY_CODE = "KM_LINT_FONT_LICENSE_EMPTY";
export const FONT_LICENSE_NOT_OPEN_CODE = "KM_LINT_FONT_LICENSE_NOT_OPEN";

/** The codes resolved through the record path (named for tests + docs). */
export const FONT_LICENSE_CODES: ReadonlySet<string> = new Set([
  FONT_LICENSE_EMPTY_CODE,
  FONT_LICENSE_NOT_OPEN_CODE,
]);

/**
 * Open-license family mentions in a LICENSE.md text, as supporting
 * evidence hints: canonical short names, deduplicated, in a stable
 * order. Detection is substring-based on the standard names.
 */
export function licenseTextHints(text: string | undefined): string[] {
  if (text === undefined || text === "") return [];
  const hints: string[] = [];
  const mention = (label: string, pattern: RegExp): void => {
    if (pattern.test(text)) hints.push(label);
  };
  mention("SIL Open Font License (OFL)", /open font license|\bOFL\b/i);
  mention("GNU General Public License (GPL)", /general public license|\bGPL\b/i);
  mention("Creative Commons (CC)", /creative commons/i);
  mention("MIT License", /\bMIT License\b/i);
  mention("Apache License", /apache license/i);
  return hints;
}

/**
 * Resolve a §9 font-license row, or return null when `lintRuleId` is
 * not one of the two font-license codes (or when no font inventory
 * exists — §9's applicability predicate has already run by then in
 * the resolver, so an empty inventory here means the facts did not
 * carry one and the row falls through honestly).
 */
export function resolveFontLicenseRow(
  criterion: Criterion,
  lintRuleId: string,
  input: CriteriaInput,
): ResolvedRow | null {
  if (!FONT_LICENSE_CODES.has(lintRuleId)) return null;
  const bundledFonts = input.facts.bundledFonts ?? [];
  if (bundledFonts.length === 0) return null;

  const attestations = input.record.fontLicenseAttestations ?? {};
  const isOpenRow = lintRuleId === FONT_LICENSE_NOT_OPEN_CODE;
  const attestedFor = (font: string): boolean => {
    const a = attestations[font];
    if (a === undefined) return false;
    return isOpenRow ? a.openConfirmed : a.license.trim() !== "";
  };
  const unattested = bundledFonts.filter((f) => !attestedFor(f));
  const controls = input.mode === "authored" ? "font-attest" : null;
  const fontLicense = { bundledFonts, attestations };

  if (unattested.length === 0) {
    const lines = bundledFonts.map((f) => {
      const a = attestations[f]!;
      return isOpenRow
        ? `${f}: the author attests the license "${a.license}" and confirms it is an open license (recorded ${a.at}).`
        : `${f}: the author attests the license "${a.license}" (recorded ${a.at}).`;
    });
    if (isOpenRow && (input.licenseTextHints?.length ?? 0) > 0) {
      lines.push(
        `Supporting evidence: the package's LICENSE.md mentions ${input.licenseTextHints!.join(", ")}.`,
      );
    }
    return {
      criterion,
      status: "met",
      controls,
      fontLicense,
      evidence: () => ({ kind: "attested", lines, lintRuleId }),
    };
  }

  const lines = [
    isOpenRow
      ? `No open-license attestation is recorded for: ${unattested.join(", ")}.`
      : `No license attestation is recorded for: ${unattested.join(", ")}.`,
    input.mode === "authored"
      ? "Record each bundled font's license in the attestation editor below — the package format carries no per-font license field to check instead."
      : "A compared keyboard's font licenses cannot be attested here; whether they are recorded is a human's call.",
  ];
  if (isOpenRow && (input.licenseTextHints?.length ?? 0) > 0) {
    lines.push(
      `Supporting evidence only: the package's LICENSE.md mentions ${input.licenseTextHints!.join(", ")} — a mention does not attest any particular font.`,
    );
  }
  return {
    criterion,
    status: "needs-human",
    controls,
    fontLicense,
    evidence: () => ({ kind: "needs-human", lines, lintRuleId }),
  };
}
