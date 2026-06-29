import type { IRRule } from "@keyboard-studio/contracts";

/**
 * isParallelIndexFanOut -- predicate for parallel-store fan-out rules.
 *
 * Returns true iff the rule has the shape:
 *   [dk(D)*, any(BASE)] > index(OUT, N)
 * where N === context.length (the offset-alignment invariant).
 *
 * Alignment invariant: the index() offset must equal the context length so that
 * the `any()` element and the `index()` output refer to the same position in their
 * respective parallel stores.  Without this check, misaligned rules (e.g. a rule
 * with offset hardcoded to a wrong value) would be wrongly classified removable.
 *
 * Pre-terminal elements: every context element before the terminal `any()` must
 * have kind === "deadkey".  This means:
 *   - A bare-any rule [any(BASE)] > index(OUT, 1)     (Bamum style) passes.
 *   - A dk+any rule  [dk(D), any(BASE)] > index(OUT, 2) (S-02 body style) passes.
 *   - A rule with context(N), char, or any in a non-terminal slot is REJECTED and
 *     left for the context-sensitive branch.
 *
 * This predicate is a strict superset of isBody() in s02-deadkey-single-tap.ts:
 *   isBody() requires context.length === 2, pre-terminal === [deadkey], offset === 2.
 *   isParallelIndexFanOut() generalises to any context.length >= 1, offset === context.length,
 *   and pre-terminals all deadkey (or none, for bare-any rules).
 */
export function isParallelIndexFanOut(rule: IRRule): boolean {
  // Output must be exactly one index() element.
  if (rule.output.length !== 1) return false;
  const outEl = rule.output[0];
  if (outEl === undefined || outEl.kind !== "index") return false;

  // Context must have at least one element (the terminal any()).
  if (rule.context.length < 1) return false;

  // Terminal context element must be any().
  const terminal = rule.context[rule.context.length - 1];
  if (terminal === undefined || terminal.kind !== "any") return false;

  // Alignment invariant: offset must equal context.length.
  if (outEl.offset !== rule.context.length) return false;

  // Pre-terminal elements (all except the last) must all be deadkey.
  const preTerminal = rule.context.slice(0, -1);
  for (const el of preTerminal) {
    if (el.kind !== "deadkey") return false;
  }

  return true;
}
