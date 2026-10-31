// Check 7.20 — KM_LINT_TOUCH_LAYOUT_FONT_MISMATCH (spec 084 Batch 1).
//
// The same font must be selected for the phone and tablet touch
// layouts. Source: TouchLayoutIR.platforms[].font. The check compares
// only when BOTH platforms declare a font — a platform with no font
// declared makes no selection to disagree with, and a keyboard with no
// tablet (or no phone) platform has nothing to mismatch.

import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** 7.20 — phone and tablet declare different fonts → finding. */
export function checkTouchLayoutFontMismatch(
  touchLayout: TouchLayoutIR,
  touchLayoutPath: string,
): CheckResult {
  const code = "KM_LINT_TOUCH_LAYOUT_FONT_MISMATCH";
  const phone = touchLayout.platforms.find((p) => p.id === "phone");
  const tablet = touchLayout.platforms.find((p) => p.id === "tablet");
  if (phone?.font === undefined || tablet?.font === undefined)
    return checkPassed(code, [
      `Moot: phone font ${phone?.font === undefined ? "undeclared" : `"${phone.font}"`}, tablet font ${tablet?.font === undefined ? "undeclared" : `"${tablet.font}"`} — no selection to disagree with.`,
    ]);
  if (phone.font === tablet.font)
    return checkPassed(code, [
      `Phone and tablet both use "${phone.font}".`,
    ]);
  return checkFailed(code, [
    criteriaFinding({
      code: "KM_LINT_TOUCH_LAYOUT_FONT_MISMATCH",
      file: touchLayoutPath,
      message: `Touch layout font differs between platforms: phone uses "${phone.font}" but tablet uses "${tablet.font}".`,
      hint: "Select the same font for the phone and tablet layouts.",
    }),
  ]);
}
