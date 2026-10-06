// Gate→decision coverage (spec 087 T051, US5, SC-005).
//
// Every keyboard-lint submission gate traces to the decision(s) that satisfy
// it. Gates with no decision mapping land on the explicit gap list — not a
// failure, but the named work ahead: the DecisionId vocabulary is complete
// when the gap list is empty.
//
// The mapping is curated (a human read each check's criteria), not inferred:
// a wrong automatic mapping would be worse than an honest gap.

import type { DecisionId } from "./decisionTypes.ts";

/** A keyboard-lint submission gate (an error-severity check). */
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

export interface GateCoverage {
  traces: GateTrace[];
  /** Gates with no decision mapping — the explicit gap list (SC-005). */
  gapList: GateTrace[];
  /** Fraction of gates with at least one decision (0..1). */
  coverage: number;
}

/**
 * The submission gates (error-severity keyboard-lint checks) and their
 * decision traces. Curated from the check sources in
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
          "on the touch layout (no touch orphans, no orphan rules).",
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
  ];

  const gapList = traces.filter((t) => t.decisions.length === 0);
  const coverage =
    traces.length === 0
      ? 1
      : traces.filter((t) => t.decisions.length > 0).length / traces.length;

  return { traces, gapList, coverage };
}
