// workingCopyStore — single canonical source of truth for the working copy.
//
// Holds the union of all state previously split across irStore and
// surveyResultsStore, plus new Phase 2 scaffolding slots for the base
// keyboard, base VFS, and base IR. irStore and surveyResultsStore are
// re-implemented as typed adapter views over this store so existing
// consumers continue to work byte-for-byte.
//
// Architecture contract:
//   - State lives HERE. The adapter hooks are selectors, not independent stores.
//   - `reset()` clears every slot including base + identity.
//   - `instantiateFromBase()` and `setIdentity()` are no-ops for Phase 1;
//     they set the new slots and will be wired to the session spine in Phase 2.
//   - No host-disk writes. VirtualFS lives as a React-state reference.
//   - Worker boundary upheld: WASM is not imported here.

import { create } from "zustand";
import type { BaseKeyboard, KeyboardIR, VirtualFS } from "@keyboard-studio/contracts";
import {
  mergePhaseResults,
  type DiscoveryAxisVector,
  type MechanismAssignment,
  type SurveyPhaseResult,
  type SurveySession,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Identity patch — lightweight overlay for the "identity" phase result.
// Typed as a partial record so Phase 2 can add fields without a schema bump.
// ---------------------------------------------------------------------------

export type IdentityPatch = Partial<{
  /** BCP47 tag for the new keyboard (e.g. "ha-Latn"). */
  bcp47: string;
  /** Human-readable display name for the new keyboard. */
  displayName: string;
  /** Raw target script subtag as entered by the user (e.g. "Latn", "Deva"). */
  targetScript: string;
}>;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface WorkingCopyState {
  // -- New canonical base slots (set by instantiateFromBase in Phase 2) --------
  /** The keyboard the author chose as their adaptation base. Null until a base is selected. */
  baseKeyboard: BaseKeyboard | null;
  /** VFS snapshot of the fetched base keyboard source. Null until Phase 2 instantiation. */
  baseVfs: VirtualFS | null;
  /** IR parsed from the base keyboard source. Null until Phase 2 instantiation. */
  baseIr: KeyboardIR | null;

  // -- Identity patch (set by setIdentity) -------------------------------------
  /**
   * Overlay produced by the identity survey step. Applied on top of base
   * keyboard metadata at output time. Null until the user completes Phase A.
   */
  identity: IdentityPatch | null;

  // -- Carve working IR (irStore slots) ----------------------------------------
  /**
   * Carve working IR — the in-progress keyboard IR being edited in the carve
   * gallery. May diverge from baseIr once carve deletions / restores apply.
   * Null until the compile step sets it.
   */
  ir: KeyboardIR | null;
  /**
   * Set of node IDs the user has marked for deletion in the carve gallery.
   * Kept as a layer (not an eager IR mutation) so undo is O(1).
   */
  deletedNodeIds: Set<string>;
  /** Ordered list of node IDs deleted (latest last) for undo semantics. */
  undoStack: string[];

  // -- Survey results (surveyResultsStore slots) --------------------------------
  /** Phase results captured so far, in completion order (A → B → … → F). */
  phaseResults: SurveyPhaseResult[];
  /**
   * IR-derived axis baseline, set before Phase A from the recognized patterns.
   * Updating this re-derives the session.
   */
  irAxes: Partial<DiscoveryAxisVector>;
  /** Merged session derived from irAxes + phaseResults via mergePhaseResults(). */
  session: SurveySession;
  /** Desktop layout lock — prevents further physical edits until unlocked. */
  desktopLocked: boolean;

  // -- Actions (irStore) -------------------------------------------------------
  /** Set the carve working IR, clearing carve deletion state. */
  setIR: (ir: KeyboardIR) => void;
  /** Clear the carve working IR and reset carve deletion state. */
  clearIR: () => void;
  /** Mark a node as deleted and push to undo stack. */
  deleteNode: (nodeId: string) => void;
  /** Pop the most recently deleted node from the undo stack. */
  undoDelete: () => void;
  /** Restore a specific node by ID, removing all its undo stack entries. */
  restoreNode: (nodeId: string) => void;
  /** Returns true if the given nodeId is in the deletion set. */
  isDeleted: (nodeId: string) => boolean;
  /** Clear all deletions and the undo stack without touching the IR. */
  keepAll: () => void;

  // -- Actions (surveyResultsStore) --------------------------------------------
  /**
   * Record a phase result and re-derive the session. Re-running a phase
   * replaces its earlier result (keyed by phase) so back-navigation works.
   */
  recordPhase: (result: SurveyPhaseResult) => void;
  /**
   * Record a Phase C result carrying the given assignments, replacing any
   * prior Phase C assignments (last-wins semantics). Call with [] to clear.
   */
  recordAssignments: (assignments: MechanismAssignment[]) => void;
  /** Update the IR-derived axis baseline and re-derive the session. */
  setIrAxes: (irAxes: Partial<DiscoveryAxisVector>) => void;
  /** Lock the desktop layout (prevents MechanismGallery edits). */
  lockDesktop: () => void;
  /** Unlock the desktop layout (restores MechanismGallery editing). */
  unlockDesktop: () => void;
  /**
   * Reset the entire working copy to initial state. Clears all slots
   * including base keyboard, base VFS, base IR, identity, carve IR,
   * survey results, and desktopLocked.
   */
  reset: () => void;

  // -- Phase 2 scaffolding (no-ops for Phase 1) --------------------------------
  /**
   * Instantiate the working copy from a selected base keyboard. Sets
   * baseKeyboard, baseVfs, and baseIr, then seeds the carve working IR
   * from baseIr. No-op in Phase 1 (Phase 2 wires this to the session spine).
   */
  instantiateFromBase: (
    base: BaseKeyboard,
    opts: { vfs: VirtualFS; ir: KeyboardIR },
  ) => void;
  /**
   * Apply an identity patch (language name, BCP47 tag, display name) over
   * the base keyboard identity. No-op in Phase 1.
   */
  setIdentity: (patch: IdentityPatch) => void;
  /**
   * Returns true once instantiateFromBase has been called (i.e. baseKeyboard
   * is non-null). Callers that need the full triple (base + VFS + IR) should
   * check all three slots directly.
   */
  isInstantiated: () => boolean;
}

// ---------------------------------------------------------------------------
// Helpers (mirrored from surveyResultsStore to avoid a cyclic dependency)
// ---------------------------------------------------------------------------

function remerge(
  irAxes: Partial<DiscoveryAxisVector>,
  phaseResults: SurveyPhaseResult[],
): Pick<WorkingCopyState, "phaseResults" | "irAxes" | "session"> {
  return {
    phaseResults,
    irAxes,
    session: mergePhaseResults(irAxes, phaseResults),
  };
}

// ---------------------------------------------------------------------------
// Initial state (extracted so reset() and the initializer share one source)
// ---------------------------------------------------------------------------

const INITIAL_SURVEY = remerge({}, []);

const INITIAL_STATE: Omit<
  WorkingCopyState,
  // actions are excluded from the initial state snapshot
  | "setIR" | "clearIR" | "deleteNode" | "undoDelete" | "restoreNode"
  | "isDeleted" | "keepAll" | "recordPhase" | "recordAssignments"
  | "setIrAxes" | "lockDesktop" | "unlockDesktop" | "reset"
  | "instantiateFromBase" | "setIdentity" | "isInstantiated"
> = {
  // base slots
  baseKeyboard: null,
  baseVfs: null,
  baseIr: null,
  identity: null,
  // carve IR slots
  ir: null,
  deletedNodeIds: new Set(),
  undoStack: [],
  // survey slots
  ...INITIAL_SURVEY,
  desktopLocked: false,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkingCopyStore = create<WorkingCopyState>((set, get) => ({
  ...INITIAL_STATE,

  // -- irStore actions -------------------------------------------------------

  setIR: (ir) =>
    set({ ir, deletedNodeIds: new Set(), undoStack: [] }),

  clearIR: () =>
    set({ ir: null, deletedNodeIds: new Set(), undoStack: [] }),

  deleteNode: (nodeId) =>
    set((s) => ({
      deletedNodeIds: new Set([...s.deletedNodeIds, nodeId]),
      undoStack: [...s.undoStack, nodeId],
    })),

  undoDelete: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const last = s.undoStack[s.undoStack.length - 1] as string;
      const next = new Set(s.deletedNodeIds);
      next.delete(last);
      return { deletedNodeIds: next, undoStack: s.undoStack.slice(0, -1) };
    }),

  restoreNode: (nodeId) =>
    set((s) => {
      const next = new Set(s.deletedNodeIds);
      next.delete(nodeId);
      return {
        deletedNodeIds: next,
        undoStack: s.undoStack.filter((id) => id !== nodeId),
      };
    }),

  isDeleted: (nodeId) => get().deletedNodeIds.has(nodeId),

  keepAll: () =>
    set({ deletedNodeIds: new Set(), undoStack: [] }),

  // -- surveyResultsStore actions --------------------------------------------

  recordPhase: (result) => {
    const prev = get().phaseResults;
    const idx = prev.findIndex((p) => p.phase === result.phase);
    const next =
      idx === -1
        ? [...prev, result]
        : prev.map((p, i) => (i === idx ? result : p));
    set(remerge(get().irAxes, next));
  },

  recordAssignments: (assignments) => {
    const prev = get().phaseResults;
    const existingC = prev.find((p) => p.phase === "C");
    const next: SurveyPhaseResult = {
      phase: "C",
      answers: existingC?.answers ?? [],
      ...(existingC?.selectedPatternIds !== undefined
        ? { selectedPatternIds: existingC.selectedPatternIds }
        : {}),
      assignments,
    };
    const idx = prev.findIndex((p) => p.phase === "C");
    const updated =
      idx === -1 ? [...prev, next] : prev.map((p, i) => (i === idx ? next : p));
    set(remerge(get().irAxes, updated));
  },

  setIrAxes: (irAxes) =>
    set(remerge(irAxes, get().phaseResults)),

  lockDesktop: () =>
    set({ desktopLocked: true }),

  unlockDesktop: () =>
    set({ desktopLocked: false }),

  reset: () =>
    set({
      ...INITIAL_STATE,
      // Re-initialize mutable objects so mutations do not bleed across resets.
      deletedNodeIds: new Set(),
    }),

  // -- Phase 2 scaffolding ---------------------------------------------------

  instantiateFromBase: (base, { vfs, ir }) =>
    set({
      baseKeyboard: base,
      baseVfs: vfs,
      baseIr: ir,
      // Seed the carve working IR from the base IR; clear any prior carve state.
      ir,
      deletedNodeIds: new Set(),
      undoStack: [],
    }),

  setIdentity: (patch) =>
    set({ identity: patch }),

  isInstantiated: () => get().baseKeyboard !== null,
}));
