// rulesStepUiStore — minimal interaction state for the rules step
// (spec 082).
//
// The selected rule family (the over-broad guard card's "Narrow" action used
// to select the guard's family here) and the bundle-as-pack family: the
// family-card list's "Bundle as pack" action sets it so the rule builder
// below opens with that family pre-selected.

import { create } from "zustand";

interface RulesStepUiState {
  /** The currently selected rule-family id, if any. */
  selectedFamilyId: string | null;
  selectFamily: (familyId: string | null) => void;
  /**
   * The family the rule builder should pre-select (spec 082 FR-018 "Bundle
   * as pack"). Null means no pre-selection — the builder opens with its own
   * default selection.
   */
  bundleFamilyId: string | null;
  setBundleFamilyId: (familyId: string | null) => void;
  /** Test helper. */
  resetForTest: () => void;
}

export const useRulesStepUiStore = create<RulesStepUiState>((set) => ({
  selectedFamilyId: null,
  selectFamily: (familyId) => set({ selectedFamilyId: familyId }),
  bundleFamilyId: null,
  setBundleFamilyId: (familyId) => set({ bundleFamilyId: familyId }),
  resetForTest: () => set({ selectedFamilyId: null, bundleFamilyId: null }),
}));
