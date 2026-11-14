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
import type { KeyEditOperation } from "@keyboard-studio/engine";
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
  /** A touch-layout edit (with its `.kmn` half, if any); `ops` are the key edits it carried. */
  | {
      kind: "touch";
      edit: { type: "ops"; ops: KeyEditOperation[] } | { type: "assignments" } | { type: "removals" };
    }
  /** Held overlays written into the file ahead of another step. */
  | { kind: "flush" }
  /** Any other precomputed or projected write (rule additions, `files`). */
  | { kind: "files" };

/** Which known step a record is, so the UI can word it in the author's language. */
export type OpenUndoLabelKey = "code-view" | "context-tolerance" | "earlier-changes" | "take-back" | "layout-edit";

export interface OpenUndoRecord {
  id: string;
  keyboardId: string;
  /** Plain label for the (later) undo UI. */
  label: string;
  /** Set for the steps the UI words itself; the rest show `label`. */
  labelKey?: OpenUndoLabelKey;
  files: Record<string, OpenUndoFile>;
  view: OpenUndoView;
}

/**
 * Paths an applied change deleted from the working copy and no undo has put
 * back: the preview must drop them from the fetched files (FR-043). Derived
 * from the log: a path is removed when the latest record that touched it left
 * it absent.
 */
export function removedPathsOf(records: readonly OpenUndoRecord[]): string[] {
  const absent = new Map<string, boolean>();
  for (const r of records) {
    for (const [path, f] of Object.entries(r.files)) absent.set(path, f.after === null);
  }
  return [...absent].filter(([, gone]) => gone).map(([path]) => path).sort();
}

interface OpenUndoState {
  records: OpenUndoRecord[];
  /** `removedPathsOf(records)`, kept beside the log so a subscriber sees both change together. */
  removedPaths: string[];
  push: (record: OpenUndoRecord) => void;
  drop: (ids: ReadonlySet<string>) => void;
  replace: (records: readonly OpenUndoRecord[]) => void;
  clear: () => void;
}

export const useOpenUndoStore = create<OpenUndoState>((set) => ({
  records: [],
  removedPaths: [],
  push: (record) =>
    set((s) => {
      const records = [...s.records, record];
      return { records, removedPaths: removedPathsOf(records) };
    }),
  drop: (ids) =>
    set((s) => {
      const records = s.records.filter((r) => !ids.has(r.id));
      return { records, removedPaths: removedPathsOf(records) };
    }),
  /** Put the log back as it was (a revision's Discard). */
  replace: (records) => set({ records: [...records], removedPaths: removedPathsOf(records) }),
  clear: () => set({ records: [], removedPaths: [] }),
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
      case "touch":
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
