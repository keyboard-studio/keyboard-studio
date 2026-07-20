// phaseBDraftStore — shared draft-alphabet accumulator for Phase B build-list.
//
// The Phase B build-list screen renders TWO panes that both mutate the SAME
// accumulating alphabet: BuildListView (center pane — CLDR suggestions +
// type-in chip editor) and CharacterMapPane (right pane — browse-and-toggle
// character map, spec character-map pane work). Lifting the list out of
// BuildListView's local useState into a store lets both panes read/toggle the
// same array without prop drilling across the pane-swap boundary (StudioShell's
// SurveyView renders CharacterMapPane independently of BuildListView).
//
// Lifecycle: reset() is called from ../survey/CharactersStep.tsx on the
// prefill -> B substage transition (a fresh alphabet each time the build-list
// screen is entered) — NOT on every render of BuildListView/CharacterMapPane.
// A component rerender (e.g. clicking one character) must never evaporate
// prior picks.
//
// All chars stored here are NFC-normalized and deduplicated via nfcDedup
// (../survey/charNormUtils.ts), matching the normalization already applied by
// BuildListView's CharChipEditor/SuggestionPanel before this store existed.
//
// No host-disk writes. No persistence of its own (like surveySessionStore,
// draft persistence is driven externally, not from this module).
//
// Durable-draft fold-in (P0 fix): a reload/OAuth-redirect return mid-build-list
// previously restored `discoveryMethod`/`charactersSubStage` (via
// surveySessionStore's TraversalSnapshot) WITHOUT this store's `chars`, landing
// the author back on the build-list screen with an empty alphabet — silently
// discarding everything they'd added. `snapshotPhaseBDraft`/
// `applyPhaseBDraftSnapshot` below mirror the snapshotTraversal/
// applyTraversalSnapshot idiom in ../stores/surveySessionStore.ts so
// ../lib/draftPersistence.ts can fold `chars` into the same DurableDraft
// envelope and restore them here before the build-list screen ever renders.

import { create } from "zustand";
import { nfcDedup } from "../survey/charNormUtils.ts";

export interface PhaseBDraftState {
  chars: string[];

  /** Add one character (NFC-normalized, deduped against the existing list). */
  add: (c: string) => void;

  /** Remove one character (NFC-normalized before comparison). */
  remove: (c: string) => void;

  /** Add if absent, remove if present (NFC-normalized before comparison). */
  toggle: (c: string) => void;

  /** Replace the whole list wholesale (drop-in for the old setChars callers). */
  setAll: (next: string[]) => void;

  /** Clear back to an empty alphabet. */
  reset: () => void;
}

export const usePhaseBDraftStore = create<PhaseBDraftState>((set, get) => ({
  chars: [],

  add: (c) => set((s) => ({ chars: nfcDedup(s.chars, [c]) })),

  remove: (c) => {
    const nfc = c.normalize("NFC");
    set((s) => ({ chars: s.chars.filter((x) => x !== nfc) }));
  },

  toggle: (c) => {
    const nfc = c.normalize("NFC");
    if (get().chars.includes(nfc)) {
      get().remove(nfc);
    } else {
      get().add(nfc);
    }
  },

  setAll: (next) => set({ chars: next }),

  reset: () => set({ chars: [] }),
}));

// ---------------------------------------------------------------------------
// PhaseBDraftSnapshot serialize/restore — draft-persistence fold-in (P0 fix)
//
// Mirrors the snapshotTraversal/applyTraversalSnapshot idiom in
// ../stores/surveySessionStore.ts. `chars` is already a plain string array (no
// Set/binary), so no encoding is needed beyond JSON.stringify/JSON.parse.
// ---------------------------------------------------------------------------

/** Serializable snapshot of this store's accumulating alphabet. */
export interface PhaseBDraftSnapshot {
  chars: string[];
}

/** Build a serializable snapshot of the CURRENT phase-B draft alphabet. */
export function snapshotPhaseBDraft(): PhaseBDraftSnapshot {
  return { chars: usePhaseBDraftStore.getState().chars };
}

/**
 * Patch a `PhaseBDraftSnapshot` directly into the phase-B draft store. Uses
 * `setAll` (not a raw `setState`) so the restored list still flows through the
 * same replace path BuildListView/CharacterMapPane already call.
 */
export function applyPhaseBDraftSnapshot(snapshot: PhaseBDraftSnapshot): void {
  usePhaseBDraftStore.getState().setAll(snapshot.chars);
}
