// Implemented layer-c lint checks (spec 084).
//
// The set of lint codes the resolver treats as actually enforced. It
// has exactly two sources, and criteriaCatalog.test.ts re-derives both
// and fails when this set drifts from them:
//
//   1. The producer scan: scanning packages/keyboard-lint/src/checks
//      for the codes emitted as a finding's `code:` literal — the same
//      source-scan method as test/gateCoverage.test.ts's
//      registeredLintCodes() — keeping the scanned codes that are also
//      a catalog criterion's lintRuleId.
//   2. ASSEMBLY_SYNTHESIZED_CODES below: codes no lint check emits,
//      produced by a named synthesis in the criteria assembly (the
//      compile-result severity mapping in compileMapping.ts, and the
//      instantiation-state verdicts in assemblyVerdicts.ts for the
//      codes that have no lint producer). This is an explicit named
//      set, not a weakening of the scan: every code here must name
//      its synthesis, and the test pins the set exactly. (§1.5's
//      KM_LINT_DUPLICATE_KEYBOARD_ID is deliberately absent: it has
//      both a lint producer for foreign mode and an authored-mode
//      assembly verdict.)
//
// Warning: adding a lint check means adding its code here in the same
// change. Until a code is listed here, its criterion honestly resolves
// Not yet checkable rather than claiming a pass no check produced.

/**
 * Codes produced by a named synthesis in the criteria assembly rather
 * than by a keyboard-lint check: §§7.6/7.21 map the host's compile
 * result by diagnostic severity (compileMapping.ts). Precertified codes (precertify.ts)
 * are NOT here — precertification is a separate resolver mechanism,
 * not an implemented check.
 *
 * §1.5 (KM_LINT_DUPLICATE_KEYBOARD_ID) and §§2.1/2.2/2.6 (the
 * version rows) are NOT here: each has a lint producer
 * (checkKeyboardIdConflict's PR base-commit ID lookup; check-version's
 * base-commit comparisons) for foreign mode, alongside its
 * authored-mode assembly verdict —
 * the scanner finds their `code:` literals, so listing them here would
 * trip the drift guard's "no lint producer" assertion.
 *
 * Also NOT here, deliberately (Batch 5): KM_LINT_FONT_LICENSE_EMPTY
 * and KM_LINT_FONT_LICENSE_NOT_OPEN (§§9.1/9.2). No lint check emits
 * them and no synthesis maps them — the corpus .kps carries no
 * per-font license field, so the rows resolve through the criteria
 * record's per-font license attestations (fontLicense.ts). Listing
 * them in either set would claim a mechanism that does not exist.
 */
