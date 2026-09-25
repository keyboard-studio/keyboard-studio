// convenienceGate — the pure tri-state gate for the Convenience letters step
// (spec 079 R-09, FR-064…FR-068).
//
// Pure and React-free by design: `computeConvenienceGate` takes plain sets
// and booleans, never a store, so it is importable from BOTH the component
// (ConvenienceCharsStep.tsx, which gathers its inputs from the working-copy
// store and useCarveNeededSet) and `steps/workToDo.ts`'s `selectWorkToDo()`
// (steps/ may depend on survey/ per the `steps-layer` depcruise rule, but
// never on stores/ directly) — the ONE place both a live render and a
// work-to-do check ("is a `not-asked` Convenience letters step now
// applicable?", FR-067) evaluate the same gate.
//
// Three outcomes, never a boolean skip (#1796):
//   - `applies`: there is something to ask. Unchanged from the pre-079 case.
//   - `not-applicable{reason}`: the signal is KNOWN and there is genuinely
//     nothing to offer. Passes without asking (FR-065).
//   - `unknown{reason}`: the signal is NOT yet known. FR-064 forbids reading
//     this as "does not apply" — the step must render and explain the gap,
//     never skip.
//
// No working copy instantiated resolves to `not-applicable`, not `unknown`:
// with no base and no produced set at all, "is there a surplus letter?" has
// a definite answer (no), unlike the missing-orthography-signal case, where
// the question is unanswerable rather than answered "no". Carve does not
// care which reason fired — R-09: an absent `retainedConvenienceChars` and a
// `not-asked` status both read as "no retention decision" either way.

import type { ConvenienceCandidate } from "@keyboard-studio/engine";
import { surplusBasicLatinCandidates } from "@keyboard-studio/engine";
import type { NotAskedReason } from "../../steps/answerTypes.ts";

export type ConvenienceGateResult =
  | { kind: "applies"; candidates: ConvenienceCandidate[] }
  | { kind: "not-applicable"; reason: NotAskedReason }
  | { kind: "unknown"; reason: NotAskedReason };

/** Machine-readable reason codes (data-model.md's `NotAskedReason.code`). */
export const CONVENIENCE_REASON_NOT_INSTANTIATED: NotAskedReason = {
  code: "convenience-not-instantiated",
};
export const CONVENIENCE_REASON_NO_SURPLUS: NotAskedReason = { code: "convenience-no-surplus" };
export const CONVENIENCE_REASON_SIGNAL_UNKNOWN: NotAskedReason = { code: "convenience-signal-unknown" };

/**
 * Compute the gate. Every input is plain data — no store read, no hook.
 */
export function computeConvenienceGate(args: {
  produced: ReadonlySet<string>;
  needed: ReadonlySet<string>;
  hasSignal: boolean;
  /** False when no working copy has been instantiated. */
  instantiated: boolean;
}): ConvenienceGateResult {
  if (!args.instantiated) {
    return { kind: "not-applicable", reason: CONVENIENCE_REASON_NOT_INSTANTIATED };
  }
  // FR-064: missing/unknown orthography signal is never "does not apply" —
  // every basic-Latin letter would look surplus with no confirmed needed set
  // to compare against, so the gate must stay open rather than guess "no".
  if (!args.hasSignal) {
    return { kind: "unknown", reason: CONVENIENCE_REASON_SIGNAL_UNKNOWN };
  }
  const candidates = surplusBasicLatinCandidates({ produced: args.produced, needed: args.needed });
  if (candidates.length === 0) {
    return { kind: "not-applicable", reason: CONVENIENCE_REASON_NO_SURPLUS };
  }
  return { kind: "applies", candidates };
}
