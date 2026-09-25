// Working-copy seed helpers shared across studio tests.

import { createVirtualFS, type VirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";

/** A VFS holding only `source/<keyboardId>.kmn` with a stub body. */
export function stubKmnVfs(keyboardId: string, kmn = "c stub\n"): VirtualFS {
  return createVirtualFS([{ path: `source/${keyboardId}.kmn`, content: kmn, isBinary: false }]);
}

/**
 * Instantiate the working copy from basic_kbdus (a one-line `c test` .kmn and
 * an empty IR): the normal end-of-flow state.
 *
 * - `inventory`: when given, also record Phase B with that confirmed
 *   inventory, so coverage gates have characters to account for.
 * - `attributed`: also record an author and copyright holder. Download is
 *   gated on attribution (spec 064), so a fixture that isolates some OTHER
 *   gate, or that stands for a working copy that has reached the ship-it
 *   screen, needs one.
 */
export function seedInstantiatedWorkingCopy(
  inventory?: string[],
  { attributed = false }: { attributed?: boolean } = {},
): void {
  const store = useWorkingCopyStore.getState();
  store.instantiateFromBase(basicKbdus, { vfs: stubKmnVfs("basic_kbdus", "c test\n"), ir: makeTestIR([]) });
  if (attributed) {
    store.setAttribution({ authorName: "Alice Example", copyrightHolder: "Alice Example" });
  }
  if (inventory !== undefined) {
    store.recordPhase({ phase: "B", answers: [], confirmedInventory: inventory });
  }
}
