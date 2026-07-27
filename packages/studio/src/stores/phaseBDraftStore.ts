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
import type { SourcedInventory } from "@keyboard-studio/engine";
import { decomposeGrapheme, isCombiningMarkChar, isPrivateUseCodePoint, glyphCategory } from "@keyboard-studio/engine";
import { casePairOf, nfcDedup } from "../survey/charNormUtils.ts";
import { DEFAULT_PHASE_B_FONT, type PhaseBFontValue } from "../survey/surveyStyles.ts";

/**
 * Where a character in the draft came from (spec 044 FR-017).
 *
 * `"author"` is the STRONGEST claim: a character the designer typed or picked
 * survives any re-seed, and removing it is not treated as rejecting a proposal.
 * The rest are proposal origins. `"text"` is not produced here — it is reserved
 * for the text-sample surface owned by spec 050, and is present so 044 does not
 * bake in the assumption that exemplars are the only proposal source. Proposal
 * sources UNION rather than override (see `seedFromProposal`).
 */
export type DraftProvenance = SourcedInventory["source"] | "author" | "text";

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
  /**
   * Derived category arrays for the alphabet breakdown (spec 047, FR-004/005).
   * Every captured non-letter, non-mark, non-PUA pick is routed to exactly one
   * of these by Unicode General Category; `bases` holds true letters only. The
   * flat `chars` list below remains the COMPLETE inventory (FR-013).
   */
  numbers: string[];
  punctuation: string[];
  symbols: string[];
  separators: string[];
  controls: string[];
  /** The most recent add()'s contribution, for the visible-decomposition highlight. */
  lastPick: LastPickContribution | null;

  /**
   * Per-character origin (spec 044 FR-004/FR-017), keyed by NFC grapheme.
   * Drives the proposed-vs-authored affordance. Only characters currently in
   * the draft appear here.
   */
  provenance: Record<string, DraftProvenance>;

  /**
   * Proposed characters the author removed. STICKY: `seedFromProposal` must
   * never re-propose these, so declining a suggestion once is not undone by a
   * later re-derivation. Removing an AUTHORED character does not add it here —
   * re-proposal was never at issue for a character the author typed.
   */
  rejected: string[];

  /**
   * True once the author has declined the exemplar discovery method for this
   * working copy (spec 044 FR-016a). Sticky across Phase B re-entry: the offer
   * is never re-asserted as the default, though the apply affordance stays
   * reachable on page 2.
   */
  exemplarMethodDeclined: boolean;

  /**
   * The font applied to every character glyph rendered while building the
   * alphabet (chip editor, suggestion chips, character map) — set via the
   * font-selection dropdown at the top of the Phase B build-list step.
   */
  selectedFont: PhaseBFontValue;

  /**
   * Add one whole-grapheme pick (NFC-normalized, deduped). A decomposable pick
   * visibly contributes its base, its mark(s), and the attested stack; a
   * private-use pick should carry the designer's declared `role` (FR-004) —
   * without one it is treated as a letter until classified.
   */
  add: (c: string, opts?: { role?: DeclaredRole }) => void;

  /** Remove one pick (NFC-normalized before comparison). Derived stores recompute. */
  remove: (c: string) => void;

  /** Add if absent, remove if present (NFC-normalized before comparison). */
  toggle: (c: string) => void;

  /**
   * Add a character on behalf of a PROPOSAL source rather than the author.
   * Separate from `add` so the ordinary UI path can never accidentally record a
   * pick as machine-proposed — `add` always means "the author did this".
   */
  addProposed: (c: string, source: DraftProvenance, opts?: { role?: DeclaredRole }) => void;

  /** Replace the whole list wholesale (drop-in for the old setChars callers). */
  setAll: (next: string[]) => void;

  /** Set the font applied to all Phase B character glyphs. */
  setSelectedFont: (font: PhaseBFontValue) => void;

  /**
   * Seed the draft from a sourced exemplar inventory (spec 044 FR-016).
   *
   * Seeds the `main` tier plus 047's existing case-counterpart derivation, so
   * accepting fills a usable alphabet in one action rather than a lowercase-only
   * half of one. The other three tiers are offered separately in their own 047
   * breakdown sections; they are deliberately not folded in here.
   *
   * Contract:
   *  - **Idempotent** — calling it twice with the same inventory is a no-op the
   *    second time.
   *  - **Never clobbers an author pick** — a character the designer typed keeps
   *    `"author"` provenance even if a proposal also contains it.
   *  - **Respects `rejected`** — a proposed character the author removed is not
   *    re-proposed.
   *  - **Unions, does not override** — a second proposal source composes with
   *    this one; each character keeps its own attribution.
   *
   * @param inv   the sourced inventory to propose from
   * @param bcp47 target tag, forwarded to the case-counterpart derivation so
   *              the Turkic dotted-I system is not mangled
   */
  seedFromProposal: (inv: SourcedInventory, bcp47?: string) => void;

  /** Record that the author declined the exemplar method (FR-016a). Sticky. */
  declineExemplarMethod: () => void;

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
  numbers: string[];
  punctuation: string[];
  symbols: string[];
  separators: string[];
  controls: string[];
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
  const numbers: string[] = [];
  const punctuation: string[] = [];
  const symbols: string[] = [];
  const separators: string[] = [];
  const controls: string[] = [];
  const charSeen = new Set<string>();
  const baseSeen = new Set<string>();
  const markSeen = new Set<string>();
  const stackSeen = new Set<string>();
  // One deduping pusher per derived category array (first-appearance order).
  const pushInto = (arr: string[], seen: Set<string>) => (v: string): void => {
    if (!seen.has(v)) {
      seen.add(v);
      arr.push(v);
    }
  };
  const pushNumber = pushInto(numbers, new Set<string>());
  const pushPunctuation = pushInto(punctuation, new Set<string>());
  const pushSymbol = pushInto(symbols, new Set<string>());
  const pushSeparator = pushInto(separators, new Set<string>());
  const pushControl = pushInto(controls, new Set<string>());

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
    // Non-mark, non-PUA, non-decomposable: route by Unicode General Category
    // (spec 047, FR-004/FR-005) so only true letters — and multi-letter
    // digraphs, which classify as `letter` — land in the Letters `bases`.
    // Digits/punctuation/symbols/separators/controls get their own derived
    // section arrays; the flat `chars` above still holds the COMPLETE
    // inventory the recorded confirmedInventory is taken from (FR-013).
    switch (glyphCategory(nfc)) {
      case "letter":
        pushBase(nfc);
        break;
      case "number":
        pushNumber(nfc);
        break;
      case "punctuation":
        pushPunctuation(nfc);
        break;
      case "symbol":
        pushSymbol(nfc);
        break;
      case "separator":
        pushSeparator(nfc);
        break;
      case "control":
        pushControl(nfc);
        break;
    }
  }

  return {
    chars,
    bases,
    marks,
    attestedStacks,
    declaredRoles,
    numbers,
    punctuation,
    symbols,
    separators,
    controls,
  };
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
  numbers: [],
  punctuation: [],
  symbols: [],
  separators: [],
  controls: [],
  lastPick: null,
  provenance: {},
  rejected: [],
  exemplarMethodDeclined: false,
  selectedFont: DEFAULT_PHASE_B_FONT,

  add: (c, opts) => {
    addWithProvenance(set, get, c, "author", opts);
  },

  addProposed: (c, source, opts) => {
    addWithProvenance(set, get, c, source, opts);
  },

  remove: (c) => {
    const nfc = c.normalize("NFC");
    const origin = get().provenance[nfc];
    picks = picks.filter((p) => p.grapheme !== nfc);
    const chars = get().chars.filter((x) => x !== nfc);
    const provenance = { ...get().provenance };
    delete provenance[nfc];
    // Removing a PROPOSED character is a rejection — remember it so a later
    // re-derivation does not put it straight back. Removing an AUTHORED one is
    // just an edit; it was never going to be re-proposed.
    const isProposal = origin !== undefined && origin !== "author";
    const rejected =
      isProposal && !get().rejected.includes(nfc) ? [...get().rejected, nfc] : get().rejected;
    set({ ...deriveStores(picks), chars, provenance, rejected, lastPick: null });
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
    // Provenance follows the new list: retained characters keep their origin,
    // anything newly present came from the author (setAll is the chip-editor /
    // snapshot-restore path, never a proposal), and entries for removed
    // characters are dropped. A wholesale replace is NOT a per-character
    // rejection, so `rejected` is untouched here — `remove()` owns that.
    const prior = usePhaseBDraftStore.getState().provenance;
    const provenance: Record<string, DraftProvenance> = {};
    for (const g of deduped) provenance[g] = prior[g] ?? "author";
    set({ ...deriveStores(picks), chars: next, provenance, lastPick: null });
  },

  setSelectedFont: (font) => set({ selectedFont: font }),

  seedFromProposal: (inv, bcp47) => {
    // The main tier only — the alphabet. The auxiliary/punctuation/numbers
    // tiers reach the author through their own 047 breakdown sections.
    const mainChars = inv.characters.filter((c) => c.tier === "main").map((c) => c.char);
    // 047's case derivation: the sources attest lowercase, but an alphabet
    // without its uppercase half is not one the author can accept and move on
    // from. `casePairOf` carries the Turkic-aware fold.
    const proposed = nfcDedup(
      [],
      mainChars.flatMap((ch) => casePairOf(ch, bcp47)),
    );
    for (const ch of proposed) {
      addWithProvenance(set, get, ch, inv.source);
    }
  },

  declineExemplarMethod: () => set({ exemplarMethodDeclined: true }),

  reset: () => {
    picks = [];
    set({
      chars: [],
      bases: [],
      marks: [],
      attestedStacks: [],
      declaredRoles: {},
      numbers: [],
      punctuation: [],
      symbols: [],
      separators: [],
      controls: [],
      lastPick: null,
      provenance: {},
      // `rejected` and `exemplarMethodDeclined` deliberately SURVIVE a reset:
      // both record a decision the author made about proposals, and reset() runs
      // on every entry to the build-list screen. Clearing them would re-propose
      // characters the author already removed and re-assert an offer they
      // already declined. resetPhaseBDraftDecisions() clears them for a genuinely
      // new working copy.
    });
  },
}));

