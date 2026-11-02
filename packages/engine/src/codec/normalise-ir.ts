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
 *   field not caught by the plain nodeId strip). Dropped outright (not
 *   placeholder-replaced) so a fragment that the #2404 dependency pass
 *   relocated across the pre-begin/group boundary — present on one side,
 *   absent on the other — still compares equal.
 * - Strip `storeSketch` on RawKmnFragment — a lenient parser annotation
 *   derived from *earlier* stores, so an IR filtered in place (e.g. by
 *   carveFilterIr) keeps the pre-filter sketch while a re-parse recomputes it.
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
      // Dropped (not placeholder-replaced): the #2404 dependency pass may
      // relocate a store-declaration fragment across the pre-begin/group
      // boundary, so one side can lack groupNodeId while the other has it.
      // A "__stripped__" placeholder would preserve that presence difference
      // and report a spurious divergence.
      if (key === "groupNodeId") return undefined;
      if (key === "storeSketch") return undefined;
      if (key === "anchorRef" && value != null && typeof value === "object") {
        return { ...(value as object), nodeId: "__stripped__" };
      }
      if (key === "comments") return [];
      return value;
    })
  ) as {
    stores: Array<{ name: string }>;
    raw: Array<{ reason: string; sourceText: string }>;
    [k: string]: unknown;
  };

  clone.stores.sort((a, b) => a.name.localeCompare(b.name));
  // Sort raw by (reason, sourceText): fragment order is not semantically
  // significant — store declarations are global/position-independent — and
  // the #2404 dependency pass legitimately reorders same-reason declarations
  // (e.g. two outs-expansion fragments) to satisfy declaration-before-use. A
  // reason-only sort is stable, so it would report a spurious divergence on
  // re-parse whenever two same-reason fragments swap relative order.
  clone.raw.sort(
    (a, b) =>
      a.reason.localeCompare(b.reason) ||
      a.sourceText.localeCompare(b.sourceText),
  );

  return clone;
}
