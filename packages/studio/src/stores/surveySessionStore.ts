// surveySessionStore — single source of truth for survey wizard traversal state.
//
// Holds the traversal state that moves out of SurveyView: which step is active,
// the walked-history stack for back navigation, and the five value slots set
// across wizard steps. Also holds the characters step's internal substage
// (CharactersSubStage, spec 027 Stage 4) so it survives component remounts.
// Does NOT hold pipeline state (instantiatedRef, oskMode) — those remain
// component-local per spec §4.
//
// Architecture contract:
//   - State lives HERE. SurveyView reads via selectors, writes via actions.
//   - `advance(stepId)` pushes the current activeStepId onto history, then sets
//     the new step. This is the one forward primitive; every forward transition
//     routes through it so history is always the true walked path (D5).
//   - `popHistory()` pops the last entry off history and sets it as activeStepId.
//     No-op when history is empty (back disabled at the first step).
//   - `reset()` clears every slot to initial (start-over).
//   - Plain setters for the five value slots.
//   - No host-disk writes. No persistence OF ITS OWN — this store never calls
//     localStorage/sessionStorage directly. Spec 034 US3 adds a serialize/
//     restore SEAM (`TraversalSnapshot`, `snapshotTraversal`,
//     `applyTraversalSnapshot` below) that the durable-draft module
//     (../lib/draftPersistence.ts) drives; the actual read/write of storage
//     lives entirely in that module, not here.
//   - Worker boundary upheld: WASM is not imported here.
//   - All survey/hooks imports are type-only (depcruise / bundle hygiene, D-R2).

import { create } from "zustand";
import type { BaseKeyboard, SurveyPhaseResult } from "@keyboard-studio/contracts";
import type { IdentityLiteResult } from "../survey/index.ts";
import type { SurveyContext } from "../survey/types.ts";
import type { Track } from "../survey/index.ts";
import type { ScaffoldSpec } from "../hooks/useKeyboardArtifact.ts";
// Runtime import of the sibling store (one-directional: workingCopyStore.ts
// does NOT import this module, so this does not create a circular dependency
// per depcruise's no-circular rule). Used only inside setTouchSeedSource to
// clear the stale touchDraft when the seed source actually changes (spec 035
// R12) — the getState() escape-hatch idiom already used elsewhere in this
// file (see the trailing comment) for cross-store reads/writes.
import { useWorkingCopyStore } from "./workingCopyStore.ts";

// ---------------------------------------------------------------------------
// CharactersSubStage — internal substage for the characters manifest step.
//
// Relocated from StudioShell.tsx (spec 027 Stage 4). Persisted in the store so
// back-from-carve re-enters CharactersStep at PhaseB rather than replaying
// prefill (the substage survives the component remount caused by a history pop).
// ---------------------------------------------------------------------------

export type CharactersSubStage = "prefill" | "B";

// ---------------------------------------------------------------------------
// TouchSeedSource — the author's choice at the touch_seed_source fork
// (spec 035 FR-006 / contracts/seed-source-fork.md): Import & adapt the
// base's shipped touch layout, vs reseed a fresh phone projection from the
// desktop work. Null means no choice has been recorded yet (fork memory, R12).
// ---------------------------------------------------------------------------

export type TouchSeedSource = "import-adapt" | "reseed-from-desktop";

// ---------------------------------------------------------------------------
// ActiveStepId — the set of manifest step ids the runtime advances through,
// plus terminal states "done" and "unsupported" not present in the manifest.
//
// Copied verbatim from StudioShell.tsx:237 (pre-migration). This module now
// owns the traversal vocabulary (research D-R1).
// ---------------------------------------------------------------------------

export type ActiveStepId =
  | "identity"
  | "choose_base"
  | "track"
  | "project_name"
  | "characters"
  | "carve"
  | "mechanisms"
  | "sequences"
  | "touch_seed_source"
  | "touch"
  | "help"
  | "done"
  | "unsupported";

// ---------------------------------------------------------------------------
// State interface
// ---------------------------------------------------------------------------

