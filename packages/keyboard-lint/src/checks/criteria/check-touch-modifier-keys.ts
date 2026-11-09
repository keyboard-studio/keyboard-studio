// Check 18.17 — KM_LINT_TOUCH_MODIFIER_KEYS.
//
// Ctrl and RAlt keys on touch layers follow one convention: id `K_RALT`,
// labels `*Ctrl*` / `*RAlt*` (not the legacy `ctrl`, `RALT`, `*Alt*`,
// `default`, ...), each opening the right Ctrl or RAlt layer (or its
// shift/caps variant) and shown as the active special key (sp 2) on the layer
// it opened. The rules are `touchModifierKeyPatch` in contracts, the same ones
// the engine fixer (`fixTouchModifierKeysRaw`) applies, so a key this check
// reports is a key the fixer repairs.

import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { touchModifierKeyPatch } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

const CODE = "KM_LINT_TOUCH_MODIFIER_KEYS";

function* withNested(key: TouchKeyIR): Generator<TouchKeyIR> {
  yield key;
  for (const sub of key.sk ?? []) yield* withNested(sub);
  for (const tap of key.multitap ?? []) yield* withNested(tap);
}

/** 18.17 — consistent Ctrl/RAlt touch keys. `ir` undefined means no touch layout. */
export function checkTouchModifierKeys(
  ir: TouchLayoutIR | undefined,
  path: string,
): CheckResult {
  if (ir === undefined) {
    return checkPassed(CODE, ["No touch layout: the touch modifier keys do not apply."]);
  }
  const findings: ReturnType<typeof criteriaFinding>[] = [];
  let modifierKeys = 0;
  for (const platform of ir.platforms) {
    const ids = new Set(platform.layers.map((l) => l.id));
    for (const layer of platform.layers) {
      const bad: string[] = [];
      for (const top of layer.rows.flatMap((r) => r.keys)) {
        for (const key of withNested(top)) {
          if (!/^K_(L|R)?(CONTROL|ALT)$/.test(key.id)) continue;
          modifierKeys += 1;
          const patch = touchModifierKeyPatch(layer.id, key, ids);
          const fields = Object.keys(patch);
          if (fields.length > 0) bad.push(`${key.id} "${key.text ?? ""}" (${fields.join(", ")})`);
        }
      }
      if (bad.length > 0) {
        findings.push(
          criteriaFinding({
            code: "KM_LINT_TOUCH_MODIFIER_KEYS",
            file: path,
            message: `Platform "${platform.id}", layer "${layer.id}": inconsistent Ctrl/RAlt keys: ${bad.join("; ")}.`,
            hint: "Use id K_RALT with the label *RAlt* (or *Ctrl*), point nextlayer at the Ctrl/RAlt layer (or its shift/caps variant), and give the key sp 2 on the layer it opened.",
          }),
        );
      }
    }
  }
  if (findings.length > 0) return checkFailed(CODE, findings);
  if (modifierKeys === 0) {
    return checkPassed(CODE, ["No Ctrl or RAlt keys on the touch layout: nothing to check."]);
  }
  return checkPassed(CODE, [`Checked ${modifierKeys} Ctrl/RAlt touch key(s): all follow the convention.`]);
}
