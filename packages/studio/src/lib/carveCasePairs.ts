/**
 * carveCasePairs — the US4 trim unit for cased letters (spec 051, FR-011..FR-015).
 *
 * The carve gallery must trim a cased letter and its counterpart together — mapping
 * adds both cases, so removal should remove both (FR-011) — but it must never invent
 * a second casing path to decide what "together" means (FR-012). This module is built
 * entirely on the engine's `caseCounterpart` (see
 * packages/engine/src/character-discovery/casePair.ts), the same primitive the
 * shift-layer proposal gallery uses, so the two surfaces cannot disagree about what a
 * case pair is (spec Definitions) — by construction, not by convention.
 *
 * Why a REFERENCE SET, not the inverse of the built-in lowercasing method
 * -------------------------------------------------------------------------
 * The tempting shortcut is: given an uppercase `upper`, its lowercase members are
 * `{ the single result of lowercasing upper }`. That is wrong, because many-to-one
 * folds are real and verified (research.md SS R7):
 *
 *   s U+0073, ſ U+017F              -> both fold to S U+0053
 *   i U+0069, ı U+0131 (locale-insensitive) -> both fold to I U+0049
 *   mu U+03BC, micro-sign U+00B5    -> both fold to capital mu U+039C
 *
 * Lowercasing `upper` directly returns exactly ONE member of a pair like this. An
 * inverse-based model would silently drop the other member from the group and retire
 * a shared uppercase before every referent trimmed — exactly the FR-013 bug this
 * module exists to avoid. Instead, `lowers` is a reference set: every produced
 * lowercase character whose OWN `caseCounterpart` points at `upper`, found by scanning
 * the produced set. This is asymmetric work (one call to `caseCounterpart` per
 * produced character) but the produced set is already bounded and small, and it is
 * the only way to recover a many-to-one fold through a bidirectional primitive.
 *
 * Note for anyone reaching for the spec's own Latin-a / Greek-alpha example as a test
 * fixture: it does NOT hold. Greek alpha (a, U+03B1) uppercases to Alpha (U+0391), not
 * Latin A (U+0041) — there is no cross-script fold there. Use the grounded fixtures in
 * the module's own tests instead (case-pairing.md's test surface).
 *
 * The retire rule (FR-013, data-model SS4.3)
 * -------------------------------------------
 * A shared uppercase is retained while at least one of its lowercase referents is NOT
 * in the trim set, and retired only once every referent is:
 *
 *   retireUpper(upper)  <=>  lowers(upper) \ (trimSet u {ch}) = empty
 *
 * Trimming `ſ` out of `{ s, ſ, S }` keeps `S` (because `s` still references it); a
 * later trim of `s` (told about `ſ` via `alsoTrimming`) then retires it.
 *
 * The uppercase-trim direction (FR-011, "removal removes both")
 * ----------------------------------------------------------------
 * Trimming a LOWERCASE member only ever removes that one character plus, conditionally,
 * the shared uppercase (the retire rule above) — it never reaches for sibling
 * lowercases sharing the same uppercase, because those are separate produced
 * characters with their own trim decisions.
 *
 * Trimming the UPPERCASE member is different: there is no partial-retire question to
 * ask (the uppercase has no "referents of its own" to preserve), so the whole group —
 * upper plus every lower — is the trim unit. This is FR-011's bidirectionality: the
 * pair trims together in EITHER direction. The escape hatch for an author who wants to
 * keep one lowercase while dropping the uppercase and its other referents is the
 * per-chip cascade (declining the paired proposal row and trimming a single character
 * directly) — documented in contracts/case-pairing.md SS"Proposal-row granularity" and
 * not reimplemented here.
 */

import { caseCounterpart } from '@keyboard-studio/engine';

export interface CaseGroup {
  /** The uppercase produced character, or null when there is none in the produced set. */
  upper: string | null;
  /** Produced lowercase characters that case-map to `upper` — the reference set (FR-013). */
  lowers: string[];
}

/**
 * Resolve the case group `ch` belongs to, within `produced`. Total — never throws,
 * never returns null (a character with no case counterpart is still a valid,
 * single-member group).
 */
export function caseGroupFor(
  ch: string,
  produced: ReadonlySet<string>,
  bcp47: string | undefined,
): CaseGroup {
  const pair = caseCounterpart(ch, bcp47);

  if (pair === null) {
    return { upper: null, lowers: [ch] };
  }

  const upper = pair.direction === 'toUpper'
    ? (produced.has(pair.counterpart) ? pair.counterpart : null)
    : ch;

  if (upper === null) {
    return { upper: null, lowers: [ch] };
  }

  const lowers = [...produced]
    .filter((candidate) => caseCounterpart(candidate, bcp47)?.counterpart === upper)
    .sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0));

  return { upper, lowers };
}

/**
 * Characters that must trim together when `ch` is trimmed, given the trim set already
 * accumulated in the same action (`alsoTrimming`, used to resolve the retire rule
 * across a multi-character trim — see the module doc's "retire rule" section).
 */
export function caseTrimSet(
  ch: string,
  produced: ReadonlySet<string>,
  bcp47: string | undefined,
  alsoTrimming?: ReadonlySet<string>,
): Set<string> {
  const group = caseGroupFor(ch, produced, bcp47);

  if (group.upper === null) {
    return new Set([ch]);
  }

  if (ch === group.upper) {
    // Trimming the uppercase member: no partial-retire question to ask (the
    // uppercase has no referents of its own to preserve) — the whole group is
    // the trim unit (FR-011 "removal removes both").
    return new Set([group.upper, ...group.lowers]);
  }

  // Trimming a lowercase member: retire the shared uppercase only once every
  // other referent is also being trimmed (FR-013).
  const alreadyTrimming = alsoTrimming ?? new Set<string>();
  const remainingReferents = group.lowers.filter(
    (l) => l !== ch && !alreadyTrimming.has(l),
  );

  const trimSet = new Set<string>([ch]);
  if (remainingReferents.length === 0) {
    trimSet.add(group.upper);
  }
  return trimSet;
}