export interface SurveySessionState {
  // --- traversal slots ---

  /** Current manifest step id, incl. terminals "done" / "unsupported". */
  activeStepId: ActiveStepId;

  /**
   * Walked-step stack — the back-nav source of truth (D5).
   * Push on advance, pop on popHistory. Never contains intra-step sub-stages
   * (charactersSub stays component-local).
   */
  history: readonly ActiveStepId[];

  /** Identity-lite output from the identity step. Null until the step completes. */
  identityResult: IdentityLiteResult | null;

  /**
   * Raw phase result of the completed identity-lite flow (the answers that
   * produced identityResult). Persisted so a history pop back onto the identity
   * step resumes the flow at its last question with answers restored, rather
   * than replaying from question 1. Null until the identity step completes.
   */
  identityPhaseResult: SurveyPhaseResult | null;

  /**
   * Derived from identityResult via contextFromIdentity. Stored (not re-derived)
   * to match today's useState semantics. Empty object until identity completes.
   */
  surveyContext: SurveyContext;

  /** "copy" | "adapt" chosen at the track step. Null until that step completes. */
  selectedTrack: Track | null;

  /**
   * Track-1 project metadata set at the project_name step.
   * Null for Track 2 (adapt uses the base's existing id/name).
   */
  scaffoldSpec: ScaffoldSpec | null;

  /**
   * Local base selection that drives the compile pipeline immediately on pick.
   * Separate from workingCopyStore.baseKeyboard — set as soon as BaseResolution
   * resolves, before the compile cycle completes. Null until first base selection.
   */
  localBase: BaseKeyboard | null;

  /**
   * Internal substage for the characters manifest step (spec 027 Stage 4).
   * Persisted here (not in CharactersStep component state) so back-from-carve
   * re-enters at PhaseB after the component remounts. Initial value "prefill".
   * Cleared to "prefill" by reset().
   */
  charactersSubStage: CharactersSubStage;

  /**
   * The author's choice at the touch_seed_source fork (spec 035 FR-006).
   * Null means no choice recorded yet — advance() routes into the chooser
   * step whenever this is null (fork memory, R12). Cleared back to null on a
   * genuine base re-instantiation (see reducer.ts CHOOSE_BASE_STEP_ID case,
   * which injects setTouchSeedSource as a ReducerDep so workingCopyStore does
   * not need to import this store — avoids a circular dependency since
   * setTouchSeedSource itself reaches into workingCopyStore to clear touchDraft).
   */
  touchSeedSource: TouchSeedSource | null;

  // --- actions ---

  /**
   * Forward transition primitive. Pushes the current activeStepId onto history,
   * then sets activeStepId to stepId. Every forward transition routes through
   * this so history is always the true walked path.
   */
  advance: (stepId: ActiveStepId) => void;

  /**
   * Generic back. Pops the last entry off history and sets it as activeStepId.
   * No-op when history is empty (guards the identity/first step).
   */
  popHistory: () => void;

  /**
   * Special-case back-navigation for the touch step's "Back from the very
   * first character" affordance (spec 035 R12 re-entry path). The generic
   * `popHistory` follows the walked-history stack, which lands on
   * "mechanisms" whenever the seed-source fork was SKIPPED this pass (a
   * recorded, non-stale `touchSeedSource` routes advance() straight from
   * "mechanisms" to "touch" — R12 fork memory) — that would make the choice
   * unreachable after the first pass (violates US2-AS4). This action always
   * resurfaces the "touch_seed_source" chooser instead:
   *
   *   - If "touch_seed_source" is already the top of history (the fork was
   *     NOT skipped this pass — normal forward path pushed it), this behaves
   *     exactly like popHistory: consumes that entry so the chooser's own
   *     Back still reaches "mechanisms" next.
   *   - Otherwise (fork was skipped — history still ends in "mechanisms" from
   *     the direct mechanisms -> touch hop), this sets activeStepId WITHOUT
   *     touching history, so "mechanisms" stays on top for the chooser's own
   *     Back to land on.
   *
   * Either way, the chooser's own onBack (generic popHistory) always reaches
   * "mechanisms" next — this action never disturbs that invariant.
   */
  backToTouchSeedSource: () => void;

