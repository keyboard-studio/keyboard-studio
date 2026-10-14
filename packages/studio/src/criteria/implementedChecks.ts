// Implemented layer-c lint checks (spec 084).
//
// The set of lint codes the resolver treats as actually enforced. It
// has exactly two sources, and criteriaCatalog.test.ts re-derives both
// and fails when this set drifts from them:
//
//   1. The producer scan: scanning packages/keyboard-lint/src/checks
//      for the codes emitted as a finding's `code:` literal — the same
//      source-scan method as decisions/gateCoverage.test.ts's
//      registeredLintCodes() — keeping the scanned codes that are also
//      a catalog criterion's lintRuleId.
//   2. ASSEMBLY_SYNTHESIZED_CODES below: codes no lint check emits,
//      produced by a named synthesis in the criteria assembly (the
//      compile-result severity mapping in compileMapping.ts). This is
//      an explicit named set, not a weakening of the scan: every code
//      here must name its synthesis, and the test pins the set exactly.
//
// Warning: adding a lint check means adding its code here in the same
// change. Until a code is listed here, its criterion honestly resolves
// Not yet checkable rather than claiming a pass no check produced.

/**
 * Codes produced by a named synthesis in the criteria assembly rather
 * than by a keyboard-lint check: §§7.6/7.21 map the host's compile
 * result by diagnostic severity (compileMapping.ts), and §§1.5/2.1/
 * 2.2/2.6 are verdicts computed from the instantiation state
 * (assemblyVerdicts.ts, Batch 3). Precertified codes (precertify.ts)
 * are NOT here — precertification is a separate resolver mechanism,
 * not an implemented check.
 */
export const ASSEMBLY_SYNTHESIZED_CODES: ReadonlySet<string> = new Set([
  "KM_LINT_COMPILE_HAS_WARNINGS",
  "KM_LINT_COMPILE_ERRORS",
  "KM_LINT_DUPLICATE_KEYBOARD_ID",
  "KM_LINT_VERSION_NOT_BUMPED",
  "KM_LINT_SPURIOUS_VERSION_BUMP",
  "KM_LINT_VERSION_NOT_INCREMENTED",
]);

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
  // Spec 084 Batch 1 (doc + kps group) — 11.2 runs inside runDocChecks
  // as the complement of 11.6; 15.3 reads the judged keyboard's own
  // .kps text in runCriteriaChecks.
  "KM_LINT_PHP_OSK_LAYERS_INCOMPLETE",
  "KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING",
  // Spec 084 Batch 2 — cross-file reconciliation checks in
  // checks/criteria/ (1.9 VFS duplicates, 7.4 modifier-name map, 7.12 /
  // 7.14 produced-set PUA checks, 7.19 touch-layout compare, 8.13
  // three-way target agreement) plus 11.8 in runDocChecks.
  "KM_LINT_DUPLICATE_SOURCE_FILES",
  "KM_LINT_MODIFIER_NAME_INCONSISTENT",
  "KM_LINT_PUA_NOT_IN_EXPERIMENTAL",
  "KM_LINT_PUA_FONT_NO_DISPLAYMAP",
  "KM_LINT_REDUNDANT_TOUCH_LAYOUTS",
  "KM_LINT_KPS_TARGETS_MISMATCH",
  "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED",
  // Spec 084 catch-up — 10.6 fell between the Batch 1/2 enumerations;
  // it is the same tag-parsing family as 12.4 in check-bcp47.
  "KM_LINT_KPS_NUMERIC_REGION_TAG",
  // Spec 084 Batch 3 — checks in checks/criteria/ (12.2 ISO 639-5 and
  // 12.3 numeric-region in check-bcp47, 8.7 package fonts, 18.7
  // mandated currency characters).
  "KM_LINT_ISO_639_5_LANG_CODE",
  "KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE",
  "KM_LINT_KPS_FONT_MISSING",
  "KM_LINT_MANDATED_CHAR_MISSING",
  // Assembly-synthesized (ASSEMBLY_SYNTHESIZED_CODES above): the
  // compile-result severity mapping (compileMapping.ts) and the
  // instantiation-state verdicts (assemblyVerdicts.ts).
  "KM_LINT_COMPILE_HAS_WARNINGS",
  "KM_LINT_COMPILE_ERRORS",
  "KM_LINT_DUPLICATE_KEYBOARD_ID",
  "KM_LINT_VERSION_NOT_BUMPED",
  "KM_LINT_SPURIOUS_VERSION_BUMP",
  "KM_LINT_VERSION_NOT_INCREMENTED",
]);
