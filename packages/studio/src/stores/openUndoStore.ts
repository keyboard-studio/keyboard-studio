// openUndoStore -- the ONE log of changes applied to an opened keyboard's
// files this session (spec 111 FR-045, "live files").
//
// Every successful apply (`lib/openApply`) records one step: a label, per file
// it wrote the text before and just after (`null` = absent), and a `view`
// saying what kind of step it was. Undo puts `before` back when every file
// still equals `after` (`undoLastOpenApply`) and pops the step.
//
// The Removed list (`openRemovalStore`) and the assignment session
// (`openAssignStore`) are NOT kept separately: they are caches rebuilt from
// this log on every change (`rebuildDerived`), so undoing a step needs no
// per-kind bookkeeping. One list for the whole session; memory only: not in
// the draft snapshot. `clearOpenSession` empties the log (and so the caches);
// it runs wherever the working copy is reset, re-instantiated or restored.
// No timers.

import { create } from "zustand";
import { useOpenRemovalStore, type OpenRemovalEntry } from "./openRemovalStore.ts";
import { useOpenAssignStore, type OpenAssignSession } from "./openAssignStore.ts";

export interface OpenUndoFile {
  before: string | null;
  after: string | null;
}

/** What kind of step a record is; the caches are derived from these. */
export type OpenUndoView =
  /** A removal: it is on the Removed list until a restore step takes it off. */
  | { kind: "removal"; entry: OpenRemovalEntry }
  /** A restore: the removals it put back (they leave the Removed list). */
  | { kind: "restore"; entries: OpenRemovalEntry[] }
  /** An assignment step (guards included): the session list before and after. */
  | { kind: "assign"; before: OpenAssignSession | null; after: OpenAssignSession | null }
  | { kind: "marks" }
  /** Held overlays written into the file ahead of another step. */
  | { kind: "flush" }
  /** Any other precomputed or projected write (rule additions, `files`). */
  | { kind: "files" };

export interface OpenUndoRecord {
  id: string;
  keyboardId: string;
  /** Plain label for the (later) undo UI. */
  label: string;
  files: Record<string, OpenUndoFile>;
  view: OpenUndoView;
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

/** Rebuild the two caches from the log. */
function rebuildDerived(records: readonly OpenUndoRecord[]): void {
  const restored = new Set<string>();
  for (const r of records) {
    if (r.view.kind === "restore") for (const e of r.view.entries) restored.add(e.id);
  }
  const entries: OpenRemovalEntry[] = [];
  let session: OpenAssignSession | null = null;
  for (const r of records) {
    switch (r.view.kind) {
      case "removal":
        if (!restored.has(r.view.entry.id)) entries.push(r.view.entry);
        break;
      case "assign":
        session = r.view.after;
        break;
      case "restore":
      case "marks":
      case "flush":
      case "files":
        break;
    }
  }
  useOpenRemovalStore.setState({ entries });
  useOpenAssignStore.setState({ session });
}

let lastRecords: readonly OpenUndoRecord[] = useOpenUndoStore.getState().records;
useOpenUndoStore.subscribe((s) => {
  if (s.records === lastRecords) return;
  lastRecords = s.records;
  rebuildDerived(s.records);
});

/** Forget every applied change of the previous session (the log, and so its caches). */
export function clearOpenSession(): void {
  useOpenUndoStore.getState().clear();
  // The log may already have been empty (no change, no rebuild): empty the caches too.
  useOpenRemovalStore.getState().clear();
  useOpenAssignStore.getState().clear();
}
