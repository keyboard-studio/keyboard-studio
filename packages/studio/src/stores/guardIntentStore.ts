// guardIntentStore — intent signals gating the guard-suggestion cards
// (spec 082 FR-020 / FR-022).
//
// Guard suggestions surface ONLY after an intent signal, never on step
// entry and never unsolicited — some workflows intentionally permit
// floating marks, and an unprompted "you're missing guards" card would be
// noise. The three signals (same for both directions):
//   - the author OPENS a rule-family card;
//   - the author CREATES, EDITS, or SELECTS a rule in that guard family;
//   - the author INSTALLS a block-behaviour bundle.
// "Keep" on an over-broad question records the author's intent for that
// guard rule so the question is never asked again; dismissing a missing-
// guard group hides that group.
//
// Session-scoped (in-memory): cross-session persistence of kept/dismissed
// intent is a follow-up — the working-copy persistence snapshot is frozen
// while FR-018's fields land, so this store deliberately doesn't touch it.

import { create } from "zustand";

interface GuardIntentState {
  /** Family ids whose card the author opened. */
  openedFamilyIds: Set<string>;
  /** Family ids the author created/edited/selected a rule in. */
  editedFamilyIds: Set<string>;
  /** True once the author installed a block-behaviour bundle. */
  blockBundleInstalled: boolean;
  /** guardRuleIds the author Kept on an over-broad question — never re-ask. */
  keptGuardRuleIds: Set<string>;
  /** Missing-guard group keys (`store::familyName`) the author dismissed. */
  dismissedMissingGroups: Set<string>;

  noteFamilyCardOpened: (familyId: string) => void;
  noteFamilyEdited: (familyId: string) => void;
  noteBlockBundleInstalled: () => void;
  keepOverBroadGuard: (guardRuleId: string) => void;
  dismissMissingGroup: (groupKey: string) => void;
  /** Test helper — restore the pristine no-signal state. */
  resetForTest: () => void;
}

function added(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  next.add(value);
  return next;
}

export const useGuardIntentStore = create<GuardIntentState>((set) => ({
  openedFamilyIds: new Set(),
  editedFamilyIds: new Set(),
  blockBundleInstalled: false,
  keptGuardRuleIds: new Set(),
  dismissedMissingGroups: new Set(),

  noteFamilyCardOpened: (familyId) =>
    set((s) => ({ openedFamilyIds: added(s.openedFamilyIds, familyId) })),
  noteFamilyEdited: (familyId) =>
    set((s) => ({ editedFamilyIds: added(s.editedFamilyIds, familyId) })),
  noteBlockBundleInstalled: () => set({ blockBundleInstalled: true }),
  keepOverBroadGuard: (guardRuleId) =>
    set((s) => ({ keptGuardRuleIds: added(s.keptGuardRuleIds, guardRuleId) })),
  dismissMissingGroup: (groupKey) =>
    set((s) => ({ dismissedMissingGroups: added(s.dismissedMissingGroups, groupKey) })),
  resetForTest: () =>
    set({
      openedFamilyIds: new Set(),
      editedFamilyIds: new Set(),
      blockBundleInstalled: false,
      keptGuardRuleIds: new Set(),
      dismissedMissingGroups: new Set(),
    }),
}));

/**
 * Whether any intent signal covers the given family: the author opened its
 * card, worked in it, or installed a block-behaviour bundle (a bundle-level
 * signal — not family-specific — that legitimizes guard questions broadly).
 */
export function guardIntentSignaledForFamily(
  state: Pick<GuardIntentState, "openedFamilyIds" | "editedFamilyIds" | "blockBundleInstalled">,
  familyId: string,
): boolean {
  return (
    state.blockBundleInstalled ||
    state.openedFamilyIds.has(familyId) ||
    state.editedFamilyIds.has(familyId)
  );
}

/** Stable key for a missing-guard group (dismissal identity). */
export function missingGuardGroupKey(group: { store: string; familyName: string }): string {
  return `${group.store}::${group.familyName}`;
}
