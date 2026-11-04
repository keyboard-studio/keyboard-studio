// Gate→decision coverage (spec 087 T051, US5, SC-005).
//
// Every check the keyboard-lint engine registers (packages/keyboard-lint/src/
// checks/**) traces to the decision(s) that satisfy it, or lands on the explicit
// gap list: not a failure, but the named work ahead. The DecisionId vocabulary
// is complete when the gap list is empty.
//
// Severity: almost every @keymanapp/keyboard-lint check emits "warning" or
// "hint". The one known exception is KM_WARN_LONGPRESS_OVERSIZE
// (checks/check-18-1-longpress.ts), whose severity is computed and becomes
// "error" above 10 longpress options. So these gates are almost never a hard
// submission blocker on their own; the one hard gate in the studio is the
// inventory-coverage download gate (useInventoryCoverageGate), which consumes
// the 18.6 results. "Gate" here means "a lint check a submission is measured
// against".
//
// Layers NOT exercised by the SC-004 harness (successCriteria.sc004.test.ts):
// Layer B (no rule set exists in engine/src/validator yet) and Layer A'
// import-fidelity I1-I6 (engine/src/validator/layer-a-prime.ts; import-side
// checks, not on the engine's public API). Layer C checks listed here do run in
// SC-004 (G7/G8), but G7/G8 only fail on "error"/"fatal" findings, so apart from
// the longpress case above they cannot fail on a lint finding; that is a known
// weakness of the evidence, not of the flow.
//
// The mapping is curated (a human read each check's criteria), not inferred:
// a wrong automatic mapping would be worse than an honest gap. Completeness is
// NOT curated: gateCoverage.test.ts scans the lint package's check sources for
// the codes they emit and fails when one is in neither the mapped nor the gap
// list, so a newly added check cannot go unaccounted for.

import type { DecisionId } from "../decisions/decisionTypes.ts";

/** A keyboard-lint check a submission is measured against (warning/hint severity). */
export interface SubmissionGate {
  /** Stable gate id (e.g. "18.6-inventory-coverage"). */
  id: string;
  /** The KM_LINT_* code the check emits. */
  code: string;
  /** Human-readable criteria summary. */
  criteria: string;
}

/**
 * A gate's trace to decisions. Empty `decisions` means the gate is on the
 * gap list — no current DecisionId captures what the gate validates.
 */
export interface GateTrace {
  gate: SubmissionGate;
  decisions: DecisionId[];
  /** Why this mapping (or why it's a gap). */
  rationale: string;
}

interface GapSpec {
  id: string;
  code: string;
  criteria: string;
  why: string;
}

