// useInventoryDraft — the shared Phase B/C draft surface, backed by the
// gallery decision values (spec 090 US2, research D-090-10).
//
// The characters, punctuation and invisibles steps and StudioShell's
// CharacterMapPane all edit ONE accumulator. Until US2 that accumulator
// was a standalone zustand draft store; now the canonical state is the
// `character-inventory` + `invisibles-inventory` decision records in
// `decisionStore`, mutated only through the pure ops in
// phaseBDraftOps.ts and recorded only through the gallery host's decide
// core (`decideGalleryValue`, steps/galleryHost.tsx) — the same single
// write path the GalleryHost component uses, composed here because the
// accumulator is edited from several step trees and one shell pane, not
// from a single hosted renderer. No store write action is called from
// any renderer (FR-003): the ops below are the host machinery, with the
// editing step's id as the record attribution.
//
// The punctuation-inventory value is maintained as a projection
// (D-090-10(d)): after any character-value mutation it is recomputed
// and re-recorded when a punctuation record already exists or the
// editing step is `punctuation`.

import { useMemo } from "react";
import { create } from "zustand";
import type { DeclaredRole } from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";
import { getDecisionSnapshot, useDecisionStore } from "../stores/decisionStore.ts";
import { decideGalleryValue, type GalleryHostDeps } from "../steps/galleryHost.tsx";
import { buildGalleryHostDeps } from "../lib/galleryHostDeps.ts";
import type { GalleryModule } from "./types.ts";
import type { PhaseBFontValue } from "./surveyStyles.ts";
import {
  acceptInvisible as acceptInvisibleOp,
  addChar,
  addLoanword,
  addProposedChar,
  adoptControlsAsInvisibles,
  clearSeededProposals,
  declineExemplarMethod,
  declineInvisible as declineInvisibleOp,
  emptyCharacterInventoryValue,
  emptyInventoryDecisionValue,
  invisibleDecisionsOf,
  punctuationProjection,
  removeChar,
  removeLoanword,
  resetDraft,
  resetDraftDecisions,
  seedFromProposal,
  seedProposals,
  setAllChars,
  setAlphabetEvidenceKey,
  setSelectedFont,
  toggleChar,
  valuesFromSnapshot,
  type CharacterInventoryValue,
  type DraftProvenance,
  type InventoryDecisionValue,
  type InventoryItemProvenance,
  type LastPickContribution,
  type PhaseBDraftSnapshotShape,
} from "./phaseBDraftOps.ts";

// ---------------------------------------------------------------------------
// Module stubs for the host decide core. `decideGalleryValue` reads only
// provides / requires / writes / apply / definition.id; the literals here
// mirror the real gallery modules' declarations (a T028 test pins them
// equal, so the two can never drift silently). The cast is the D-090-1
// pattern: the accumulator cannot import the real modules without closing
// an import cycle through their renderers (D-090-7/D-090-8).
// ---------------------------------------------------------------------------

const CHARACTER_MODULE = {
  definition: { id: "characterInventory" },
  provides: ["character-inventory"],
  requires: ["target-script", "authoring-track", "project-keyboard-id"],
  writes: [],
  apply: () => ({}),
} as unknown as GalleryModule<CharacterInventoryValue>;

const INVISIBLES_MODULE = {
  definition: { id: "invisiblesInventory" },
  provides: ["invisibles-inventory"],
  requires: ["character-inventory"],
  writes: [],
  apply: () => ({}),
} as unknown as GalleryModule<InventoryDecisionValue>;

const PUNCTUATION_MODULE = {
  definition: { id: "punctuationInventory" },
  provides: ["punctuation-inventory"],
  requires: ["character-inventory"],
  writes: [],
  apply: () => ({}),
} as unknown as GalleryModule<InventoryDecisionValue>;

let cachedDeps: GalleryHostDeps | null = null;
function deps(): GalleryHostDeps {
  cachedDeps ??= buildGalleryHostDeps();
  return cachedDeps;
}

