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

import type { DecisionId } from "./decisionTypes.ts";

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
