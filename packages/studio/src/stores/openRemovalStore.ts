// openRemovalStore -- the removals the author applied to an opened keyboard
// this session (spec 111 "live files", slice S1).
//
// On Open a removal is written into the files when the author applies it, so
// the removed rules no longer exist in `startIr` and the gallery cannot find
// them there to restore. Each applied removal is therefore recorded here with
// what Restore needs: the files as they were before and just after, the
// characters it removed (the Removed list and the language warning read
// them), the carved-key labels for the review dialog, and the removed rules'
// verbatim text with the rule before each.
//
// Session state only: it is not part of the working-copy draft snapshot, so a
// reload keeps the removals (they are in the files) but forgets how to
// restore them. S4's file-text undo replaces this. No timers.

import { create } from "zustand";
import type { CarvedCombo } from "../lib/carvedCombo.ts";

/** One removed `.kmn` rule, as Restore needs to put it back. */
export interface RemovedRuleRecord {
  /** Index of the rule's group in the keyboard (groups are never removed here). */
  groupIndex: number;
  /** The rule's own lines, verbatim, without the final line ending. */
  text: string;
  /**
   * Emitted text of the nearest earlier rule in the group that survived the
   * removal; `null` when none did (the rule goes at the group's start).
   */
  prevText: string | null;
  /** 1-based count of rules with text `prevText` up to and including that rule. */
  prevOrdinal: number;
}

/** One applied removal. */
export interface OpenRemovalEntry {
  id: string;
  keyboardId: string;
  /** NFC characters the removal carved. */
  chars: string[];
  /** Carved-key labels for the review dialog, resolved before the removal. */
  combos: CarvedCombo[];
  rules: RemovedRuleRecord[];
  /**
   * Set when the removal is a disabled rule family (spec 082 FR-018): the
   * family card shows it as disabled, and Enable puts it back. Such an entry
   * carves no characters and has no review combos.
   */
  family?: { id: string; name: string; count: number };
  /** Text of each changed file before and just after the removal. */
  files: Record<string, { before: string; after: string }>;
}

interface OpenRemovalState {
  entries: OpenRemovalEntry[];
  push: (entry: OpenRemovalEntry) => void;
  drop: (ids: ReadonlySet<string>) => void;
  clear: () => void;
}

export const useOpenRemovalStore = create<OpenRemovalState>((set) => ({
  entries: [],
  push: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  drop: (ids) => set((s) => ({ entries: s.entries.filter((e) => !ids.has(e.id)) })),
  clear: () => set({ entries: [] }),
}));
