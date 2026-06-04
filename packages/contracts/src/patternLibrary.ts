// see spec.md section 5 / section 7.2 / section 8 step 4 — pattern-library service

import type { Pattern } from "./pattern";
import type { BaseKeyboard } from "./baseKeyboard";
import type { DiscoveryAxisVector } from "./axes";
import type { PatternMatch } from "./patternMatch";

/**
 * Service contract for the pattern-library loader.
 *
 * Serves the curated `Pattern[]` catalog to the gallery (§8 step 4).
 * Patterns are parameterized KMN skeletons tagged with a `strategyId`
 * (§5, §7.3). The `filterFor` method runs the §7.2 strategy-selector
 * decision tree and returns patterns ranked by their match to the user's
 * discovery axis vector, mirroring the gallery ordering:
 * primary-strategy patterns first, secondaries next, then any unrestricted
 * patterns whose `appliesTo` matches the base keyboard's script.
 *
 * Implementations own only retrieval and ranking; slot substitution and
 * validation happen outside this service (ValidatorService.validateFragment).
 *
 * @see spec.md §5 (Pattern schema)
 * @see spec.md §7.2 (decision tree)
 * @see spec.md §7.3 (strategy catalog)
 * @see spec.md §8 step 4 (gallery — Phase C)
 */
export interface PatternLibraryService {
  /**
   * Return the complete curated pattern catalog, unfiltered.
   *
   * Ordered by `id` ascending. Includes all categories (desktop, touch,
   * reorder). Callers that need strategy-ranked subsets should use
   * `filterFor()` instead.
   *
   * @returns All patterns in the library.
   * @see spec.md §5
   */
  listAll(): Promise<Pattern[]>;

  /**
   * Fetch a single pattern by its stable snake_case `id`.
   *
   * Returns `undefined` when the id is not in the catalog. Used by the
   * gallery to load a pattern's full detail view (questions, kmnFragment,
   * test vectors) on selection.
   *
   * @param id - Stable pattern identifier (e.g. "latin_deadkey_acute_single").
   * @returns The matching Pattern, or undefined.
   * @see spec.md §5
   */
  getById(id: string): Promise<Pattern | undefined>;

  /**
   * Return ranked pattern matches for the given base keyboard and optional
   * axis vector, applying the §7.2 decision tree.
   *
   * Each returned {@link PatternMatch} carries `rank` (1 = top of gallery),
   * `reason` (one of `"primary-strategy"`, `"secondary-strategy"`,
   * `"appliesTo-match"`, `"user-expanded"`), and `patternId` for joining
   * back to the full {@link Pattern} via {@link getById}. The gallery UI is
   * then a pure renderer — it does not infer ordering reasons on its own.
   *
   * When `axes` is provided the decision tree fires and patterns whose
   * `strategyId` matches the primary recommendation are ranked first
   * (`reason: "primary-strategy"`), secondaries next
   * (`reason: "secondary-strategy"`), then patterns whose `appliesTo`
   * includes `base.script` or is empty (`reason: "appliesTo-match"`).
   * When `axes` is omitted only `appliesTo` matching is applied and every
   * match has `reason: "appliesTo-match"`.
   *
   * Reorder-category patterns are included only when the base keyboard's
   * script group (derived from `base.script`, §9) requires curated
   * reorder selection; QWERTY/QWERTZ and AZERTY groups receive NFD
   * normalization automatically and their reorder patterns are excluded
   * from the gallery result.
   *
   * @param base - The chosen base keyboard; its `script` field drives
   *   `appliesTo` matching and Three-group routing (§9).
   * @param axes - Optional fully-computed discovery axis vector (§7.1).
   *   Pass the merged vector after Phase B completes.
   * @returns Strategy-ranked pattern matches for the gallery, highest-ranked first.
   * @see spec.md §7.2
   * @see spec.md §8 step 4 (Phase C gallery ordering)
   * @see PatternMatch
   */
  filterFor(
    base: BaseKeyboard,
    axes?: DiscoveryAxisVector
  ): Promise<PatternMatch[]>;
}
