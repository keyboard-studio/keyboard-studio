// useBasicKeyboardOpen: true while a basic keyboard is opened for update, the one
// case where no suggestion may edit physical keys (lib/basicKeyboard.ts). A
// keyboard copied from a basic one (Copy) is a new keyboard and is not affected.

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isBasicKeyboard } from "../lib/basicKeyboard.ts";
import { isOpenMode } from "../lib/openMode.ts";

export function useBasicKeyboardOpen(): boolean {
  const mode = useWorkingCopyStore((s) => s.instantiationMode);
  const startKeyboard = useWorkingCopyStore((s) => s.startKeyboard);
  return isOpenMode(mode) && isBasicKeyboard(startKeyboard);
}
