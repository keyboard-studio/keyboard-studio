/**
 * Barrel for Layer A' import-fidelity checks.
 *
 * Two entry-point functions partition the checks by pipeline stage:
 *
 *   runImportFidelityParseChecks  — runs immediately after parse(), before emit()
 *     I1: parse completeness
 *     I4: opaque feature inventory (informational)
 *
 *   runImportFidelityEmitChecks   — runs after emit(), with the emitted text in hand
 *     I2: round-trip stub (non-blocking)
 *     I3: header preservation
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
  checkRoundTrip,
  checkHeaderPreservation,
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
  ];
}

/**
 * Run Layer A' emit-stage checks (I2 stub + I3).
 * Call after emit(), passing the emitted .kmn text.
 *
 * Returns a Promise so that when the Keyman Core runtime lands and I2 becomes
 * truly async, callers require no further signature changes.
 */
export async function runImportFidelityEmitChecks(
  ir: KeyboardIR,
  emitted: string,
): Promise<LintFinding[]> {
  return [
    ...checkRoundTrip(ir),
    ...checkHeaderPreservation(ir, emitted),
  ];
}

// I5 is standalone — fires at output time.
export { checkSidecarHash } from "./layer-a-prime.js";
