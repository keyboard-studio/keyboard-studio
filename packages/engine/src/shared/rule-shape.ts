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

/**
 * True for the codec's synthetic keystroke-boundary separator — the `+`
 * token the parser inserts as a `{kind:"raw", text:"+"}` context element to
 * mark where pre-context ends and the matched keystroke begins (see
 * emit.ts's `hasInlinePlus`). It is a codec/round-trip artifact, not a real
 * kmcmplib context item, so shape/pairing predicates that count or resolve
 * context positions must exclude it first.
 */
export function isPlusSeparator(el: { kind: string; text?: string }): boolean {
  return el.kind === "raw" && el.text?.trim() === "+";
}
