// `&mnemoniclayout`: keys are positional by character, not by virtual key.

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { isMnemonicKeyboard } from "../layout-ops/ruleMatch.js";

export function isMnemonic(ir: KeyboardIR): boolean {
  return isMnemonicKeyboard(ir);
}
