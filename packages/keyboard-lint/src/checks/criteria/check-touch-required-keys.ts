// Check 18.14 — KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS.
//
// Every touch layer carries the compiler-required control keys, and
// standard control keys use canonical `K_` IDs.
//
// (a) Upstream `CRequiredKeys` (keyman kmc-kmn `constants.ts`) demands
// `K_LOPT`, `K_BKSP` and `K_ENTER` on every layer of every platform
// (kmc KM02093 WARN_TouchLayoutMissingRequiredKeys). A layer without
// backspace/enter traps the user — e.g. #4162 (indigenous_nt: BKSP+
// ENTER added to RALT layers). Reuses contracts'
// `findMissingRequiredTouchKeys`, the same accumulator the compiler uses.
// (b) A touch-only `T_` ID for a standard control key is not canonical:
// `T_BKSP` → `K_BKSP` (#4157, sil_yi). (`T_` keys are otherwise a
// deliberate first-class idiom — only the required control keys are
// flagged here.)

import type {
  TouchKeyIR,
  TouchLayoutIR,
} from "@keyboard-studio/contracts";
import {
  findMissingRequiredTouchKeys,
  REQUIRED_TOUCH_KEY_IDS,
} from "@keyboard-studio/contracts";
import {
  checkFailed,
  checkPassed,
  type CheckResult,
  criteriaFinding,
} from "./_shared.js";

/** Non-canonical touch IDs for the required control keys, with their fix. */
const NON_CANONICAL: ReadonlyMap<string, string> = new Map([
  ["T_LOPT", "K_LOPT"],
  ["T_BKSP", "K_BKSP"],
  ["T_ENTER", "K_ENTER"],
]);

/** All key IDs on a layer, descending into longpress/multitap/flick sub-keys. */
function* allKeyIds(layer: {
  rows: Array<{ keys: TouchKeyIR[] }>;
}): Generator<string> {
  const visit = function* (key: TouchKeyIR): Generator<string> {
    if (key.id.length > 0) yield key.id;
    for (const sub of key.sk ?? []) yield* visit(sub);
    for (const sub of key.multitap ?? []) yield* visit(sub);
    if (key.flick) {
      for (const sub of Object.values(key.flick)) {
        if (sub) yield* visit(sub);
      }
    }
  };
  for (const row of layer.rows) {
    for (const key of row.keys) {
      yield* visit(key);
    }
  }
}

/** 18.14 — findings for layers missing required keys and for T_ control IDs. */
export function checkTouchRequiredKeys(
  ir: TouchLayoutIR,
  path: string,
): CheckResult {
  const findings: ReturnType<typeof criteriaFinding>[] = [];

  // (a) Required keys per layer.
  for (const f of findMissingRequiredTouchKeys(ir)) {
    const platform = String(f.fields.platform);
    const layerId = String(f.fields.layerId);
    const missing = f.fields.missingKeyIds as readonly string[];
    findings.push(
      criteriaFinding({
        code: "KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS",
        file: path,
        message: `Platform "${platform}" layer "${layerId}" is missing the required key(s) ${missing.join(", ")}.`,
        hint: `Add ${missing.join(", ")} to the layer. Keyman requires ${REQUIRED_TOUCH_KEY_IDS.join(", ")} on every layer.`,
      }),
    );
  }

  // (b) Non-canonical T_ IDs for the required control keys.
  const bad = new Map<string, string>(); // T_ id -> first platform/layer seen
  for (const platform of ir.platforms) {
    for (const layer of platform.layers) {
      for (const id of allKeyIds(layer)) {
        const upper = id.toUpperCase();
        if (NON_CANONICAL.has(upper) && !bad.has(upper)) {
          bad.set(upper, `${platform.id}/${layer.id}`);
        }
      }
    }
  }
  for (const [tId, where] of bad) {
    const canonical = NON_CANONICAL.get(tId)!;
    findings.push(
      criteriaFinding({
        code: "KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS",
        file: path,
        message: `Non-canonical touch key ID ${tId} (seen on ${where}): use ${canonical} for the standard control key.`,
        hint: `Rename the key ID from ${tId} to ${canonical} so it resolves as a real control key.`,
      }),
    );
  }

  if (findings.length > 0)
    return checkFailed("KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS", findings);
  const layerCount = ir.platforms.reduce((n, p) => n + p.layers.length, 0);
  return checkPassed("KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS", [
    `Checked ${layerCount} layer(s): every layer carries ${REQUIRED_TOUCH_KEY_IDS.join(", ")}, all with canonical K_ IDs.`,
  ]);
}