/**
 * Shared add path for both the author (`add`) and proposal sources
 * (`addProposed`).
 *
 * Provenance only ever strengthens: once a character is `"author"` it stays
 * `"author"`, so an author's pick survives a re-seed. A character already
 * present from one proposal source keeps that source rather than being
 * overwritten by a second — proposal sources UNION (spec 044 T053), and each
 * character keeps the attribution the UI shows next to it.
 */
function addWithProvenance(
  set: (partial: Partial<PhaseBDraftState>) => void,
  get: () => PhaseBDraftState,
  c: string,
  origin: DraftProvenance,
  opts?: { role?: DeclaredRole },
): void {
  const nfc = c.normalize("NFC");
  if (nfc.length === 0) return;

  const isProposal = origin !== "author";
  // A proposal never resurrects something the author explicitly removed.
  if (isProposal && get().rejected.includes(nfc)) return;

  // An explicit author add always UPGRADES the origin to "author" — the
  // designer touching a proposed character makes it theirs, and it must then
  // survive any re-seed. A proposal add never overwrites an existing origin, so
  // the first source to attest a character keeps the attribution the UI shows.
  const existing = get().provenance[nfc];
  const nextOrigin: DraftProvenance = origin === "author" ? "author" : (existing ?? origin);
  const provenance = { ...get().provenance, [nfc]: nextOrigin };

  const chars = nfcDedup(get().chars, [c]);
  if (!picks.some((p) => p.grapheme === nfc)) {
    const before = deriveStores(picks);
    picks = [...picks, { grapheme: nfc, ...(opts?.role !== undefined ? { role: opts.role } : {}) }];
    const after = deriveStores(picks);
    set({ ...after, chars, provenance, lastPick: contribution(before, after, nfc) });
  } else {
    set({ chars, provenance });
  }
}

