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
// gets serialized into the durable draft by construction. Everything this store
// holds is rebuilt on the next mount, so it is never persisted.
//
// The CURSOR and the in-progress ANSWERS used to live here too. They are durable
// state — losing them on reload was a defect — so they moved to
// stores/surveyAnswerStore.ts (spec 079 R-01), which the draft envelope carries.
// `peekStepCursor` / `peekAnswerDraft` below are thin readers over that store,
// kept so their callers did not change shape.
//
// SINGLE WRITER PER STEP. `publishStepWalk` is called only by the component
// that owns that step's walk (SurveyRunner for a flow, MechanismGallery /
// TouchGallery for a character walk).

import { create } from "zustand";
import type { StepWalkMap, StepWalkPositions } from "../lib/stepWalk.ts";
import { useSurveyAnswerStore } from "./surveyAnswerStore.ts";

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
 * Answers a step's flow has collected but not yet recorded, keyed by question
 * id — a projection of that step's saved answers (stores/surveyAnswerStore.ts).
 */
export type AnswerDraft = Readonly<Record<string, string | string[]>>;

export interface StepWalkState {
  /** Every published walk, keyed by manifest step id. */
  walks: StepWalkMap;

  /**
   * Replace `stepId`'s stops. A no-op when the positions are field-for-field
   * identical to what is already stored, so callers may invoke it from an
   * effect that runs on every render.
   */
  publishStepWalk: (stepId: string, positions: StepWalkPositions) => void;

  /**
   * Forget `stepId`'s stops. Called when a step's walk genuinely ceases to
   * exist rather than merely unmounting.
   */
  clearStepWalk: (stepId: string) => void;

  /** Drop every walk — start-over, and new project. */
  reset: () => void;
}

export const useStepWalkStore = create<StepWalkState>((set) => ({
  walks: {},

  publishStepWalk: (stepId, positions) =>
    set((s) => {
      if (samePositions(s.walks[stepId], positions)) return s;
      return { walks: { ...s.walks, [stepId]: positions } };
    }),

  clearStepWalk: (stepId) =>
    set((s) => {
      if (s.walks[stepId] === undefined) return s;
      const walks = { ...s.walks };
      delete walks[stepId];
      return { walks };
    }),

  reset: () => set({ walks: {} }),
}));

/**
 * The author's position inside `stepId` right now, without subscribing. For a
 * component initialising its arrival position in a `useState` initializer or a
 * sync effect, where a subscription would be the wrong shape.
 */
export function peekStepCursor(stepId: string): string | undefined {
  return useSurveyAnswerStore.getState().steps[stepId]?.position ?? undefined;
}

/**
 * `stepId`'s saved answers right now, as question id -> value, without
 * subscribing. Read by SurveyRunner's state initializer, which needs them before
 * its first render. Boolean-valued answers (which no SurveyRunner question
 * produces) are left out, keeping the historical return shape.
 */
export function peekAnswerDraft(stepId: string): AnswerDraft | undefined {
  const answers = useSurveyAnswerStore.getState().steps[stepId]?.answers;
  if (answers === undefined) return undefined;
  const out: Record<string, string | string[]> = {};
  for (const [id, a] of Object.entries(answers)) {
    if (typeof a.value === "string" || Array.isArray(a.value)) out[id] = a.value;
  }
  return Object.keys(out).length === 0 ? undefined : out;
}
