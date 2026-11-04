// Check 18.16 — KM_LINT_TOUCH_CAPS_LAYER.
//
// A keyboard that produces cased letters has a touch `caps` layer, reached by
// double-tapping Shift on `default`, carrying the uppercase of every cased
// letter on `default`; its character keys do not switch layers (spec 112
// FR-003). Without that, Caps Lock on a phone/tablet either does not exist or
// drops out of caps after the first letter.
//
// Frame keys (Shift, symbol, RAlt, ...) may switch layers; only character
// keys are held to the no-switch rule. A caps key is compared with the
// default key of the same id.

import type { TouchKeyIR, TouchLayoutIR } from "@keyboard-studio/contracts";
import { caseCounterpart, isTouchFrameKey } from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

const CODE = "KM_LINT_TOUCH_CAPS_LAYER";

type Layer = TouchLayoutIR["platforms"][number]["layers"][number];

function topKeys(layer: Layer): TouchKeyIR[] {
  return layer.rows.flatMap((r) => r.keys);
}

/** 18.16 — touch caps layer complete. `ir` undefined means no touch layout. */
export function checkTouchCapsLayer(
  ir: TouchLayoutIR | undefined,
  path: string,
  opts: { mnemonic?: boolean; bcp47?: string } = {},
): CheckResult {
  if (opts.mnemonic === true) {
    return checkPassed(CODE, ["Mnemonic layout: the touch caps layer does not apply."]);
  }
  if (ir === undefined) {
    return checkPassed(CODE, ["No touch layout: the touch caps layer does not apply."]);
  }

  const findings: ReturnType<typeof criteriaFinding>[] = [];
  let checkedPlatforms = 0;
  const add = (message: string, hint: string): void => {
    findings.push(
      criteriaFinding({ code: "KM_LINT_TOUCH_CAPS_LAYER", file: path, message, hint }),
    );
  };

  for (const platform of ir.platforms) {
    const def = platform.layers.find((l) => l.id === "default");
    if (def === undefined) continue;
    const defKeys = topKeys(def);
    // A letter is held to its uppercase only when Shift gives that uppercase
    // (or nothing): AZERTY's e-acute on the number row has digits on Shift and
    // Caps, and that is correct, not a gap.
    const shiftKeys = topKeys(platform.layers.find((l) => l.id === "shift") ?? { id: "shift", rows: [] });
    const cased = defKeys.flatMap((k) => {
      if (k.text === undefined) return [];
      const c = caseCounterpart(k.text, opts.bcp47);
      if (c === null || c.direction !== "toUpper") return [];
      const shiftText = shiftKeys.find((s) => s.id === k.id)?.text ?? "";
      return shiftText === "" || shiftText === c.counterpart
        ? [{ key: k, upper: c.counterpart }]
        : [];
    });
    if (cased.length === 0) continue;
    checkedPlatforms += 1;
    const where = `Platform "${platform.id}"`;

    const caps = platform.layers.find((l) => l.id === "caps");
    if (caps === undefined) {
      add(
        `${where}: no caps layer.`,
        "Add a caps layer holding the uppercase of every letter on default, reached by double-tapping Shift.",
      );
      continue;
    }

    const shift = defKeys.find((k) => k.id === "K_SHIFT");
    const doubleTap = shift?.multitap?.some((m) => m.nextlayer === "caps") === true;
    if (!doubleTap) {
      add(
        `${where}: Shift on default has no double-tap to caps.`,
        'Add a multitap { "id": "T_CAPS", "text": "*ShiftLock*", "nextlayer": "caps" } to the default layer\'s K_SHIFT.',
      );
    }

    const capsKeys = topKeys(caps);
    const lacking = cased.filter(
      ({ key, upper }) =>
        !capsKeys.some((c) => c.id === key.id && c.text === upper),
    );
    if (lacking.length > 0) {
      add(
        `${where}: caps layer lacks: ${lacking.map(({ key, upper }) => `${upper} (${key.id})`).join(", ")}.`,
        "Put the uppercase counterpart of each default-layer letter on the same key of the caps layer.",
      );
    }

    const switching = capsKeys.filter(
      (k) => k.nextlayer !== undefined && k.nextlayer !== "" && !isTouchFrameKey(k),
    );
    if (switching.length > 0) {
      add(
        `${where}: caps-layer keys switch layer after typing: ${switching.map((k) => k.id).join(", ")}.`,
        "Remove nextlayer from the caps layer's character keys so Caps Lock stays on.",
      );
    }
  }

  if (findings.length > 0) return checkFailed(CODE, findings);
  if (checkedPlatforms === 0) {
    return checkPassed(CODE, ["No cased letters on the touch default layer: the touch caps layer does not apply."]);
  }
  return checkPassed(CODE, [
    `Checked ${checkedPlatforms} platform(s): the caps layer is complete and reached by double-tapping Shift.`,
  ]);
}
