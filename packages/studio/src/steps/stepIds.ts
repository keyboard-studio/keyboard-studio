// stepIds — the step-id constants for steps that carry completion
// side effects (keyed constants — never inline strings).
//
// A leaf module (imports nothing) on purpose: the galleries read
// these ids, and since spec 090 the gallery decision modules' renderers
// import the galleries — a gallery → steps/reducer.ts import closes a
// cycle (reducer.ts imports the question registry, which imports the
// modules), which left a module undefined at registry construction
// (found at T042; the constants lived in reducer.ts until then).
// reducer.ts re-exports these so existing imports keep working.

/** Step id for the Mechanisms (physical assignment) step. (Its R1 completion
 * effects re-homed to lib/assignLoopCompletion.ts at spec 090 T041.) */
export const MECHANISMS_STEP_ID = "mechanisms" as const;

/** Step id for the Touch (Phase E) step. (Its R2 completion effects re-homed
 * to lib/assignLoopCompletion.ts at spec 090 T042; the TouchCompleteResult
 * payload type moved with them.) */
export const TOUCH_STEP_ID = "touch" as const;

/** Step id for the choose-base step — fires the copy/adapt instantiation on complete. */
export const CHOOSE_BASE_STEP_ID = "choose_base" as const;
