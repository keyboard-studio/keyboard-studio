// see spec.md section 5 / section 7.2 / section 8 step 4 — PatternLibraryService mock

import type { PatternLibraryService } from "../patternLibrary";
import type { Pattern } from "../pattern";
import type { BaseKeyboard } from "../baseKeyboard";
import type { DiscoveryAxisVector } from "../axes";
import type { PatternMatch, PatternMatchReason } from "../patternMatch";
import { samplePatterns } from "../fixtures/index";

/** In-memory index keyed by Pattern.id. */
const byId = new Map<string, Pattern>(
  samplePatterns.map((p) => [p.id, p])
);

/**
 * In-memory mock of {@link PatternLibraryService}.
 * Returns fixture data without invoking the real implementation.
 * @see spec.md §5 / §7.2 / §8 step 4
 */
export const mockPatternLibrary: PatternLibraryService = {
  listAll(): Promise<Pattern[]> {
    return Promise.resolve([...samplePatterns].sort((a, b) =>
      a.id.localeCompare(b.id)
    ));
  },

  getById(id: string): Promise<Pattern | undefined> {
    return Promise.resolve(byId.get(id));
  },

  filterFor(
    base: BaseKeyboard,
    axes?: DiscoveryAxisVector
  ): Promise<PatternMatch[]> {
    // MOCK ONLY — not a faithful subset of §7.2. The real
    // PatternLibraryService implementation must run the full 12-rule
    // decision tree. The single-line "multi-family -> S-02" heuristic
    // below exists so unit tests can observe rank changes when axes are
    // provided; the mapping itself is NOT in spec.md §7.2 and must not
    // be treated as authoritative.
    //
    // Behavior:
    // 1. Patterns whose appliesTo includes base.script (or is empty) qualify.
    // 2. If axes is provided and a pattern's strategyId matches S-02, rank
    //    it first with reason "primary-strategy"; other qualified patterns
    //    get reason "appliesTo-match".
    // 3. Without axes, every qualified pattern gets reason "appliesTo-match".
    // 4. Reorder patterns always included (mock does not apply Three-group exclusion).
    const qualified = samplePatterns.filter(
      (p) =>
        p.appliesTo.length === 0 ||
        p.appliesTo.includes(base.script) ||
        p.appliesTo.includes(base.id)
    );

    const toMatch = (p: Pattern, rank: number, reason: PatternMatchReason): PatternMatch => ({
      patternId: p.id,
      rank,
      reason,
      ...(p.strategyId !== undefined ? { strategyId: p.strategyId } : {}),
    });

    if (axes === undefined) {
      const matches = qualified.map((p, i) => toMatch(p, i + 1, "appliesTo-match"));
      return Promise.resolve(matches);
    }

    const isPrimary = axes.diacriticBehavior === "multi-family"
      ? (p: Pattern) => p.strategyId === "S-02"
      : (_p: Pattern) => false;

    const primaries = qualified.filter(isPrimary);
    const rest = qualified.filter((p) => !isPrimary(p));
    const ranked: PatternMatch[] = [
      ...primaries.map((p, i) => toMatch(p, i + 1, "primary-strategy")),
      ...rest.map((p, i) => toMatch(p, primaries.length + i + 1, "appliesTo-match")),
    ];
    return Promise.resolve(ranked);
  },
};
