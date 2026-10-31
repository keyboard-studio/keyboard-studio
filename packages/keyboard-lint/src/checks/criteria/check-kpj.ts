// Checks 1.10b / 2.7 — the .kpj project-file format version pair
// (spec 084 KPJ pair, landed under Matthew's 2026-10-14 ruling).
//
//   1.10b KM_LINT_KPJ_FORMAT_OUTDATED — <Options><Version> older than current
//   2.7   KM_LINT_KPJ_VERSION_BUMPED  — <Options><Version> newer than current
//
// One reader, one constant, two findings: together the pair pins the
// judged .kpj's format version to equality with the current format —
// older is a stale project file (1.10b), newer means the file-format
// version was bumped alongside (or ahead of) the keyboard (2.7), and
// exactly current passes both.
//
// The constant is criterion 1.10's pin, re-pinned to 2.0 by Matthew's
// ruling of 2026-10-14: the catalog previously said `version="10.0"`,
// a data defect — every .kpj in the keyboards corpus carries
// <Version>2.0</Version> (11 of 12 local files; the twelfth predates
// the element entirely), and the studio never authors the value, it
// inherits the base keyboard's .kpj verbatim.
//
// Source: the judged VFS's root <id>.kpj text, handed over raw via
// CriteriaLintInput (the same handoff as kpsText for 15.3) and read in
// the parseKpjFlags regex style. An ABSENT .kpj never reaches these
// checks — the criteria assembly names it in contextMissing so both
// rows resolve Not yet checkable, never a fabricated verdict. A
// PRESENT .kpj with no <Version> element (the pre-versioned project
// shape) is outdated by construction for 1.10b and un-bumped for 2.7.

import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** The current .kpj project-file format version (criterion 1.10's pin). */
export const KPJ_CURRENT_FORMAT_VERSION = "2.0";

const OPTIONS_BLOCK = /<Options\s*>([\s\S]*?)<\/Options\s*>/i;
const VERSION_ELEMENT = /<Version\s*>\s*([^<]*?)\s*<\/Version\s*>/i;

/**
 * Read the .kpj format version: the `<Version>` element inside
 * `<Options>` (falling back to a document-level `<Version>` when the
 * file has no Options block — `<FileVersion>` never matches, it is a
 * different element). Undefined when the file carries no format
 * version at all.
 */
export function parseKpjFormatVersion(kpjText: string): string | undefined {
  const scope = OPTIONS_BLOCK.exec(kpjText)?.[1] ?? kpjText;
  const m = VERSION_ELEMENT.exec(scope);
  if (m === null) return undefined;
  const version = (m[1] ?? "").trim();
  return version === "" ? undefined : version;
}

/**
 * Numeric dot-compare of two version strings: negative when `a` is
 * older than `b`, positive when newer, 0 when equal. Missing trailing
 * components count as 0 ("2" == "2.0"). A side with a non-numeric
 * component cannot be ordered numerically; it then compares by raw
 * string, so only an exact match reads as equal.
 */
export function compareKpjVersions(a: string, b: string): number {
  const pa = a.split(".");
  const pb = b.split(".");
  const numeric = (parts: string[]): number[] | undefined => {
    const out: number[] = [];
    for (const p of parts) {
      if (!/^\d+$/.test(p)) return undefined;
      out.push(Number(p));
    }
    return out;
  };
  const na = numeric(pa);
  const nb = numeric(pb);
  if (na === undefined || nb === undefined) {
    return a === b ? 0 : a < b ? -1 : 1;
  }
  const len = Math.max(na.length, nb.length);
  for (let i = 0; i < len; i++) {
    const diff = (na[i] ?? 0) - (nb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export interface KpjFacts {
  /** Raw .kpj text, when the file exists in the judged VFS. */
  kpjText?: string;
  /** VFS path of the judged .kpj (finding location). */
  kpjPath?: string;
}

/** 1.10b — the .kpj format version is older than the current format. */
export function checkKpjFormatOutdated(facts: KpjFacts): CheckResult {
  const code = "KM_LINT_KPJ_FORMAT_OUTDATED";
  if (facts.kpjText === undefined || facts.kpjPath === undefined)
    return checkPassed(code, ["No .kpj text supplied to check."]);
  const version = parseKpjFormatVersion(facts.kpjText);
  if (version === undefined) {
    return checkFailed(code, [
      criteriaFinding({
        code: "KM_LINT_KPJ_FORMAT_OUTDATED",
        file: facts.kpjPath,
        message:
          "The .kpj project file carries no <Options><Version> element — it predates the versioned project-file format.",
        hint: `Open the project in a current Keyman Developer so it is rewritten in the current format (<Version>${KPJ_CURRENT_FORMAT_VERSION}</Version>).`,
      }),
    ]);
  }
  if (compareKpjVersions(version, KPJ_CURRENT_FORMAT_VERSION) >= 0)
    return checkPassed(code, [
      `Format version "${version}" (current: ${KPJ_CURRENT_FORMAT_VERSION}).`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPJ_FORMAT_OUTDATED",
      file: facts.kpjPath,
      message: `The .kpj project file format version "${version}" is older than the current format "${KPJ_CURRENT_FORMAT_VERSION}".`,
      hint: `Open the project in a current Keyman Developer so it is rewritten at format version ${KPJ_CURRENT_FORMAT_VERSION}.`,
    }),
  ]);
}

/** 2.7 — the .kpj format version was bumped past the current format. */
export function checkKpjVersionBumped(facts: KpjFacts): CheckResult {
  const code = "KM_LINT_KPJ_VERSION_BUMPED";
  if (facts.kpjText === undefined || facts.kpjPath === undefined)
    return checkPassed(code, ["No .kpj text supplied to check."]);
  const version = parseKpjFormatVersion(facts.kpjText);
  if (version === undefined)
    return checkPassed(code, [
      "No <Version> element: not bumped past the current format (outdated is 1.10b's finding).",
    ]);
  if (compareKpjVersions(version, KPJ_CURRENT_FORMAT_VERSION) <= 0)
    return checkPassed(code, [
      `Format version "${version}" (current: ${KPJ_CURRENT_FORMAT_VERSION}): not bumped.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_KPJ_VERSION_BUMPED",
      file: facts.kpjPath,
      message: `The .kpj project file format version "${version}" is newer than the current format "${KPJ_CURRENT_FORMAT_VERSION}" — the file-format version must not be bumped with the keyboard version.`,
      hint: `Leave the .kpj <Options><Version> at the current file-format version (${KPJ_CURRENT_FORMAT_VERSION}); bump only the keyboard version.`,
    }),
  ]);
}
