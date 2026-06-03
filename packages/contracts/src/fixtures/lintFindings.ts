// see spec.md section 10 — LintFinding test fixtures (layers A / B / C)

import type { LintFinding } from "../lintFinding";

/**
 * Layer A (validity) findings — TS-portable checks.
 * Errors that block the WASM call and surface immediately per-keystroke.
 * See spec.md §10 Layer A; 9 TS-portable checks.
 */
export const layerAFindings: LintFinding[] = [
  {
    code: "KM_ERROR_DUPLICATE_STORE",
    severity: "error",
    layer: "A",
    message: "Duplicate store name 'dk_acute_bases' — store names must be unique.",
    location: { file: "source/my_keyboard.kmn", line: 12, column: 7 },
    hint: "Rename one of the two 'dk_acute_bases' store declarations.",
  },
  {
    code: "KM_WARN_DEPRECATED_STORE_ID",
    severity: "warning",
    layer: "A",
    message: "Store 'KMW_RTL' is deprecated; use '&RightToLeft' instead.",
    location: { file: "source/my_keyboard.kmn", line: 5, column: 1 },
    hint: "Replace 'KMW_RTL' with the canonical '&RightToLeft' system store.",
  },
  {
    // The supplementary finding the WASM oracle attaches when it cannot
    // load kmcmplib and is degrading to TS-only checks. Distinct from
    // KM_FATAL_MISSING_WASM_MODULE: the fatal blocks compile; this warn
    // surfaces alongside successful TS-only results so the user knows the
    // WASM-only checks (#10–#14) were skipped this cycle.
    code: "KM_WARN_ORACLE_UNAVAILABLE",
    severity: "warning",
    layer: "A",
    message:
      "WASM oracle unavailable — only TS-portable checks (#1–#9) ran. " +
      "Findings for the 5 WASM-only checks may be missing.",
    hint: "Reload the studio to retry; if the failure persists, file a bug.",
  },
];

/**
 * Layer B (style) findings — AST-based canonical-form checks.
 * Share the compile pass; do not block WASM but appear as warnings/hints.
 * See spec.md §10 Layer B.
 */
export const layerBFindings: LintFinding[] = [
  {
    code: "KM_HINT_CANONICAL_STORE_ORDER",
    severity: "hint",
    layer: "B",
    message:
      "Store declarations should appear before rule groups for canonical layout.",
    location: { file: "source/my_keyboard.kmn", line: 20 },
    hint: "Move all 'store(...)' declarations to the top of the file.",
  },
];

/**
 * Layer A + B combined — what ValidatorService returns.
 * Ordered errors first, then warnings, then hints (spec §10).
 */
export const validatorFindings: LintFinding[] = [
  ...layerAFindings,
  ...layerBFindings,
];

/**
 * Layer C (hygiene) findings — criteria.md compliance across the whole FS.
 * Runs on phase-exit and at submit; errors block phase progression.
 * See spec.md §10 Layer C, §11 band "layer-c-enforce".
 */
export const layerCFindings: LintFinding[] = [
  {
    code: "KM_LINT_MISSING_LICENSE",
    severity: "error",
    layer: "C",
    message: "LICENSE.md is missing from the keyboard folder.",
    location: { file: "LICENSE.md", line: 0 },
    hint: "Add a LICENSE.md file; the MIT license text is pre-populated by the scaffolder.",
  },
  {
    code: "KM_LINT_HISTORY_EMPTY",
    severity: "warning",
    layer: "C",
    message: "HISTORY.md contains no version entries.",
    location: { file: "HISTORY.md", line: 1 },
    hint: "Add at least one version entry describing the initial release.",
  },
  {
    code: "KM_LINT_WELCOME_PLACEHOLDER",
    severity: "info",
    layer: "C",
    message: "welcome.htm still contains unreplaced template placeholders.",
    location: { file: "welcome.htm", line: 7, column: 4 },
    hint: "Fill in the keyboard display name and description in welcome.htm.",
  },
];

/**
 * Fatal-severity findings — the load-failure / unrecoverable class.
 * Upstream Keyman models these as `FATAL_*` events (BadCallParams,
 * MissingWasmModule, UnexpectedException). They block compilation
 * entirely; consumers testing "fatal blocks WASM" behavior need a
 * fixture (#91). Layer A because the WASM oracle is where these
 * surface to the studio.
 */
export const fatalFindings: LintFinding[] = [
  {
    code: "KM_FATAL_MISSING_WASM_MODULE",
    severity: "fatal",
    layer: "A",
    message: "kmcmplib WASM module failed to load or instantiate.",
    hint: "Reload the studio; if the failure persists, file a bug.",
  },
];