/**
 * Clear the sticky proposal decisions (`rejected`, `exemplarMethodDeclined`).
 *
 * Those are per-working-copy, not per-visit: `reset()` runs every time the
 * build-list screen is entered and must not undo them. Call this when a genuinely
 * new working copy is instantiated.
 */
export function resetPhaseBDraftDecisions(): void {
  usePhaseBDraftStore.setState({ rejected: [], exemplarMethodDeclined: false });
}

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
  /** Per-character origin (spec 044). Absent in pre-044 snapshots. */
  provenance?: Record<string, DraftProvenance>;
  /** Proposals the author removed. Absent in pre-044 snapshots. */
  rejected?: string[];
  /** Whether the exemplar method was declined. Absent in pre-044 snapshots. */
  exemplarMethodDeclined?: boolean;
  selectedFont: PhaseBFontValue;
}

/** Build a serializable snapshot of the CURRENT phase-B draft alphabet. */
export function snapshotPhaseBDraft(): PhaseBDraftSnapshot {
  const s = usePhaseBDraftStore.getState();
  return {
    chars: s.chars,
    declaredRoles: s.declaredRoles,
    provenance: s.provenance,
    rejected: s.rejected,
    exemplarMethodDeclined: s.exemplarMethodDeclined,
    selectedFont: s.selectedFont,
  };
}

/**
 * Patch a `PhaseBDraftSnapshot` directly into the phase-B draft store. Restores
 * declared roles first so the pick rebuild keeps PUA classifications, then
 * flows the char list through the same `setAll` replace path
 * BuildListView/CharacterMapPane already call, and restores the font choice via
 * `setSelectedFont`.
 */
export function applyPhaseBDraftSnapshot(snapshot: PhaseBDraftSnapshot): void {
  // Restore the sticky proposal decisions and the prior provenance BEFORE
  // setAll: setAll preserves the origin of any character already known and
  // attributes the rest to the author, so a restored draft keeps its
  // proposed-vs-authored distinction instead of flattening to "author".
  usePhaseBDraftStore.setState({
    declaredRoles: snapshot.declaredRoles ?? {},
    provenance: snapshot.provenance ?? {},
    rejected: snapshot.rejected ?? [],
    exemplarMethodDeclined: snapshot.exemplarMethodDeclined ?? false,
  });
  usePhaseBDraftStore.getState().setAll(snapshot.chars);
  usePhaseBDraftStore.getState().setSelectedFont(snapshot.selectedFont);
}
