// Decision-spike adapt diff (km/decisions-spike).
//
// "Adapt the keyboard" = diff the decisions EXTRACTED from a base keyboard
// against the author's answers. Pure.

import type {
  DecisionId,
  DecisionProvenance,
  DecisionSet,
} from "./decisionTypes.ts";

export type DecisionDiffStatus = "confirmed" | "changed" | "missing";

export interface DecisionDiff {
  id: DecisionId;
  status: DecisionDiffStatus;
  provenance: DecisionProvenance;
}

/**
 * Compare an extracted decision set against the author's answers.
 *
 * - "confirmed": extracted and never overridden (or overridden with an equal value)
 * - "changed":   the author supplied a value where there was none, or a different one
 * - "missing":   no extracted value and no answer
 */
export function diffDecisions(
  extracted: DecisionSet,
  answers: DecisionSet,
): DecisionDiff[] {
  const ids = new Set<DecisionId>([
    ...(Object.keys(extracted) as DecisionId[]),
    ...(Object.keys(answers) as DecisionId[]),
  ]);

  const diffs: DecisionDiff[] = [];
  for (const id of ids) {
    const e = extracted[id];
    const a = answers[id];
    if (
      a?.value !== undefined &&
      (e?.value === undefined || a.value !== e.value)
    ) {
      diffs.push({ id, status: "changed", provenance: a.provenance });
    } else if (e?.value !== undefined) {
      diffs.push({ id, status: "confirmed", provenance: e.provenance });
    } else {
      diffs.push({ id, status: "missing", provenance: "default" });
    }
  }
  return diffs;
}
