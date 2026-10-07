// phaseBDraftOps — the Phase B/C draft accumulator as pure functions over
// the gallery decision values (spec 090 US2, research D-090-10).
//
// Until US2 the accumulator was `stores/phaseBDraftStore.ts`, a zustand
// store shared by the characters, punctuation and invisibles steps and by
// StudioShell's CharacterMapPane. The store is deleted (T025); its logic
// lives here, behaviour-verbatim, as pure functions over
// `CharacterInventoryValue` (the `character-inventory` decision) and the
// invisibles half of the old state, which is now the
// `invisibles-inventory` decision's value. Recording is the caller's job
// (survey/useInventoryDraft.ts records through the gallery host's decide
// core); everything here is deterministic and side-effect free, which is
// what makes the values replayable (092/093) and unit-testable without a
// store.
//
// The three-store model (spec 071) is unchanged: the designer's PICKS are
// canonical — each pick is one whole grapheme (plus a declared role for
// private-use characters) — and everything else derives from the picks on
// every mutation. The value does not store picks: it stores the derived
// split, and the pick list is reconstructed from `chars` +
// `declaredRoles` exactly the way the old store's snapshot restore did
// (its `setAll` rebuild). All chars are NFC-normalized and deduplicated
// via nfcDedup, matching the normalization the UI applied before the
// store existed.

import type { AttestedStack, DeclaredRole } from "@keyboard-studio/contracts";
import {
  makeConfirmedAlphabet,
  parseUPlusNotation,
  stackKey,
  toUPlusNotation,
} from "@keyboard-studio/contracts";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";
import {
  decomposeGrapheme,
  glyphCategory,
  isCombiningMarkChar,
  isPrivateUseCodePoint,
} from "@keyboard-studio/engine";
import { casePairOf, isFormatChar, nfcDedup } from "./charNormUtils.ts";
import { DEFAULT_PHASE_B_FONT, type PhaseBFontValue } from "./surveyStyles.ts";

/**
 * Where a character in the draft came from (spec 044 FR-017) — the draft
 * provenance union `stores/phaseBDraftStore.ts` declared as
 * `DraftProvenance`, moved here with the logic. `"author"` is the
 * STRONGEST claim; the rest are proposal origins. `"text"` is reserved
 * for the text-sample surface owned by spec 050.
 */
export type DraftProvenance =
  | SourcedInventory["source"]
  | "author"
  | "text"
  | "base"
  | "ascii-floor";

/** An author's decision about one invisible (format) character. */
export type InvisibleDecision = "accepted" | "declined";

/** Per-item provenance inside an inventory decision value (FR-006). */
export type InventoryItemProvenance = "asked" | "extracted" | "derived" | "default";

/** One inventory item with its per-item provenance (FR-006). */
export interface InventoryItem {
  char: string;
  provenance: InventoryItemProvenance;
}

/**
 * The inventory decision value (data-model.md): what the author accepted
 * and what they declined, each item carrying its own provenance. The
 * gallery modules for `punctuation-inventory` / `invisibles-inventory`
 * re-export this shape (declared here because the ops maintain it).
 */
export interface InventoryDecisionValue {
  accepted: InventoryItem[];
  declined: InventoryItem[];
}

/**
 * The character-inventory decision value: the Phase B draft's characters
 * slice of the old `PhaseBDraftState`, mapped field-for-field (research
 * D-090-10(c)). The first group is the derived split (recomputed from
 * the picks on every mutation); the second is the draft meta that must
 * survive reload and step re-entry. NOT carried: `lastPick` (transient
 * highlight — renderer-internal) and `invisibleDecisions` (now the
 * invisibles-inventory value).
 */
export interface CharacterInventoryValue {
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
  provenance: Record<string, DraftProvenance>;
  exemplarDigraphs: string[];
  loanwordChars: string[];
  rejected: string[];
  proposalConfidence: Record<string, string>;
  exemplarMethodDeclined: boolean;
  seededProposals: string[];
  alphabetEvidenceKey?: string | undefined;
  selectedFont: PhaseBFontValue;
}

