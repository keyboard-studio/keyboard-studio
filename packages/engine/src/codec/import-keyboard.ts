/**
 * importKeyboard orchestrator and ImportReport assembler.
 *
 * Pipeline (in order):
 *   1. parse(kmnText, keyboardId)           → ParseResult
 *   2. recognizePatterns(ir)                → RecognizeResult (recognizedRatio)
 *   2b. classifyRemovalCapabilities(ir)     → removal-capability entries
 *   2c. detectMarkInputOrderFromImport(ir)  → AxisFill (A3a=postfix, spec §7.2 rule 3a)
 *   3. addSidecar(vfs, kmnText, keyboardId) → VFS mutation (original .kmn preserved)
 *   4. computeSha256Hex(kmnText)            → SHA-256 stored at source/<id>.kmn.imported.sha256
 *   5. emit(ir)                             → emitted .kmn text
 *   6. runImportFidelityParseChecks(...)    → I1 + I4 findings
 *   7. runImportFidelityEmitChecks(...)     → I2 functional round-trip + I3 + I6 findings
 *   8. buildImportReport(...)              → ImportReport
 */

import type {
  AxisFill,
  VirtualFS,
  ImportReport,
  ImportStatus,
  RemovalCapability,
} from "@keyboard-studio/contracts";
import { ImportStatus as IS } from "@keyboard-studio/contracts";
import { parse } from "./parse.js";
import { emit } from "./emit.js";
import { addSidecar, SIDECAR_HASH_SUFFIX } from "../output/sidecar.js";
import { computeSha256Hex } from "./hash.js";
import { recognizePatterns, classifyRemovalCapabilities } from "../recognizer/index.js";
import { detectMarkInputOrderFromImport } from "../strategy-selector/import-mark-order.js";
import {
  runImportFidelityParseChecks,
  runImportFidelityEmitChecks,
  ROUND_TRIP_DIVERGENCE_CODE,
} from "../validator/index-import-fidelity.js";
import type { RoundTripDeps } from "../validator/index-import-fidelity.js";

// ---------------------------------------------------------------------------
// buildImportReport (pure function)
// ---------------------------------------------------------------------------

export interface BuildImportReportParams {
  keyboardId: string;
  parseError: string | null;
  opaqueFeatures: Array<{ feature: string; count: number }>;
  recognizedRatio: number;
  /** True if I2 produced a RoundTripDivergence (functional I2, #882). */
  hasRoundTripDivergence: boolean;
  /** Entry-array from classifyRemovalCapabilities(); absent on parse failure. */
  removalCapabilities?: Array<[string, RemovalCapability]>;
}

/**
 * Pure function — assembles the ImportReport from gathered signals.
 *
 * Status priority (high → low):
 *   ParseFailure        — parse threw; no usable IR
 *   RoundTripDivergence — I2 functional divergence (#882)
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
    removalCapabilities,
  } = params;

  let status: ImportStatus;
  const parseErrors: string[] = parseError ? [parseError] : [];

  if (parseError) {
    status = IS.ParseFailure;
  } else if (hasRoundTripDivergence) {
    status = IS.RoundTripDivergence;
  } else if (opaqueFeatures.length > 0) {
    status = IS.CleanWithOpaque;
  } else {
    status = IS.Clean;
  }

  const report: ImportReport = {
    keyboardId,
    status,
    parseErrors,
    opaqueFeatureInventory: opaqueFeatures,
    recognizedRatio,
  };

  if (removalCapabilities !== undefined) {
    report.removalCapabilities = removalCapabilities;
  }

  return report;
}

// ---------------------------------------------------------------------------
// importKeyboard orchestrator
// ---------------------------------------------------------------------------

export interface ImportKeyboardResult {
  report: ImportReport;
  /** All Layer A' findings from I1–I4 (I5 fires separately at output time). */
  findings: Array<import("@keyboard-studio/contracts").LintFinding>;
  /**
   * Axis-fill provenance derived from structural evidence in the imported IR
   * (spec §7.2), e.g. `markInputOrder="postfix"` when the base already uses
   * letter-then-mark sequence-replace rules. Empty when no such evidence is
   * found — callers must not assume a fill happened. Distinct from the
   * script-class default-fill prior's "script-class-prior" source tag.
   */
  axisFills: AxisFill[];
}

/**
 * Orchestrate the full keyboard import pipeline.
 *
 * @param kmnText    Raw .kmn source text.
 * @param keyboardId Keyboard identifier (typically the filename stem).
 * @param vfs        VirtualFS to write sidecar and hash into.
 * @param roundTripDeps  Optional I2 harness (compile + simulate). The
 *   original/emitted texts and keyboardId are filled in from this call's
 *   own values; `sourceFiles` defaults to the vfs `source/` entries (the
 *   imported keyboard's siblings) when the caller does not supply them.
 *   Without deps, I2 reports its unavailable state instead of passing.
 */
export async function importKeyboard(
  kmnText: string,
  keyboardId: string,
  vfs: VirtualFS,
  roundTripDeps?: Pick<RoundTripDeps, "compileFn" | "simulateFn"> &
    Partial<Pick<RoundTripDeps, "sourceFiles">>,
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
      axisFills: [],
    };
  }

  const { ir, opaqueFeatures } = parseResult;

  // --- Step 2: Recognize patterns ---
  const { recognizedRatio } = recognizePatterns(ir);

  // --- Step 2b: Classify removal capabilities ---
  const removalCapabilities = [...classifyRemovalCapabilities(ir).entries()];

  // --- Step 2c: Base-derived axis-fill detection (spec §7.2 rule 3a) ---
  const importMarkOrderFill = detectMarkInputOrderFromImport(ir);
  const axisFills: AxisFill[] = importMarkOrderFill !== undefined ? [importMarkOrderFill] : [];

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
  const fullRoundTripDeps: RoundTripDeps | undefined =
    roundTripDeps === undefined
      ? undefined
      : {
          originalKmn: kmnText,
          emittedKmn: emitted,
          keyboardId,
          compileFn: roundTripDeps.compileFn,
          simulateFn: roundTripDeps.simulateFn,
          sourceFiles:
            roundTripDeps.sourceFiles ??
            vfs
              .entries("source/")
              .map((e) => ({ path: e.path, content: e.content, isBinary: e.isBinary })),
        };
  const emitFindings = await runImportFidelityEmitChecks(ir, emitted, fullRoundTripDeps);
  const allFindings = [...parseFindings, ...emitFindings];

  // --- Step 8: Build report ---
  // I2 sets divergence via its aggregate error finding (#882).
  const hasRoundTripDivergence = emitFindings.some(
    (f) => f.code === ROUND_TRIP_DIVERGENCE_CODE,
  );

  const report = buildImportReport({
    keyboardId,
    parseError: null,
    opaqueFeatures,
    recognizedRatio,
    hasRoundTripDivergence,
    removalCapabilities,
  });

  return { report, findings: allFindings, axisFills };
}
