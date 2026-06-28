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
import type { BaseKeyboard, KeyboardIR, LintFinding, RemovalCapability, VirtualFS } from "@keyboard-studio/contracts";
import {
  mergePhaseResults,
  type DiscoveryAxisVector,
  type MechanismAssignment,
  type SurveyPhaseResult,
  type SurveySession,
  type TouchAssignment,
} from "@keyboard-studio/contracts";
import { computeStalenessFromManifest } from "../dashboard/completeness.ts";
import type { Step } from "../steps/types.ts";

// ---------------------------------------------------------------------------
// Manifest binding — avoids a static import of steps/manifest.ts which would
// create a circular dependency: stores/ → steps/manifest.ts →
// steps/registerEditorSteps.ts → editors/ → stores/workingCopyStore.ts.
//
// `bindManifest(m)` is called once from StudioShell (which already imports the
// manifest). depcruise's `no-circular` rule checks static import edges only, so
// a function call does not create a dependency edge.
// ---------------------------------------------------------------------------

/** @internal — module-level manifest reference; set by bindManifest before first use. */
let _manifest: readonly Step[] = [];

/**
 * @internal — the ROOTS of the re-opened set. Distinct from `staleSteps` (the derived
 * closure). markStale adds to this set; clearStale removes from it; both then recompute
 * the closure. This separation prevents ghost-stale: clearing a root correctly removes
 * its downstream dependents from staleSteps (since the closure is recomputed from the
 * remaining roots, not from the prior closure).
 *
 * Reset on reset() / instantiateFromBase() / instantiateFromExisting().
 */
let _reopenedRoots: Set<string> = new Set();

/**
 * Bind the live manifest to the staleness actions in this store.
 *
 * Must be called once before `markStale` or `clearStale` is used.
 * Designed to be called from StudioShell, which already imports the manifest,
 * to avoid a circular static import through steps/ → editors/ → stores/.
 */
export function bindManifest(m: readonly Step[]): void {
  _manifest = m;
}

// ---------------------------------------------------------------------------
// Undo stack entry — discriminated union so node and item deletions share one stack.
// ---------------------------------------------------------------------------

