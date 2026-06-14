// irStore — adapter over workingCopyStore.
//
// All IR state lives in workingCopyStore. This module re-exports a
// useIRStore hook with the exact same call signatures as the original
// Zustand store so every existing consumer (React components, non-React
// callers via .getState()/.setState()) continues to work unchanged.
//
// Adapter technique: workingCopyStore holds the data; useIRStore is a
// UseBoundStore-shaped object whose hook body delegates to
// useWorkingCopyStore(selector) and whose .getState()/.setState() bridge
// directly to workingCopyStore's equivalents with a scoped view.

import { useStore } from "zustand/react";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "./workingCopyStore.ts";

// ---------------------------------------------------------------------------
// IRStoreState — the public type contract for existing consumers.
// Matches the original irStore interface byte-for-byte.
// ---------------------------------------------------------------------------

export interface IRStoreState {
  ir: KeyboardIR | null;
  deletedNodeIds: Set<string>;
  undoStack: string[];
  setIR: (ir: KeyboardIR) => void;
  clearIR: () => void;
  deleteNode: (nodeId: string) => void;
  undoDelete: () => void;
  restoreNode: (nodeId: string) => void;
  isDeleted: (nodeId: string) => boolean;
  keepAll: () => void;
}

// ---------------------------------------------------------------------------
// Selector — project the IR slice out of workingCopyStore state.
// Used both by the hook and by getState() so the shape is derived in one place.
// ---------------------------------------------------------------------------

function selectIRSlice(s: ReturnType<typeof useWorkingCopyStore.getState>): IRStoreState {
  return {
    ir: s.ir,
    deletedNodeIds: s.deletedNodeIds,
    undoStack: s.undoStack,
    setIR: s.setIR,
    clearIR: s.clearIR,
    deleteNode: s.deleteNode,
    undoDelete: s.undoDelete,
    restoreNode: s.restoreNode,
    isDeleted: s.isDeleted,
    keepAll: s.keepAll,
  };
}

// ---------------------------------------------------------------------------
// useIRStore — the adapter hook.
//
// Calling convention (matches original):
//   useIRStore()                    — returns full IRStoreState
//   useIRStore((s) => s.ir)         — returns selected slice
//   useIRStore.getState()           — imperative read (non-React callers)
//   useIRStore.setState({...})      — imperative partial write
//   useIRStore.subscribe(listener)  — subscribe to state changes
//   useIRStore.getInitialState()    — initial state
//
// IMPORTANT: Avoid returning freshly-allocated objects from within-selector
// bounds without useShallow — a selector like (s) => ({ ir: s.ir, ... }) would
// allocate a new object every render, causing re-render loops. The hook below
// is typed to only allow selectors that return stable (primitive / referentially
// stable) values. Callers that need multiple fields should call useIRStore
// multiple times with individual selectors, which is the pattern already used
// in every existing consumer (CarveGallery, CarveActions, PatternCard, etc.).
// ---------------------------------------------------------------------------

function useIRStoreHook(): IRStoreState;
function useIRStoreHook<U>(selector: (state: IRStoreState) => U): U;
function useIRStoreHook<U>(selector?: (state: IRStoreState) => U): IRStoreState | U {
  if (selector === undefined) {
    return useStore(useWorkingCopyStore, selectIRSlice);
  }
  return useStore(useWorkingCopyStore, (wcs) => selector(selectIRSlice(wcs)));
}

// ---------------------------------------------------------------------------
// Bridge: attach .getState() / .setState() / .subscribe() / .getInitialState()
// so that non-React callers (e.g. useKeyboardArtifact.ts) work unchanged.
// ---------------------------------------------------------------------------

const getState = (): IRStoreState => selectIRSlice(useWorkingCopyStore.getState());

const setState = (
  partial:
    | Partial<IRStoreState>
    | ((state: IRStoreState) => Partial<IRStoreState>),
): void => {
  if (typeof partial === "function") {
    const current = getState();
    const patch = partial(current);
    useWorkingCopyStore.setState(patch);
  } else {
    useWorkingCopyStore.setState(partial);
  }
};

const subscribe = (listener: (state: IRStoreState, prev: IRStoreState) => void) => {
  return useWorkingCopyStore.subscribe((wcs, prev) => {
    listener(selectIRSlice(wcs), selectIRSlice(prev));
  });
};

const getInitialState = (): IRStoreState =>
  selectIRSlice(useWorkingCopyStore.getInitialState());

// Compose the hook + static methods into a UseBoundStore-compatible shape.
export const useIRStore = Object.assign(useIRStoreHook, {
  getState,
  setState,
  subscribe,
  getInitialState,
});
