// useOpenInventorySeed: gives an opened keyboard the character inventory its
// Touch step walks (spec 111 FR-031).
//
// The Touch gallery walks the session's confirmed inventory and shows nothing
// without one. Copy builds that inventory in the character survey, which the
// Open walk skips (its Missing letters page replaces it), so on Open the
// inventory is seeded once from the letters and marks the keyboard itself
// produces. A synchronous effect over store slices: no timer, no diagnostics
// (decision D3 is untouched). It never overwrites an inventory that exists.

import { useEffect } from "react";
import { summarizeInventory } from "@keyboard-studio/engine/kmAssist";

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { isOpenMode } from "../lib/openMode.ts";

const LETTER_OR_MARK = /^[\p{L}\p{M}]+$/u;

export function useOpenInventorySeed(): void {
  const instantiationMode = useWorkingCopyStore((s) => s.instantiationMode);
  const startIr = useWorkingCopyStore((s) => s.startIr);
  const confirmedInventory = useWorkingCopyStore((s) => s.session.confirmedInventory);
  const recordPhase = useWorkingCopyStore((s) => s.recordPhase);

  useEffect(() => {
    if (!isOpenMode(instantiationMode) || startIr === null) return;
    if (confirmedInventory !== undefined && confirmedInventory.length > 0) return;
    const chars = summarizeInventory(startIr).chars.filter((c) => LETTER_OR_MARK.test(c));
    if (chars.length === 0) return;
    recordPhase({ phase: "B", answers: [], confirmedInventory: chars });
  }, [instantiationMode, startIr, confirmedInventory, recordPhase]);
}
