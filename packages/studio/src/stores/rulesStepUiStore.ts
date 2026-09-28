// rulesStepUiStore — minimal interaction state for the rules step
// (spec 082).
//
// Currently just the selected rule family: the over-broad guard card's
// "Narrow" action selects the guard's family here so the author can edit it.
// FR-018's family cards (test-this-group target, bundle-as-pack selection,
// expanded/collapsed state) will grow this store; this seam is the shared
// selection they will read.

import { create } from "zustand";

interface RulesStepUiState {
  /** The currently selected rule-family id, if any. */
  selectedFamilyId: string | null;
  selectFamily: (familyId: string | null) => void;
  /** Test helper. */
  resetForTest: () => void;
}

export const useRulesStepUiStore = create<RulesStepUiState>((set) => ({
  selectedFamilyId: null,
  selectFamily: (familyId) => set({ selectedFamilyId: familyId }),
  resetForTest: () => set({ selectedFamilyId: null }),
}));
