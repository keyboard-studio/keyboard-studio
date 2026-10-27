// Expands the keyboard-wide fallback policy into the per-combination
// dispositions the carve-suppression compiler consumes (FR-020..FR-022).
//
// Only the SOURCE of the decision moved (per-combo records -> one policy);
// `compileCarveSuppression` is unchanged, including its deadkey backstop:
// it coerces `allow-host` on a deadkey-context rule back to `block`, so a
// `pass-through` policy can never leave a deadkey armed.

import type { CarveDisposition, FallbackPolicy } from "@keyboard-studio/contracts";

/**
 * One disposition per carved combo id, all carrying the policy's value.
 * `comboIds` is the live carve set (deletedNodeIds union deletedItemIds);
 * ids that are not rules or store slots are ignored by the compiler.
 * Duplicates are collapsed; order follows first appearance.
 */
export function dispositionsForFallbackPolicy(
  policy: FallbackPolicy,
  comboIds: Iterable<string>,
): CarveDisposition[] {
  const disposition = policy === "pass-through" ? "allow-host" : "block";
  const seen = new Set<string>();
  const out: CarveDisposition[] = [];
  for (const comboId of comboIds) {
    if (seen.has(comboId)) continue;
    seen.add(comboId);
    out.push({ comboId, disposition, provenance: "bulk-default" });
  }
  return out;
}
