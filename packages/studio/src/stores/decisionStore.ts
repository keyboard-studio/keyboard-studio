// decisionStore — the one live record of every resolved decision (spec 088).
//
// Holds the live `DecisionSet`: one `Decision` record per decision id, keyed
// by decision id, never by the step that asked the question (FR-001). Survey
// -question completions write here through the single completion writer
// (`recordAnswersAsDecisions` in steps/reducer.ts, contract C-2); drafts
// persist this store as their `decisions` slice (FR-007).
//
// Contract C-1 (specs/088-modular-decisions/contracts/decision-store-contract.md):
// this module imports types from decisions/decisionTypes.ts ONLY — no other
// store, no step module, no survey module — and it writes no other store and
// reads no other store. The touch-draft side effect that used to ride on the
// session's seed setter lives at the seed decision's writer call sites
// (research D-06), not here.

import { create } from "zustand";
import type { Decision, DecisionId, DecisionSet } from "../decisions/decisionTypes.ts";

export interface DecisionStoreState {
  decisions: DecisionSet;
  /** Replace-or-insert one record by its id; no other record changes (C-1.1). */
  record: (r: Decision) => void;
  /** `record` folded over the argument list, in argument order (C-1.1). */
  recordAll: (rs: readonly Decision[]) => void;
  /**
   * Remove one decision outright — no record remains (not a supersede).
   * For facts invalidated by a later act, e.g. the touch-seed choice on a
   * genuine base re-instantiation (spec 035 R12): the fork must be re-asked,
   * which requires NO record to exist.
   */
  forget: (id: DecisionId) => void;
  /** Start-over / new-project only — wired beside surveyAnswerStore's reset. */
  reset: () => void;
}

export const useDecisionStore = create<DecisionStoreState>()((set) => ({
  decisions: {},

  record: (r) =>
    set((s) => ({ decisions: { ...s.decisions, [r.id]: r } })),

  recordAll: (rs) =>
    set((s) => {
      if (rs.length === 0) return s;
      const next: Partial<Record<DecisionId, Decision<unknown>>> = { ...s.decisions };
      for (const r of rs) next[r.id] = r;
      return { decisions: next };
    }),

  forget: (id) =>
    set((s) => {
      if (s.decisions[id] === undefined) return s;
      const next: Partial<Record<DecisionId, Decision<unknown>>> = { ...s.decisions };
      delete next[id];
      return { decisions: next };
    }),

  reset: () => set({ decisions: {} }),
}));

/**
 * The persisted shape — it IS the draft's `decisions` slice; the draft writer
 * performs no transformation on it (C-1.4).
 */
export function getDecisionSnapshot(): DecisionSet {
  return useDecisionStore.getState().decisions;
}

/** Restore a snapshot — a direct `setState`, not reset-first (the surveyAnswerStore idiom). */
export function applyDecisionSnapshot(snapshot: DecisionSet): void {
  useDecisionStore.setState({ decisions: snapshot });
}

/** One decision's live record, without subscribing. */
export function peekDecision(id: DecisionId): Decision | undefined {
  return useDecisionStore.getState().decisions[id];
}

/** Mirrors `Track` in survey/types.ts (this module imports no survey module — C-1.3). */
export type TrackValue = "copy" | "adapt";
/** Mirrors `TouchSeedSource` in stores/surveySessionStore.ts (C-1.3, as above). */
export type TouchSeedSourceValue = "import-adapt" | "reseed-from-desktop";

/** FR-005 selector: the authoring track, replacing the deleted session field. */
export function selectTrack(decisions: DecisionSet): TrackValue | null {
  const value = decisions["authoring-track"]?.value;
  return value === "copy" || value === "adapt" ? value : null;
}

/** FR-005 selector: the touch seed source, replacing the deleted session field. */
export function selectTouchSeedSource(decisions: DecisionSet): TouchSeedSourceValue | null {
  const value = decisions["touch-seed-source"]?.value;
  return value === "import-adapt" || value === "reseed-from-desktop" ? value : null;
}

/**
 * Contract C-3.2's one permitted view: the set with the `touch-seed-source`
 * record omitted, for `resolveLocation`'s gate evaluation (a remembered seed
 * must not strand the jump back to the chooser). Constructed by omission
 * from a snapshot at the call site — never stored, never rebuilt from
 * session fields.
 */
export function decisionsWithoutTouchSeed(decisions: DecisionSet): DecisionSet {
  if (decisions["touch-seed-source"] === undefined) return decisions;
  const { "touch-seed-source": _omitted, ...rest } = decisions;
  return rest;
}
