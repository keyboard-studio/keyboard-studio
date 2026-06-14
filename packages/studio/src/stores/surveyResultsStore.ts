// Survey-results store — adapter over workingCopyStore.
//
// All survey state lives in workingCopyStore. This module re-exports a
// useSurveyResultsStore hook with the exact same call signatures as the
// original Zustand store so every existing consumer (StudioShell.tsx,
// MechanismGallery.tsx, TouchGate, non-React callers via .getState()) works
// unchanged.
//
// See irStore.ts for the adapter technique.
//
// Mirrors the Zustand pattern in irStore.ts. The merged `session` is derived
// from `irAxes` + `phaseResults` via the contract's mergePhaseResults(), so the
// scoped assignment map (spec §7.7, SurveySession.assignments) and the merged
// axis vector are available to downstream consumers from one place.

import { useStore } from "zustand/react";
import type {
  DiscoveryAxisVector,
  MechanismAssignment,
  SurveyPhaseResult,
  SurveySession,
} from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "./workingCopyStore.ts";

// ---------------------------------------------------------------------------
// SurveyResultsState — the public type contract for existing consumers.
// Matches the original surveyResultsStore interface byte-for-byte.
// ---------------------------------------------------------------------------

export interface SurveyResultsState {
  /** Phase results captured so far, in completion order (A → B → … → F). */
  phaseResults: SurveyPhaseResult[];
  /**
   * IR-derived axis baseline, set before/at Phase A from the working IR's
   * recognized patterns. `{}` until IR seeding lands (see the IR seeding
   * milestone); updating it (e.g. after a carve-gallery decision) re-derives the session.
   */
  irAxes: Partial<DiscoveryAxisVector>;
  /** Merged session: `mergePhaseResults(irAxes, phaseResults)`. The single source downstream consumers read. */
  session: SurveySession;
  /**
   * Desktop layout lock flag (spec §7.7 / §8 "Gallery instantiation").
   *
   * Design note: the locked desktop layout IS session.assignments (physical)
   * frozen by convention. This flag prevents further physical edits (disabling
   * the MechanismGallery controls) rather than deep-copying a snapshot. The
   * assignments themselves continue to live in session.assignments — the lock
   * is a UI gate, not a separate data copy.
   *
   * Promotion to a contract field on SurveySession is NOT done here to avoid a
   * major-version contract change (spec §17 policy requires a joint
   * engine+content session for schema mutations). Recommend surfacing this in the
   * next schema joint session: if the lock flag needs to be persisted in the
   * VFS or communicated to the output layer it should become a top-level field
   * on SurveySession (or a separate DesktopLayoutSnapshot type). For studio-only
   * gate purposes (no VFS/output impact yet), the store-local boolean is the
   * right default.
   */
  desktopLocked: boolean;
  /**
   * Record a phase's result, then re-merge. Re-running a phase **replaces** its
   * earlier result (keyed by `phase`) rather than appending a duplicate, so the
   * merge's last-wins semantics stay correct on back-navigation + redo.
   */
  recordPhase: (result: SurveyPhaseResult) => void;
  /**
   * Convenience action for the §7.7 mechanism gallery: record a Phase C result
   * carrying the supplied assignments. Assignments are merged last-wins per
   * (modality, scope, target) via mergePhaseResults — prior Phase C assignments
   * are REPLACED (not accumulated) by this call so the gallery's "remove"
   * action works correctly. Call with an empty array to clear all assignments.
   *
   * Character-class scope is supported here (the store is scope-agnostic);
   * the gallery UI currently exposes only keyboard-default and individual.
   */
  recordAssignments: (assignments: MechanismAssignment[]) => void;
  /** Update the IR-derived baseline (carve gallery / recognizer), then re-merge. */
  setIrAxes: (irAxes: Partial<DiscoveryAxisVector>) => void;
  /**
   * Lock the desktop layout. Once locked, the MechanismGallery controls are
   * disabled and the touch gallery is unblocked. Requires at least one physical
   * assignment to be meaningful (enforced in the UI, not the store).
   */
  lockDesktop: () => void;
  /**
   * Unlock the desktop layout, restoring MechanismGallery editing and re-gating
   * the touch gallery.
   */
  unlockDesktop: () => void;
  /** Reset to an empty session (start over). Clears desktopLocked to false. */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Selector — project the survey slice out of workingCopyStore state.
// ---------------------------------------------------------------------------

function selectSurveySlice(
  s: ReturnType<typeof useWorkingCopyStore.getState>,
): SurveyResultsState {
  return {
    phaseResults: s.phaseResults,
    irAxes: s.irAxes,
    session: s.session,
    desktopLocked: s.desktopLocked,
    recordPhase: s.recordPhase,
    recordAssignments: s.recordAssignments,
    setIrAxes: s.setIrAxes,
    lockDesktop: s.lockDesktop,
    unlockDesktop: s.unlockDesktop,
    reset: s.reset,
  };
}

// ---------------------------------------------------------------------------
// useSurveyResultsStore — the adapter hook.
//
// Calling convention (matches original):
//   useSurveyResultsStore()                         — full SurveyResultsState
//   useSurveyResultsStore((s) => s.desktopLocked)   — selected slice
//   useSurveyResultsStore.getState()                — imperative read
//   useSurveyResultsStore.setState({...})           — imperative partial write
//   useSurveyResultsStore.subscribe(listener)       — subscribe to changes
//   useSurveyResultsStore.getInitialState()         — initial state
// ---------------------------------------------------------------------------

function useSurveyResultsStoreHook(): SurveyResultsState;
function useSurveyResultsStoreHook<U>(selector: (state: SurveyResultsState) => U): U;
function useSurveyResultsStoreHook<U>(
  selector?: (state: SurveyResultsState) => U,
): SurveyResultsState | U {
  if (selector === undefined) {
    return useStore(useWorkingCopyStore, selectSurveySlice);
  }
  return useStore(useWorkingCopyStore, (wcs) => selector(selectSurveySlice(wcs)));
}

// ---------------------------------------------------------------------------
// Bridge: attach .getState() / .setState() / .subscribe() / .getInitialState()
// ---------------------------------------------------------------------------

const getState = (): SurveyResultsState =>
  selectSurveySlice(useWorkingCopyStore.getState());

const setState = (
  partial:
    | Partial<SurveyResultsState>
    | ((state: SurveyResultsState) => Partial<SurveyResultsState>),
): void => {
  if (typeof partial === "function") {
    const current = getState();
    const patch = partial(current);
    useWorkingCopyStore.setState(patch);
  } else {
    useWorkingCopyStore.setState(partial);
  }
};

const subscribe = (
  listener: (state: SurveyResultsState, prev: SurveyResultsState) => void,
) => {
  return useWorkingCopyStore.subscribe((wcs, prev) => {
    listener(selectSurveySlice(wcs), selectSurveySlice(prev));
  });
};

const getInitialState = (): SurveyResultsState =>
  selectSurveySlice(useWorkingCopyStore.getInitialState());

export const useSurveyResultsStore = Object.assign(useSurveyResultsStoreHook, {
  getState,
  setState,
  subscribe,
  getInitialState,
});
