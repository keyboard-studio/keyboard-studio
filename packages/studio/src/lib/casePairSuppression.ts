// casePairSuppression — the orthographic-convention override on top of
// Unicode's Lu/Ll case-pair machinery.
//
// Lives in studio `lib/` (not `editors/assignLoop/` and not the engine's
// `character-discovery/casePair.ts`) so both `editors/assignLoop` and
// `survey` — which each need this predicate but must not depend on each
// other (survey -> editors is a layering inversion) — share one neutral
// module instead of one importing it from the other.

/**
 * Scripts where Unicode's Lu/Ll case-pair machinery reports a formal
 * uppercase mapping that does NOT correspond to a Shift-layer relationship in
 * ordinary orthographic practice. Currently Georgian only — see the comment
 * at the `propose` call site (in `editors/assignLoop/casePairCompanion.ts`)
 * for the corpus evidence. Add a script here only on the same kind of
 * evidence (a real keyboard whose Shift layer doesn't case-shift it, ideally
 * corroborated by the facet classifier), never on a hunch; Cherokee is
 * Unicode-bicameral in the same technical sense and is deliberately NOT
 * listed — it keeps proposing.
 *
 * Exported so other case-pair-adjacent proposal paths (e.g.
 * `survey/placementSeeds.ts`'s S-08 case-pair suggestion fallback) can apply
 * the SAME suppression without a second copy of the script test — see
 * FR-002 "no second casing path" at the top of `casePairCompanion.ts`.
 */
export function isOrthographicallyUnicameral(char: string): boolean {
  return /\p{Script=Georgian}/u.test(char);
}
