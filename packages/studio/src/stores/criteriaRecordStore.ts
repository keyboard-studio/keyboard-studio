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
import type { ReviewNote } from "@keyboard-studio/contracts";

import type { OpenBaseline } from "../criteria/openRatchet.ts";

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
 * One bundled font's license attestation (spec 084 Batch 5, criteria
 * 9.1/9.2): the license the author asserts for the font (e.g.
 * "OFL-1.1"), whether the author confirms it is an open license, and
 * when. Keyed by font file name in the record — the corpus .kps has
 * no per-font license field, so this record is the only honest source
 * for these two criteria.
 */
export interface FontLicenseAttestation {
  license: string;
  openConfirmed: boolean;
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
  /**
   * Per-font license attestations, keyed by font file name (Batch 5).
   * Optional in the type so drafts written before Batch 5 (which lack
   * the key) still satisfy it; applyCriteriaRecordSnapshot defaults it.
   */
  fontLicenseAttestations?: Record<string, FontLicenseAttestation>;
  /**
   * Open mode (spec 111): what was already failing when the keyboard was
   * opened. Null until taken; never set on Copy. Optional so older drafts
   * (which lack the key) still satisfy the type.
   */
  openBaseline?: OpenBaseline | null;
  /** Open mode: the author's justification per new failure. Never a decision. */
  reviewNotes?: ReviewNote[];
}

/** The empty record: what a project with no attestations or confirmations carries. */
export const EMPTY_CRITERIA_RECORD: CriteriaRecord = {
  attestations: {},
  confirmations: {},
  contrastiveAttestation: null,
  fontLicenseAttestations: {},
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
  /** Record (or replace) one bundled font's license attestation (§§9.1/9.2), stamped with the current time. */
  attestFontLicense: (
    fontName: string,
    license: string,
    openConfirmed: boolean,
  ) => void;
  /** Remove one font's license attestation outright. */
  clearFontLicense: (fontName: string) => void;
  /** Take (or clear) the Open-mode baseline. */
  setOpenBaseline: (baseline: OpenBaseline | null) => void;
  /** Write or edit the review note for one new failure. Empty text removes it. */
  setReviewNote: (note: Omit<ReviewNote, "writtenAt">) => void;
  /** Remove the review note for one finding key. */
  removeReviewNote: (key: ReviewNote["key"]) => void;
  /** Drop notes whose key is no longer failing (auto-drop). */
  retainReviewNotes: (failingKeys: ReadonlySet<ReviewNote["key"]>) => void;
  /** Start-over / new-project only — wired beside decisionStore's reset. */
  reset: () => void;
}

export const useCriteriaRecordStore = create<CriteriaRecordStoreState>()((set) => ({
  attestations: {},
  confirmations: {},
  contrastiveAttestation: null,
  fontLicenseAttestations: {},
  openBaseline: null,
  reviewNotes: [],

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

  attestFontLicense: (fontName, license, openConfirmed) =>
    set((s) => ({
      fontLicenseAttestations: {
        ...(s.fontLicenseAttestations ?? {}),
        [fontName]: { license, openConfirmed, at: new Date().toISOString() },
      },
    })),

  clearFontLicense: (fontName) =>
    set((s) => {
      if (s.fontLicenseAttestations?.[fontName] === undefined) return s;
      const fontLicenseAttestations = { ...s.fontLicenseAttestations };
      delete fontLicenseAttestations[fontName];
      return { fontLicenseAttestations };
    }),

  setOpenBaseline: (baseline) => set({ openBaseline: baseline }),

  setReviewNote: (note) =>
    set((s) => {
      const others = (s.reviewNotes ?? []).filter((n) => n.key !== note.key);
      if (note.text.trim() === "") return { reviewNotes: others };
      return {
        reviewNotes: [...others, { ...note, writtenAt: new Date().toISOString() }],
      };
    }),

  removeReviewNote: (key) =>
    set((s) => {
      const notes = s.reviewNotes ?? [];
      return notes.some((n) => n.key === key)
        ? { reviewNotes: notes.filter((n) => n.key !== key) }
        : s;
    }),

  retainReviewNotes: (failingKeys) =>
    set((s) => {
      const notes = s.reviewNotes ?? [];
      const kept = notes.filter((n) => failingKeys.has(n.key));
      return kept.length === notes.length ? s : { reviewNotes: kept };
    }),

  reset: () =>
    set({
      attestations: {},
      confirmations: {},
      contrastiveAttestation: null,
      fontLicenseAttestations: {},
      openBaseline: null,
      reviewNotes: [],
    }),
}));

/** The persisted shape — the draft's `criteriaRecord` slice, untransformed. */
export function getCriteriaRecordSnapshot(): CriteriaRecord {
  const {
    attestations,
    confirmations,
    contrastiveAttestation,
    fontLicenseAttestations,
    openBaseline,
    reviewNotes,
  } = useCriteriaRecordStore.getState();
  return {
    attestations,
    confirmations,
    contrastiveAttestation: contrastiveAttestation ?? null,
    fontLicenseAttestations: fontLicenseAttestations ?? {},
    // Open-only slices stay out of the snapshot until used, so a Copy draft
    // keeps the shape it always had.
    ...(openBaseline != null ? { openBaseline } : {}),
    ...(reviewNotes != null && reviewNotes.length > 0 ? { reviewNotes } : {}),
  };
}

/** Restore a snapshot — a direct `setState`, not reset-first (the decisionStore idiom). */
export function applyCriteriaRecordSnapshot(snapshot: CriteriaRecord): void {
  useCriteriaRecordStore.setState({
    attestations: snapshot.attestations,
    confirmations: snapshot.confirmations,
    // Drafts written before Batch 3 lack the key entirely.
    contrastiveAttestation: snapshot.contrastiveAttestation ?? null,
    // Drafts written before Batch 5 lack the key entirely.
    fontLicenseAttestations: snapshot.fontLicenseAttestations ?? {},
    // Drafts written before Open mode lack both keys.
    openBaseline: snapshot.openBaseline ?? null,
    reviewNotes: snapshot.reviewNotes ?? [],
  });
}
