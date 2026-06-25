/**
 * Structural-comparison normaliser for KeyboardIR.
 *
 * Produces a comparison-stable view of an IR so two IRs that are semantically
 * equal but differ only in incidental presentation (minting-order nodeIds,
 * store/raw array order, comment-anchor heuristics) compare equal. Used by the
 * codec round-trip test and the supportability scanner's I2 structural check,
 * which must agree on what "structurally equal" means.
 *
 * - Strip all nodeId strings (IDs are minting-order artefacts, not semantic),
 *   including the nested `anchorRef.nodeId`.
 * - Sort the `stores` array by name so file-order vs canonical-order
 *   differences do not cause false failures.
 * - Sort the `raw` array by reason (order not semantically significant).
 * - Exclude `comments` — anchor assignment is a best-effort heuristic that can
 *   legitimately differ between passes.
 */
import type { KeyboardIR } from "@keyboard-studio/contracts";

export function normaliseForComparison(ir: KeyboardIR): unknown {
  const clone = JSON.parse(
    JSON.stringify(ir, (key, value) => {
      if (key === "nodeId") return "__stripped__";
      if (key === "anchorRef" && value != null && typeof value === "object") {
        return { ...(value as object), nodeId: "__stripped__" };
      }
      if (key === "comments") return [];
      return value;
    })
  ) as {
    stores: Array<{ name: string }>;
    raw: Array<{ reason: string }>;
    [k: string]: unknown;
  };

  clone.stores.sort((a, b) => a.name.localeCompare(b.name));
  clone.raw.sort((a, b) => a.reason.localeCompare(b.reason));

  return clone;
}
