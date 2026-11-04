// suggestedFixesStore: the consistency suggestions raised by applied changes
// (spec 111 US5). Transient by design: suggestions are recomputed, and only
// accepted and declined dispositions persist (in the decision record, see
// lib/suggestionDispositions.ts). Nothing here applies a change.

import { create } from "zustand";

import type { SuggestedFix } from "../lib/consistencySuggestions.ts";

export interface SuggestedFixesState {
  offered: readonly SuggestedFix[];
  /** Add suggestions, keeping one per id. */
  offer: (fixes: readonly SuggestedFix[]) => void;
  /** Remove one suggestion (accepted or skipped). */
  settle: (id: string) => void;
  clear: () => void;
}

export const useSuggestedFixesStore = create<SuggestedFixesState>()((set) => ({
  offered: [],
  offer: (fixes) =>
    set((s) => {
      const known = new Set(s.offered.map((f) => f.id));
      const fresh = fixes.filter((f) => !known.has(f.id));
      return fresh.length === 0 ? s : { offered: [...s.offered, ...fresh] };
    }),
  settle: (id) =>
    set((s) =>
      s.offered.some((f) => f.id === id)
        ? { offered: s.offered.filter((f) => f.id !== id) }
        : s,
    ),
  clear: () => set((s) => (s.offered.length === 0 ? s : { offered: [] })),
}));
