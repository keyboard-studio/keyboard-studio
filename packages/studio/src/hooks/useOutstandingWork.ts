// useOutstandingWork — the React composition seam over lib/outstandingWork.ts
// (spec 061 FR-011).
//
// Mirrors hooks/useAccountedForGate.ts exactly: this hook holds EVERY store
// read and the i18n binding, so the pure module holds none (FR-016). Both
// consumers of the derivation — components/StudioFooter.tsx (which threads it
// into `buildProgressDots` as an input, because `decisions/` may not import
// `stores/`) and components/OutstandingWorkNudge.tsx — call this one hook, so
// the row and the nudge cannot disagree about what a section owes (FR-009) or
// about what a section is CALLED (FR-020: the label resolver injected below is
// the same `stageLabel` the row's own marks use).
//
// No timer (FR-034). The result is a plain derived value, recomputed on the
// renders whose inputs changed — the same state changes that already re-render
// both consumers. Nothing here validates, so D3's single debounce cycle is
// untouched.

import { useCallback, useMemo } from "react";
import { useLingui } from "@lingui/react";
import { manifest } from "../steps/manifest.ts";
import { stageLabel } from "../decisions/progressDots.ts";
import { useInventoryCoverageGate } from "./useInventoryCoverageGate.ts";
import { useStepWalkStore } from "../stores/stepWalkStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { outstandingWork, type OutstandingWork } from "../lib/outstandingWork.ts";

export function useOutstandingWork(): OutstandingWork {
  const { i18n } = useLingui();
  // The RAW coverage gate, deliberately — not useAccountedForGate(). A
  // marked-for-later character is still owed here (FR-014 / A3); marking
  // relaxes only the gallery's own completion control.
  const coverage = useInventoryCoverageGate();
  const walks = useStepWalkStore((s) => s.walks);
  const activeStepId = useSurveySessionStore((s) => s.activeStepId);
  const visited = useSurveySessionStore((s) => s.visited);

  const label = useCallback((stepId: string) => stageLabel(stepId, i18n), [i18n]);

  return useMemo(
    () => outstandingWork({ coverage, manifest, walks, activeStepId, visited, label }),
    [coverage, walks, activeStepId, visited, label],
  );
}