const EMPTY_CHARACTER = emptyCharacterInventoryValue();
const EMPTY_INVENTORY = emptyInventoryDecisionValue();

// ---------------------------------------------------------------------------
// Readers (hook + getState forms)
// ---------------------------------------------------------------------------

export function getCharacterInventoryValue(): CharacterInventoryValue {
  const record = getDecisionSnapshot()["character-inventory"];
  return (record?.value as CharacterInventoryValue | undefined) ?? EMPTY_CHARACTER;
}

export function getInvisiblesInventoryValue(): InventoryDecisionValue {
  const record = getDecisionSnapshot()["invisibles-inventory"];
  return (record?.value as InventoryDecisionValue | undefined) ?? EMPTY_INVENTORY;
}

export function getPunctuationInventoryValue(): InventoryDecisionValue {
  const record = getDecisionSnapshot()["punctuation-inventory"];
  return (record?.value as InventoryDecisionValue | undefined) ?? EMPTY_INVENTORY;
}

export function useCharacterInventoryValue(): CharacterInventoryValue {
  const record = useDecisionStore((s) => s.decisions["character-inventory"]);
  return (record?.value as CharacterInventoryValue | undefined) ?? EMPTY_CHARACTER;
}

export function useInvisiblesInventoryValue(): InventoryDecisionValue {
  const record = useDecisionStore((s) => s.decisions["invisibles-inventory"]);
  return (record?.value as InventoryDecisionValue | undefined) ?? EMPTY_INVENTORY;
}

export function usePunctuationInventoryValue(): InventoryDecisionValue {
  const record = useDecisionStore((s) => s.decisions["punctuation-inventory"]);
  return (record?.value as InventoryDecisionValue | undefined) ?? EMPTY_INVENTORY;
}

// ---------------------------------------------------------------------------
// lastPick — the transient "just added" highlight (renderer-internal,
// research R3): never part of a decision value, held in a local UI store
// exactly as transient as the old store's field was.
// ---------------------------------------------------------------------------

const useLastPickStore = create<{
  lastPick: LastPickContribution | null;
  setLastPick: (p: LastPickContribution | null) => void;
}>((set) => ({
  lastPick: null,
  setLastPick: (lastPick) => set({ lastPick }),
}));

/** The current last-pick contribution, read imperatively (post-op callers). */
export function peekLastPick(): LastPickContribution | null {
  return useLastPickStore.getState().lastPick;
}

// ---------------------------------------------------------------------------
// Bound ops
// ---------------------------------------------------------------------------

export interface InventoryDraftOps {
  add: (c: string, opts?: { role?: DeclaredRole }) => void;
  addProposed: (c: string, source: DraftProvenance, opts?: { role?: DeclaredRole }) => void;
  remove: (c: string) => void;
  toggle: (c: string) => void;
  setAll: (next: string[]) => void;
  setSelectedFont: (font: PhaseBFontValue) => void;
  addLoanword: (c: string) => void;
  removeLoanword: (c: string) => void;
  seedFromProposal: (inv: SourcedInventory, bcp47?: string) => void;
  declineExemplarMethod: () => void;
  seedProposals: (chars: readonly string[], source: DraftProvenance, seedKey: string) => void;
  clearSeededProposals: (prefixes: readonly string[]) => void;
  acceptInvisible: (notation: string, provenance?: InventoryItemProvenance) => void;
  declineInvisible: (notation: string) => void;
  adoptControlsAsInvisibles: () => void;
  setAlphabetEvidenceKey: (key: string) => void;
  reset: () => void;
  resetDecisions: () => void;
}

function recordCharacter(next: CharacterInventoryValue, stepId: string): void {
  const current = getCharacterInventoryValue();
  if (next === current) return;
  decideGalleryValue(CHARACTER_MODULE, next, { provenance: "asked" }, stepId, deps());
  recordPunctuationProjection(next, stepId);
}

