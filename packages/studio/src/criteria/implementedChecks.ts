// Implemented layer-c lint checks (spec 084).
//
// The set of lint codes the resolver treats as actually enforced. It is
// derived by scanning packages/keyboard-lint/src/checks for the codes
// emitted as a finding's `code:` literal — the same source-scan method as
// decisions/gateCoverage.test.ts's registeredLintCodes() — and keeping
// exactly the scanned codes that are also a catalog criterion's
// lintRuleId. criteriaCatalog.test.ts re-runs that scan and fails when
// this set drifts from it.
//
// Warning: adding a lint check means adding its code here in the same
// change. Until a code is listed here, its criterion honestly resolves
// Not yet checkable rather than claiming a pass no check produced.

/** Lint codes with a real check behind them, mapped to catalog criteria. */
export const IMPLEMENTED_LINT_CODES: ReadonlySet<string> = new Set([
  "KM_LINT_HISTORY_ORDER",
  "KM_LINT_HISTORY_TRUNCATED",
  "KM_LINT_HISTORY_ENTRY_FORMAT",
  "KM_LINT_HISTORY_VERSION_MISMATCH",
  "KM_LINT_HISTORY_STALE_FILE_REFS",
  "KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT",
  "KM_LINT_README_TARGETS_MISMATCH",
  "KM_LINT_KMN_VERSION_MISMATCH",
  "KM_LINT_HTML_NOT_WELL_FORMED",
  "KM_LINT_PHP_DATA_STATES_INCOMPLETE",
  "KM_LINT_PHP_PAGENAME_FORMAT",
  "KM_LINT_PHP_HTM_BODY_MISMATCH",
  "KM_LINT_PHP_HTM_STYLE_MISMATCH",
  "KM_LINT_INVENTORY_UNCOVERED",
  "KM_WARN_LONGPRESS_OVERSIZE",
  "KM_WARN_TOUCH_ROW_COUNT",
  "KM_WARN_TOUCH_KEYS_PER_ROW",
  "KM_WARN_CONTROL_KEY_DRIFT",
  "KM_WARN_LAYER_SWITCH_NO_RETURN",
  // Spec 084 Batch 1 — the checks in packages/keyboard-lint/src/checks/
  // criteria/ (run via runCriteriaChecks when the criteria assembly
  // supplies a CriteriaLintInput) plus the foreign stray-file scan.
  "KM_LINT_ID_CONTAINS_KEYBOARD",
  "KM_LINT_STRAY_SCRATCH_FILES",
  "KM_LINT_VERSION_FORMAT",
  "KM_LINT_VERSION_LEADING_ZERO",
  "KM_LINT_VERSION_V_PREFIX",
  "KM_LINT_TARGETS_ANY_NOT_ALONE",
  "KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH",
  "KM_LINT_RALT_MISSING_USEALTGR",
  "KM_LINT_DISPLAY_NAME_UNDERSCORE",
  "KM_LINT_BITMAP_PLACEHOLDER",
  "KM_LINT_STORE_SYNTAX_INVALID",
  "KM_LINT_KVKS_BLANK",
  "KM_LINT_TOUCH_LAYOUT_FONT_MISMATCH",
  "KM_LINT_KPS_INDUSTRY_FONT",
  "KM_LINT_WOFF_FONT_IN_PACKAGE",
  "KM_LINT_REGION_001_TAG",
  "KM_LINT_PUA_KEYBOARD_PLACEMENT",
  "KM_LINT_MATH_LATIN_LOOKALIKE",
]);