  /** Reset every slot to initial (start-over). Includes clearing history. */
  reset: () => void;

  /** Plain setter — identity-lite output. */
  setIdentityResult: (r: IdentityLiteResult | null) => void;

  /** Plain setter — raw identity-lite phase result (history-pop resume). */
  setIdentityPhaseResult: (r: SurveyPhaseResult | null) => void;

  /** Plain setter — survey context derived from identity. */
  setSurveyContext: (c: SurveyContext) => void;

  /** Plain setter — chosen track. */
  setSelectedTrack: (t: Track | null) => void;

  /** Plain setter — Track-1 scaffold spec. */
  setScaffoldSpec: (s: ScaffoldSpec | null) => void;

  /** Plain setter — local base driving the compile pipeline. */
  setLocalBase: (b: BaseKeyboard | null) => void;

  /** Plain setter — characters step internal substage (spec 027 Stage 4). */
  setCharactersSubStage: (s: CharactersSubStage) => void;

  /**
   * Setter — the touch_seed_source fork choice (spec 035 R12).
   * Setting a value DIFFERENT from the current one clears the working-copy
   * `touchDraft` (its `charTouch` entries reference host keys of the other
   * seed and would half-apply — see workingCopyStore.touchDraft docstring).
   * A no-op re-set of the same value does not clear the draft.
   */
  setTouchSeedSource: (s: TouchSeedSource | null) => void;
}

// ---------------------------------------------------------------------------
// Data-field type (T017, spec 034 US3) — the non-action slots of
// SurveySessionState, compiler-enforced via Omit exactly like
// WorkingCopySnapshot/WorkingCopyData in persistWorkingCopy.ts /
// workingCopyStore.ts. A new non-action field added to SurveySessionState
// fails to compile here (both in `INITIAL_STATE`'s `satisfies` below and in
// `snapshotTraversal`'s return-typed object literal) until it is accounted
// for — no silent omission from the durable draft.
//
// DEVIATION 1 (spec 034 US3 task brief): the data-model.md TraversalSnapshot
// field list predates spec 035, which added `touchSeedSource` to this store.
// It is included here — a reload mid-touch that lost the seed-source fork
// choice would silently re-ask a question the author already answered, or
// worse, mis-resolve the R11/R12 default. `TraversalSnapshot` is exactly this
// data-field type; see `snapshotTraversal`/`applyTraversalSnapshot` below.
// ---------------------------------------------------------------------------

type SurveySessionData = Omit<
  SurveySessionState,
  | "advance" | "popHistory" | "backToTouchSeedSource" | "reset"
  | "setIdentityResult" | "setIdentityPhaseResult" | "setSurveyContext"
  | "setSelectedTrack" | "setScaffoldSpec" | "setLocalBase" | "setCharactersSubStage"
  | "setTouchSeedSource"
>;

/**
 * Serializable snapshot of the traversal state — "where am I in the walk"
 * (data-model.md TraversalSnapshot, spec 034 US3). All fields are plain
 * JSON-safe values already (no Set/binary, unlike WorkingCopySnapshot), so no
 * encoding is needed beyond `JSON.stringify`/`JSON.parse`.
 *
 * Consumed by ../lib/draftPersistence.ts as the `traversal` envelope field.
 */
export type TraversalSnapshot = SurveySessionData;

