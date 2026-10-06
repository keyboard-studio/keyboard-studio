// Shared evaluator for the survey's YAML condition grammar:
//   value == 'x' | value != 'x' | ctx.field == 'x' | ctx.field != 'x'
//   <expr> or <expr> | <expr> and <expr>      (`or` binds loosest)
//
// Callers differ only in where the left-hand side comes from (a live answer
// plus survey context, or a DecisionSet entry) and in how an unmappable
// clause behaves, so both are parameters.

/** Resolve a left-hand side ("value" or "ctx.<field>"); undefined = unmappable. */
export type ConditionResolver = (lhs: string) => string | undefined;

/**
 * Evaluate a condition. Returns `undefined` when a clause is unmappable
 * (resolver gave undefined) or the grammar is unrecognized.
 *
 * - `propagate: true`  — any undefined clause makes an `or` / `and` undefined
 *   (the caller can then fail open per condition).
 * - `propagate: false` — an undefined clause counts as false and the
 *   combinators still decide (the live-survey behaviour).
 */
export function evalConditionGrammar(
  condition: string,
  resolve: ConditionResolver,
  propagate: boolean,
): boolean | undefined {
  const combine = (
    clauses: string[],
    reduce: (results: Array<boolean | undefined>) => boolean,
  ): boolean | undefined => {
    const results = clauses.map((c) => evalConditionGrammar(c.trim(), resolve, propagate));
    if (propagate && results.some((r) => r === undefined)) return undefined;
    return reduce(results);
  };

  const orClauses = condition.split(" or ");
  if (orClauses.length > 1) return combine(orClauses, (rs) => rs.some((r) => r === true));

  const andClauses = condition.split(" and ");
  if (andClauses.length > 1) return combine(andClauses, (rs) => rs.every((r) => r === true));

  const eq = condition.match(/^(value|ctx\.\w+)\s*==\s*'([^']*)'$/);
  if (eq !== null) {
    const lhsVal = resolve(eq[1]!);
    return lhsVal === undefined ? undefined : lhsVal === eq[2]!;
  }

  const ne = condition.match(/^(value|ctx\.\w+)\s*!=\s*'([^']*)'$/);
  if (ne !== null) {
    const lhsVal = resolve(ne[1]!);
    return lhsVal === undefined ? undefined : lhsVal !== ne[2]!;
  }

  return undefined;
}
