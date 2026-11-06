// Check 7.30 — KM_LINT_SIDED_CTRL_ADVISORY (spec 114 FR-004).
//
// LCTRL / RCTRL rules are allowed; this advisory says an Alt-based placement
// is preferred. Findings carry warning severity. Rules in every group count.
// basic_* keyboards are exempt, as for the raw-Ctrl check.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";

const ALT_MODIFIERS = new Set(["ALT", "LALT", "RALT"]);
const SIDED_CTRL = new Set(["LCTRL", "RCTRL"]);

/** The `[PLANE KEY]` labels of every sided-Ctrl rule (without Alt). */
function sidedCtrlRules(ir: KeyboardIR, keyboardId: string): string[] {
  if (keyboardId.toLowerCase().startsWith("basic_")) return [];
  const found: string[] = [];
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const vkey = rule.context.find((c) => c.kind === "vkey");
      if (vkey === undefined || vkey.kind !== "vkey") continue;
      const mods = vkey.modifiers.map((m) => m.toUpperCase());
      if (!mods.some((m) => SIDED_CTRL.has(m))) continue;
      if (mods.some((m) => ALT_MODIFIERS.has(m))) continue;
      found.push(`[${vkey.modifiers.join(" ")} ${vkey.name}]`);
    }
  }
  return found;
}

/** 7.30 — advisory on sided Ctrl rules. */
export function checkSidedCtrlAdvisory(
  ir: KeyboardIR,
  keyboardId: string,
): CheckResult {
  const rules = sidedCtrlRules(ir, keyboardId);
  if (rules.length === 0) {
    return checkPassed("KM_LINT_SIDED_CTRL_ADVISORY", [
      "No rule uses a left- or right-sided Ctrl modifier.",
    ]);
  }
  const list = rules.slice(0, 8).join(", ");
  const more = rules.length > 8 ? `, and ${rules.length - 8} more` : "";
  return checkFailed("KM_LINT_SIDED_CTRL_ADVISORY", [
    criteriaFinding({
      code: "KM_LINT_SIDED_CTRL_ADVISORY",
      file: kmnPath(keyboardId),
      message: `${rules.length} rule${rules.length === 1 ? "" : "s"} use a left- or right-sided Ctrl modifier: ${list}${more}. This is allowed, but an Alt-based placement is preferred.`,
      hint: "Consider moving these characters onto an Alt-based layer.",
    }),
  ]);
}
