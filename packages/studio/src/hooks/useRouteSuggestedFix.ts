// useRouteSuggestedFix: what accepting a suggested fix does for the studio
// (spec 111 US5). A suggestion never edits the keyboard by itself: accepting
// takes the author to the editor that owns the change, as a back action (the
// same path the unfinished-gallery links use), where they make it.

import { useCallback } from "react";

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";
import { navigateTo } from "../lib/navigate.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

export function useRouteSuggestedFix(): (fix: SuggestedFix) => void {
  const back = useSurveySessionStore((s) => s.backToUnfinishedGallery);
  return useCallback(
    (fix) => {
      const target = fix.action?.target;
      if (target === "mechanisms" || target === "physical") back("mechanisms");
      else if (target === "touch") back("touch");
      navigateTo("survey");
    },
    [back],
  );
}
