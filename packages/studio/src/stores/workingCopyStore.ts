// workingCopyStore — single canonical source of truth for the working copy.
//
// Holds the union of all state previously split across irStore and
// surveyResultsStore, plus base keyboard, base VFS, and base IR. irStore
// and surveyResultsStore are re-implemented as typed adapter views over this
// store so existing consumers continue to work byte-for-byte.
//
// Architecture contract:
//   - State lives HERE. The adapter hooks are selectors, not independent stores.
//   - `reset()` clears every slot including base + identity + instantiationMode.
//   - `instantiateFromBase()` is the explicit Track-1 entry point (spec §8 v1.3.0);
//     it sets base slots, seeds the carve IR, resets identity and all edit layers,
//     and records instantiationMode = "new-from-base".
//   - `instantiateFromExisting()` is the Track-2 entry point; it preserves the
//     loaded keyboard's identity and sets instantiationMode = "adapt-existing".
//   - `setIdentity()` overlays a post-instantiation identity patch.
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
  type TouchAssignment,
} from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Instantiation mode — spec §8 v1.3.0, two authoring tracks.
// ---------------------------------------------------------------------------

/**
 * Records which authoring track created this working copy.
 *
 * - `"new-from-base"`: Track 1 — author started fresh from a base keyboard;
 *   identity was RESET (new keyboard id placeholder, version "1.0").
 * - `"adapt-existing"`: Track 2 — author loaded an existing keyboard to adapt;
 *   identity was PRESERVED (id, name, BCP47 kept from the loaded keyboard).
 * - `null`: not yet instantiated (store is in pre-selection state).
 *
 * This is a studio-local field (not yet in the contracts package schema).
 * It informs UI affordances (e.g. showing "Adapting: <name>" vs
 * "New keyboard" in a future header bar) and will be promoted to a contracts
 * field in a future joint session when the output layer needs it.
 */
