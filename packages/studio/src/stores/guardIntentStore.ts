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
// Durable: kept/dismissed dispositions are part of the working-copy draft
// snapshot (persistWorkingCopy.ts) and survive resume. They reset when the
// working copy's IR is replaced wholesale (setIR) — node ids from a previous
// base keyboard would be stale.

import { create, type StoreApi, type UseBoundStore } from "zustand";

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
  /**
   * Over-broad-guard questions the author Narrowed — never re-ask. Keyed by
   * the deterministic question text (stable across re-analysis), not the
   * guard rule id. Durable: part of the working-copy draft snapshot.
   */
  narrowedGuardQuestions: Set<string>;
  /**
   * Narrow-undo records (transient — never persisted): the exception rule
   * id and the question each Narrow inserted, latest last. Undoing removes
   * the rule from the working IR and lifts that question's narrowed
   * disposition.
   */
  narrowUndoStack: NarrowUndoRecord[];

  noteFamilyCardOpened: (familyId: string) => void;
  noteFamilyEdited: (familyId: string) => void;
  noteBlockBundleInstalled: () => void;
  keepOverBroadGuard: (guardRuleId: string) => void;
  dismissMissingGroup: (groupKey: string) => void;
  /**
   * Record a Narrow: the question is never re-asked, and the inserted
   * exception rule id is pushed for undo.
   */
  noteGuardNarrowed: (question: string, ruleId: string) => void;
  /**
   * Pop the most recent Narrow record for undo; also lifts that question's
   * narrowed disposition so it may surface again. Returns undefined when the
   * stack is empty.
   */
  popNarrowUndo: () => NarrowUndoRecord | undefined;
  /** Wholesale reset — called when the working copy's IR is replaced. */
  reset: () => void;
  /** Test helper — restore the pristine no-signal state. */
  resetForTest: () => void;
}

/** One Narrow's undo record: the inserted exception rule and its question. */
export interface NarrowUndoRecord {
  ruleId: string;
  question: string;
}

function added(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  next.add(value);
  return next;
}

export const useGuardIntentStore: UseBoundStore<StoreApi<GuardIntentState>> =
  create<GuardIntentState>((set) => ({
  openedFamilyIds: new Set(),
  editedFamilyIds: new Set(),
  blockBundleInstalled: false,
  keptGuardRuleIds: new Set(),
  dismissedMissingGroups: new Set(),
  narrowedGuardQuestions: new Set(),
  narrowUndoStack: [],

  noteFamilyCardOpened: (familyId) =>
    set((s) => ({ openedFamilyIds: added(s.openedFamilyIds, familyId) })),
  noteFamilyEdited: (familyId) =>
    set((s) => ({ editedFamilyIds: added(s.editedFamilyIds, familyId) })),
  noteBlockBundleInstalled: () => set({ blockBundleInstalled: true }),
  keepOverBroadGuard: (guardRuleId) =>
    set((s) => ({ keptGuardRuleIds: added(s.keptGuardRuleIds, guardRuleId) })),
  dismissMissingGroup: (groupKey) =>
    set((s) => ({ dismissedMissingGroups: added(s.dismissedMissingGroups, groupKey) })),
  noteGuardNarrowed: (question, ruleId) =>
    set((s) => ({
      narrowedGuardQuestions: added(s.narrowedGuardQuestions, question),
      narrowUndoStack: [...s.narrowUndoStack, { ruleId, question }],
    })),
  popNarrowUndo: () => {
    const stack = useGuardIntentStore.getState().narrowUndoStack;
    const record = stack.at(-1);
    if (record === undefined) return undefined;
    const next = new Set(useGuardIntentStore.getState().narrowedGuardQuestions);
    next.delete(record.question);
    useGuardIntentStore.setState({
      narrowUndoStack: stack.slice(0, -1),
      narrowedGuardQuestions: next,
    });
    return record;
  },
  reset: () =>
    set({
      openedFamilyIds: new Set(),
      editedFamilyIds: new Set(),
      blockBundleInstalled: false,
      keptGuardRuleIds: new Set(),
      dismissedMissingGroups: new Set(),
      narrowedGuardQuestions: new Set(),
      narrowUndoStack: [],
    }),
  resetForTest: () => useGuardIntentStore.getState().reset(),
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
