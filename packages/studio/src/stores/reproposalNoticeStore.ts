// reproposalNoticeStore — the FR-016 non-blocking notice's one piece of live
// state (spec 079 T064).
//
// A tiny, single-purpose store rather than a prop threaded from StepHost to
// StudioFooter directly: the two components are siblings under StudioShell,
// not parent/child, so a shared store is the same pattern every other piece
// of footer-visible state already uses (surveyAnswerStore, stepWalkStore).
//
// NOT a second debounce timer (D3): the message is set synchronously on the
// Next that produces it (StepHost's commit path) and cleared on the NEXT
// navigation away from the step it was set for — no interval, no delay.
//
// `stepId` pins the message to the step it was raised for (the step the
// author just arrived at, per journey-strip-contract.md §9): StudioFooter
// clears the message once `activeStepId` no longer matches it, which is
// "the next navigation" without either component polling a timer.

import { create } from "zustand";

export interface ReproposalNoticeState {
  readonly message: string | null;
  readonly stepId: string | null;
  /** Raise the notice for the step the author just landed on. */
  setMessage: (message: string, stepId: string) => void;
  /** Clear it — called once the author navigates away from `stepId`. */
  clear: () => void;
}

export const useReproposalNoticeStore = create<ReproposalNoticeState>((set) => ({
  message: null,
  stepId: null,
  setMessage: (message, stepId) => set({ message, stepId }),
  clear: () => set({ message: null, stepId: null }),
}));