// ---------------------------------------------------------------------------
// Initial state (extracted so reset() and the initializer share one source)
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  activeStepId: "identity" as ActiveStepId,
  history: [] as readonly ActiveStepId[],
  identityResult: null,
  identityPhaseResult: null,
  surveyContext: {} as SurveyContext,
  selectedTrack: null,
  scaffoldSpec: null,
  localBase: null,
  charactersSubStage: "prefill" as CharactersSubStage,
  touchSeedSource: null as TouchSeedSource | null,
} as const satisfies SurveySessionData;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useSurveySessionStore = create<SurveySessionState>((set) => ({
  ...INITIAL_STATE,

  advance: (stepId) =>
    set((s) => ({
      history: [...s.history, s.activeStepId],
      activeStepId: stepId,
    })),

  popHistory: () =>
    set((s) => {
      if (s.history.length === 0) return s;
      // Non-null: length guard above proves this index exists.
      const prev = s.history[s.history.length - 1]!;
      return {
        activeStepId: prev,
        history: s.history.slice(0, -1),
      };
    }),

  backToTouchSeedSource: () =>
    set((s) => {
      const top = s.history[s.history.length - 1];
      if (top === "touch_seed_source") {
        return {
          activeStepId: "touch_seed_source",
          history: s.history.slice(0, -1),
        };
      }
      // Fork was skipped this pass — jump without consuming history so
      // "mechanisms" (or whatever is actually on top) stays there for the
      // chooser's own Back.
      return { activeStepId: "touch_seed_source" };
    }),

  reset: () =>
    set({
      ...INITIAL_STATE,
      // Re-initialize array so mutations do not bleed across resets.
      history: [] as readonly ActiveStepId[],
    }),

  setIdentityResult: (r) => set({ identityResult: r }),
  setIdentityPhaseResult: (r) => set({ identityPhaseResult: r }),
  setSurveyContext: (c) => set({ surveyContext: c }),
  setSelectedTrack: (t) => set({ selectedTrack: t }),
  setScaffoldSpec: (s) => set({ scaffoldSpec: s }),
  setLocalBase: (b) => set({ localBase: b }),
  setCharactersSubStage: (s) => set({ charactersSubStage: s }),

  setTouchSeedSource: (s) =>
    set((state) => {
      // A genuine change of seed source invalidates any in-progress touch
      // draft — its charTouch entries reference host keys of the OTHER seed
      // and would half-apply with warnings (R12). A no-op re-set (same value,
      // including null -> null) leaves the draft untouched.
      if (s !== state.touchSeedSource) {
        useWorkingCopyStore.getState().setTouchDraft(null);
      }
      return { touchSeedSource: s };
    }),
}));

// Ensure the store's getState() escape hatch is available for imperative reads
// inside memoised callbacks (e.g. onInstantiate reads selectedTrack this way).
// No extra export needed — zustand attaches getState() to the hook directly.

// ---------------------------------------------------------------------------
// TraversalSnapshot serialize/restore (T017, spec 034 US3)
//
// Mirrors the snapshotWorkingCopyData/applyWorkingCopySnapshot idiom in
// ../lib/persistWorkingCopy.ts. The return type on `snapshotTraversal` is the
// enforcement point: a new non-action field added to SurveySessionState (and
// therefore SurveySessionData/TraversalSnapshot via the Omit above) makes the
// object literal below fail to compile until it is listed here.
// ---------------------------------------------------------------------------

/** Build a serializable snapshot of the CURRENT traversal state. */
export function snapshotTraversal(): TraversalSnapshot {
  const s = useSurveySessionStore.getState();
  return {
    activeStepId: s.activeStepId,
    history: s.history,
    identityResult: s.identityResult,
    identityPhaseResult: s.identityPhaseResult,
    surveyContext: s.surveyContext,
    selectedTrack: s.selectedTrack,
    scaffoldSpec: s.scaffoldSpec,
    localBase: s.localBase,
    charactersSubStage: s.charactersSubStage,
    touchSeedSource: s.touchSeedSource,
  };
}

/**
 * Patch a `TraversalSnapshot` directly into the survey-session store.
 * `TraversalSnapshot` is exactly the non-action slice of `SurveySessionState`,
 * so this is a direct `setState` — no field-by-field mapping needed.
 */
export function applyTraversalSnapshot(snapshot: TraversalSnapshot): void {
  useSurveySessionStore.setState({ ...snapshot });
}
