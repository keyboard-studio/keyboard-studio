// Checks 1.10b / 2.7 — the KPJ pair (spec 084, Matthew's ruling B,
// 2026-10-14: structural form, the numeric version pin dropped).
//
// One reader (the engine's parseKpjForm, whose facts cross into this
// package via CriteriaLintInput — see contracts' KpjFormFacts) feeds
// two findings:
//
//   1.10b KM_LINT_KPJ_FORMAT_OUTDATED — the judged .kpj is in the
//         legacy project-file form: no <Options><Version> format
//         marker, its project driven by the <Files> list. Modern =
//         the marker is present (upstream: the element is implicit
//         in the legacy form and required from format 2.0 onward).
//         The loader carries an imported .kpj forward as-is and
//         never regenerates it, so an adaptation that starts from a
//         legacy base ships a legacy .kpj unless it is migrated —
//         docs/criteria.md §1.10: older formats should be migrated
//         when the keyboard is touched.
//
//   2.7   KM_LINT_KPJ_VERSION_BUMPED — the judged .kpj's format-
//         marker state differs from the base keyboard's: the marker
//         was added, removed, or its value changed by the adaptation.
//         The <Version> element is the project-FILE format version,
//         not the keyboard version (docs/criteria.md §2.7, from the
//         upstream review record), and the scaffolder's carry-
//         forward never touches it — any difference is the finding.
//         The comparison is state-to-state, never against a pinned
//         constant (the constant is what ruling B removed: 1.10's
//         "10.0" is the .kvks header version and occurs in no .kpj).
//
// Absence honesty: facts that are not there produce no findings —
// the assembly names the missing input in contextMissing instead
// (no .kpj in the judged VFS for 1.10b; no base .kpj for 2.7, which
// is every foreign judgment), so those rows resolve Not yet
// checkable rather than passing on an unrun comparison. A legacy
// base carried forward UNCHANGED is exactly the split the criteria
// intend: 1.10b fires (the form is stale) and 2.7 passes (nothing
// was bumped).

import type { KpjFormFacts, LintFinding } from "@keyboard-studio/contracts";
import { criteriaFinding } from "./_shared.js";

/** Plain-language name of one file's format-marker state, for messages. */
function markerState(facts: KpjFormFacts): string {
  return facts.versionElement === null
    ? "no <Options><Version> marker (legacy implicit form)"
    : `<Options><Version>${facts.versionElement}</Version>`;
}

/** 1.10b — the judged .kpj is in the legacy project-file form → finding. */
export function checkKpjFormatAdapted(
  kpj: KpjFormFacts | undefined,
  kpjPath: string,
): LintFinding[] {
  if (kpj === undefined) return [];
  if (kpj.form === "modern") return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPJ_FORMAT_OUTDATED",
      file: kpjPath,
      message:
        "This keyboard's .kpj is in the legacy project-file form: it has no <Options><Version> format marker and its project is driven by its <Files> list.",
      hint: "Migrate the .kpj to the current Options-based form (declare the format with an <Options><Version> element) when the keyboard is next touched; the scaffolder carries an imported .kpj forward as-is and never regenerates it.",
    }),
  ];
}

/** 2.7 — the judged .kpj's format-marker state differs from the base's → finding. */
export function checkKpjVersionNotBumped(
  kpj: KpjFormFacts | undefined,
  baseKpj: KpjFormFacts | undefined,
  kpjPath: string,
): LintFinding[] {
  if (kpj === undefined || baseKpj === undefined) return [];
  if (kpj.versionElement === baseKpj.versionElement) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_KPJ_VERSION_BUMPED",
      file: kpjPath,
      message: `The .kpj format marker changed during adaptation: the base keyboard has ${markerState(baseKpj)}, this keyboard has ${markerState(kpj)}.`,
      hint: "The .kpj <Version> element is the project-file format version, not the keyboard version — carry the base keyboard's marker forward unchanged.",
    }),
  ];
}
