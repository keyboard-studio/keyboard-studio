// openUndoStore -- the session undo list for changes applied to an opened
// keyboard's files (spec 111 FR-045, "live files").
//
// Every successful apply (`lib/openApply.ts`) records one step: a label and,
// per file it wrote, the text before and just after (`null` = the file did not
// exist / was deleted). Undo puts `before` back when every file still equals
// `after` (`undoLastOpenApply`). One list for the whole session; memory only:
// it is not in the draft snapshot, so a reload keeps the files but forgets the
// steps. The undo UI is built later; this is the record it reads.
//
// `clearOpenSession` empties this list and the removal list together; it runs
// wherever the working copy is reset, re-instantiated or restored from a
// saved project. No timers.

import { create } from "zustand";
import { useOpenRemovalStore, type OpenRemovalEntry } from "./openRemovalStore.ts";

export interface OpenUndoFile {
  before: string | null;
  after: string | null;
}

export interface OpenUndoRecord {
  id: string;
  keyboardId: string;
  /** Plain label for the (later) undo UI; not shown by anything yet. */
  label: string;
  files: Record<string, OpenUndoFile>;
  /** Removals this step took off the Removed list (a restore); undo puts them back. */
  removals?: OpenRemovalEntry[];
}

interface OpenUndoState {
  records: OpenUndoRecord[];
  push: (record: OpenUndoRecord) => void;
  drop: (ids: ReadonlySet<string>) => void;
  clear: () => void;
}

export const useOpenUndoStore = create<OpenUndoState>((set) => ({
  records: [],
  push: (record) => set((s) => ({ records: [...s.records, record] })),
  drop: (ids) => set((s) => ({ records: s.records.filter((r) => !ids.has(r.id)) })),
  clear: () => set({ records: [] }),
}));

/** Forget every applied change of the previous session (undo steps and removals). */
export function clearOpenSession(): void {
  useOpenUndoStore.getState().clear();
  useOpenRemovalStore.getState().clear();
}