/** What one pick just contributed — drives the "just added" highlight (US5). */
export interface LastPickContribution {
  grapheme: string;
  addedBases: string[];
  addedMarks: string[];
  addedStack: AttestedStack | null;
}

/** One designer pick: a whole grapheme, plus the declared role for PUA picks. */
interface DraftPick {
  grapheme: string;
  role?: DeclaredRole;
}

// ---------------------------------------------------------------------------
// Empty values
// ---------------------------------------------------------------------------

export function emptyCharacterInventoryValue(): CharacterInventoryValue {
  return {
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
    provenance: {},
    exemplarDigraphs: [],
    loanwordChars: [],
    rejected: [],
    proposalConfidence: {},
    exemplarMethodDeclined: false,
    seededProposals: [],
    selectedFont: DEFAULT_PHASE_B_FONT,
  };
}

export function emptyInventoryDecisionValue(): InventoryDecisionValue {
  return { accepted: [], declined: [] };
}

// ---------------------------------------------------------------------------
// Pure derivation: picks -> derived split (verbatim port of the store's
// deriveStores)
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
    const key = stackKey(s);
    if (!stackSeen.has(key)) {
      stackSeen.add(key);
      attestedStacks.push(s);
    }
  };

  for (const pick of picks) {
    const nfc = pick.grapheme.normalize("NFC");
    pushChar(nfc);

    if (isPrivateUseGrapheme(nfc)) {
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
  grapheme: string,
): LastPickContribution {
  const beforeBases = new Set(before.bases);
  const beforeMarks = new Set(before.marks);
  const beforeStacks = new Set(before.attestedStacks.map((s) => stackKey(s)));
  const addedStack = after.attestedStacks.find((s) => !beforeStacks.has(stackKey(s))) ?? null;
  return {
    grapheme: grapheme.normalize("NFC"),
    addedBases: after.bases.filter((b) => !beforeBases.has(b)),
    addedMarks: after.marks.filter((m) => !beforeMarks.has(m)),
    addedStack,
  };
}

/**
 * Reconstruct the pick list from a value — the same rebuild the old
 * store's snapshot restore performed: `chars` are the picks, each
 * carrying its declared role where one was recorded.
 */
function picksOf(value: CharacterInventoryValue): DraftPick[] {
  return value.chars.map((grapheme) => {
    const role = value.declaredRoles[grapheme];
    return role !== undefined ? { grapheme, role } : { grapheme };
  });
}

/** A value with its derived split recomputed from the given picks. */
function withDerived(
  value: CharacterInventoryValue,
  picks: DraftPick[],
  patch: Partial<CharacterInventoryValue>,
): CharacterInventoryValue {
  return { ...value, ...deriveStores(picks), ...patch };
}

// ---------------------------------------------------------------------------
// Character ops (verbatim ports of the store's actions)
// ---------------------------------------------------------------------------

export interface AddResult {
  value: CharacterInventoryValue;
  lastPick: LastPickContribution | null;
}

/**
 * Shared add path for both the author (`addChar`) and proposal sources
 * (`addProposedChar`). Provenance only ever strengthens: once a character
 * is `"author"` it stays `"author"`; a proposal add never overwrites an
 * existing origin (proposal sources UNION, spec 044 T053). A proposal
 * never resurrects a character in `rejected`.
 */
function addWithProvenance(
  value: CharacterInventoryValue,
  c: string,
  origin: DraftProvenance,
  opts?: { role?: DeclaredRole },
): AddResult {
  const nfc = c.normalize("NFC");
  if (nfc.length === 0) return { value, lastPick: null };

  const isProposal = origin !== "author";
  if (isProposal && value.rejected.includes(nfc)) return { value, lastPick: null };

  const existing = value.provenance[nfc];
  const nextOrigin: DraftProvenance = origin === "author" ? "author" : (existing ?? origin);
  const provenance = { ...value.provenance, [nfc]: nextOrigin };

  const chars = nfcDedup(value.chars, [c]);
  const picks = picksOf(value);
  if (!picks.some((p) => p.grapheme === nfc)) {
    const before = deriveStores(picks);
    const nextPicks = [
      ...picks,
      { grapheme: nfc, ...(opts?.role !== undefined ? { role: opts.role } : {}) },
    ];
    const after = deriveStores(nextPicks);
    return {
      value: { ...value, ...after, chars, provenance },
      lastPick: contribution(before, after, nfc),
    };
  }
  return { value: { ...value, chars, provenance }, lastPick: null };
}

/** Add one whole-grapheme author pick (NFC-normalized, deduped). */
export function addChar(
  value: CharacterInventoryValue,
  c: string,
  opts?: { role?: DeclaredRole },
): AddResult {
  return addWithProvenance(value, c, "author", opts);
}

/** Add a character on behalf of a PROPOSAL source rather than the author. */
export function addProposedChar(
  value: CharacterInventoryValue,
  c: string,
  source: DraftProvenance,
  opts?: { role?: DeclaredRole },
): AddResult {
  return addWithProvenance(value, c, source, opts);
}

/**
 * Remove one pick. Removing a PROPOSED character is a rejection —
 * remembered in `rejected` so a later re-derivation does not put it
 * straight back; removing an AUTHORED one is just an edit.
 */
export function removeChar(
  value: CharacterInventoryValue,
  c: string,
): CharacterInventoryValue {
  const nfc = c.normalize("NFC");
  const origin = value.provenance[nfc];
  const picks = picksOf(value).filter((p) => p.grapheme !== nfc);
  const chars = value.chars.filter((x) => x !== nfc);
  const provenance = { ...value.provenance };
  delete provenance[nfc];
  const isProposal = origin !== undefined && origin !== "author";
  const rejected =
    isProposal && !value.rejected.includes(nfc) ? [...value.rejected, nfc] : value.rejected;
  return { ...withDerived(value, picks, {}), chars, provenance, rejected };
}

/** Add if absent, remove if present (NFC-normalized before comparison). */
export function toggleChar(
  value: CharacterInventoryValue,
  c: string,
): { value: CharacterInventoryValue; lastPick: LastPickContribution | null } {
  const nfc = c.normalize("NFC");
  if (value.chars.includes(nfc)) return { value: removeChar(value, nfc), lastPick: null };
  return addChar(value, nfc);
}

/**
 * Replace the whole list wholesale. Pinned contract (the old store's
 * phaseBDraftStore.test.ts): `chars` takes the input VERBATIM — no
 * dedupe, no NFC-normalization; that is the caller's job. The derived
 * split still derives from a normalized/deduped pick rebuild.
 * Provenance follows the new list: retained characters keep their
 * origin, anything newly present came from the author, entries for
 * removed characters are dropped. NOT a per-character rejection —
 * `rejected` is untouched.
 */
export function setAllChars(
  value: CharacterInventoryValue,
  next: string[],
): CharacterInventoryValue {
  const deduped = nfcDedup([], next);
  const roles = { ...value.declaredRoles };
  const picks: DraftPick[] = deduped.map((grapheme) => {
    const role = roles[grapheme];
    return role !== undefined ? { grapheme, role } : { grapheme };
  });
  const prior = value.provenance;
  const provenance: Record<string, DraftProvenance> = {};
  for (const g of deduped) provenance[g] = prior[g] ?? "author";
  return { ...withDerived(value, picks, {}), chars: next, provenance };
}

/** Set the font applied to all Phase B character glyphs. */
export function setSelectedFont(
  value: CharacterInventoryValue,
  font: PhaseBFontValue,
): CharacterInventoryValue {
  return { ...value, selectedFont: font };
}

/** Add a loanword letter (NFC). No-op when already a loanword or an alphabet letter. */
export function addLoanword(value: CharacterInventoryValue, c: string): CharacterInventoryValue {
  const nfc = c.normalize("NFC");
  if (nfc.length === 0) return value;
  if (value.loanwordChars.includes(nfc) || value.chars.includes(nfc)) return value;
  return { ...value, loanwordChars: [...value.loanwordChars, nfc] };
}

/** Remove a loanword letter (NFC). An edit, never a rejection. */
export function removeLoanword(value: CharacterInventoryValue, c: string): CharacterInventoryValue {
  const nfc = c.normalize("NFC");
  return { ...value, loanwordChars: value.loanwordChars.filter((x) => x !== nfc) };
}

/**
 * Seed the draft from a sourced exemplar inventory (spec 044 FR-016):
 * the `main` tier only, plus 047's case-counterpart derivation.
 * Idempotent; never clobbers an author pick; respects `rejected`;
 * proposal sources union rather than override.
 */
export function seedFromProposal(
  value: CharacterInventoryValue,
  inv: SourcedInventory,
  bcp47?: string,
): { value: CharacterInventoryValue; lastPick: LastPickContribution | null } {
  const mainChars = inv.characters.filter((c) => c.tier === "main").map((c) => c.char);
  const proposed = nfcDedup(
    [],
    mainChars.flatMap((ch) => casePairOf(ch, bcp47)),
  );
  let next: CharacterInventoryValue = {
    ...value,
    proposalConfidence: { ...value.proposalConfidence, [inv.source]: inv.confidence },
    exemplarDigraphs: nfcDedup(value.exemplarDigraphs, inv.digraphs),
  };
  let lastPick: LastPickContribution | null = null;
  for (const ch of proposed) {
    const r = addWithProvenance(next, ch, inv.source);
    next = r.value;
    if (r.lastPick !== null) lastPick = r.lastPick;
  }
  return { value: next, lastPick };
}

/** Record that the author declined the exemplar method (FR-016a). Sticky. */
export function declineExemplarMethod(value: CharacterInventoryValue): CharacterInventoryValue {
  return { ...value, exemplarMethodDeclined: true };
}

/**
 * Seed a proposal set once per `seedKey` (spec 075 FR-001/FR-006).
 * Every character goes through the proposal add path, so a `rejected`
 * character is vetoed (FR-022) and an `"author"` entry is never
 * downgraded (FR-005). A repeated key is a no-op; the key is recorded
 * either way.
 */
export function seedProposals(
  value: CharacterInventoryValue,
  chars: readonly string[],
  source: DraftProvenance,
  seedKey: string,
): CharacterInventoryValue {
  if (value.seededProposals.includes(seedKey)) return value;
  let next: CharacterInventoryValue = {
    ...value,
    seededProposals: [...value.seededProposals, seedKey],
  };
  for (const ch of chars) {
    next = addWithProvenance(next, ch, source).value;
  }
  return next;
}

/**
 * Drop seed keys with any of the given prefixes (the characters
 * prefill confirm clearing the punctuation seeds tied to old evidence,
 * spec 079 FR-022). Other keys are untouched.
 */
export function clearSeededProposals(
  value: CharacterInventoryValue,
  prefixes: readonly string[],
): CharacterInventoryValue {
  return {
    ...value,
    seededProposals: value.seededProposals.filter(
      (k) => !prefixes.some((p) => k.startsWith(p)),
    ),
  };
}

/** Stamp the evidence key the alphabet is built from (spec 079 R-07). */
export function setAlphabetEvidenceKey(
  value: CharacterInventoryValue,
  key: string,
): CharacterInventoryValue {
  return { ...value, alphabetEvidenceKey: key };
}

/**
 * Clear back to an empty alphabet (font selection left untouched). The
 * sticky proposal decisions (`rejected`, `exemplarMethodDeclined`,
 * `seededProposals`, `alphabetEvidenceKey`) deliberately SURVIVE: each
 * records a decision the author made about proposals, and reset() runs
 * on every entry to the build-list screen.
 */
export function resetDraft(value: CharacterInventoryValue): CharacterInventoryValue {
  return {
    ...value,
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
    provenance: {},
    exemplarDigraphs: [],
    loanwordChars: [],
    proposalConfidence: {},
  };
}

/**
 * Clear the sticky proposal decisions (`rejected`,
 * `exemplarMethodDeclined`, `seededProposals`, `alphabetEvidenceKey`)
 * and the invisibles decisions — per-working-copy, not per-visit. Call
 * when a genuinely new working copy is instantiated.
 */
export function resetDraftDecisions(
  value: CharacterInventoryValue,
): CharacterInventoryValue {
  return {
    ...value,
    rejected: [],
    exemplarMethodDeclined: false,
    seededProposals: [],
    alphabetEvidenceKey: undefined,
  };
}

// ---------------------------------------------------------------------------
// Invisibles ops (over the invisibles-inventory value)
// ---------------------------------------------------------------------------

/**
 * Canonical `U+XXXX` key validation, via the contracts parser (the old
 * store's normalizeNotation): returns the CHARACTER for a well-formed
 * notation, or null.
 */
function charFromNotation(notation: string): string | null {
  return parseUPlusNotation(notation.trim());
}

/** The invisibles value as the old store's notation-keyed decision record. */
export function invisibleDecisionsOf(
  value: InventoryDecisionValue,
): Record<string, InvisibleDecision> {
  const out: Record<string, InvisibleDecision> = {};
  for (const item of value.accepted) out[toUPlusNotation(item.char)] = "accepted";
  for (const item of value.declined) out[toUPlusNotation(item.char)] = "declined";
  return out;
}

function withInvisibleDecision(
  value: InventoryDecisionValue,
  ch: string,
  decision: InvisibleDecision,
  provenance: InventoryItemProvenance,
): InventoryDecisionValue {
  // Already decided this way: a no-op (the old store absorbed a redundant
  // toggle silently; as a decision value it must not record a duplicate
  // version of the same value).
  const current = decision === "accepted" ? value.accepted : value.declined;
  if (current.some((i) => i.char === ch)) return value;
  const accepted = value.accepted.filter((i) => i.char !== ch);
  const declined = value.declined.filter((i) => i.char !== ch);
  if (decision === "accepted") accepted.push({ char: ch, provenance });
  else declined.push({ char: ch, provenance });
  return { accepted, declined };
}

/**
 * Record that the author wants this invisible character (by `U+XXXX`
 * notation). Never touches the character value's `chars`. The item's
 * provenance is `asked` (a hand decision) unless the caller names the
 * hand-off case (a character typed into the punctuation box, FR-016 —
 * also `asked`) or the carry-over case (`derived`, via
 * adoptControlsAsInvisibles).
 */
export function acceptInvisible(
  value: InventoryDecisionValue,
  notation: string,
  provenance: InventoryItemProvenance = "asked",
): InventoryDecisionValue {
  const ch = charFromNotation(notation);
  if (ch === null) return value;
  return withInvisibleDecision(value, ch, "accepted", provenance);
}

/** Record that the author declined this invisible character (`U+XXXX`). */
export function declineInvisible(
  value: InventoryDecisionValue,
  notation: string,
  provenance: InventoryItemProvenance = "derived",
): InventoryDecisionValue {
  const ch = charFromNotation(notation);
  if (ch === null) return value;
  return withInvisibleDecision(value, ch, "declined", provenance);
}

/**
 * Carry-over (spec 075 FR-017): every format character (General
 * Category Cf) in the character value's `controls` bucket becomes an
 * `"accepted"` invisible decision (provenance `derived` — a computed
 * carry-over) and leaves `chars`, so it is offered once, pre-selected,
 * and appears in one answer instead of two. Not a rejection —
 * `rejected` is untouched. Idempotent.
 */
export function adoptControlsAsInvisibles(
  character: CharacterInventoryValue,
  invisibles: InventoryDecisionValue,
): { character: CharacterInventoryValue; invisibles: InventoryDecisionValue } {
  const carried = character.controls.filter(isFormatChar);
  if (carried.length === 0) return { character, invisibles };
  let nextInvisibles = invisibles;
  for (const c of carried) {
    nextInvisibles = withInvisibleDecision(nextInvisibles, c, "accepted", "derived");
  }
  const carriedSet = new Set(carried);
  const provenance = { ...character.provenance };
  for (const c of carried) delete provenance[c];
  const picks = picksOf(character).filter((p) => !carriedSet.has(p.grapheme));
  const chars = character.chars.filter((c) => !carriedSet.has(c));
  const nextCharacter: CharacterInventoryValue = {
    ...withDerived(character, picks, {}),
    chars,
    provenance,
  };
  return { character: nextCharacter, invisibles: nextInvisibles };
}

// ---------------------------------------------------------------------------
// Punctuation projection (research D-090-10(d))
// ---------------------------------------------------------------------------

/**
 * Map a draft provenance onto an inventory item's FR-006 provenance:
 * `author → asked` (a hand decision), `base | text → extracted` (read
 * from the starting point / the author's own text), `cldr | sldr |
 * ascii-floor → derived` (a computed proposal).
 */
export function inventoryProvenanceOf(draft: DraftProvenance | undefined): InventoryItemProvenance {
  switch (draft) {
    case "author":
      return "asked";
    case "base":
    case "text":
      return "extracted";
    case undefined:
      return "asked";
    default:
      return "derived";
  }
}

/**
 * The punctuation-inventory value as a projection of the character
 * value: `accepted` is the draft's punctuation slice with mapped
 * provenance; `declined` is the rejected-punctuation ledger — the
 * previous value's declined items (their provenance was captured at
 * removal time, before the draft forgot it) plus any newly rejected
 * punctuation char, minus anything since re-accepted.
 */
export function punctuationProjection(
  character: CharacterInventoryValue,
  previous: InventoryDecisionValue,
): InventoryDecisionValue {
  const accepted: InventoryItem[] = character.punctuation.map((char) => ({
    char,
    provenance: inventoryProvenanceOf(character.provenance[char]),
  }));
  const acceptedChars = new Set(accepted.map((i) => i.char));
  const declined: InventoryItem[] = [];
  const seen = new Set<string>();
  for (const item of previous.declined) {
    if (acceptedChars.has(item.char) || seen.has(item.char)) continue;
    seen.add(item.char);
    declined.push(item);
  }
  for (const ch of character.rejected) {
    if (glyphCategory(ch) !== "punctuation") continue;
    if (acceptedChars.has(ch) || seen.has(ch)) continue;
    seen.add(ch);
    declined.push({ char: ch, provenance: previous.declined.find((i) => i.char === ch)?.provenance ?? "derived" });
  }
  return { accepted, declined };
}

/**
 * Capture a declined punctuation item at removal time: the caller (the
 * punctuation step, before it removes the char from the draft) appends
 * the item with the provenance the draft currently records for it.
 */
export function withDeclinedPunctuation(
  value: InventoryDecisionValue,
  char: string,
  draftProvenance: DraftProvenance | undefined,
): InventoryDecisionValue {
  if (value.declined.some((i) => i.char === char)) return value;
  return {
    accepted: value.accepted.filter((i) => i.char !== char),
    declined: [...value.declined, { char, provenance: inventoryProvenanceOf(draftProvenance) }],
  };
}

// ---------------------------------------------------------------------------
// Derived readers (pure over the values)
// ---------------------------------------------------------------------------

/** The three-store ConfirmedAlphabet the character value resolves to (spec 071). */
export function draftConfirmedAlphabet(value: CharacterInventoryValue): ConfirmedAlphabet {
  return makeConfirmedAlphabet({
    bases: value.bases,
    marks: value.marks,
    attestedStacks: value.attestedStacks,
    declaredRoles: value.declaredRoles,
  });
}

/** The characters of every `"accepted"` invisible decision, in insertion order. */
export function acceptedInvisibleChars(invisibles: InventoryDecisionValue): string[] {
  return invisibles.accepted.map((i) => i.char);
}

/**
 * The NFC-deduped union of the character value's punctuation slice and
 * the accepted invisible characters — the phase-C confirmed inventory
 * both phase-C emitters report (spec 075 FR-014 / FR-024).
 */
export function phaseCConfirmedInventory(
  character: CharacterInventoryValue,
  invisibles: InventoryDecisionValue,
): string[] {
  return nfcDedup([], [...character.punctuation, ...acceptedInvisibleChars(invisibles)]);
}

/**
 * The serializable snapshot shape the old draft store persisted inside
 * the durable draft (its `PhaseBDraftSnapshot`) — declared structurally
 * here so the value↔snapshot mapping has no store to import. The
 * interim facade (T021) and the v2-draft migration (T025) both map
 * through these functions.
 */
export interface PhaseBDraftSnapshotShape {
  chars: string[];
  declaredRoles?: Record<string, DeclaredRole>;
  provenance?: Record<string, DraftProvenance>;
  exemplarDigraphs?: string[];
  loanwordChars?: string[];
  rejected?: string[];
  proposalConfidence?: Record<string, string>;
  exemplarMethodDeclined?: boolean;
  seededProposals?: string[];
  invisibleDecisions?: Record<string, InvisibleDecision>;
  alphabetEvidenceKey?: string | undefined;
  selectedFont: PhaseBFontValue;
}

/**
 * Build the decision values from a stored snapshot — the old store's
 * `applyPhaseBDraftSnapshot` semantics: sticky fields and provenance
 * land first, then the char list flows through `setAllChars`, so a
 * restored draft keeps its proposed-vs-authored distinction instead of
 * flattening to "author".
 */
export function valuesFromSnapshot(snapshot: PhaseBDraftSnapshotShape): {
  character: CharacterInventoryValue;
  invisibles: InventoryDecisionValue;
} {
  const base: CharacterInventoryValue = {
    ...emptyCharacterInventoryValue(),
    declaredRoles: snapshot.declaredRoles ?? {},
    provenance: snapshot.provenance ?? {},
    exemplarDigraphs: snapshot.exemplarDigraphs ?? [],
    loanwordChars: snapshot.loanwordChars ?? [],
    rejected: snapshot.rejected ?? [],
    proposalConfidence: snapshot.proposalConfidence ?? {},
    exemplarMethodDeclined: snapshot.exemplarMethodDeclined ?? false,
    seededProposals: snapshot.seededProposals ?? [],
    alphabetEvidenceKey: snapshot.alphabetEvidenceKey,
    selectedFont: snapshot.selectedFont,
  };
  const character = setAllChars(base, snapshot.chars);
  let invisibles = emptyInventoryDecisionValue();
  for (const [notation, decision] of Object.entries(snapshot.invisibleDecisions ?? {})) {
    invisibles =
      decision === "accepted"
        ? acceptInvisible(invisibles, notation, "asked")
        : declineInvisible(invisibles, notation, "derived");
  }
  return { character, invisibles };
}

/** The snapshot shape for a pair of decision values (the old `snapshotPhaseBDraft`). */
export function snapshotFromValues(
  character: CharacterInventoryValue,
  invisibles: InventoryDecisionValue,
): PhaseBDraftSnapshotShape {
  return {
    chars: character.chars,
    declaredRoles: character.declaredRoles,
    provenance: character.provenance,
    exemplarDigraphs: character.exemplarDigraphs,
    loanwordChars: character.loanwordChars,
    rejected: character.rejected,
    proposalConfidence: character.proposalConfidence,
    exemplarMethodDeclined: character.exemplarMethodDeclined,
    seededProposals: character.seededProposals,
    invisibleDecisions: invisibleDecisionsOf(invisibles),
    ...(character.alphabetEvidenceKey !== undefined
      ? { alphabetEvidenceKey: character.alphabetEvidenceKey }
      : {}),
    selectedFont: character.selectedFont,
  };
}

/**
 * The seed value for `character-inventory`'s `extract` (folded in from
 * the retired `pb_character_inventory` spike, T021): the characters the
 * starting point already produces, each carried as a `base`-provenance
 * pick, with the derived split computed. Returns undefined when the
 * produced set is empty (the spike's contract).
 */
export function valueFromProducedSet(produced: ReadonlySet<string>): CharacterInventoryValue | undefined {
  if (produced.size === 0) return undefined;
  const chars = [...produced].sort();
  let value = emptyCharacterInventoryValue();
  for (const ch of chars) {
    value = addWithProvenance(value, ch, "base").value;
  }
  return value;
}
