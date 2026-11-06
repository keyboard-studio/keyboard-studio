// The modifier layers a keyboard uses, for the Layout tab's layer switcher.

import type { KeyboardIR, LayerCombo } from "@keyboard-studio/contracts";
import { collectLayerCombosInUse } from "../pattern-apply/modifierCombos.js";

/**
 * Every layer in use. The no-modifier layer comes first (a keyboard always has one;
 * `collectLayerCombosInUse` reports only combinations that carry a modifier).
 */
export function listLayers(ir: KeyboardIR): LayerCombo[] {
  return [[], ...collectLayerCombosInUse(ir)];
}
