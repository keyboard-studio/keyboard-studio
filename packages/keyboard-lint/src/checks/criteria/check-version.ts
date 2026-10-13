// Checks 2.3 / 2.4 / 2.5 — the shared &KEYBOARDVERSION validator
// (spec 084 Batch 1, triage: one validator, three criterion outcomes).
//
//   2.3 KM_LINT_VERSION_FORMAT       — dot-separated, entirely numeric
//   2.4 KM_LINT_VERSION_LEADING_ZERO — no component has a leading zero
//   2.5 KM_LINT_VERSION_V_PREFIX     — no `v` prefix, no non-numeric labels
//
// Source: IR header.version (the &KEYBOARDVERSION store as parsed from
// the judged .kmn). An absent/empty version yields no findings from any
// of the three: a missing version is judged by the version-match checks
// (3.6/7.1), and a format verdict on a value that is not there would be
// a guess. `v1.02` fails all three, each for its own stated reason.

import type { KeyboardIR, LintFinding } from "@keyboard-studio/contracts";
import { criteriaFinding, kmnPath } from "./_shared.js";

const NUMERIC = /^\d+$/;

function versionOf(ir: KeyboardIR): string {
  return ir.header.version.trim();
}

/** 2.3 — the version is dot-separated and entirely numeric. */
export function checkVersionFormat(ir: KeyboardIR): LintFinding[] {
  const version = versionOf(ir);
  if (version === "") return [];
  const components = version.split(".");
  if (components.every((c) => NUMERIC.test(c))) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_VERSION_FORMAT",
      file: kmnPath(ir.header.keyboardId),
      message: `Keyboard version "${version}" is not dot-separated and entirely numeric.`,
      hint: 'Use a version of dot-separated numbers only, e.g. "1.0" or "2.10.3".',
    }),
  ];
}

/** 2.4 — no version component has a leading zero. */
export function checkVersionLeadingZero(ir: KeyboardIR): LintFinding[] {
  const version = versionOf(ir);
  if (version === "") return [];
  const offenders = version
    .split(".")
    .filter((c) => NUMERIC.test(c) && c.length > 1 && c.startsWith("0"));
  if (offenders.length === 0) return [];
  return [
    criteriaFinding({
      code: "KM_LINT_VERSION_LEADING_ZERO",
      file: kmnPath(ir.header.keyboardId),
      message: `Keyboard version "${version}" has component(s) with a leading zero: ${offenders.join(", ")}.`,
      hint: 'Remove the leading zero from each version component ("01" → "1").',
    }),
  ];
}

/** 2.5 — the version has no `v` prefix and no non-numeric labels. */
export function checkVersionVPrefix(ir: KeyboardIR): LintFinding[] {
  const version = versionOf(ir);
  if (version === "") return [];
  const hasVPrefix = /^v/i.test(version);
  const labels = version.split(".").filter((c) => !NUMERIC.test(c));
  if (!hasVPrefix && labels.length === 0) return [];
  const reasons = [
    ...(hasVPrefix ? ['it starts with a "v" prefix'] : []),
    ...(labels.length > 0
      ? [`component(s) ${labels.join(", ")} are not numeric labels`]
      : []),
  ];
  return [
    criteriaFinding({
      code: "KM_LINT_VERSION_V_PREFIX",
      file: kmnPath(ir.header.keyboardId),
      message: `Keyboard version "${version}" is not a plain numeric version: ${reasons.join(" and ")}.`,
      hint: 'Drop any "v" prefix and any suffix labels ("-beta", "rc1") from the version.',
    }),
  ];
}
