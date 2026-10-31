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
  // The four assembly-verdict codes (1.5, 2.1, 2.2, 2.6) are NOT lint
  // codes and do not belong in this registry: no check emits them;
  // they are synthesized in the criteria assembly (assemblyVerdicts.ts)
  // and pinned by criteriaCatalog.test.ts's synthesized-set guard.
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
