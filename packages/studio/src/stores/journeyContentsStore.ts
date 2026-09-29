// journeyContentsStore — open state for the narrow-viewport journey contents
// sheet (JourneyContents.tsx).
//
// Two invokers open the one sheet: the "Contents" button in StudioFooter and
// the "Contents" item in NavBar's narrow menu. The sheet itself is mounted by
// StudioFooter (which owns the progress-dot data), so the footer also
// publishes `available` — whether there is a journey to list — and the menu
// item renders only while it is true. View state only; never persisted.

import { create } from "zustand";

interface JourneyContentsState {
  /** True while StudioFooter is mounted with a journey to list. */
  available: boolean;
  open: boolean;
  setAvailable: (available: boolean) => void;
  setOpen: (open: boolean) => void;
}

export const useJourneyContentsStore = create<JourneyContentsState>((set) => ({
  available: false,
  open: false,
  setAvailable: (available) =>
    set(available ? { available } : { available, open: false }),
  setOpen: (open) => set({ open }),
}));