export type InstantiationMode = "new-from-base" | "adapt-existing" | null;

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
  /**
   * New keyboard identifier chosen by the author (Track 1 only).
   *
   * Must satisfy validateKeyboardId (§10 Layer A check #1: 1-255 chars,
   * no spaces / parens / brackets / commas). When set, the projection's id
   * rename pass (projectWorkingCopyVfs step 4) renames every
   * source/<baseId>.{kmn,kps,kvks,keyman-touch-layout,ico,css,htm,js} sibling
   * to source/<keyboardId>.*, rewrites the .kmn's path-bearing stores
   * (&KMW_EMBEDCSS, &KMW_HELPFILE, &VISUALKEYBOARD, &LAYOUTFILE, &BITMAP),
   * and rewrites `.kmw-keyboard-<baseId>` selectors in *.css and the
   * <ID> / <kbdname> references in *.kps and *.kvks. The downloaded zip
   * filename uses this id.
   */
  keyboardId: string;
}>;

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface WorkingCopyState {
  // -- Instantiation mode (spec §8 v1.3.0) ------------------------------------
  /**
   * Which authoring track created this working copy.
   * Null until instantiateFromBase or instantiateFromExisting is called.
   * See InstantiationMode for full semantics.
   */
  instantiationMode: InstantiationMode;

  // -- Canonical base slots (set by instantiateFromBase / instantiateFromExisting) --
  /** The keyboard the author chose as their adaptation base. Null until instantiation. */
  baseKeyboard: BaseKeyboard | null;
  /** VFS snapshot of the fetched base keyboard source. Null until instantiation. */
  baseVfs: VirtualFS | null;
  /** IR parsed from the base keyboard source. Null until instantiation. */
  baseIr: KeyboardIR | null;

  // -- Identity patch (set by setIdentity) -------------------------------------
  /**
   * Overlay produced by the identity survey step (Track 1) or preserved from
   * the loaded keyboard (Track 2). Applied on top of base keyboard metadata at
   * output time. Null until the user completes Phase A (Track 1) or until
   * instantiateFromExisting sets it from the loaded keyboard's identity (Track 2).
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
  /**
   * Touch-modality assignments produced by Phase E (touch gallery).
   * Stored as a flat list mirroring how Phase C assignments are kept.
   * Initialized to [] and replaced wholesale on each `recordTouchAssignments` call.
   */
  touchAssignments: TouchAssignment[];
  /**
   * Serialized JSON for the `.keyman-touch-layout` artifact, derived from
   * scaffoldTouchLayout(ir) at Phase E completion. Written into the cloned
   * VFS in serializeWorkingCopy before zipping (Option B — the base VFS is
   * immutable after instantiation; touch layout JSON is stored here as a
   * side-car string and injected at output time).
   * Null until Phase E completes.
   */
  touchLayoutJson: string | null;

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
   * Record Phase E (touch gallery) assignments, replacing any prior touch
   * assignments wholesale (last-wins). Call with [] to clear.
   *
   * These are stored separately from Phase C physical assignments because
   * Phase E runs after the desktop layout is locked and its output targets
   * the `.keyman-touch-layout` artifact rather than `.kmn` rules.
   */
  recordTouchAssignments: (assignments: TouchAssignment[]) => void;
  /**
   * Persist the serialized `.keyman-touch-layout` JSON produced at Phase E
   * completion. Replaces any prior value (last-wins). Pass the result of
   * `JSON.stringify(scaffoldTouchLayout(ir), null, 2)` from the call site.
   */
  setTouchLayoutJson: (json: string) => void;
  /**
   * Reset the entire working copy to initial state. Clears all slots
   * including base keyboard, base VFS, base IR, identity, carve IR,
   * survey results, and desktopLocked.
   */
  reset: () => void;

  // -- Instantiation actions (spec §8 v1.3.0) ----------------------------------

  /**
   * Track 1 — copy a base, NEW identity (spec §8 v1.3.0).
   *
   * Sets baseKeyboard, baseVfs, baseIr, and seeds the carve working IR from
   * baseIr. Resets identity to null (a fresh copy starts with no identity overlay
   * until the user completes Phase A). Clears all edit layers (deletedNodeIds,
   * undoStack, phaseResults / assignments) so a fresh copy starts clean.
   * Sets instantiationMode = "new-from-base".
   *
   * IDEMPOTENCE: if the working copy is already instantiated with the SAME
   * `base.id`, this call is a NO-OP — the existing layers (phaseResults, carve
   * deletions, identity) are preserved. Re-basing to a DIFFERENT base id still
   * re-instantiates unconditionally; the caller is responsible for confirming
   * with the user via `confirmRebaseIfEdited` before calling in that case.
   */
  instantiateFromBase: (
    base: BaseKeyboard,
    opts: { vfs: VirtualFS; ir: KeyboardIR },
  ) => void;

  /**
   * Track 2 — adapt an existing keyboard, identity PRESERVED (spec §8 v1.3.0).
   *
   * Sets baseKeyboard, baseVfs, baseIr, and seeds the carve working IR from
   * baseIr. Preserves identity from the loaded keyboard (id, name, BCP47 are
   * set from `keyboard.displayName` / `keyboard.id` rather than reset).
   * Clears edit layers so the adapt session starts clean.
   * Sets instantiationMode = "adapt-existing".
   *
   * NOTE: The UI entry point for Track 2 (import/source-picker path) does not
   * yet exist in the app. This action is store-ready; the wiring is a follow-up.
   * TODO(track2-ui): wire to the import/source-picker path when that UX lands.
   */
  instantiateFromExisting: (
    keyboard: BaseKeyboard,
    opts: { vfs: VirtualFS; ir: KeyboardIR },
  ) => void;

  /**
   * Apply an identity patch (language name, BCP47 tag, display name) over
   * the base keyboard identity. Replaces any prior patch (last-wins).
   */
  setIdentity: (patch: IdentityPatch) => void;

  /**
   * Returns true once instantiateFromBase or instantiateFromExisting has been
   * called (i.e. baseKeyboard is non-null). Callers that need the full triple
   * (base + VFS + IR) should check all three slots directly.
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
  | "setIrAxes" | "lockDesktop" | "unlockDesktop" | "recordTouchAssignments"
  | "setTouchLayoutJson" | "reset"
  | "instantiateFromBase" | "instantiateFromExisting" | "setIdentity" | "isInstantiated"
> = {
  // instantiation mode
  instantiationMode: null,
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
  touchAssignments: [],
  touchLayoutJson: null,
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

  recordTouchAssignments: (assignments) =>
    set({ touchAssignments: assignments }),

  setTouchLayoutJson: (json) =>
    set({ touchLayoutJson: json }),

  reset: () =>
    set({
      ...INITIAL_STATE,
      // Re-initialize mutable objects so mutations do not bleed across resets.
      deletedNodeIds: new Set(),
      // instantiationMode is null in INITIAL_STATE; explicit for clarity.
      instantiationMode: null,
    }),

  // -- Instantiation actions (spec §8 v1.3.0) ----------------------------------

  instantiateFromBase: (base, { vfs, ir }) => {
    // Idempotence guard: if already instantiated with the SAME base keyboard id,
    // do nothing. This prevents an async re-fire of onInstantiate from wiping
    // recorded survey answers when the user has not actually changed the base.
    // A different base id bypasses this guard and re-instantiates fully.
    const current = get();
    if (
      current.instantiationMode === "new-from-base" &&
      current.baseKeyboard !== null &&
      current.baseKeyboard.id === base.id
    ) {
      return;
    }

    // Track 1: new keyboard from base — identity RESET, edit layers cleared.
    set({
      instantiationMode: "new-from-base",
      baseKeyboard: base,
      baseVfs: vfs,
      baseIr: ir,
      // Reset identity: fresh copy has no overlay until Phase A completes.
      identity: null,
      // Seed the carve working IR from the base IR; clear any prior carve state.
      ir,
      deletedNodeIds: new Set(),
      undoStack: [],
      // Clear all survey results so the new keyboard starts without inherited
      // phase data from a prior session. irAxes also cleared (re-derived from
      // the new IR after recognition runs).
      ...remerge({}, []),
      desktopLocked: false,
      touchAssignments: [],
      touchLayoutJson: null,
    });
  },

  instantiateFromExisting: (keyboard, { vfs, ir }) =>
    // Track 2: adapt existing keyboard — identity PRESERVED from loaded keyboard.
    set({
      instantiationMode: "adapt-existing",
      baseKeyboard: keyboard,
      baseVfs: vfs,
      baseIr: ir,
      // Preserve identity from the loaded keyboard's metadata.
      // keyboardId is required: downstream consumers (serializeWorkingCopy zip
      // filename, MechanismGallery scaffoldSpec, lint identity checks) read
      // identity.keyboardId and get undefined without it — "no default is a defect"
      // per spec v1.3.1 §3c.
      identity: {
        keyboardId: keyboard.id,
        bcp47: keyboard.languages?.[0] ?? "",
        displayName: keyboard.displayName,
      },
      // Seed the carve working IR from the existing keyboard's IR.
      ir,
      deletedNodeIds: new Set(),
      undoStack: [],
      // Edit layers start clean for an adapt session too.
      ...remerge({}, []),
      desktopLocked: false,
      touchAssignments: [],
      touchLayoutJson: null,
    }),

  setIdentity: (patch) =>
    set({ identity: patch }),

  isInstantiated: () => get().baseKeyboard !== null,
}));
