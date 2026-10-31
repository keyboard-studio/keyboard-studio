// contextToleranceRun — the working copy's context-tolerance analysis, run and
// published the way the preview pipeline does it (spec 078 FR-001): the
// analysis, with the applied overlay already removed, the cached normalization
// step and the verification lineage all read from the working-copy store, and
// the `analysing` -> `ready`/`failed` states published through the store's
// action. hooks/useKeyboardArtifact.ts launches it after a compile and never
// awaits it; the headless scripted author (spec 107) calls the same function
// and awaits it. No timer (D3).

import type { KeyboardIR } from "@keyboard-studio/contracts";
import { devLog } from "@keyboard-studio/contracts/dev-log";

import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { analyseContextTolerance, type ContextToleranceResult } from "./contextToleranceAnalysis.ts";
import { lookupNormalizationVerification } from "./normalizationVerification.ts";

/**
 * Every await inside the analysis is followed by an `isCurrent()` check; a
 * superseded run's result is dropped.
 */
export function analyseWorkingCopyContextTolerance(
  ir: KeyboardIR,
  isCurrent: () => boolean,
): Promise<ContextToleranceResult | null> {
  const { startKeyboard, contextToleranceOverlay, contextNormalizationStep, setContextNormalizationStep } =
    useWorkingCopyStore.getState();
  return analyseContextTolerance(ir, isCurrent, contextToleranceOverlay, {
    normalizationSnapshot: contextNormalizationStep,
    verificationLookup: lookupNormalizationVerification,
    // A copy-a-keyboard project carries a new keyboard id, but its rules are
    // the base's: the base's verification verdict applies to it (spec 086).
    verificationLineage: startKeyboard === null ? [] : [startKeyboard.id],
    onNormalizationStored: (stored) => {
      // Persist only a changed entry (spec 086 FR-016): a cache hit re-stores nothing.
      if (isCurrent() && stored.cacheKey !== contextNormalizationStep?.cacheKey) {
        setContextNormalizationStep(stored);
      }
    },
  });
}

export function runContextToleranceAnalysis(
  ir: KeyboardIR,
  runId: number,
  isCurrent: () => boolean,
): Promise<void> {
  useWorkingCopyStore.getState().setContextTolerance({ status: "analysing", runId });
  return analyseWorkingCopyContextTolerance(ir, isCurrent).then(
    (result) => {
      if (result === null || !isCurrent()) return;
      useWorkingCopyStore.getState().setContextTolerance({ status: "ready", runId, ...result });
    },
    (err: unknown) => {
      if (!isCurrent()) return;
      const reason = err instanceof Error ? err.message : String(err);
      devLog.warn("[contextToleranceRun] context-tolerance analysis failed:", err);
      useWorkingCopyStore.getState().setContextTolerance({ status: "failed", runId, reason });
    },
  );
}
