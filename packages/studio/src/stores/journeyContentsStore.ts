// journeyContentsStore — open state for the narrow-viewport journey contents
// sheet (JourneyContents.tsx).
//
// Two invokers open the one sheet: the "Contents" button in StudioFooter and
// the "Contents" item in NavBar's narrow menu. The sheet itself is mounted by
// StudioFooter (which owns the progress-dot data), so the footer also
// publishes `available` — whether there is a journey to list — and the menu
// item renders only while it is true. View state only; never persisted.

import { create } from "zustand";

export interface JourneyContentsOrigin {
  /** Viewport x of the trigger that opened the sheet, in px. */
  readonly x: number;
  /** Viewport y of the trigger that opened the sheet, in px. */
  readonly y: number;
}

interface JourneyContentsState {
  /** True while StudioFooter is mounted with a journey to list. */
  available: boolean;
  open: boolean;
  /**
   * Where the trigger that opened the sheet sits. JourneyContents translates
   * this into the sheet's own box and hands it to CSS as the transform
   * origin, so the enter/exit reads as emerging from the button that opened
   * it. Kept across close — the exit animation still needs it after `open`
   * flips false — and replaced on every open that supplies one.
   */
  origin: JourneyContentsOrigin | null;
  setAvailable: (available: boolean) => void;
  setOpen: (open: boolean, origin?: JourneyContentsOrigin | null) => void;
}

export const useJourneyContentsStore = create<JourneyContentsState>((set) => ({
  available: false,
  open: false,
  origin: null,
  setAvailable: (available) =>
    set(available ? { available } : { available, open: false }),
  setOpen: (open, origin) =>
    set((state) => ({
      open,
      origin: origin === undefined ? state.origin : origin,
    })),
}));
