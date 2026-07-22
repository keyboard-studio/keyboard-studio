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
// Three-store model (spec 046): the designer's PICKS are canonical — each pick
// is one whole grapheme (plus a declared role for private-use characters).
// Everything else is derived from the picks on every mutation:
//   - `bases` / `marks` / `attestedStacks` / `declaredRoles` — the three-store
//     ConfirmedAlphabet split (a precomposed pick contributes its base, its
//     marks, and its ordered attested stack);
//   - `chars` — the legacy flat NFC list every pre-046 consumer keeps reading.
// Deriving (rather than mutating stores independently) means removing a pick
// can never leave an orphaned mark behind: a mark stays only while some
// remaining pick still implies it.
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
// ../lib/draftPersistence.ts can fold the picks into the same DurableDraft
// envelope and restore them here before the build-list screen ever renders.

import { create } from "zustand";
import type { AttestedStack, ConfirmedAlphabet, DeclaredRole } from "@keyboard-studio/contracts";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import { decomposeGrapheme, isCombiningMarkChar, isPrivateUseCodePoint } from "@keyboard-studio/engine";
import { nfcDedup } from "../survey/charNormUtils.ts";
import { DEFAULT_PHASE_B_FONT, type PhaseBFontValue } from "../survey/surveyStyles.ts";

/** One designer pick: a whole grapheme, plus the declared role for PUA picks. */
interface DraftPick {
  grapheme: string;
  role?: DeclaredRole;
}

/** What one pick just contributed — drives the "just added" highlight (US5). */
export interface LastPickContribution {
  grapheme: string;
  addedBases: string[];
  addedMarks: string[];
  addedStack: AttestedStack | null;
}

export interface PhaseBDraftState {
  /** Legacy flat NFC alphabet (derived from the picks; kept for every pre-046 consumer). */
  chars: string[];
  /** Three-store split derived from the picks (spec 046). */
  bases: string[];
  marks: string[];
  attestedStacks: AttestedStack[];
  declaredRoles: Record<string, DeclaredRole>;
  /** The most recent add()'s contribution, for the visible-decomposition highlight. */
  lastPick: LastPickContribution | null;

  /**
<<<<<<< HEAD
   * Add one whole-grapheme pick (NFC-normalized, deduped). A decomposable pick
   * visibly contributes its base, its mark(s), and the attested stack; a
   * private-use pick should carry the designer's declared `role` (FR-004) —
   * without one it is treated as a letter until classified.
   */
  add: (c: string, opts?: { role?: DeclaredRole }) => void;
=======
   * The font applied to every character glyph rendered while building the
   * alphabet (chip editor, suggestion chips, character map) — set via the
   * font-selection dropdown at the top of the Phase B build-list step.
   */
  selectedFont: PhaseBFontValue;

  /** Add one character (NFC-normalized, deduped against the existing list). */
  add: (c: string) => void;
>>>>>>> a05563e (feat(studio): font picker for Phase B add-characters step)

  /** Remove one pick (NFC-normalized before comparison). Derived stores recompute. */
  remove: (c: string) => void;

  /** Add if absent, remove if present (NFC-normalized before comparison). */
  toggle: (c: string) => void;

  /** Replace the whole list wholesale (drop-in for the old setChars callers). */
  setAll: (next: string[]) => void;

  /** Set the font applied to all Phase B character glyphs. */
  setSelectedFont: (font: PhaseBFontValue) => void;