function recordInvisibles(next: InventoryDecisionValue, stepId: string): void {
  const current = getInvisiblesInventoryValue();
  if (next === current) return;
  decideGalleryValue(INVISIBLES_MODULE, next, { provenance: "asked" }, stepId, deps());
}

/**
 * Record a whole character-inventory value under one step's attribution
 * (snapshot restore / legacy-draft migration — the ops record edits;
 * this records a complete value). Also maintains the punctuation
 * projection, like any other character-value change.
 */
export function recordCharacterInventoryValue(
  next: CharacterInventoryValue,
  stepId: string,
): void {
  decideGalleryValue(CHARACTER_MODULE, next, { provenance: "asked" }, stepId, deps());
  recordPunctuationProjection(next, stepId);
}

/** Record a whole invisibles-inventory value under one step's attribution. */
export function recordInvisiblesInventoryValue(
  next: InventoryDecisionValue,
  stepId: string,
): void {
  decideGalleryValue(INVISIBLES_MODULE, next, { provenance: "asked" }, stepId, deps());
}

/**
 * Clear the sticky proposal decisions (`rejected`, `exemplarMethodDeclined`,
 * `seededProposals`, `invisibleDecisions`, `alphabetEvidenceKey`) — called
 * when a genuinely new working copy is instantiated (spec 044 FR-016a).
 * Was `resetPhaseBDraftDecisions` on the retired facade (spec 090 T025).
 */
export function resetInventoryDecisions(): void {
  inventoryOps("characters").resetDecisions();
}

/** Reset the whole inventory draft to its empty values (the old store's `reset()`). */
export function resetInventoryDraft(): void {
  inventoryOps("characters").reset();
}

/**
 * Restore a legacy phase-B snapshot (the retired draft slice's shape) by
 * recording the decision values it maps to — the v2-draft migration in
 * lib/draftPersistence.ts (spec 090 T025) drives the durable-draft
 * restore through here.
 */
export function restoreInventoryFromSnapshot(snapshot: PhaseBDraftSnapshotShape): void {
  const { character, invisibles } = valuesFromSnapshot(snapshot);
  recordCharacterInventoryValue(character, "characters");
  recordInvisiblesInventoryValue(invisibles, "characters");
}

/**
 * Maintain the punctuation-inventory record as a projection of the
 * character value (D-090-10(d)): recorded when a record already exists
 * or the editing step is `punctuation`, and only when it changed.
 */
function recordPunctuationProjection(character: CharacterInventoryValue, stepId: string): void {
  const hasRecord = getDecisionSnapshot()["punctuation-inventory"] !== undefined;
  if (!hasRecord && stepId !== "punctuation") return;
  const current = getPunctuationInventoryValue();
  const next = punctuationProjection(character, current);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  decideGalleryValue(PUNCTUATION_MODULE, next, { provenance: "asked" }, stepId, deps());
}

