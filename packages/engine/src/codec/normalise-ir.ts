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
 * - Strip `sourceLine` — a parser annotation, not a semantic field of the IR
 *   contract; after emit→re-parse line numbers change because the canonical
 *   emitter reflows the file (blank lines, store order).
 * - Strip `groupNodeId` on RawKmnFragment — holds a minted group nodeId; after
 *   emit→re-parse the owning group gets a new minted id (a differently-named
 *   field not caught by the plain nodeId strip).
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
      if (key === "sourceLine") return undefined;
      if (key === "groupNodeId") return "__stripped__";
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