/** One entry on the undo stack: 'n' = whole node deleted, 'i' = single item removed. */
export type UndoEntry = { k: 'n'; id: string } | { k: 'i'; id: string };

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
   * Per-rule removal capability map, computed once at instantiation from the
   * base IR by `classifyRemovalCapabilities`. Keyed by rule.nodeId (and by
   * output-store nodeId for S-02 slot tiles). Never recomputed on carve edits —
   * it derives from the base IR, not the carve working IR.
   */
  removalCapabilities: Map<string, RemovalCapability>;
  /**
   * Set of node IDs the user has marked for deletion in the carve gallery.
   * Kept as a layer (not an eager IR mutation) so undo is O(1).
   */
  deletedNodeIds: Set<string>;
  /**
   * Set of item IDs (individual characters / rules within a node) the user
   * has removed. Format: `"<nodeId>#<index>"` or `"<nodeId>#r<ruleIndex>"`.
   */
  deletedItemIds: Set<string>;
  /** Ordered list of undo entries (latest last). Each entry is either a whole-node
   * deletion or a single-item removal. */
  undoStack: UndoEntry[];

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
   * Serialized JSON for the `.keyman-touch-layout` artifact, derived from
   * scaffoldTouchLayout(ir) at Phase E completion. Written into the cloned
   * VFS in serializeWorkingCopy before zipping (Option B — the base VFS is
   * immutable after instantiation; touch layout JSON is stored here as a
   * side-car string and injected at output time).
   * Null until Phase E completes.
   */
  touchLayoutJson: string | null;
  /**
   * In-progress Phase E (touch gallery) draft state — persisted across
   * unmount/remount when the user navigates back to Phase C and returns.
   *
   * - `charTouchEntries`: serializable form of the `charTouch` Map
   *   (array of [char, TouchAssignment] pairs so it survives JSON round-trips).
   * - `skippedChars`: array form of the `skippedChars` Set.
   *
   * Null until Phase E first mounts and writes back state. Cleared on reset
   * and on a new instantiation.
   */
  touchDraft: {
    charTouchEntries: Array<[string, TouchAssignment]>;
    skippedChars: string[];
  } | null;

  /**
   * One-time gallery intro splashes the author has dismissed this working-copy
   * session, keyed by gallery. Both the desktop Mechanism Gallery (Phase C) and
   * the Touch Gallery (Phase E) show a brief orientation splash on first entry;
   * this records which have been seen so back-and-forth navigation does not
   * re-show them. Cleared on reset and on a new instantiation.
   */
  galleryIntrosSeen: { mechanism: boolean; touch: boolean };

  // -- Staleness slice (US3, T040) -----------------------------------------------
  /**
   * Currently-stale step ids (transitive closure over the writes→inputs data
   * graph from the re-opened set). Default: empty ("fresh"). Derived UI state —
   * not persisted; recomputed on markStale/clearStale. (FR-019, data-model.md)
   */
  staleSteps: Set<string>;

  // -- Validator findings slice (US5, T034 live-wiring) --------------------------
  /**
   * The most recent Layer-A validator findings produced by the SINGLE debounced
   * `useValidator` cycle in `SurveyView`. Published here via an effect so that
   * `StudioShell` (a sibling component, where the single `runCompleteness` call
   * site lives) can pass the REAL findings into C4 spine-prefix shippability
   * WITHOUT spinning up a second `useValidator`/debounce — honoring Article IV /
   * V3 (exactly one debounce timer). Default: empty (the pure structural proxy,
   * byte-identical to flag-off / legacy behavior; findings only become non-empty
   * through the normal validator cycle). Derived UI state — not persisted.
   */
  validatorFindings: LintFinding[];

  // -- Actions (irStore) -------------------------------------------------------
  /**
   * Set the carve working IR for a FULL/base replacement, clearing carve
   * deletion state (deletedNodeIds, deletedItemIds, undoStack).
   *
   * Use this only when the working IR is being REPLACED wholesale (e.g. loading
   * a different keyboard / re-seeding from a new base), where stale carve
   * deletions correctly must not carry over. For INCREMENTAL patches to the
   * working IR (the spec-014 mutate seam: question mutate-apply, touch
   * re-propagation, touch promotion) use {@link setWorkingIR}, which preserves
   * the live carve-deletion overlay.
   */
  setIR: (ir: KeyboardIR) => void;
  /**
   * Update the carve working IR WITHOUT touching the carve-deletion overlay
   * (deletedNodeIds, deletedItemIds, undoStack).
   *
   * This is the write path for spec-014 mutate-seam INCREMENTAL patches: the
   * reducer's question mutate-apply (US1), touch re-propagation (US2), and the
   * TouchGallery `hand-set` promotion (US2). Those writes happen AFTER the carve
   * step and must preserve the live overlay that the OSK preview
   * (`useWorkingCopyTransform`) and the shipped output (`serializeWorkingCopy` /
   * `projectWorkingCopyForOutput`, which project from baseIr + the overlay)
   * consume. Routing them through {@link setIR} silently wipes those deletions.
   */
  setWorkingIR: (ir: KeyboardIR) => void;
  /** Clear the carve working IR and reset carve deletion state. */
  clearIR: () => void;
  /** Mark a node as deleted and push to undo stack. */
  deleteNode: (nodeId: string) => void;
  /** Pop the most recently deleted entry from the undo stack (node or item). */
  undoDelete: () => void;
  /** Restore a specific node by ID, removing all its undo stack entries. */
  restoreNode: (nodeId: string) => void;
  /** Returns true if the given nodeId is in the deletion set. */
  isDeleted: (nodeId: string) => boolean;
  /** Mark an individual item (character / rule within a node) as removed. */
  deleteItem: (itemId: string) => void;
  /** Restore an individual item by ID. */
  restoreItem: (itemId: string) => void;
  /** Returns true if the given itemId is in the item deletion set. */
  isItemDeleted: (itemId: string) => boolean;
  /** Clear all deletions (nodes + items) and the undo stack without touching the IR. */
  keepAll: () => void;
  /** Clear all deletions (nodes + items) and the undo stack. Alias for keepAll with clearer name. */
  restoreAll: () => void;

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
   * Persist the serialized `.keyman-touch-layout` JSON produced at Phase E
   * completion. Replaces any prior value (last-wins).
   * Pass `null` when there are no real touch edits — the store will clear any
   * previously stored layout so `serializeWorkingCopy` leaves the VFS untouched
   * and KMW renders its own native default (or the keyboard's shipped file).
   */
  setTouchLayoutJson: (json: string | null) => void;
  /**
   * Persist the in-progress Phase E draft so it survives an unmount/remount
   * caused by back-navigation to Phase C. Call from TouchGallery whenever
   * charTouch or skippedChars change (or on unmount). Pass null to clear.
   */
  setTouchDraft: (
    draft: { charTouchEntries: Array<[string, TouchAssignment]>; skippedChars: string[] } | null,
  ) => void;
  /** Mark a gallery's one-time intro splash as seen for this working-copy session. */
  markGalleryIntroSeen: (gallery: "mechanism" | "touch") => void;
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
    opts: { vfs: VirtualFS; ir: KeyboardIR; removalCapabilities?: Map<string, RemovalCapability> },
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
    opts: { vfs: VirtualFS; ir: KeyboardIR; removalCapabilities?: Map<string, RemovalCapability> },
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

  // -- Staleness actions (US3, T040) -------------------------------------------

  /**
   * Re-open a step and recompute the transitive staleness closure.
   *
   * Adds `reopenedId` to the re-opened set, then computes the fixpoint of all
   * step ids transitively invalidated by the re-opened set over the manifest's
   * writes→inputs data graph. Stores the result in `staleSteps`.
   *
   * Uses `computeStalenessFromManifest` from `dashboard/completeness.ts` and
   * the manifest bound via `bindManifest()`. The stores/ → dashboard/ import
   * direction is NOT forbidden by the depcruise `dashboard-layer` rule (which
   * forbids the reverse: dashboard/ → stores/). The manifest is accessed via a
   * module-level reference (not a static import) to avoid a circular dep through
   * steps/ → editors/ → stores/.
   */
  markStale: (reopenedId: string) => void;

  /**
   * Clear a step from the stale set (on re-answer / completion) and recompute
   * dependents.
   *
   * Removes `stepId` from the current re-opened set, then recomputes the
   * transitive closure from the remaining re-opened steps. This ensures that
   * clearing one step does not leave its dependents as ghost-stale if they were
   * only stale because of the cleared step.
   */
  clearStale: (stepId: string) => void;

  // -- Validator findings actions (US5, T034 live-wiring) ----------------------

  /**
   * Publish the latest Layer-A validator findings from the single debounced
   * `useValidator` cycle in `SurveyView`. No-op (returns prior state reference)
   * when the incoming findings are reference-equal to the stored ones, so an
   * effect that re-fires with the same `findings` array does not trigger a
   * spurious store update / re-render. The debounce already coalesces input
   * changes; this setter never starts a timer or async work.
   */
  setValidatorFindings: (findings: LintFinding[]) => void;
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
  | "setIR" | "setWorkingIR" | "clearIR" | "deleteNode" | "undoDelete" | "restoreNode"
  | "isDeleted" | "deleteItem" | "restoreItem" | "isItemDeleted" | "keepAll" | "restoreAll"
  | "recordPhase" | "recordAssignments"
  | "setIrAxes" | "lockDesktop" | "unlockDesktop"
  | "setTouchLayoutJson" | "setTouchDraft" | "markGalleryIntroSeen" | "reset"
  | "instantiateFromBase" | "instantiateFromExisting" | "setIdentity" | "isInstantiated"
  | "markStale" | "clearStale"
  | "setValidatorFindings"
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
  removalCapabilities: new Map(),
  deletedNodeIds: new Set(),
  deletedItemIds: new Set(),
  undoStack: [],
  // survey slots
  ...INITIAL_SURVEY,
  desktopLocked: false,
  touchLayoutJson: null,
  touchDraft: null,
  galleryIntrosSeen: { mechanism: false, touch: false },
  // staleness slice (US3) — default empty ("fresh", FR-019)
  staleSteps: new Set<string>(),
  // validator findings slice (US5, T034) — default empty (structural proxy)
  validatorFindings: [],
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useWorkingCopyStore = create<WorkingCopyState>((set, get) => ({
  ...INITIAL_STATE,

  // -- irStore actions -------------------------------------------------------

  setIR: (ir) =>
    set({ ir, deletedNodeIds: new Set(), deletedItemIds: new Set(), undoStack: [] }),

  // Overlay-preserving write for spec-014 mutate-seam incremental patches.
  // Deliberately writes ONLY `ir`, leaving deletedNodeIds/deletedItemIds/undoStack
  // untouched so the carve-deletion overlay survives a mutate-seam write.
  setWorkingIR: (ir) =>
    set({ ir }),

  clearIR: () =>
    set({ ir: null, deletedNodeIds: new Set(), deletedItemIds: new Set(), undoStack: [] }),

  deleteNode: (nodeId) =>
    set((s) => ({
      deletedNodeIds: new Set([...s.deletedNodeIds, nodeId]),
      undoStack: [...s.undoStack, { k: 'n', id: nodeId }],
    })),

  undoDelete: () =>
    set((s) => {
      if (s.undoStack.length === 0) return s;
      const last = s.undoStack[s.undoStack.length - 1]!;
      if (last.k === 'n') {
        const next = new Set(s.deletedNodeIds);
        next.delete(last.id);
        return { deletedNodeIds: next, undoStack: s.undoStack.slice(0, -1) };
      } else {
        const next = new Set(s.deletedItemIds);
        next.delete(last.id);
        return { deletedItemIds: next, undoStack: s.undoStack.slice(0, -1) };
      }
    }),

  restoreNode: (nodeId) =>
    set((s) => {
      const next = new Set(s.deletedNodeIds);
      next.delete(nodeId);
      return {
        deletedNodeIds: next,
        undoStack: s.undoStack.filter((e) => !(e.k === 'n' && e.id === nodeId)),
      };
    }),

  isDeleted: (nodeId) => get().deletedNodeIds.has(nodeId),

  deleteItem: (itemId) =>
    set((s) => ({
      deletedItemIds: new Set([...s.deletedItemIds, itemId]),
      undoStack: [...s.undoStack, { k: 'i', id: itemId }],
    })),

  restoreItem: (itemId) =>
    set((s) => {
      const next = new Set(s.deletedItemIds);
      next.delete(itemId);
      return {
        deletedItemIds: next,
        undoStack: s.undoStack.filter((e) => !(e.k === 'i' && e.id === itemId)),
      };
    }),

  isItemDeleted: (itemId) => get().deletedItemIds.has(itemId),

  keepAll: () =>
    set({ deletedNodeIds: new Set(), deletedItemIds: new Set(), undoStack: [] }),

  restoreAll: () => get().keepAll(),

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

  setTouchLayoutJson: (json) =>
    set({ touchLayoutJson: json }),

  setTouchDraft: (draft) =>
    set({ touchDraft: draft }),

  markGalleryIntroSeen: (gallery) =>
    set((s) => ({
      galleryIntrosSeen: { ...s.galleryIntrosSeen, [gallery]: true },
    })),

  reset: () => {
    // Clear the module-level re-opened roots so clearStale after reset is correct.
    _reopenedRoots = new Set();
    set({
      ...INITIAL_STATE,
      // Re-initialize mutable objects so mutations do not bleed across resets.
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      removalCapabilities: new Map(),
      galleryIntrosSeen: { mechanism: false, touch: false },
      staleSteps: new Set<string>(),
      // instantiationMode is null in INITIAL_STATE; explicit for clarity.
      instantiationMode: null,
    });
  },

  // -- Instantiation actions (spec §8 v1.3.0) ----------------------------------

  instantiateFromBase: (base, { vfs, ir, removalCapabilities }) => {
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
    _reopenedRoots = new Set(); // reset staleness roots for the new session
    set({
      instantiationMode: "new-from-base",
      baseKeyboard: base,
      baseVfs: vfs,
      baseIr: ir,
      // Reset identity: fresh copy has no overlay until Phase A completes.
      identity: null,
      // Seed the carve working IR from the base IR; clear any prior carve state.
      ir,
      removalCapabilities: removalCapabilities ?? new Map(),
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      undoStack: [],
      // Clear all survey results so the new keyboard starts without inherited
      // phase data from a prior session. irAxes also cleared (re-derived from
      // the new IR after recognition runs).
      ...remerge({}, []),
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
      staleSteps: new Set<string>(),
    });
  },

  instantiateFromExisting: (keyboard, { vfs, ir, removalCapabilities }) => {
    _reopenedRoots = new Set(); // reset staleness roots for the new session
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
      removalCapabilities: removalCapabilities ?? new Map(),
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      undoStack: [],
      // Edit layers start clean for an adapt session too.
      ...remerge({}, []),
      desktopLocked: false,
      touchLayoutJson: null,
      touchDraft: null,
      galleryIntrosSeen: { mechanism: false, touch: false },
      staleSteps: new Set<string>(),
    });
  },

  setIdentity: (patch) =>
    set({ identity: patch }),

  isInstantiated: () => get().baseKeyboard !== null,

  // -- Staleness actions (US3, T040) -------------------------------------------

  markStale: (reopenedId) => {
    // Guard: fail loud if the manifest has not been bound yet.
    if (_manifest.length === 0) {
      throw new Error("[workingCopyStore] bindManifest() must be called before markStale");
    }
    // Add the reopened step to the ROOT set (NOT the derived closure).
    // The root set is the seed; the closure is derived from it.
    // Using the root set prevents ghost-stale: downstream steps that were
    // only stale because of a root can be correctly cleared by clearStale.
    _reopenedRoots = new Set([..._reopenedRoots, reopenedId]);
    const staleSteps = computeStalenessFromManifest(_manifest, _reopenedRoots);
    set({ staleSteps });
  },

  clearStale: (stepId) => {
    // Guard: fail loud if the manifest has not been bound yet.
    if (_manifest.length === 0) {
      throw new Error("[workingCopyStore] bindManifest() must be called before clearStale");
    }
    // Remove from the ROOT set, then recompute the closure from remaining roots.
    // This correctly removes downstream-stale steps that were only stale because
    // of the cleared root (ghost-stale fix — P0-2).
    _reopenedRoots = new Set([..._reopenedRoots].filter((id) => id !== stepId));
    const staleSteps = computeStalenessFromManifest(_manifest, _reopenedRoots);
    set({ staleSteps });
  },

  // -- Validator findings actions (US5, T034 live-wiring) ----------------------

  setValidatorFindings: (findings) =>
    set((s) => (s.validatorFindings === findings ? s : { validatorFindings: findings })),
}));
