// criteriaRecordStore — the author's per-project record of criteria
// attestations and confirmations (spec 084 D5).
//
// Holds the live `CriteriaRecord` for the AUTHOR's own project only: one
// attestation per yellow-band criterion the author has answered on the
// criteria page (Yes / No / Not applicable, with the time it was given),
// and one confirmation per red-band criterion the author has confirmed.
// Drafts persist this store as their `criteriaRecord` slice, exactly as
// they persist the decision set (the decisionStore pattern).
//
// This store is never written from the Compare surface: a foreign
// keyboard is judged read-only there, and its rows carry no attestation
// or confirmation controls (spec 057 FR-023 isolation).

import { create } from "zustand";

/** The author's answer to a yellow-band criterion, given on the criteria page. */
export type AttestationAnswer = "yes" | "no" | "not-applicable";

/** One attestation: the answer given, and when (ISO timestamp string). */
export interface Attestation {
  answer: AttestationAnswer;
  at: string;
}

/** One red-band confirmation: when it was given (ISO timestamp string). */
export interface Confirmation {
  at: string;
}

/**
 * The persisted shape — it IS the draft's `criteriaRecord` slice; the draft
 * writer performs no transformation on it.
 */
export interface CriteriaRecord {
  attestations: Record<string, Attestation>;
  confirmations: Record<string, Confirmation>;
  /**
   * The author's attestation that the keyboard's numeric region subtag
   * is explicitly contrastive (criterion 12.3's exception clause, spec
   * 084 Batch 3) — one per project, not per criterion: there is one
   * keyboard and one region choice per project. Null when unattested.
   * Optional in the type so drafts written before Batch 3 (which lack
   * the key) still satisfy it; applyCriteriaRecordSnapshot defaults it.
   */
  contrastiveAttestation?: { at: string } | null;
}

/** The empty record: what a project with no attestations or confirmations carries. */
export const EMPTY_CRITERIA_RECORD: CriteriaRecord = {
  attestations: {},
  confirmations: {},
  contrastiveAttestation: null,
};

export interface CriteriaRecordStoreState extends CriteriaRecord {
  /** Record (or replace) the author's answer for one criterion, stamped with the current time. */
  attest: (criterionId: string, answer: AttestationAnswer) => void;
  /** Remove one criterion's attestation outright; no other entry changes. */
  clearAttestation: (criterionId: string) => void;
  /** Record (or re-stamp) the author's confirmation for one criterion. */
  confirm: (criterionId: string) => void;
  /** Remove one criterion's confirmation outright; no other entry changes. */
  unconfirm: (criterionId: string) => void;
  /** Attest the numeric region subtag is explicitly contrastive (§12.3), stamped with the current time. */
  attestContrastiveRegion: () => void;
  /** Remove the contrastive-region attestation outright. */
  clearContrastiveRegion: () => void;
  /** Start-over / new-project only — wired beside decisionStore's reset. */
  reset: () => void;
}

export const useCriteriaRecordStore = create<CriteriaRecordStoreState>()((set) => ({
  attestations: {},
  confirmations: {},
  contrastiveAttestation: null,

  attest: (criterionId, answer) =>
    set((s) => ({
      attestations: {
        ...s.attestations,
        [criterionId]: { answer, at: new Date().toISOString() },
      },
    })),

  clearAttestation: (criterionId) =>
    set((s) => {
      if (s.attestations[criterionId] === undefined) return s;
      const attestations = { ...s.attestations };
      delete attestations[criterionId];
      return { attestations };
    }),

  confirm: (criterionId) =>
    set((s) => ({
      confirmations: {
        ...s.confirmations,
        [criterionId]: { at: new Date().toISOString() },
      },
    })),

  unconfirm: (criterionId) =>
    set((s) => {
      if (s.confirmations[criterionId] === undefined) return s;
      const confirmations = { ...s.confirmations };
      delete confirmations[criterionId];
      return { confirmations };
    }),

  attestContrastiveRegion: () =>
    set({ contrastiveAttestation: { at: new Date().toISOString() } }),

  clearContrastiveRegion: () => set({ contrastiveAttestation: null }),

  reset: () =>
    set({ attestations: {}, confirmations: {}, contrastiveAttestation: null }),
}));

/** The persisted shape — the draft's `criteriaRecord` slice, untransformed. */
export function getCriteriaRecordSnapshot(): CriteriaRecord {
  const { attestations, confirmations, contrastiveAttestation } =
    useCriteriaRecordStore.getState();
  return {
    attestations,
    confirmations,
    contrastiveAttestation: contrastiveAttestation ?? null,
  };
}

/** Restore a snapshot — a direct `setState`, not reset-first (the decisionStore idiom). */
export function applyCriteriaRecordSnapshot(snapshot: CriteriaRecord): void {
  useCriteriaRecordStore.setState({
    attestations: snapshot.attestations,
    confirmations: snapshot.confirmations,
    // Drafts written before Batch 3 lack the key entirely.
    contrastiveAttestation: snapshot.contrastiveAttestation ?? null,
  });
}
