/**
 * Small rule-output-shape predicates shared across engine submodules
 * (pattern-apply, recognizer) that need to recognize the same IR shapes
 * without creating a directional dependency between those submodules.
 */

/**
 * True when a rule's ENTIRE output is exactly one `{kind:"deadkey"}` element.
 * This is the output-shape half of "is this an S-02 deadkey trigger rule";
 * callers that also need to check context do so themselves.
 */
export function isDeadkeyOnlyOutput(rule: { output: { kind: string }[] }): boolean {
  return rule.output.length === 1 && rule.output[0]?.kind === "deadkey";
}
