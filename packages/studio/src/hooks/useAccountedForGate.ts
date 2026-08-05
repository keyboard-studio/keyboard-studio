// useAccountedForGate — the mark-aware NavBar/indicator counterpart of
// useInventoryCoverageGate.ts.
//
// Composes the SAME useInventoryCoverageGate() hook every export/Phase-F
// consumer already uses (unchanged by this file) with the author's
// per-surface "mark for later review" sets from surveySessionStore, via the
// pure accountedForGate() function (../lib/accountedForGate.ts). Do not
// thread this hook's result into StudioShell's `outputNavBlocked` or
// StepHost's `allCharactersImplemented` — those two must keep reading
// `useInventoryCoverageGate()` directly so a mark can never relax the export
// / Phase F gates. This hook exists ONLY for the NavBar indicator
// (components/UnfinishedGalleryIndicator.tsx) and any other "what's left to
// consciously account for" surface.

import { useMemo } from "react";
import { useInventoryCoverageGate } from "./useInventoryCoverageGate.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { accountedForGate, type AccountedForGate } from "../lib/accountedForGate.ts";

export function useAccountedForGate(): AccountedForGate {
  const gate = useInventoryCoverageGate();
  const markedDesktopArr = useSurveySessionStore((s) => s.markedForLaterDesktop);
  const markedTouchArr = useSurveySessionStore((s) => s.markedForLaterTouch);

  const markedDesktop = useMemo(() => new Set(markedDesktopArr), [markedDesktopArr]);
  const markedTouch = useMemo(() => new Set(markedTouchArr), [markedTouchArr]);

  return useMemo(
    () => accountedForGate(gate, markedDesktop, markedTouch),
    [gate, markedDesktop, markedTouch],
  );
}