const GAP_SPECS: readonly GapSpec[] = [
  { id: "18.4-touch-duplicate-key-id", code: "KM_WARN_TOUCH_DUPLICATE_KEY_ID", criteria: "No touch key id is duplicated within a layer.", why: "touch layout structure; no DecisionId" },
  { id: "18.4-touch-missing-required-key", code: "KM_WARN_TOUCH_MISSING_REQUIRED_KEY", criteria: "Each touch layer carries the required control keys.", why: "touch layout structure; no DecisionId" },
  { id: "18.5-touch-missing-layer", code: "KM_WARN_TOUCH_MISSING_LAYER", criteria: "Every layer a key switches to exists in the touch layout.", why: "layer-graph well-formedness; no DecisionId" },
  { id: "18.6-touch-key-no-rule", code: "KM_LINT_TOUCH_KEY_NO_RULE", criteria: "Every touch key that outputs text has a matching rule.", why: "touch key/rule join; no DecisionId captures rule authoring" },
  { id: "18.6-touch-rule-orphan", code: "KM_LINT_TOUCH_RULE_ORPHAN", criteria: "Every touch rule is reachable from a touch key.", why: "touch key/rule join; no DecisionId captures rule authoring" },
  { id: "18.6-touch-key-id-case", code: "KM_HINT_TOUCH_KEY_ID_CASE", criteria: "A touch key id is spelled identically in layout and rules.", why: "identifier hygiene; no DecisionId" },
  { id: "19.x-context-not-analysed", code: "KM_HINT_CONTEXT_NOT_ANALYSED", criteria: "Context-tolerance analysis could examine the rule (hint when it could not).", why: "context-tolerance policy has no DecisionId" },
  { id: "3.3-history-order", code: "KM_LINT_HISTORY_ORDER", criteria: "HISTORY.md entries are in descending version order.", why: "documentation hygiene; no DecisionId covers HISTORY.md" },
  { id: "3.4-history-cumulative", code: "KM_LINT_HISTORY_TRUNCATED", criteria: "HISTORY.md is cumulative (no earlier entries dropped).", why: "documentation hygiene; no DecisionId covers HISTORY.md" },
  { id: "3.5-history-entry-format", code: "KM_LINT_HISTORY_ENTRY_FORMAT", criteria: "HISTORY.md entries follow the house format.", why: "documentation hygiene; no DecisionId covers HISTORY.md" },
  { id: "3.6-history-version-match", code: "KM_LINT_HISTORY_VERSION_MISMATCH", criteria: "The newest HISTORY.md version matches the package version.", why: "keyboard version is not a DecisionId" },
  { id: "7.1-kmn-version-match", code: "KM_LINT_KMN_VERSION_MISMATCH", criteria: "The .kmn version store matches the package version.", why: "keyboard version is not a DecisionId" },
  { id: "3.7-history-stale-refs", code: "KM_LINT_HISTORY_STALE_FILE_REFS", criteria: "HISTORY.md does not reference files that no longer exist.", why: "documentation hygiene; no DecisionId" },
  { id: "5.7-readme-targets", code: "KM_LINT_README_TARGETS_MISMATCH", criteria: "README.md platform targets match the .kps targets.", why: "platform targets are not a DecisionId" },
  { id: "11.5-html-well-formed", code: "KM_LINT_HTML_NOT_WELL_FORMED", criteria: "Welcome/help HTML is well-formed.", why: "generated documentation markup; no DecisionId" },
  { id: "11.6-data-states", code: "KM_LINT_PHP_DATA_STATES_INCOMPLETE", criteria: "welcome.php data-states cover every layer.", why: "generated documentation markup; no DecisionId" },
  { id: "11.7-pagename-format", code: "KM_LINT_PHP_PAGENAME_FORMAT", criteria: "welcome.php pagename follows the house format.", why: "generated documentation markup; no DecisionId" },
  { id: "11.9-body-parity", code: "KM_LINT_PHP_HTM_BODY_MISMATCH", criteria: "welcome.php and welcome.htm bodies agree.", why: "generated documentation markup; no DecisionId" },
  { id: "11.10-style-parity", code: "KM_LINT_PHP_HTM_STYLE_MISMATCH", criteria: "welcome.php and welcome.htm inline styles agree.", why: "generated documentation markup; no DecisionId" },
  // Spec 084 Batch 1 (criteria checks in keyboard-lint's checks/criteria/
  // and docs/check-11-2): submission-hygiene checks the criteria page
  // judges; none of them validates a fact a DecisionId captures, so all
  // are honest gaps here — the criteria resolver, not the decision
  // trail, is their consumer.
  { id: "1.6-id-contains-keyboard", code: "KM_LINT_ID_CONTAINS_KEYBOARD", criteria: "Keyboard ID, folder name, and display name do not contain the word \"keyboard\".", why: "keyboard identity naming; no DecisionId captures the display name" },
  { id: "1.13-stray-scratch-files", code: "KM_LINT_STRAY_SCRATCH_FILES", criteria: "No stray scratch or test files in the keyboard folder.", why: "repository file hygiene; no DecisionId" },
  { id: "2.3-version-format", code: "KM_LINT_VERSION_FORMAT", criteria: "Version number is dot-separated and entirely numeric.", why: "keyboard version is not a DecisionId" },
  { id: "2.4-version-leading-zero", code: "KM_LINT_VERSION_LEADING_ZERO", criteria: "No version component has a leading zero.", why: "keyboard version is not a DecisionId" },
  { id: "2.5-version-v-prefix", code: "KM_LINT_VERSION_V_PREFIX", criteria: "Version has no `v` prefix and no non-numeric labels.", why: "keyboard version is not a DecisionId" },
  { id: "7.2-targets-any-alone", code: "KM_LINT_TARGETS_ANY_NOT_ALONE", criteria: ".kmn targets line uses `any` alone, not combined with platform names.", why: "platform targets are not a DecisionId" },
  { id: "7.3-targets-mobile-without-touch", code: "KM_LINT_TARGETS_MOBILE_WITHOUT_TOUCH", criteria: ".kmn targets do not include `mobile` unless a touch layout exists.", why: "platform targets are not a DecisionId" },
  { id: "7.5-ralt-usealtgr", code: "KM_LINT_RALT_MISSING_USEALTGR", criteria: "If the keyboard uses RALT, the .kvks includes the usealtgr tag.", why: "visual keyboard flags; no DecisionId" },
  { id: "7.7a-display-name-underscore", code: "KM_LINT_DISPLAY_NAME_UNDERSCORE", criteria: "Keyboard display name contains no literal underscore characters.", why: "keyboard identity naming; no DecisionId captures the display name" },
  { id: "7.9-bitmap-placeholder", code: "KM_LINT_BITMAP_PLACEHOLDER", criteria: "store(&BITMAP) references the actual keyboard .ico, not a placeholder.", why: "package asset references; no DecisionId" },
  { id: "7.10-store-syntax", code: "KM_LINT_STORE_SYNTAX_INVALID", criteria: "All .kmn string-literal stores have balanced quotes and valid syntax.", why: "source syntax hygiene; no DecisionId" },
  { id: "7.16-kvks-blank", code: "KM_LINT_KVKS_BLANK", criteria: "The .kvks on-screen keyboard layout is populated, not blank.", why: "visual keyboard contents; no DecisionId" },
  { id: "7.20-touch-font-mismatch", code: "KM_LINT_TOUCH_LAYOUT_FONT_MISMATCH", criteria: "Same font is selected for phone and tablet layouts.", why: "touch layout font selection; no DecisionId" },
  { id: "8.12-kps-industry-font", code: "KM_LINT_KPS_INDUSTRY_FONT", criteria: "No industry fonts (Arial, Times, Tahoma, etc.) in the package.", why: "package font selection; no DecisionId" },
  { id: "9.6-woff-in-package", code: "KM_LINT_WOFF_FONT_IN_PACKAGE", criteria: "No .woff or web-only font formats in keyboard packages.", why: "package font formats; no DecisionId" },
  { id: "11.2-php-osk-layers", code: "KM_LINT_PHP_OSK_LAYERS_INCOMPLETE", criteria: "If using OSK syntax, all desktop and mobile layers are listed in data-states.", why: "generated documentation markup; no DecisionId" },
  { id: "12.4-region-001", code: "KM_LINT_REGION_001_TAG", criteria: "Region code 001 is never used in BCP47 tags.", why: "language tagging; no DecisionId" },
  { id: "13.1-pua-placement", code: "KM_LINT_PUA_KEYBOARD_PLACEMENT", criteria: "PUA codepoint use means the keyboard is in experimental/.", why: "encoding placement; no DecisionId" },
  { id: "13.4-math-latin-lookalikes", code: "KM_LINT_MATH_LATIN_LOOKALIKE", criteria: "No mathematical Latin look-alike characters in keyboard output.", why: "output character hygiene; no DecisionId" },
  { id: "15.3-deprecated-kps-linkage", code: "KM_LINT_DEPRECATED_KPS_LINKAGE_MISSING", criteria: "Legacy package ID is listed in the new keyboard's .kps Related packages as Deprecated.", why: "deprecation bookkeeping; no DecisionId" },
  // Spec 084 Batch 2 (cross-file reconciliation checks in
  // keyboard-lint's checks/criteria/ and docs/check-11-8): same status
  // as the Batch 1 entries — the criteria resolver is their consumer,
  // and no DecisionId captures what they validate.
  { id: "1.9-duplicate-source-files", code: "KM_LINT_DUPLICATE_SOURCE_FILES", criteria: "No duplicate copies of the same source file inside the keyboard folder.", why: "repository file hygiene; no DecisionId" },
  { id: "7.4-modifier-name-inconsistent", code: "KM_LINT_MODIFIER_NAME_INCONSISTENT", criteria: "Modifier key names are consistent across .kmn, .kvks, and .keyman-touch-layout.", why: "modifier naming across source files; no DecisionId" },
  { id: "7.12-pua-not-in-experimental", code: "KM_LINT_PUA_NOT_IN_EXPERIMENTAL", criteria: "A keyboard using PUA codepoints is in experimental/.", why: "encoding placement; no DecisionId" },
  { id: "7.14-pua-font-no-displaymap", code: "KM_LINT_PUA_FONT_NO_DISPLAYMAP", criteria: "A keyboard shipping a PUA-encoded font declares store(&DISPLAYMAP).", why: "display-map declaration; no DecisionId" },
  { id: "7.19-redundant-touch-layouts", code: "KM_LINT_REDUNDANT_TOUCH_LAYOUTS", criteria: "Identical phone and tablet touch layouts are deduplicated.", why: "touch layout structure; no DecisionId" },
  { id: "8.13-kps-targets-mismatch", code: "KM_LINT_KPS_TARGETS_MISMATCH", criteria: "Targets declared in .kmn match compiled files listed in the .kps.", why: "platform targets are not a DecisionId" },
  { id: "11.8-php-osk-image", code: "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED", criteria: "OSK graphics either use Keyman-generated form or custom images have width constraints.", why: "generated documentation markup; no DecisionId" },
  { id: "10.6-kps-numeric-region-tag", code: "KM_LINT_KPS_NUMERIC_REGION_TAG", criteria: "The .kps does not use numeric region codes in language tags.", why: "language-tag hygiene; no DecisionId" },
  // Spec 084 Batch 3 (checks in keyboard-lint's checks/criteria/):
  // same status as the Batch 1/2 entries — the criteria resolver is
  // their consumer, and no DecisionId captures what they validate.
  { id: "8.7-kps-font-missing", code: "KM_LINT_KPS_FONT_MISSING", criteria: "All fonts used in the keyboard are listed in the .kps <Files>.", why: "font packaging; no DecisionId" },
  { id: "12.2-iso-639-5-lang-code", code: "KM_LINT_ISO_639_5_LANG_CODE", criteria: "BCP47 tags do not use ISO 639-5 language codes.", why: "language-tag hygiene; no DecisionId" },
  { id: "12.3-numeric-region-non-contrastive", code: "KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE", criteria: "A language tag does not include a numerical region code, unless it is explicitly contrastive.", why: "language-tag hygiene; no DecisionId" },
  { id: "18.7-mandated-currency-char", code: "KM_LINT_MANDATED_CHAR_MISSING", criteria: "The keyboard can produce the mandated characters for currency (if applicable).", why: "character coverage; no DecisionId" },
  // Spec 084 KPJ pair (checks in keyboard-lint's checks/criteria/
  // check-kpj): same status as the Batch 1–3 entries — the criteria
  // resolver is their consumer, and no DecisionId captures what they
  // validate. Landed once Matthew's 2026-10-14 ruling re-pinned
  // criterion 1.10's current .kpj format constant to 2.0.
  { id: "1.10b-kpj-format-outdated", code: "KM_LINT_KPJ_FORMAT_OUTDATED", criteria: "Adapted keyboard's .kpj uses the current project-file format version (2.0), not an older one.", why: "project-file format hygiene; no DecisionId" },
  { id: "2.7-kpj-version-bumped", code: "KM_LINT_KPJ_VERSION_BUMPED", criteria: "The .kpj file's <Version> (the file-format version) has not been bumped.", why: "project-file format hygiene; no DecisionId" },
  // /review twins and PR checks (the text-content, .kps-listing, .kps-
  // metadata and repo-context twins, plus the PR base-commit checks for
  // 1.5/2.1/2.2/2.6, whose authored verdicts come from assemblyVerdicts.ts):
  // same status as the Batch 1-3 entries -- the criteria resolver is their
  // consumer, and no DecisionId captures what they validate.
{ id: "7.11b-author-in-kps-not-kmn", code: "KM_LINT_AUTHOR_IN_KMN", criteria: "The author name is in the .kps, not in a .kmn Author store.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.12b-no-build-folder-committed", code: "KM_LINT_BUILD_FOLDER_PRESENT", criteria: "No `build/` folder contents are committed.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "4.1b-copyright-present-with-year", code: "KM_LINT_COPYRIGHT_ABSENT", criteria: "A copyright statement with year(s) is present in LICENSE.md.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "5.3b-no-copyright-in-readme-or-docs", code: "KM_LINT_COPYRIGHT_IN_DOCS", criteria: "No copyright year/statement is in README.md, readme.htm, or welcome.htm.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "4.5b-copyright-syntax-exact", code: "KM_LINT_COPYRIGHT_SYNTAX", criteria: "The LICENSE.md copyright line follows the `Copyright (C) <year> <holder>` syntax (the `©` symbol is accepted in place of `(C)`).", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "4.6b-copyright-year-not-in-kmn-or-kps", code: "KM_LINT_COPYRIGHT_YEAR_EMBEDDED", criteria: "No copyright year is embedded in the .kmn or .kps copyright strings.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.8b-no-duplicate-docs-subfolder", code: "KM_LINT_DOCS_SUBFOLDER_DUPLICATES", criteria: "No `docs/` (or similar) subfolder holds duplicate HISTORY / README / INSTALL files.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.5-keyboard-id-not-already-used", code: "KM_LINT_DUPLICATE_KEYBOARD_ID", criteria: "The keyboard ID (folder name) is not already used in `experimental/`, `legacy/`, or `release/`", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.1-no-files-outside-keyboard-folder", code: "KM_LINT_FILES_OUTSIDE_FOLDER", criteria: "No files modified outside the keyboard's own folder", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "19.2b-import-attribution-in-history-md", code: "KM_LINT_HISTORY_ATTRIBUTION_BAD", criteria: "HISTORY.md contains the 'Adapted from' entry.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "3.1b-history-file-exists", code: "KM_LINT_HISTORY_MD_ABSENT", criteria: "A `HISTORY.md` exists at the keyboard root.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "4.0-license-md-exists", code: "KM_LINT_LICENSE_MD_ABSENT", criteria: "A `LICENSE.md` exists at the keyboard root.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "5.0-readme-md-exists", code: "KM_LINT_README_MD_ABSENT", criteria: "A `README.md` exists at the keyboard root.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.10a-kpj-exists", code: "KM_LINT_KPJ_ABSENT", criteria: "A `.kpj` project file exists at the keyboard root.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.0-kps-exists", code: "KM_LINT_KPS_ABSENT", criteria: "A `.kps` package file exists in source/.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "18.0-touch-layout-exists", code: "KM_LINT_TOUCH_LAYOUT_ABSENT", criteria: "A `.keyman-touch-layout` touch layout file exists in source/.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "7.15-kvks-exists", code: "KM_LINT_KVKS_ABSENT", criteria: "A `.kvks` on-screen keyboard file exists in source/.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "7.8-ico-exists", code: "KM_LINT_ICO_ABSENT", criteria: "An `.ico` icon file exists for the keyboard.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.7b-no-keyboard-info-file", code: "KM_LINT_KEYBOARD_INFO_PRESENT", criteria: "No `keyboard.info` file is present in the keyboard folder.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.11b-no-kpj-user-committed", code: "KM_LINT_KPJ_USER_PRESENT", criteria: "No `.kpj.user` file is committed.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "10.9b-kps-description-nonempty", code: "KM_LINT_KPS_DESCRIPTION_EMPTY", criteria: "The .kps description is present and non-empty.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "10.7b-kps-details-files-selected", code: "KM_LINT_KPS_DETAILS_UNSELECTED", criteria: "Readme.htm, welcome.htm, and LICENSE.md are selected in the .kps Details tab.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "10.8b-kps-follow-keyboard-version", code: "KM_LINT_KPS_FOLLOW_VERSION_UNSET", criteria: "\"Follow keyboard version\" is selected in the .kps Details tab.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "10.1b-kps-font-selected", code: "KM_LINT_KPS_FONT_UNSELECTED", criteria: "A font is selected in the .kps Keyboards tab when a font is included in the package files.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.9b-kps-no-help-folder-files", code: "KM_LINT_KPS_HELP_LISTED", criteria: "No files from the `help/` folder are listed in the `.kps` package.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.11b-kps-no-displaymap-json", code: "KM_LINT_KPS_JSON_LISTED", criteria: "No font display-map `.json` files are listed in the `.kps`.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.3b-kps-includes-js-if-mobile", code: "KM_LINT_KPS_JS_ABSENT", criteria: "A compiled `.js` is listed in the `.kps` package when the keyboard has a touch layout.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.1b-kps-includes-kmx", code: "KM_LINT_KPS_KMX_ABSENT", criteria: "A compiled `.kmx` is listed in the `.kps` package.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.2b-kps-includes-kvk", code: "KM_LINT_KPS_KVK_ABSENT", criteria: "A compiled `.kvk` is listed in the `.kps` package.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "10.2b-kps-language-tags-selected", code: "KM_LINT_KPS_LANGUAGES_UNSELECTED", criteria: "Language tag(s) are selected in the .kps Keyboards tab.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.4b-kps-includes-license-md", code: "KM_LINT_KPS_LICENSE_ABSENT", criteria: "`LICENSE.md` is listed in the `.kps` package.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.8b-kps-no-php-file", code: "KM_LINT_KPS_PHP_LISTED", criteria: "No `.php` help file is listed in the `.kps` package.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.5b-kps-includes-readme-htm", code: "KM_LINT_KPS_README_ABSENT", criteria: "`readme.htm` is listed in the `.kps` package.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.10b-kps-no-uncompiled-sources", code: "KM_LINT_KPS_SOURCE_LISTED", criteria: "No uncompiled sources (.kmn, .ico, .kvks, .keyman-touch-layout, .kps) are listed in the `.kps`.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "8.6b-kps-includes-welcome-and-graphics", code: "KM_LINT_KPS_WELCOME_ABSENT", criteria: "`welcome.htm` is listed in the `.kps` package, and its associated graphics when the welcome page references images.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "11.4b-php-no-closing-body-html", code: "KM_LINT_PHP_CLOSING_TAGS", criteria: "The .php has no closing </body> or </html> tags.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "11.1b-php-exists-with-header", code: "KM_LINT_PHP_HEADER_BAD", criteria: "The <name>.php help file exists and has the proper PHP header (<?php + `$pagename = '...'` and `require_once('header.php')`).", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "11.3b-php-style-inside-header", code: "KM_LINT_PHP_STYLE_OUTSIDE", criteria: "All style information (<style> tags) is inside the PHP header block, not outside it.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "19.1b-import-attribution-in-pr-body", code: "KM_LINT_PR_ATTRIBUTION_BAD", criteria: "The PR body includes the import attribution block.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "5.6b-readme-help-link", code: "KM_LINT_README_HELP_LINK_ABSENT", criteria: "README.md links to http(s)://help.keyman.com/keyboard/<id>.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "6.1b-readme-htm-exists", code: "KM_LINT_README_HTM_ABSENT", criteria: "`readme.htm` exists in `source/`.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "5.5b-readme-keyman-home-link", code: "KM_LINT_README_KEYMAN_LINK_ABSENT", criteria: "README.md links to https://keyman.com/keyboards/<id>.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.3b-keyboard-under-organizing-folder", code: "KM_LINT_REPO_NO_ORGANIZING_FOLDER", criteria: "The keyboard sits under an organizing subfolder (`release/<org>/<id>`).", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.2b-keyboard-under-release-or-experimental", code: "KM_LINT_REPO_PLACEMENT_BAD", criteria: "The keyboard folder lives under `release/` or `experimental/`.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "1.4b-no-source-files-at-repo-root", code: "KM_LINT_REPO_ROOT_SOURCE", criteria: "No source files are placed at the repository root.", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "2.2-version-not-required-if-only-nonpackage", code: "KM_LINT_SPURIOUS_VERSION_BUMP", criteria: "If only non-package files were modified, a version bump is not required", why: "keyboard version is not a DecisionId" },
  { id: "5.2b-no-version-in-readme-or-docs", code: "KM_LINT_VERSION_IN_DOCS", criteria: "No version number is embedded in README.md, readme.htm, welcome.htm, or the help .php (heuristic: an X.Y[.Z] pattern in the visible text; CSS, scripts, URLs and DOIs are ignored).", why: "keyboard version is not a DecisionId" },
  { id: "2.1-version-bumped-if-package-changed", code: "KM_LINT_VERSION_NOT_BUMPED", criteria: "If any file that ships in the package was modified, the keyboard version was bumped", why: "keyboard version is not a DecisionId" },
  { id: "2.6-new-version-strictly-greater", code: "KM_LINT_VERSION_NOT_INCREMENTED", criteria: "New version is strictly greater than the previously deployed version", why: "keyboard version is not a DecisionId" },
  { id: "6.3b-welcome-htm-exists", code: "KM_LINT_WELCOME_HTM_ABSENT", criteria: "`welcome.htm` exists in `source/` (flat or the `source/welcome/` folder convention).", why: "submission hygiene the criteria page judges; no DecisionId" },
  { id: "6.6b-welcome-htm-lang-attribute", code: "KM_LINT_WELCOME_LANG_MISMATCH", criteria: "The welcome.htm <html lang> attribute matches the keyboard's primary BCP47 tag (an English page may declare lang=\"en\").", why: "submission hygiene the criteria page judges; no DecisionId" },
  // Criteria consistency batch (#2456): new Layer C checks whose consumer is
  // the criteria resolver, not a DecisionId.
  { id: "1.15-filenames-follow-convention", code: "KM_LINT_FILENAME_CONVENTION", criteria: "All files in the keyboard folder follow the filename convention: lowercase extensions, and names containing only alphanumerics, `-`, `_`, `+`, `.`.", why: "repository file hygiene; no DecisionId" },
  { id: "7.25-no-deprecated-numeric-formats", code: "KM_LINT_DEPRECATED_NUMERIC_FORMAT", criteria: "All character literals in the .kmn use U+NNNN notation; deprecated decimal/octal/hex formats do not appear.", why: "source syntax hygiene; no DecisionId" },
  { id: "7.26-caps-ncaps-consistent-per-key", code: "KM_LINT_CAPS_NCAPS_INCONSISTENT", criteria: "Every rule referencing a given key is consistent in CAPS/NCAPS handling.", why: "rule modifier hygiene; no DecisionId" },
  { id: "7.27-no-deprecated-headers-or-unused-stores", code: "KM_LINT_DEPRECATED_HEADER_OR_UNUSED_STORE", criteria: "No deprecated header statements or system stores remain; unused stores are removed.", why: "source syntax hygiene; no DecisionId" },
  { id: "7.28-cased-script-declares-casedkeys", code: "KM_LINT_CASEDKEYS_MISSING", criteria: "A keyboard that produces cased letters declares store(&CasedKeys); mnemonic layouts are exempt.", why: "rule modifier hygiene; no DecisionId" },
  { id: "18.14-touch-layers-carry-bksp-enter", code: "KM_LINT_TOUCH_LAYER_MISSING_CONTROL_KEYS", criteria: "Every touch layer includes the required control keys (K_LOPT, K_BKSP, K_ENTER).", why: "touch layout structure; no DecisionId" },
  { id: "18.16-touch-caps-layer-complete", code: "KM_LINT_TOUCH_CAPS_LAYER", criteria: "A keyboard that produces cased letters has a touch caps layer reached by double-tapping Shift, carrying every uppercase letter, whose character keys do not switch layers.", why: "touch layout structure; no DecisionId" },
];

function gaps(): GateTrace[] {
  return GAP_SPECS.map((g) => ({
    gate: { id: g.id, code: g.code, criteria: g.criteria },
    decisions: [],
    rationale: `Gap: ${g.why}. (Warning/hint severity.)`,
  }));
}

export interface GateCoverage {
  traces: GateTrace[];
  /** Gates with no decision mapping — the explicit gap list (SC-005). */
  gapList: GateTrace[];
  /** Fraction of gates with at least one decision (0..1). */
  coverage: number;
}

/**
 * The keyboard-lint checks (all warning/hint severity) and their decision
 * traces. Curated from the check sources in
 * packages/keyboard-lint/src/checks/.
 */
export function buildGateCoverage(): GateCoverage {
  const traces: GateTrace[] = [
    {
      gate: {
        id: "18.6-inventory-coverage",
        code: "KM_LINT_INVENTORY_UNCOVERED",
        criteria:
          "Every character in the confirmed linguist inventory is produced " +
          "by some reachable input sequence in the draft keyboard.",
      },
      decisions: ["character-inventory"],
      rationale:
        "The gate validates coverage of the linguist inventory — the exact " +
        "fact the character-inventory decision captures. A keyboard passes " +
        "iff its inventory decision is satisfied by the built layout.",
    },
    {
      gate: {
        id: "18.6-touch-coverage",
        code: "KM_LINT_TOUCH_UNCOVERED",
        criteria:
          "Every inventory character reachable on desktop is also reachable " +
          "on the touch layout.",
      },
      decisions: ["character-inventory"],
      rationale:
        "The touch-surface counterpart of 18.6: same inventory decision, " +
        "different surface. The decision is surface-agnostic; the gate " +
        "checks both surfaces satisfy it.",
    },
    {
      gate: {
        id: "18.1-longpress-oversize",
        code: "KM_WARN_LONGPRESS_OVERSIZE",
        criteria:
          "No touch long-press menu offers more than 8 options.",
      },
      decisions: [],
      rationale:
        "Gap: long-press menu contents are placement decisions, but no " +
        "DecisionId yet captures the long-press assignment per key. " +
        "(Warning severity, not a submission blocker.)",
    },
    {
      gate: {
        id: "18.2-touch-rows",
        code: "KM_WARN_TOUCH_ROW_COUNT",
        criteria: "Touch layout uses 4-5 rows on phone, exactly 5 on tablet.",
      },
      decisions: [],
      rationale:
        "Gap: touch row geometry has no DecisionId. The decision vocabulary " +
        "covers identity and inventory, not layout geometry. " +
        "(Warning severity.)",
    },
    {
      gate: {
        id: "18.3-keys-per-row",
        code: "KM_WARN_TOUCH_KEYS_PER_ROW",
        criteria:
          "Touch layout uses at most 10 keys per row on phone, 13 on tablet.",
      },
      decisions: [],
      rationale: "Gap: same as 18.2 — layout geometry, no DecisionId. (Warning.)",
    },
    {
      gate: {
        id: "18.4-control-key-drift",
        code: "KM_WARN_CONTROL_KEY_DRIFT",
        criteria:
          "Within a platform, control keys (BKSP, ENTER) must not move or " +
          "resize across layers.",
      },
      decisions: [],
      rationale:
        "Gap: control-key stability is a layout invariant with no DecisionId. " +
        "(Warning severity.)",
    },
    {
      gate: {
        id: "18.5-layer-switch-return",
        code: "KM_WARN_LAYER_SWITCH_NO_RETURN",
        criteria:
          "Every non-default layer switched into must contain a return path.",
      },
      decisions: [],
      rationale:
        "Gap: layer-graph well-formedness has no DecisionId. (Warning.)",
    },
    {
      gate: {
        id: "19.x-context-tolerance",
        code: "KM_WARN_CONTEXT_NOT_TOLERANT",
        criteria:
          "The keyboard tolerates the declared context (no context-sensitive " +
          "rules that break under the tolerance policy).",
      },
      decisions: [],
      rationale:
        "Gap: context-tolerance policy has no DecisionId yet. The " +
        "contextToleranceProposal in decisions/ is the seed, but it is not " +
        "a DecisionId. (Warning severity.)",
    },
    {
      gate: {
        id: "4.7-copyright-holder",
        code: "KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT",
        criteria:
          "The copyright holder is identical across LICENSE.md, .kmn, .kps, " +
          "README.md and HISTORY.md.",
      },
      decisions: ["copyright-holder"],
      rationale:
        "The copyright-holder decision is the single source the doc " +
        "generators write into every file; the gate verifies they agree.",
    },
    ...gaps(),
  ];

  const gapList = traces.filter((t) => t.decisions.length === 0);
  const coverage =
    traces.length === 0
      ? 1
      : traces.filter((t) => t.decisions.length > 0).length / traces.length;

  return { traces, gapList, coverage };
}
