/**
 * rule-shape — small rule-element-shape predicates that both the engine and
 * the contracts-layer utilities need to recognize identically.
 *
 * These live here rather than in the engine because contracts is the
 * dependency root: `@keymanapp/keyboard-lint` and the contracts-layer IR
 * utilities (`./ir/*`, `./touch-key-rule-join`) cannot import engine, and a
 * second copy of a predicate this load-bearing is exactly the kind of drift
 * the single-source rule exists to prevent.
 *
 * Every predicate here is **structurally typed** — it takes the minimal
 * `{ kind, text? }` shape rather than a `KeyboardIR` node type — which is what
 * makes the contracts home free of any IR coupling.
 *
 * The engine's `src/shared/rule-shape.ts` re-exports `isPlusSeparator` from
 * here, so existing engine and studio call sites are unchanged.
 */

/**
 * True for the codec's synthetic keystroke-boundary separator — the `+`
 * token the parser inserts as a `{kind:"raw", text:"+"}` context element to
 * mark where pre-context ends and the matched keystroke begins (see the
 * codec emitter's `hasInlinePlus`). It is a codec/round-trip artifact, not a
 * real kmcmplib context item, so shape/pairing predicates that count or
 * resolve context positions must exclude it first.
 *
 * The touch key↔rule join's struck-key resolution (§2.1) depends on this:
 * the struck key is the first vkey element *after* plus-separators are
 * filtered out, and a join that skipped the filter would resolve the
 * separator itself on any rule written with an inline `+`.
 */
export function isPlusSeparator(el: { kind: string; text?: string }): boolean {
  return el.kind === "raw" && el.text?.trim() === "+";
}