export const ASSEMBLY_SYNTHESIZED_CODES: ReadonlySet<string> = new Set([
  "KM_LINT_COMPILE_HAS_WARNINGS",
  "KM_LINT_COMPILE_ERRORS",
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
  // Spec 084 KPJ pair — one reader (check-kpj) pins the judged .kpj's
  // <Options><Version> to criterion 1.10's current format from both
  // directions. The constant was settled by Matthew's 2026-10-14
  // ruling: 2.0 (the catalog's earlier 10.0 was a data defect; the
  // corpus carries 2.0) and 1.10's pin was corrected in the same change.
  "KM_LINT_KPJ_FORMAT_OUTDATED",
  "KM_LINT_KPJ_VERSION_BUMPED",
  // Group A2 file-inventory twins (check-file-inventory): post-hoc checks
  // of the scaffolder-bake file guarantees — 1.7b/1.8b/1.11b/1.12b/
  // 3.1b/6.1b/6.3b. Pure VFS path-list checks, no parsing.
  "KM_LINT_KEYBOARD_INFO_PRESENT",
  "KM_LINT_DOCS_SUBFOLDER_DUPLICATES",
  "KM_LINT_KPJ_USER_PRESENT",
  "KM_LINT_BUILD_FOLDER_PRESENT",
  "KM_LINT_HISTORY_MD_ABSENT",
  "KM_LINT_README_HTM_ABSENT",
  "KM_LINT_WELCOME_HTM_ABSENT",
  // Group A2 .kps-listing twins (check-kps-listing): post-hoc checks of
  // the scaffolder-bake package-listing guarantees — 8.1b–8.6b /
  // 8.8b–8.11b. Pure functions of the .kps <File> names.
  "KM_LINT_KPS_KMX_ABSENT",
  "KM_LINT_KPS_KVK_ABSENT",
  "KM_LINT_KPS_JS_ABSENT",
  "KM_LINT_KPS_LICENSE_ABSENT",
  "KM_LINT_KPS_README_ABSENT",
  "KM_LINT_KPS_WELCOME_ABSENT",
  "KM_LINT_KPS_PHP_LISTED",
  "KM_LINT_KPS_HELP_LISTED",
  "KM_LINT_KPS_SOURCE_LISTED",
  "KM_LINT_KPS_JSON_LISTED",
  // Group A2 .kps-metadata twins (check-kps-metadata): post-hoc checks of
  // the scaffolder-bake package-tab selections — 10.1b/10.2b/10.7b/
  // 10.8b/10.9b. Pure functions of the pre-parsed .kps details.
  "KM_LINT_KPS_FONT_UNSELECTED",
  "KM_LINT_KPS_LANGUAGES_UNSELECTED",
  "KM_LINT_KPS_DETAILS_UNSELECTED",
  "KM_LINT_KPS_FOLLOW_VERSION_UNSET",
  "KM_LINT_KPS_DESCRIPTION_EMPTY",
  // Group A2 text-content twins (check-text-content): post-hoc checks of
  // the scaffolder-bake text guarantees — 4.1b/4.5b/4.6b/5.2b/5.3b/5.5b/
  // 5.6b/6.6b/7.11b/11.1b/11.3b/11.4b. Pure functions of the judged texts.
  "KM_LINT_COPYRIGHT_ABSENT",
  "KM_LINT_COPYRIGHT_SYNTAX",
  "KM_LINT_COPYRIGHT_YEAR_EMBEDDED",
  "KM_LINT_VERSION_IN_DOCS",
  "KM_LINT_COPYRIGHT_IN_DOCS",
  "KM_LINT_README_KEYMAN_LINK_ABSENT",
  "KM_LINT_README_HELP_LINK_ABSENT",
  "KM_LINT_WELCOME_LANG_MISMATCH",
  "KM_LINT_AUTHOR_IN_KMN",
  "KM_LINT_PHP_HEADER_BAD",
  "KM_LINT_PHP_STYLE_OUTSIDE",
  "KM_LINT_PHP_CLOSING_TAGS",
  // Group A2 Batch 5 repo-context twins (check-repo-context): post-hoc
  // checks of the scaffolder-bake repo guarantees — 1.2b/1.3b/1.4b/
  // 19.1b/19.2b — plus the Group C extraneous-files check, which maps to
  // the existing layer-c row 1.1 (no twin needed). Pure functions of the
  // ReviewContext; /review-only.
  "KM_LINT_REPO_PLACEMENT_BAD",
  "KM_LINT_REPO_NO_ORGANIZING_FOLDER",
  "KM_LINT_REPO_ROOT_SOURCE",
  "KM_LINT_FILES_OUTSIDE_FOLDER",
  "KM_LINT_PR_ATTRIBUTION_BAD",
  "KM_LINT_HISTORY_ATTRIBUTION_BAD",
  // Assembly-synthesized (ASSEMBLY_SYNTHESIZED_CODES above): the
  // compile-result severity mapping (compileMapping.ts) and the
  // instantiation-state verdicts (assemblyVerdicts.ts). §§1.5/2.1/2.2/2.6
  // keep their authored-mode assembly verdicts AND their foreign-mode
  // lint checks (checkKeyboardIdConflict, check-version).
  "KM_LINT_COMPILE_HAS_WARNINGS",
  "KM_LINT_COMPILE_ERRORS",
  "KM_LINT_DUPLICATE_KEYBOARD_ID",
  "KM_LINT_VERSION_NOT_BUMPED",
  "KM_LINT_SPURIOUS_VERSION_BUMP",
  "KM_LINT_VERSION_NOT_INCREMENTED",
]);
