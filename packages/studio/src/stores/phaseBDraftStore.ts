// phaseBDraftStore — INTERIM BRIDGE (spec 090 T021; DELETED by T025).
//
// Until US2 this file was the Phase B draft accumulator store. The
// canonical draft state is now the `character-inventory` +
// `invisibles-inventory` decision values (research D-090-10), edited
// through survey/useInventoryDraft.ts and computed by
// survey/phaseBDraftOps.ts. This module preserves the old store's
// public interface — a read mirror over the decision records, with the
// actions delegating to the inventory ops — so the consumers T022/T025
// have not rewired yet (the punctuation and invisibles steps, draft
// persistence, and their tests) keep working against the SAME values
// during the story. Nothing new should import this file.
//
// Records written through these actions carry the `characters` step
// attribution (the draft's home step); T022 rewires the punctuation and
// invisibles steps to the inventory surface with their own attribution,
// and T025 deletes this bridge and re-points draft persistence.

import { create } from "zustand";
import type { AttestedStack, ConfirmedAlphabet, DeclaredRole } from "@keyboard-studio/contracts";
import type { SourcedInventory } from "@keyboard-studio/engine";
import {
  draftConfirmedAlphabet as confirmedAlphabetOf,
  invisibleDecisionsOf,
  snapshotFromValues,
  valuesFromSnapshot,
  type InvisibleDecision,
  type LastPickContribution,
  type PhaseBDraftSnapshotShape,
} from "../survey/phaseBDraftOps.ts";
import type { PhaseBFontValue } from "../survey/surveyStyles.ts";
import { useDecisionStore } from "./decisionStore.ts";
import {
  getCharacterInventoryValue,
  getInvisiblesInventoryValue,
  inventoryOps,
  peekLastPick,
  recordCharacterInventoryValue,
  recordInvisiblesInventoryValue,
} from "../survey/useInventoryDraft.ts";

export type {
  DraftProvenance,
  InvisibleDecision,
  LastPickContribution,
} from "../survey/phaseBDraftOps.ts";
import type { DraftProvenance } from "../survey/phaseBDraftOps.ts";

/** The old store's snapshot shape (see phaseBDraftOps.ts for the mapping). */
export type PhaseBDraftSnapshot = PhaseBDraftSnapshotShape;

export interface PhaseBDraftState {
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
  lastPick: LastPickContribution | null;
  provenance: Record<string, DraftProvenance>;
  exemplarDigraphs: string[];
  loanwordChars: string[];
  rejected: string[];
  proposalConfidence: Record<string, string>;
  exemplarMethodDeclined: boolean;
  seededProposals: string[];
  alphabetEvidenceKey?: string | undefined;
  invisibleDecisions: Record<string, InvisibleDecision>;
  selectedFont: PhaseBFontValue;

  add: (c: string, opts?: { role?: DeclaredRole }) => void;
  remove: (c: string) => void;
  toggle: (c: string) => void;
  addProposed: (c: string, source: DraftProvenance, opts?: { role?: DeclaredRole }) => void;
  setAll: (next: string[]) => void;
  setSelectedFont: (font: PhaseBFontValue) => void;
  seedFromProposal: (inv: SourcedInventory, bcp47?: string) => void;
  declineExemplarMethod: () => void;
  seedProposals: (chars: readonly string[], source: DraftProvenance, seedKey: string) => void;
  acceptInvisible: (notation: string) => void;
  declineInvisible: (notation: string) => void;
  adoptControlsAsInvisibles: () => void;
  setAlphabetEvidenceKey: (key: string) => void;
  addLoanword: (c: string) => void;
  removeLoanword: (c: string) => void;
  reset: () => void;
}

type PhaseBDraftData = Omit<
  PhaseBDraftState,
  | "add"
  | "remove"
  | "toggle"
  | "addProposed"
  | "setAll"
  | "setSelectedFont"
  | "seedFromProposal"
  | "declineExemplarMethod"
  | "seedProposals"
  | "acceptInvisible"
  | "declineInvisible"
  | "adoptControlsAsInvisibles"
  | "setAlphabetEvidenceKey"
  | "addLoanword"
  | "removeLoanword"
  | "reset"
