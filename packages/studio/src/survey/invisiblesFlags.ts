// invisiblesFlags — why the invisibles step NEVER has a `reproposed` answer
// to flag (spec 079 US3 T079/T080).
//
// `InvisiblesStep.tsx` does not use `surveyAnswerStore` at all: each
// candidate's yes/no decision lives directly in `phaseBDraftStore`'s sticky
// `invisibleDecisions` map (keyed `U+XXXX`), written immediately on toggle —
// there is no draft/confirm split and no per-answer `evidenceKey` to
// reconcile against a "current" one (`steps/evidence.ts`'s `invisiblesKey` is
// declared but not consulted by this step's render path).
//
// More fundamentally, the CANDIDATE SET a shape change could affect is
// self-healing by construction: `invisibleCandidatesFor({ direction,
// carriedOver })` always includes every character the author has EVER
// decided about (`carriedOver`, derived from `invisibleDecisions`'s own
// keys), on top of whatever the current writing direction proposes. So a
// candidate the author already accepted or declined can never silently drop
// off the list — there is no "no longer offered" transition for a decided
// candidate, only "newly offered" (a fresh candidate defaulting to
// unchecked, exactly like a first visit) alongside every earlier decision
// rendered unchanged. That is `current`/`proposed`, never `reproposed`.
//
// This module exists so `hooks/useWorkToDo.ts` has one documented, testable
// place to point at instead of silently omitting invisibles — and so a
// future change to InvisiblesStep that DID introduce a real per-answer
// evidence key would have an obvious function to fill in, rather than a
// TODO comment nobody notices.

/** Always empty: see the module header for why. Typed to match the shape
 * `hooks/useWorkToDo.ts`'s other `deriveXFlags()` functions return, so a
 * future real implementation is a drop-in replacement. */
export function deriveInvisiblesFlags(): readonly never[] {
  return [];
}
