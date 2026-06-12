// PatternLibraryService.filterFor() — strategy-ranked pattern matching (spec §7.2 §9).

import type { BaseKeyboard, DiscoveryAxisVector, Pattern, PatternMatch } from "@keyboard-studio/contracts";
import { getPatterns } from "./loader.js";
import { selectStrategy } from "../strategy-selector/index.js";

const toMatch = (p: Pattern, rank: number, reason: PatternMatch["reason"]): PatternMatch => ({
  patternId: p.id,
  rank,
  reason,
  ...(p.strategyId !== undefined ? { strategyId: p.strategyId } : {}),
});

/**
 * Return strategy-ranked pattern matches for the given base keyboard.
 *
 * If `axes` is provided:
 *   1. Run the §7.2 decision tree via {@link selectStrategy}.
 *   2. Partition eligible patterns into:
 *      - `primary`: patterns whose `strategyId` equals the recommended primary.
 *      - `secondary`: patterns whose `strategyId` appears in secondaries.
 *      - `appliesToOnly`: remaining eligible patterns (`appliesTo` is empty or
 *        includes `base.script`).
 *   3. Concatenate in that order and assign ascending ranks.
 *
 * If `axes` is omitted:
 *   Return all eligible patterns with `reason: "appliesTo-match"`, ranked
 *   ascending from 1.
 *
 * Reorder-category patterns are excluded for Latin-script keyboards (§9
 * Three-group routing — Latin/QWERTY group receives NFD normalization
 * automatically and does not need curated reorder patterns).
 *
 * @param base  - The chosen base keyboard; `script` drives appliesTo matching
 *               and Three-group routing.
 * @param axes  - Optional fully-computed discovery axis vector (§7.1).
 *   Must be fully elicited (all required fields present) before passing;
 *   `session.axes` from {@link SurveySession} is `Partial` until Phase B completes.
 * @returns Strategy-ranked pattern matches for the gallery.
 *
 * @see spec.md §7.2
 * @see spec.md §8 step 4
 * @see spec.md §9
 * Module-level function satisfying {@link PatternLibraryService}.filterFor (consistent with getPatterns/getById).
 */
export async function filterFor(
  base: BaseKeyboard,
  axes?: DiscoveryAxisVector,
): Promise<PatternMatch[]> {
  const all = getPatterns();

  // §9 Three-group routing: exclude reorder patterns for Latin-script keyboards.
  const eligible =
    base.script === "Latn" ? all.filter(p => p.category !== "reorder") : all;

  if (axes === undefined) {
    // No axis vector — return appliesTo-matched patterns in cache order.
    const matches = eligible.filter(
      p => p.appliesTo.length === 0 || p.appliesTo.includes(base.script),
    );

    return matches.map((p, idx) => toMatch(p, idx + 1, "appliesTo-match"));
  }

  // Axis vector present — run decision tree and partition.
  const rec = selectStrategy(axes);

  const primaryPatterns: typeof eligible = [];
  const secondaryPatterns: typeof eligible = [];
  const appliesToOnlyPatterns: typeof eligible = [];

  for (const p of eligible) {
    if (p.strategyId === rec.primary) {
      primaryPatterns.push(p);
    } else if (p.strategyId !== undefined && rec.secondaries.includes(p.strategyId)) {
      secondaryPatterns.push(p);
    } else if (
      p.strategyId === undefined &&
      (p.appliesTo.length === 0 || p.appliesTo.includes(base.script))
    ) {
      appliesToOnlyPatterns.push(p);
    }
    // Patterns with a strategyId that matches neither primary nor secondaries are
    // intentionally excluded: they are off-strategy for this keyboard recommendation.
  }

  const ordered = [...primaryPatterns, ...secondaryPatterns, ...appliesToOnlyPatterns];

  return ordered.map((p, idx) => {
    const rank = idx + 1;
    const reason: PatternMatch["reason"] =
      p.strategyId === rec.primary
        ? "primary-strategy"
        : p.strategyId !== undefined && rec.secondaries.includes(p.strategyId)
          ? "secondary-strategy"
          : "appliesTo-match";

    return toMatch(p, rank, reason);
  });
}
