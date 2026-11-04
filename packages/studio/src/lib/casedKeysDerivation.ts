// casedKeysDerivation — the studio's one reading of the derived `&CasedKeys`
// key set (spec 112): the family floor of the copied keyboard plus every key
// with a case pair, minus R1 conflicts. Shared by the caps-handling renderer's
// summary and projection step 2.8, so the layout screen shows what the
// download will write.

import { casedKeySet } from "@keyboard-studio/contracts";
import type { CasedKeySet, KeyboardIR } from "@keyboard-studio/contracts";
import { casedKeysFloor, detectStartLayoutFamily } from "@keyboard-studio/engine";

/**
 * The family floor for a copied keyboard, from its own layout. A layout the
 * detector cannot place (non-Roman, Dvorak, ...) has no floor: its cased keys
 * come from the case pairs the keyboard actually types.
 */
export function capsFloorFor(ir: KeyboardIR): readonly string[] {
  const family = detectStartLayoutFamily(ir);
  if (family === "AZERTY") return casedKeysFloor("azerty");
  if (family === "QWERTY" || family === "QWERTZ") return casedKeysFloor("qwerty-qwertz");
  return casedKeysFloor("non-roman");
}

export function deriveCasedKeys(
  ir: KeyboardIR,
  opts: { bcp47?: string; floor?: readonly string[] } = {},
): CasedKeySet {
  return casedKeySet(ir, {
    ...(opts.bcp47 !== undefined ? { bcp47: opts.bcp47 } : {}),
    floor: opts.floor ?? capsFloorFor(ir),
  });
}
