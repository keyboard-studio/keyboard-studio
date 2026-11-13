// useRemovalActions -- the carve gallery's remove / restore / restore-all,
// aware of Open (spec 111 "live files", slice S1).
//
// Copy (and an older Open draft with no descriptor) keeps the store's overlay
// actions exactly as they were: the wrappers pass straight through. On Open a
// removal is written into the keyboard's files when the author applies it
// (`applyOnOpen`), with nothing recorded in `deletedItemIds` / `carveChars`;
// Restore puts the removed rules back from the session's `openRemovals`.

import { useCallback } from "react";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useOpenRemovalStore, type OpenRemovalEntry } from "../../stores/openRemovalStore.ts";
import { isOpenedWithDescriptor } from "../../lib/openMode.ts";
import { useApplyOnOpen } from "../../components/OpenApplyHost.tsx";

const EMPTY: readonly OpenRemovalEntry[] = [];

/** True when removals on this working copy are written into the files. */
export function useIsLiveOpen(): boolean {
  return useWorkingCopyStore((s) =>
    isOpenedWithDescriptor(s.instantiationMode, s.startVfs, s.startKeyboard?.id ?? ""),
  );
}

/** The removals applied to the keyboard that is open now (empty outside Open). */
export function useOpenRemovals(): readonly OpenRemovalEntry[] {
  const live = useIsLiveOpen();
  const keyboardId = useWorkingCopyStore((s) => s.startKeyboard?.id);
  const entries = useOpenRemovalStore((s) => s.entries);
  if (!live) return EMPTY;
  return entries.filter((e) => e.keyboardId === keyboardId);
}

export function useRemovalActions() {
  const live = useIsLiveOpen();
  const storeDelete = useWorkingCopyStore((s) => s.cascadeDelete);
  const storeRestore = useWorkingCopyStore((s) => s.cascadeRestore);
  const storeRestoreAll = useWorkingCopyStore((s) => s.restoreAll);
  const applyOnOpen = useApplyOnOpen();
  const removals = useOpenRemovals();

  const cascadeDelete = useCallback(
    (ruleNodeIds: string[], storeSlotIds: string[], carvedChars: string[] = []): void => {
      if (!live) return storeDelete(ruleNodeIds, storeSlotIds, carvedChars);
      if (ruleNodeIds.length === 0 && storeSlotIds.length === 0) return;
      void applyOnOpen({
        kind: "remove",
        itemIds: [...new Set([...ruleNodeIds, ...storeSlotIds])],
        chars: carvedChars,
      });
    },
    [live, storeDelete, applyOnOpen],
  );

  // On Open the removed items are gone from the gallery, so a restore names
  // them by character (the Removed list). A removal is restored as a whole.
  const cascadeRestore = useCallback(
    (ids: string[], restoredChars: string[] = []): void => {
      if (!live) return storeRestore(ids, restoredChars);
      const wanted = new Set(restoredChars.map((c) => c.normalize("NFC")));
      const entries = removals.filter((e) => e.chars.some((c) => wanted.has(c)));
      if (entries.length === 0) return;
      void applyOnOpen({ kind: "reinsert", entries });
    },
    [live, storeRestore, applyOnOpen, removals],
  );

  const restoreAll = useCallback((): void => {
    if (!live) return storeRestoreAll();
    if (removals.length === 0) return;
    void applyOnOpen({ kind: "reinsert", entries: [...removals] });
  }, [live, storeRestoreAll, applyOnOpen, removals]);

  return { cascadeDelete, cascadeRestore, restoreAll };
}
