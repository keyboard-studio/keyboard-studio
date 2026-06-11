/**
 * importKeyboard orchestrator and ImportReport assembler.
 *
 * Pipeline (in order):
 *   1. parse(kmnText, keyboardId)           → ParseResult
 *   2. recognizePatterns(ir)                → RecognizeResult (recognizedRatio)
 *   3. addSidecar(vfs, kmnText, keyboardId) → VFS mutation (original .kmn preserved)
 *   4. computeSha256Hex(kmnText)            → SHA-256 stored at source/<id>.kmn.imported.sha256
 *   5. emit(ir)                             → emitted .kmn text
 *   6. runImportFidelityParseChecks(...)    → I1 + I4 findings
 *   7. runImportFidelityEmitChecks(...)     → I2 stub + I3 findings
 *   8. buildImportReport(...)              → ImportReport
 */

import type { VirtualFS, ImportReport, ImportStatus } from "@keyboard-studio/contracts";
import { ImportStatus as IS } from "@keyboard-studio/contracts";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { addSidecar, SIDECAR_HASH_SUFFIX } from "../output/sidecar.js";
import { computeSha256Hex } from "./hash.js";
import { recognizePatterns } from "../recognizer/index.js";
import {
  runImportFidelityParseChecks,
  runImportFidelityEmitChecks,
} from "../validator/index-import-fidelity.js";

// ---------------------------------------------------------------------------
// buildImportReport (pure function)
// ---------------------------------------------------------------------------

export interface BuildImportReportParams {
  keyboardId: string;
  parseError: string | null;
  opaqueFeatures: Array<{ feature: string; count: number }>;
  recognizedRatio: number;
  /** True if I2 produced a RoundTripDivergence (not reachable while I2 is a stub). */
  hasRoundTripDivergence: boolean;
}

/**
 * Pure function — assembles the ImportReport from gathered signals.
 *
 * Status priority (high → low):
 *   ParseFailure        — parse threw; no usable IR
 *   RoundTripDivergence — I2 divergence (not reachable while I2 is stub)
 *   CleanWithOpaque     — parse ok; some RawKmnFragment nodes present
 *   Clean               — parse ok; no opaque fragments
 */
export function buildImportReport(params: BuildImportReportParams): ImportReport {
  const {
    keyboardId,
    parseError,
    opaqueFeatures,
    recognizedRatio,
    hasRoundTripDivergence,
  } = params;

  let status: ImportStatus;
  const parseErrors: string[] = parseError ? [parseError] : [];

  if (parseError) {
    status = IS.ParseFailure;
  } else if (hasRoundTripDivergence) {
    // Not reachable while I2 is a stub, but wired for the future.
    status = IS.RoundTripDivergence;
  } else if (opaqueFeatures.length > 0) {
    status = IS.CleanWithOpaque;
  } else {
    status = IS.Clean;
  }

  return {
    keyboardId,
    status,
    parseErrors,
    opaqueFeatureInventory: opaqueFeatures,
    recognizedRatio,
  };
}

// ---------------------------------------------------------------------------
// importKeyboard orchestrator
// ---------------------------------------------------------------------------

export interface ImportKeyboardResult {
  report: ImportReport;
  /** All Layer A' findings from I1–I4 (I5 fires separately at output time). */
  findings: Array<import("@keyboard-studio/contracts").LintFinding>;
}

/**
 * Orchestrate the full keyboard import pipeline.
 *
 * @param kmnText    Raw .kmn source text.
 * @param keyboardId Keyboard identifier (typically the filename stem).
 * @param vfs        VirtualFS to write sidecar and hash into.
 */
export async function importKeyboard(
  kmnText: string,
  keyboardId: string,
  vfs: VirtualFS,
): Promise<ImportKeyboardResult> {
  // --- Step 1: Parse ---
  let parseResult;
  let parseError: string | null = null;
  try {
    parseResult = parse(kmnText, keyboardId);
  } catch (err) {
    parseError = err instanceof Error ? err.message : String(err);
    const report = buildImportReport({
      keyboardId,
      parseError,
      opaqueFeatures: [],
      recognizedRatio: 0,
      hasRoundTripDivergence: false,
    });
    return {
      report,
      findings: [
        {
          code: "KM_ERROR_PARSE_INCOMPLETE",
          severity: "error",
          layer: "A-prime",
          message: parseError,
        },
      ],
    };
  }

  const { ir, opaqueFeatures } = parseResult;

  // --- Step 2: Recognize patterns ---
  const { recognizedRatio } = recognizePatterns(ir);

  // --- Step 3: Add sidecar (.kmn.imported) ---
  addSidecar(vfs, kmnText, keyboardId);

  // --- Step 4: Compute + store SHA-256 of original .kmn text ---
  const sha256 = await computeSha256Hex(kmnText);
  const hashPath = `source/${keyboardId}${SIDECAR_HASH_SUFFIX}`;
  vfs.set(hashPath, sha256, false);

  // --- Step 5: Emit ---
  const emitted = emit(ir);

  // --- Steps 6 + 7: Layer A' checks ---
  const parseFindings = runImportFidelityParseChecks(parseResult, kmnText);
  const emitFindings = await runImportFidelityEmitChecks(ir, emitted);
  const allFindings = [...parseFindings, ...emitFindings];

  // --- Step 8: Build report ---
  // I2 is a stub and never sets divergence; wire the branch for the future.
  const hasRoundTripDivergence = false;

  const report = buildImportReport({
    keyboardId,
    parseError: null,
    opaqueFeatures,
    recognizedRatio,
    hasRoundTripDivergence,
  });

  return { report, findings: allFindings };
}
