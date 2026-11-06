// Check 7.29 — KM_LINT_RAW_CTRL (spec 114 FR-001).
//
// Keyman core matches unsided CTRL on either Ctrl key, and Ctrl keeps its
// application-shortcut meaning on every platform, so a rule that types
// content on Ctrl without Alt is reported. Exempt: basic_* keyboards (their
// Ctrl content is frozen), Ctrl+Space (special spaces), and a Ctrl rule on an
// ASCII digit key that types the same digit (not content on Ctrl). Rules in
// every group count, including deadkey and context groups.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
  kmnPath,
} from "./_shared.js";
import { ALT_MODIFIERS, isBasicKeyboard } from "./_ctrl.js";

/** One reported raw-Ctrl rule. */
export interface RawCtrlRule {
  file: string;
  nodeId: string;
  groupIndex: number;
  ruleIndex: number;
  /** The rule's virtual key, e.g. `K_1`. */
  key: string;
  /** The rule's modifiers joined by a space, e.g. `CTRL` or `CTRL SHIFT`. */
  plane: string;
  /** The literal characters the rule's output types, one entry per output element. */
  outputs: string[];
  /** True when the rule's output also has non-character elements (deadkey, store index, and so on). */
  hasOtherOutputs: boolean;
}

/** The raw-Ctrl rules of the keyboard, after the exemptions. Empty for basic_*. */
export function findRawCtrlRules(ir: KeyboardIR, keyboardId: string): RawCtrlRule[] {
  if (isBasicKeyboard(keyboardId)) return [];
  const file = kmnPath(keyboardId);
  const found: RawCtrlRule[] = [];
  ir.groups.forEach((group, groupIndex) => {
    group.rules.forEach((rule, ruleIndex) => {
      const vkey = rule.context.find((c) => c.kind === "vkey");
      if (vkey === undefined || vkey.kind !== "vkey") return;
      const mods = vkey.modifiers.map((m) => m.toUpperCase());
      if (!mods.includes("CTRL") || mods.some((m) => ALT_MODIFIERS.has(m))) return;
      if (vkey.name === "K_SPACE") return;
      const outputs = rule.output.flatMap((o) => (o.kind === "char" ? [o.value] : []));
      const digit = /^K_([0-9])$/.exec(vkey.name)?.[1];
      if (digit !== undefined && outputs.length === 1 && outputs[0] === digit) return;
      found.push({
        file,
        nodeId: rule.nodeId,
        groupIndex,
        ruleIndex,
        key: vkey.name,
        plane: vkey.modifiers.join(" "),
        outputs,
        hasOtherOutputs: rule.output.some((o) => o.kind !== "char"),
      });
    });
  });
  return found;
}

/** 7.29 — no rule uses Ctrl without Alt to type content. */
export function checkRawCtrl(ir: KeyboardIR, keyboardId: string): CheckResult {
  const rules = findRawCtrlRules(ir, keyboardId);
  if (rules.length === 0) {
    return checkPassed("KM_LINT_RAW_CTRL", ["No rule types content on Ctrl without Alt."]);
  }
  const list = rules
    .slice(0, 8)
    .map((r) => `[${r.plane} ${r.key}]`)
    .join(", ");
  const more = rules.length > 8 ? `, and ${rules.length - 8} more` : "";
  return checkFailed("KM_LINT_RAW_CTRL", [
    criteriaFinding({
      code: "KM_LINT_RAW_CTRL",
      file: kmnPath(keyboardId),
      message: `${rules.length} rule${rules.length === 1 ? "" : "s"} type content on Ctrl without Alt: ${list}${more}. The keyboard may not be accepted if it stays this way.`,
      hint: "Move these characters off Ctrl, onto a Shift or Alt-based layer, so Ctrl keeps its shortcut meaning.",
    }),
  ]);
}
