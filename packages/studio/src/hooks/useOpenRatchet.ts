// useOpenRatchet — the Open-mode ratchet for one authored criteria result
// (spec 111, US2). Reads the baseline and review notes from the criteria
// record store, classifies the result, drops notes whose finding stopped
// failing, and returns the submit gate. Null on Copy (and before the baseline
// exists), so every caller stays a no-op outside Open mode.
//
// No timer: classification is a memoised derivation over the result, and the
// note pruning is a store write keyed on that result (D3).

import { useEffect, useMemo } from "react";

import type { CriteriaResult } from "../criteria/criteriaTypes.ts";
import {
  collectFailing,
  newFailures,
  pruneReviewNotes,
  ratchetFor,
  type FailingFinding,
  type OpenBaseline,
  type RatchetGate,
} from "../criteria/openRatchet.ts";
import { isOpenMode } from "../lib/openMode.ts";
import { useCriteriaRecordStore } from "../stores/criteriaRecordStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import type { ReviewNote } from "@keyboard-studio/contracts";

export interface OpenRatchet {
  baseline: OpenBaseline;
  notes: readonly ReviewNote[];
  newFailures: FailingFinding[];
  gate: RatchetGate;
}

export function useOpenRatchet(
  result: CriteriaResult | null,
  compileError: boolean,
): OpenRatchet | null {
  const mode = useWorkingCopyStore((s) => s.instantiationMode);
  const baseline = useCriteriaRecordStore((s) => s.openBaseline);
  const storedNotes = useCriteriaRecordStore((s) => s.reviewNotes);
  const open = isOpenMode(mode);

  const failingKeys = useMemo(
    () =>
      result === null
        ? null
        : new Set(collectFailing(result).map((f) => f.key)),
    [result],
  );

  // Auto-drop: a note whose key stopped failing leaves the slice.
  useEffect(() => {
    if (!open || failingKeys === null) return;
    const notes = storedNotes ?? [];
    if (pruneReviewNotes(notes, failingKeys).length !== notes.length) {
      useCriteriaRecordStore.getState().retainReviewNotes(failingKeys);
    }
  }, [open, failingKeys, storedNotes]);

  return useMemo(() => {
    if (!open || result === null || baseline === null || baseline === undefined) {
      return null;
    }
    const notes = storedNotes ?? [];
    return {
      baseline,
      notes,
      newFailures: newFailures(result, baseline),
      gate: ratchetFor(result, baseline, notes, compileError),
    };
  }, [open, result, baseline, storedNotes, compileError]);
}