/** The draft ops bound to one editing step's attribution. */
export function inventoryOps(stepId: string): InventoryDraftOps {
  return {
    add: (c, opts) => {
      const r = addChar(getCharacterInventoryValue(), c, opts);
      if (r.lastPick !== null) useLastPickStore.getState().setLastPick(r.lastPick);
      recordCharacter(r.value, stepId);
    },
    addProposed: (c, source, opts) => {
      const r = addProposedChar(getCharacterInventoryValue(), c, source, opts);
      if (r.lastPick !== null) useLastPickStore.getState().setLastPick(r.lastPick);
      recordCharacter(r.value, stepId);
    },
    remove: (c) => {
      recordCharacter(removeChar(getCharacterInventoryValue(), c), stepId);
      useLastPickStore.getState().setLastPick(null);
    },
    toggle: (c) => {
      const r = toggleChar(getCharacterInventoryValue(), c);
      if (r.lastPick !== null) useLastPickStore.getState().setLastPick(r.lastPick);
      else useLastPickStore.getState().setLastPick(null);
      recordCharacter(r.value, stepId);
    },
    setAll: (next) => {
      recordCharacter(setAllChars(getCharacterInventoryValue(), next), stepId);
      useLastPickStore.getState().setLastPick(null);
    },
    setSelectedFont: (font) => {
      recordCharacter(setSelectedFont(getCharacterInventoryValue(), font), stepId);
    },
    addLoanword: (c) => {
      recordCharacter(addLoanword(getCharacterInventoryValue(), c), stepId);
    },
    removeLoanword: (c) => {
      recordCharacter(removeLoanword(getCharacterInventoryValue(), c), stepId);
    },
    seedFromProposal: (inv, bcp47) => {
      const r = seedFromProposal(getCharacterInventoryValue(), inv, bcp47);
      if (r.lastPick !== null) useLastPickStore.getState().setLastPick(r.lastPick);
      recordCharacter(r.value, stepId);
    },
    declineExemplarMethod: () => {
      recordCharacter(declineExemplarMethod(getCharacterInventoryValue()), stepId);
    },
    seedProposals: (chars, source, seedKey) => {
      recordCharacter(seedProposals(getCharacterInventoryValue(), chars, source, seedKey), stepId);
    },
    clearSeededProposals: (prefixes) => {
      recordCharacter(clearSeededProposals(getCharacterInventoryValue(), prefixes), stepId);
    },
    acceptInvisible: (notation, provenance) => {
      recordInvisibles(
        acceptInvisibleOp(getInvisiblesInventoryValue(), notation, provenance),
        stepId,
      );
    },
    declineInvisible: (notation) => {
      recordInvisibles(declineInvisibleOp(getInvisiblesInventoryValue(), notation), stepId);
    },
    adoptControlsAsInvisibles: () => {
      const r = adoptControlsAsInvisibles(
        getCharacterInventoryValue(),
        getInvisiblesInventoryValue(),
      );
      recordInvisibles(r.invisibles, stepId);
      recordCharacter(r.character, stepId);
    },
    setAlphabetEvidenceKey: (key) => {
      recordCharacter(setAlphabetEvidenceKey(getCharacterInventoryValue(), key), stepId);
    },
    reset: () => {
      recordCharacter(resetDraft(getCharacterInventoryValue()), stepId);
      useLastPickStore.getState().setLastPick(null);
    },
    resetDecisions: () => {
      recordCharacter(resetDraftDecisions(getCharacterInventoryValue()), stepId);
      recordInvisibles(EMPTY_INVENTORY, stepId);
    },
  };
}

// ---------------------------------------------------------------------------
// The hook: the old draft store's field surface + the bound ops
// ---------------------------------------------------------------------------

export interface InventoryDraft extends CharacterInventoryValue {
  /** The invisibles decisions as the old store's notation-keyed record. */
  invisibleDecisions: Record<string, "accepted" | "declined">;
  lastPick: LastPickContribution | null;
  characterValue: CharacterInventoryValue;
  invisiblesValue: InventoryDecisionValue;
  punctuationValue: InventoryDecisionValue;
  ops: InventoryDraftOps;
}

/**
 * Subscribe to the shared Phase B/C draft under one editing step's
 * attribution. Returns the character value's fields (the surface the
 * components read from the old draft store), the invisibles decision
 * record, and the bound ops.
 */
export function useInventoryDraft(stepId: string): InventoryDraft {
  const characterValue = useCharacterInventoryValue();
  const invisiblesValue = useInvisiblesInventoryValue();
  const punctuationValue = usePunctuationInventoryValue();
  const lastPick = useLastPickStore((s) => s.lastPick);
  const ops = useMemo(() => inventoryOps(stepId), [stepId]);
  return {
    ...characterValue,
    invisibleDecisions: invisibleDecisionsOf(invisiblesValue),
    lastPick,
    characterValue,
    invisiblesValue,
    punctuationValue,
    ops,
  };
}
