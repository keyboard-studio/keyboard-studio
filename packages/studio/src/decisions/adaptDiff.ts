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
 * Structural equality for decision values (km/decisions-spike fix 4):
 * primitives via Object.is, arrays element-wise, plain objects by key.
 * Reference equality would mark every array/object answer "changed".
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  const aRecord = a as Record<string, unknown>;
  const bRecord = b as Record<string, unknown>;
  const aKeys = Object.keys(aRecord);
  const bKeys = Object.keys(bRecord);
  return (
    aKeys.length === bKeys.length &&
    aKeys.every(
      (k) =>
        Object.prototype.hasOwnProperty.call(bRecord, k) &&
        deepEqual(aRecord[k], bRecord[k]),
    )
  );
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
      (e?.value === undefined || !deepEqual(a.value, e.value))
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
