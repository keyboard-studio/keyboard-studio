/**
 * Barrel for Layer A' import-fidelity checks.
 *
 * Two entry-point functions partition the checks by pipeline stage:
 *
 *   runImportFidelityParseChecks  — runs immediately after parse(), before emit()
 *     I1: parse completeness
 *     I4: opaque feature inventory (informational)
 *     0x05A: touch-layout key-id validity (spec 063 FR-040) — an imported
 *            keyboard's existing ids. Author-typed ids are handled by edit-time
 *            rejection instead, with no finding at all. Deliberately NOT a Layer C
 *            check: see checkTouchLayoutIdentifiers' header.
 *
 *   runImportFidelityEmitChecks   — runs after emit(), with the emitted text in hand
 *     I2: functional round-trip via simulate() (#882; blocking on compared
 *         divergence, honest no-coverage/unavailable states otherwise)
 *     I3: header preservation
 *     I6: ownership consistency (Pattern↔node back-reference)
 *
 * I5 (sidecar hash) fires at output time and is re-exported standalone so
 * callers can invoke it independently.
 *
 * IMPORTANT: this barrel must NOT be imported by
 * packages/engine/src/validator/index.ts (the runAllChecks path). Layer A'
 * checks live outside the 300 ms debounce cycle.
 */

import type { LintFinding, KeyboardIR } from "@keyboard-studio/contracts";
import type { ParseResult } from "../codec/parse.js";
import {
  checkParseCompleteness,
  checkOpaqueFeatureInventory,
  checkTouchLayoutIdentifiers,
  checkRoundTrip,
  checkHeaderPreservation,
  checkOwnershipConsistency,
  checkBehaviourNulOnTextContext,
} from "./layer-a-prime.js";
import type { RoundTripDeps } from "./layer-a-prime.js";

export type { RoundTripDeps, RoundTripSourceFile } from "./layer-a-prime.js";
export {
  ROUND_TRIP_DIVERGENCE_CODE,
  ROUND_TRIP_NO_COVERAGE_CODE,
  ROUND_TRIP_UNAVAILABLE_CODE,
  ROUND_TRIP_CORPUS_TRUNCATED_CODE,
} from "./layer-a-prime.js";

/**
 * Run Layer A' parse-stage checks (I1 + I4).
 * Call immediately after parse(), before emit().
 */
export function runImportFidelityParseChecks(
  parseResult: ParseResult,
  source: string,
): LintFinding[] {
  return [
    ...checkParseCompleteness(parseResult, source),
    ...checkOpaqueFeatureInventory(parseResult),
    ...checkTouchLayoutIdentifiers(parseResult),
  ];
}

/**
 * Run the synchronous Layer A' emit-stage checks (I3 + I6 + the NUL-behaviour
 * check) — everything except I2. Cheap and deterministic: safe on a
 * latency-critical path (the studio's pre-`ready` preview pipeline runs this
 * half before publishing the preview).
 * Call after emit(), passing the emitted .kmn text.
 */
export function runImportFidelityEmitChecksSync(
  ir: KeyboardIR,
  emitted: string,
): LintFinding[] {
  return [
    ...checkHeaderPreservation(ir, emitted),
    ...checkOwnershipConsistency(ir),
    ...checkBehaviourNulOnTextContext(ir),
  ];
}

/**
 * Run I2 (functional round-trip via simulate(), #882) on its own.
 *
 * I2 compiles the original and emitted .kmn and simulates the generated
 * corpus through the KeymanWeb runtime — seconds to minutes on a real base
 * keyboard. It must NEVER sit on a path a user is waiting on: the studio
 * live path runs it after the preview stage reaches `ready` and delivers
 * the findings when they land (the spec-078 publish-after-ready posture).
 * Batch hosts (importKeyboard) can simply await the composed
 * {@link runImportFidelityEmitChecks} instead.
 *
 * `roundTripDeps` supplies the compile/simulate harness (see
 * {@link RoundTripDeps}). When omitted, I2 reports its unavailable state
 * (a non-blocking hint) rather than silently passing — hosts that can
 * compile and simulate (the studio live path, Node hosts) should pass it.
 */
export async function runImportFidelityRoundTripCheck(
  ir: KeyboardIR,
  roundTripDeps?: RoundTripDeps,
): Promise<LintFinding[]> {
  return checkRoundTrip(ir, roundTripDeps);
}

/**
 * Run Layer A' emit-stage checks (I2 functional round-trip + I3 + I6).
 * Call after emit(), passing the emitted .kmn text.
 *
 * `roundTripDeps` supplies I2's compile/simulate harness (see
 * {@link RoundTripDeps}). When omitted, I2 reports its unavailable state
 * (a non-blocking hint) rather than silently passing — hosts that can
 * compile and simulate (the studio live path, Node hosts) should pass it.
 */
export async function runImportFidelityEmitChecks(
  ir: KeyboardIR,
  emitted: string,
  roundTripDeps?: RoundTripDeps,
): Promise<LintFinding[]> {
  return [
    ...(await runImportFidelityRoundTripCheck(ir, roundTripDeps)),
    ...runImportFidelityEmitChecksSync(ir, emitted),
  ];
}

// I5 is standalone — fires at output time.
export { checkSidecarHash } from "./layer-a-prime.js";
// Re-exported standalone so the studio can surface 0x05A on an imported layout
// without running the whole parse-stage suite, and so its code is importable for
// the routing test.
export {
  checkTouchLayoutIdentifiers,
  TOUCH_LAYOUT_INVALID_IDENTIFIER_CODE,
} from "./layer-a-prime.js";
