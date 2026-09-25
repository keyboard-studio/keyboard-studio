// convenienceFlags — why the convenience step NEVER has a `reproposed`
// answer to flag (spec 079 US3 T079/T080).
//
// `ConvenienceCharsStep.tsx` DOES save one boolean answer per candidate into
// `surveyAnswerStore`, keyed by `steps/evidence.ts`'s `offeredKey(primary,
// offeredPrimaries)` — but that key is either `offered|<primary>` (the
// candidate is in the CURRENT surplus set) or `null` (it is not). The
// component's `unchecked` derivation reads a saved answer's `.value`
// directly, for every candidate CURRENTLY in `candidates`, without ever
// comparing its stored `evidenceKey` to a "current" one. A candidate that
// stops being surplus simply disappears from `candidates` and is never
// rendered again — its saved answer becomes inert, not `reproposed` — and a
// candidate that reappears (or is newly surplus) has no saved answer at all
// the first time it is offered under a `offered|<primary>` key, so it reads
// as `proposed` (checked by default), never as a stale confirmation. There is
// structurally no THIRD state ("saved under a still-offered but now-stale
// key") for `reconcile()` to ever classify as `reproposed`, matching
// `steps/evidence.ts`'s own `offeredKey` doc: "either equal or null".
//
// This module exists so `hooks/useWorkToDo.ts` has one documented, testable
// place to point at instead of silently omitting convenience — and so a
// future change to this step's key design that DID introduce a real
// per-answer evidence mismatch would have an obvious function to fill in.

/** Always empty: see the module header for why. Typed to match the shape
 * `hooks/useWorkToDo.ts`'s other `deriveXFlags()` functions return, so a
 * future real implementation is a drop-in replacement. */
export function deriveConvenienceFlags(): readonly never[] {
  return [];
}
