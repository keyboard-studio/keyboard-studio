// Walk policy -- which of the product's offered options the author takes
// (spec 107 FR-015). Precedence: override > top suggestion > default >
// placeholder. This returns the choice only; it builds no decision value (bar
// the placeholder, supplied by the caller) and writes nothing. The driver
// applies the choice through the function the UI control's handler calls.

import type { PolicyStep } from "./caseTypes.ts";

export interface PolicyInput<T> {
  decisionId: string;
  /** A case-supplied value (harness override). */
  override?: T;
  /** The product's ranked suggestions; the first is the one it pre-selects. */
  suggestions: readonly T[];
  /** The product's default for the decision. */
  defaultValue?: T;
  /** Types the zzq placeholder when nothing is offered. */
  placeholder?: () => T;
  /** The product function the suggestions/default came from. */
  proposalSource?: string;
}

export function chooseByPolicy<T>(input: PolicyInput<T>): PolicyStep & { value: T } {
  const { decisionId, proposalSource } = input;
  const make = (rule: PolicyStep["rule"], value: T, withSource: boolean): PolicyStep & { value: T } => {
    const s: PolicyStep & { value: T } = { decisionId, rule, value };
    if (withSource && proposalSource !== undefined) s.proposalSource = proposalSource;
    return s;
  };
  if (input.override !== undefined) return make("override", input.override, false);
  const top = input.suggestions[0];
  if (top !== undefined) return make("top-suggestion", top, true);
  if (input.defaultValue !== undefined) return make("default", input.defaultValue, true);
  if (input.placeholder !== undefined) return make("placeholder", input.placeholder(), false);
  throw new Error(`walk policy: no option available for decision "${decisionId}"`);
}