>;

const ops = inventoryOps("characters");

const actions: Omit<PhaseBDraftState, keyof PhaseBDraftData> = {
  add: (c, opts) => ops.add(c, opts),
  remove: (c) => ops.remove(c),
  toggle: (c) => ops.toggle(c),
  addProposed: (c, source, opts) => ops.addProposed(c, source, opts),
  setAll: (next) => ops.setAll(next),
  setSelectedFont: (font) => ops.setSelectedFont(font),
  seedFromProposal: (inv, bcp47) => ops.seedFromProposal(inv, bcp47),
  declineExemplarMethod: () => ops.declineExemplarMethod(),
  seedProposals: (chars, source, seedKey) => ops.seedProposals(chars, source, seedKey),
  acceptInvisible: (notation) => ops.acceptInvisible(notation),
  declineInvisible: (notation) => ops.declineInvisible(notation),
  adoptControlsAsInvisibles: () => ops.adoptControlsAsInvisibles(),
  setAlphabetEvidenceKey: (key) => ops.setAlphabetEvidenceKey(key),
  addLoanword: (c) => ops.addLoanword(c),
  removeLoanword: (c) => ops.removeLoanword(c),
  reset: () => ops.reset(),
};

function mirrorFields(): PhaseBDraftData {
  const character = getCharacterInventoryValue();
  const invisibles = getInvisiblesInventoryValue();
  return {
    chars: character.chars,
    bases: character.bases,
    marks: character.marks,
    attestedStacks: character.attestedStacks,
    declaredRoles: character.declaredRoles,
    numbers: character.numbers,
    punctuation: character.punctuation,
    symbols: character.symbols,
    separators: character.separators,
    controls: character.controls,
    lastPick: peekLastPick(),
    provenance: character.provenance,
    exemplarDigraphs: character.exemplarDigraphs,
    loanwordChars: character.loanwordChars,
    rejected: character.rejected,
    proposalConfidence: character.proposalConfidence,
    exemplarMethodDeclined: character.exemplarMethodDeclined,
    seededProposals: character.seededProposals,
    alphabetEvidenceKey: character.alphabetEvidenceKey,
    invisibleDecisions: invisibleDecisionsOf(invisibles),
    selectedFont: character.selectedFont,
  };
}

export const usePhaseBDraftStore = create<PhaseBDraftState>()(() => ({
  ...mirrorFields(),
  ...actions,
}));

// Every decision-record change re-mirrors the draft's data fields (the
// actions are stable identities and are never part of the mirror).
useDecisionStore.subscribe(() => {
  usePhaseBDraftStore.setState(mirrorFields());
});

/**
 * Clear the sticky proposal decisions (`rejected`, `exemplarMethodDeclined`,
 * `seededProposals`, `invisibleDecisions`, `alphabetEvidenceKey`) — called
 * when a genuinely new working copy is instantiated.
 */
export function resetPhaseBDraftDecisions(): void {
  ops.resetDecisions();
}

/** The three-store ConfirmedAlphabet the current draft resolves to (spec 071). */
export function draftConfirmedAlphabet(): ConfirmedAlphabet {
  return confirmedAlphabetOf(getCharacterInventoryValue());
}

/** Build a serializable snapshot of the CURRENT phase-B draft alphabet. */
export function snapshotPhaseBDraft(): PhaseBDraftSnapshot {
  return snapshotFromValues(getCharacterInventoryValue(), getInvisiblesInventoryValue());
}

/**
 * Restore a stored snapshot by recording the decision values it maps to
 * (the old store patched its own state; the values are the state now).
 * Draft persistence drives the durable-draft restore through here until
 * T025 re-points it at the decisions slice + the legacy-slice migration.
 */
export function applyPhaseBDraftSnapshot(snapshot: PhaseBDraftSnapshot): void {
  const { character, invisibles } = valuesFromSnapshot(snapshot);
  recordCharacterInventoryValue(character, "characters");
  recordInvisiblesInventoryValue(invisibles, "characters");
}
