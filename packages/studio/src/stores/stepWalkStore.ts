// stepWalkStore — where the author is INSIDE a step, and what stops that step
// has (see lib/stepWalk.ts's header for the model and why it is not a second
// notion of position).
//
// Why a store rather than component state: a step's component unmounts on every
// tab switch (StudioShell renders one route at a time), so a position kept in
// `useState` is lost exactly when the author leaves and comes back — the
// reported defect. `activeStepId` already lives in `surveySessionStore` for the
// same reason; this is the next level down.
//
// Why a SEPARATE store from surveySessionStore: `walks` is derived, per-mount,
// potentially large (a whole character inventory) and meaningless to persist —
// whereas every slot in `surveySessionStore` is part of `TraversalSnapshot` and
// gets serialized into the durable draft by construction (its `Omit`-based
// `SurveySessionData` type makes a new field a compile error until it is added
// to `snapshotTraversal`). Putting a rebuilt-on-mount index in there would
// bloat every draft write for no benefit. The CURSOR is small and durable in
// principle; it lives here beside the walk it indexes so there is one module to
// read when a position does not come back, and is re-derived from the walk on
// the next mount if it is ever lost.
//
// SINGLE WRITER PER STEP. `publishStepWalk` is called only by the component
// that owns that step's walk (SurveyRunner for a flow, MechanismGallery /
// TouchGallery for a character walk). `setStepCursor` has two callers by
// design: that same component (the author moved within the step) and
// `lib/jumpToLocation.ts` (the author asked to land on a specific stop). The
// second is why the cursor is not folded into `publishStepWalk`: a jump writes
// it BEFORE the target component exists, and that component reads it as its
// arrival position.

import { create } from "zustand";
import type { StepCursorMap, StepWalkMap, StepWalkPositions } from "../lib/stepWalk.ts";

// ---------------------------------------------------------------------------
// Equality guard
//
// `publishStepWalk` is called from an effect whose input is a freshly derived
// array on every render (a `.map` over an inventory). Writing unconditionally
// would notify every subscriber each render — including the footer, whose own
// re-render is harmless but whose `useMemo` over the walks would churn — and,
// worse, would re-enter the publishing effect if its deps include anything
// derived from the store. Comparing field-by-field makes a no-change publish a
// genuine no-op, so the effect is safe to run on every render.
// ---------------------------------------------------------------------------

function samePositions(a: StepWalkPositions | undefined, b: StepWalkPositions): boolean {
  if (a === undefined) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (x.id !== y.id || x.label !== y.label || x.done !== y.done) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Answers a step's flow has collected but not yet COMMITTED, keyed by question
 * id. See `StepWalkState.answerDrafts` for why this exists and why it is not a
 * second source of truth for recorded answers.
 */
export type AnswerDraft = Readonly<Record<string, string | string[]>>;

export interface StepWalkState {
  /** Every published walk, keyed by manifest step id. */
  walks: StepWalkMap;
  /** Where the author is inside each step, keyed by manifest step id. */
  cursors: StepCursorMap;
  /**
   * In-progress answers per step, keyed by manifest step id.
   *
   * WHY THIS IS NOT A SECOND ANSWER STORE. A survey answer is recorded into the
   * decision record at STEP COMPLETION and nowhere earlier — spec 053's capture
   * boundary, deliberately untouched here. Until then the answers live in
   * SurveyRunner's `useState` answer stack, which is destroyed by the very thing
   * this store exists for: a tab switch unmounts the step. So an author who
   * answered four of five identity questions, looked at Compare, and came back
   * found question one and an empty form — the position was not the only thing
   * lost, the answers were too, and restoring a cursor into a walk that no longer
   * has those answers would land them on question one anyway.
   *
   * This is that stack's home outside the component: the WORKING BUFFER for the
   * step in progress, not a record of decisions. The record stays the single
   * source of truth for what was decided; this is the single source of truth for
   * what has been typed but not yet submitted, and it is replayed through the
   * SAME `buildResumeStack` path a completed run already uses rather than a
   * second restoration mechanism.
   */
  answerDrafts: Readonly<Record<string, AnswerDraft>>;

  /**
   * Replace `stepId`'s stops. A no-op when the positions are field-for-field
   * identical to what is already stored, so callers may invoke it from an
   * effect that runs on every render.
   */
  publishStepWalk: (stepId: string, positions: StepWalkPositions) => void;

  /**
   * Record the author's position inside `stepId`. A no-op when unchanged (same
   * reason as above — the publishing component calls this from an effect).
   */
  setStepCursor: (stepId: string, positionId: string) => void;

  /**
   * Record the answers `stepId`'s flow has collected so far. A no-op when
   * value-for-value identical to what is stored (same reason as above).
   */
  setAnswerDraft: (stepId: string, answers: AnswerDraft) => void;

  /**
   * Forget `stepId`'s stops. Called when a step's walk genuinely ceases to
   * exist rather than merely unmounting — the cursor is DELIBERATELY kept, so
   * an unmount-then-remount (the tab switch this store exists for) still knows
   * where to land.
   */
  clearStepWalk: (stepId: string) => void;

  /** Drop every walk and cursor — start-over, and base re-instantiation. */
  reset: () => void;
}

/** Value-equality for an answer draft — same rationale as `samePositions`. */
function sameAnswerDraft(a: AnswerDraft | undefined, b: AnswerDraft): boolean {
  if (a === undefined) return false;
  if (a === b) return true;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  for (const key of aKeys) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((v, i) => v !== y[i])) return false;
      continue;
    }
    return false;
  }
  return true;
}

const INITIAL: Pick<StepWalkState, "walks" | "cursors" | "answerDrafts"> = {
  walks: {},
  cursors: {},
  answerDrafts: {},
};

export const useStepWalkStore = create<StepWalkState>((set) => ({
  ...INITIAL,

  publishStepWalk: (stepId, positions) =>
    set((s) => {
      if (samePositions(s.walks[stepId], positions)) return s;
      return { walks: { ...s.walks, [stepId]: positions } };
    }),

  setStepCursor: (stepId, positionId) =>
    set((s) => {
      if (s.cursors[stepId] === positionId) return s;
      return { cursors: { ...s.cursors, [stepId]: positionId } };
    }),

  setAnswerDraft: (stepId, answers) =>
    set((s) => {
      if (sameAnswerDraft(s.answerDrafts[stepId], answers)) return s;
      return { answerDrafts: { ...s.answerDrafts, [stepId]: answers } };
    }),

  clearStepWalk: (stepId) =>
    set((s) => {
      if (s.walks[stepId] === undefined) return s;
      const walks = { ...s.walks };
      delete walks[stepId];
      return { walks };
    }),

  reset: () => set({ walks: {}, cursors: {}, answerDrafts: {} }),
}));

/**
 * The cursor for `stepId` right now, without subscribing. For a component
 * initialising its arrival position in a `useState` initializer or a sync
 * effect, where a subscription would be the wrong shape.
 */
export function peekStepCursor(stepId: string): string | undefined {
  return useStepWalkStore.getState().cursors[stepId];
}

/**
 * `stepId`'s in-progress answers right now, without subscribing. Read by
 * SurveyRunner's state initializer, which needs them before its first render —
 * an effect would be a render too late and would have to overwrite the fresh
 * question-one stack it had already built.
 */
export function peekAnswerDraft(stepId: string): AnswerDraft | undefined {
  return useStepWalkStore.getState().answerDrafts[stepId];
}