  /** Clear back to an empty alphabet (font selection is left untouched). */
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Pure derivation: picks -> { chars, bases, marks, attestedStacks, declaredRoles }
// ---------------------------------------------------------------------------

interface DerivedStores {
  chars: string[];
  bases: string[];
  marks: string[];
  attestedStacks: AttestedStack[];
  declaredRoles: Record<string, DeclaredRole>;
}

function isPrivateUseGrapheme(g: string): boolean {
  for (const ch of g) {
    const cp = ch.codePointAt(0);
    if (cp !== undefined && isPrivateUseCodePoint(cp)) return true;
  }
  return false;
}

function deriveStores(picks: DraftPick[]): DerivedStores {
  const chars: string[] = [];
  const bases: string[] = [];
  const marks: string[] = [];
  const attestedStacks: AttestedStack[] = [];
  const declaredRoles: Record<string, DeclaredRole> = {};
  const charSeen = new Set<string>();
  const baseSeen = new Set<string>();
  const markSeen = new Set<string>();
  const stackSeen = new Set<string>();

  const pushChar = (g: string): void => {
    if (!charSeen.has(g)) {
      charSeen.add(g);
      chars.push(g);
    }
  };
  const pushBase = (b: string): void => {
    if (!baseSeen.has(b)) {
      baseSeen.add(b);
      bases.push(b);
    }
  };
  const pushMark = (m: string): void => {
    if (!markSeen.has(m)) {
      markSeen.add(m);
      marks.push(m);
    }
  };
  const pushStack = (s: AttestedStack): void => {
    const key = `${s.base} ${s.marks.join(" ")}`;
    if (!stackSeen.has(key)) {
      stackSeen.add(key);
      attestedStacks.push(s);
    }
  };

  for (const pick of picks) {
    const nfc = pick.grapheme.normalize("NFC");
    pushChar(nfc);

    if (isPrivateUseGrapheme(nfc)) {
      // No linguistic data exists — the designer's declared role decides
      // (FR-004); an unclassified PUA pick behaves as a letter until asked.
      const role = pick.role ?? declaredRoles[nfc] ?? "letter";
      declaredRoles[nfc] = role;
      if (role === "mark") pushMark(nfc);
      else pushBase(nfc);
      continue;
    }
    if (isCombiningMarkChar(nfc)) {
      pushMark(nfc);
      continue;
    }
    const decomposition = decomposeGrapheme(nfc);
    if (decomposition !== null) {
      pushBase(decomposition.base);
      for (const m of decomposition.marks) pushMark(m);
      pushStack({ base: decomposition.base, marks: decomposition.marks });
      continue;
    }
    // Plain letter, digit, punctuation, or a multi-base sequence (digraph):
    // a whole unit of the Letters list.
    pushBase(nfc);
  }

  return { chars, bases, marks, attestedStacks, declaredRoles };
}

/** Contribution diff for the just-added grapheme (visible decomposition, US5). */
function contribution(
  before: DerivedStores,
  after: DerivedStores,
  grapheme: string
): LastPickContribution {
  const beforeBases = new Set(before.bases);
  const beforeMarks = new Set(before.marks);
  const beforeStacks = new Set(before.attestedStacks.map((s) => `${s.base} ${s.marks.join(" ")}`));
  const addedStack =
    after.attestedStacks.find((s) => !beforeStacks.has(`${s.base} ${s.marks.join(" ")}`)) ?? null;
  return {
    grapheme: grapheme.normalize("NFC"),
    addedBases: after.bases.filter((b) => !beforeBases.has(b)),
    addedMarks: after.marks.filter((m) => !beforeMarks.has(m)),
    addedStack,
  };
}

// Canonical picks live module-side alongside the store (zustand state carries
// only the derived arrays consumers subscribe to).
let picks: DraftPick[] = [];

export const usePhaseBDraftStore = create<PhaseBDraftState>((set, get) => ({
  chars: [],
  bases: [],
  marks: [],
  attestedStacks: [],
  declaredRoles: {},
  lastPick: null,
  selectedFont: DEFAULT_PHASE_B_FONT,

  add: (c, opts) => {
    const nfc = c.normalize("NFC");
    if (nfc.length === 0) return;
    const chars = nfcDedup(get().chars, [c]);
    if (!picks.some((p) => p.grapheme === nfc)) {
      const before = deriveStores(picks);
      picks = [
        ...picks,
        { grapheme: nfc, ...(opts?.role !== undefined ? { role: opts.role } : {}) },
      ];
      const after = deriveStores(picks);
      set({ ...after, chars, lastPick: contribution(before, after, nfc) });
    } else {
      set({ chars });
    }
  },

  remove: (c) => {
    const nfc = c.normalize("NFC");
    picks = picks.filter((p) => p.grapheme !== nfc);
    const chars = get().chars.filter((x) => x !== nfc);
    set({ ...deriveStores(picks), chars, lastPick: null });
  },

  toggle: (c) => {
    const nfc = c.normalize("NFC");
    if (get().chars.includes(nfc)) {
      get().remove(nfc);
    } else {
      get().add(nfc);
    }
  },

  // Pinned contract (see phaseBDraftStore.test.ts): `chars` takes the input
  // VERBATIM — no dedupe, no NFC-normalization; that is the caller's job. The
  // three-store split still derives from a normalized/deduped pick rebuild,
  // since the stores are canonical-model data, not a display list.
  setAll: (next) => {
    const deduped = nfcDedup([], next);
    const roles = { ...usePhaseBDraftStore.getState().declaredRoles };
    picks = deduped.map((grapheme) => {
      const role = roles[grapheme];
      return role !== undefined ? { grapheme, role } : { grapheme };
    });
    set({ ...deriveStores(picks), chars: next, lastPick: null });
  },

  setSelectedFont: (font) => set({ selectedFont: font }),

  reset: () => {
    picks = [];
    set({
      chars: [],
      bases: [],
      marks: [],
      attestedStacks: [],
      declaredRoles: {},
      lastPick: null,
    });
  },
}));

/** The three-store ConfirmedAlphabet the current draft resolves to (spec 046). */
export function draftConfirmedAlphabet(): ConfirmedAlphabet {
  const s = usePhaseBDraftStore.getState();
  return makeConfirmedAlphabet({
    bases: s.bases,
    marks: s.marks,
    attestedStacks: s.attestedStacks,
    declaredRoles: s.declaredRoles,
  });
}

// ---------------------------------------------------------------------------
// PhaseBDraftSnapshot serialize/restore — draft-persistence fold-in (P0 fix)
//
// Mirrors the snapshotTraversal/applyTraversalSnapshot idiom in
// ../stores/surveySessionStore.ts. `chars` is already a plain string array (no
// Set/binary), so no encoding is needed beyond JSON.stringify/JSON.parse.
// `declaredRoles` rides along additively (spec 046) so a restored draft keeps
// its PUA classifications; old snapshots without the field restore fine.
// ---------------------------------------------------------------------------

/** Serializable snapshot of this store's accumulating alphabet + font choice. */
export interface PhaseBDraftSnapshot {
  chars: string[];
  declaredRoles?: Record<string, DeclaredRole>;
  selectedFont: PhaseBFontValue;
}

/** Build a serializable snapshot of the CURRENT phase-B draft alphabet. */
export function snapshotPhaseBDraft(): PhaseBDraftSnapshot {
  const s = usePhaseBDraftStore.getState();
  return { chars: s.chars, declaredRoles: s.declaredRoles, selectedFont: s.selectedFont };
}

/**
 * Patch a `PhaseBDraftSnapshot` directly into the phase-B draft store. Restores
 * declared roles first so the pick rebuild keeps PUA classifications, then
 * flows the char list through the same `setAll` replace path
 * BuildListView/CharacterMapPane already call, and restores the font choice via
 * `setSelectedFont`.
 */
export function applyPhaseBDraftSnapshot(snapshot: PhaseBDraftSnapshot): void {
  usePhaseBDraftStore.setState({ declaredRoles: snapshot.declaredRoles ?? {} });
  usePhaseBDraftStore.getState().setAll(snapshot.chars);
  usePhaseBDraftStore.getState().setSelectedFont(snapshot.selectedFont);
}
