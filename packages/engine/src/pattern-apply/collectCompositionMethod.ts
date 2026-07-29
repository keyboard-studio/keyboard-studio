/**
 * collectCompositionMethod — synthesizes an "Existing methods" row for a
 * character the base keyboard does not directly produce but that IS
 * composable from characters it does produce (spec follow-up, "SHOW-ALL":
 * every green-badged character in the mechanism/touch galleries must render
 * >= 1 "inputs -> character" row).
 *
 * Delegates the actual NFD-decompose-and-check rule to
 * `composableComponentsFor` (@keyboard-studio/contracts) — the one place that
 * rule lives (shared with `augmentWithComposable`, the badge/coverage
 * augmenter). This function adds only:
 *   - the "already directly produced" early-out (a directly-produced char
 *     already has real method rows from `collectCharContributors` — no
 *     synthesized row is needed, or wanted, alongside those);
 *   - wrapping the result as a `ContributorDescriptor` so the studio can
 *     render it through the SAME `composeContributorLabel` composer every
 *     other contributor kind goes through.
 *
 * IMPORTANT — ONE LEVEL only: `baseProduced` MUST be the BASE (pre-
 * `augmentWithComposable`) produced/covered set, never an already-augmented
 * one. `composableComponentsFor` itself has no recursion guard of its own —
 * passing an augmented set would let two composable chars chain (A composes
 * from B, B composes from C) two levels deep, which the "ONE LEVEL only"
 * contract (see composable.ts's doc comment) forbids.
 */

import { composableComponentsFor } from "@keyboard-studio/contracts";
import type { ContributorDescriptor } from "./collectCharContributors.js";

/**
 * @param baseProduced - The BASE (pre-augmentation) set of glyphs the
 *                       keyboard directly produces/reaches.
 * @param targetChar   - The character to synthesize a composition method for.
 * @returns             A `{ kind: "composition" }` descriptor when `targetChar`
 *                      is composable from `baseProduced` and not itself
 *                      already a member of it; `undefined` otherwise.
 */
export function collectCompositionMethod(
  baseProduced: ReadonlySet<string>,
  targetChar: string,
): ContributorDescriptor | undefined {
  if (baseProduced.has(targetChar)) return undefined;
  const result = composableComponentsFor(baseProduced, targetChar);
  if (result === undefined) return undefined;
  return {
    kind: 'composition',
    producedChar: targetChar,
    producedRole: 'produced',
    components: result.components,
  };
}
