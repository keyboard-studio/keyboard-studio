// Checks 7.2 / 7.3 — the .kmn &TARGETS line (spec 084 Batch 1).
//
//   7.2 KM_LINT_TARGETS_ANY_NOT_ALONE        — `any` is used alone, not
//        combined with individual platform names
//   7.3 KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH — `mobile` is not targeted
//        unless a touch layout exists
//
// Source: IR header.targets (parseKmn splits &TARGETS on whitespace).
// Touch-layout existence is a VFS/IR fact the caller resolves (a parsed
// touch layout, an IR-carried touch layout, or the touch-layout file).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

function targetsOf(ir: KeyboardIR): string[] {
  return ir.header.targets.map((t) => t.toLowerCase());
}

/** 7.2 — fails iff `any` is present AND combined with other targets. */
export function checkTargetsAnyAlone(ir: KeyboardIR): CheckResult {
  const code = "KM_LINT_TARGETS_ANY_NOT_ALONE";
  const targets = targetsOf(ir);
  if (targets.length === 0)
    return checkPassed(code, ["No &TARGETS declared: nothing to combine."]);
  if (!targets.includes("any") || targets.length <= 1)
    return checkPassed(code, [
      `Targets: ${ir.header.targets.join(" ")} — "any" is alone or absent.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_TARGETS_ANY_NOT_ALONE",
      file: kmnPath(ir.header.keyboardId),
      message: `The .kmn targets line combines "any" with other platforms: ${ir.header.targets.join(" ")}.`,
      hint: 'Use "any" alone, or list the individual platforms without it.',
    }),
  ]);
}

/** 7.3 — fails iff `mobile` is targeted and no touch layout exists. */
export function checkTargetsMobileWithoutTouch(
  ir: KeyboardIR,
  hasTouchLayout: boolean,
): CheckResult {
  const code = "KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH";
  const targets = targetsOf(ir);
  if (!targets.includes("mobile"))
    return checkPassed(code, [
      `Targets: ${targets.length > 0 ? ir.header.targets.join(" ") : "(none)"} — no mobile target, so no touch layout is required.`,
    ]);
  if (hasTouchLayout)
    return checkPassed(code, [
      `Targets include mobile; a touch layout is present.`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH",
      file: kmnPath(ir.header.keyboardId),
      message:
        'The .kmn targets line includes "mobile" but the keyboard has no touch layout.',
      hint: 'Add a touch layout, or remove "mobile" from the targets line.',
    }),
  ]);
}
