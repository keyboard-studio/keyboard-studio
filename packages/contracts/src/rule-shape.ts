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
 * Every predicate and reader here is **structurally typed** — it takes the
 * minimal `{ kind, text? }` element shape and `{ context, matchKind? }` rule
 * shape rather than a `KeyboardIR` node type — which is what makes the
 * contracts home free of any IR coupling. The two writers (`makeRule`,
 * `withRuleParts`) build a rule and so name the IR rule types, by type-only
 * import (erased at runtime).
 *
 * The engine's `src/shared/rule-shape.ts` re-exports everything here, so
 * existing engine and studio call sites are unchanged.
 */

import type {
  ContextElement,
  IRGroup,
  IRRule,
  OutputElement,
  TargetSelector,
} from "./keyboard-ir.js";

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

// ---------------------------------------------------------------------------
// Readers (spec 116 FR-032..FR-036)
// ---------------------------------------------------------------------------
//
// One splitter for "which part of a rule's context is the keystroke". It
// follows kmcmplib: in a `using keys` group the keystroke is the single
// element after the (last) `+` separator, or the last element when there is no
// separator; outside `using keys` groups there is no keystroke. Offsets
// (`index(s,n)`, `context(n)`) count 1-based over
// `[nul?, ...conditions, ...preContext, keystroke?]`, and the separator is
// never counted (kmcmplib CheckStatementOffsets).

/** The minimal element shape the readers need. */
export interface RuleElementLike {
  kind: string;
  text?: string;
}

/** The minimal rule shape the readers need. */
export interface RuleLike<E extends RuleElementLike = RuleElementLike> {
  context: readonly E[];
  matchKind?: "match" | "nomatch" | undefined;
}

/** The minimal group shape the readers need. */
export interface RuleGroupLike {
  usingKeys: boolean;
}

export type LhsKind = "match" | "nomatch" | "input";

function isNulElement(el: RuleElementLike): boolean {
  return el.kind === "raw" && el.text?.trim().toLowerCase() === "nul";
}

/**
 * A head-cluster condition: an `if()` guard, a `baselayout()` element or a
 * `platform(...)` element (carried by the codec as a raw element). These
 * produce no context character and are never the keystroke.
 */
function isConditionElement(el: RuleElementLike): boolean {
  return (
    el.kind === "if" ||
    el.kind === "baselayout" ||
    (el.kind === "raw" && /^platform\s*\(/i.test(el.text?.trim() ?? ""))
  );
}

interface RuleParts<E extends RuleElementLike> {
  /** Leading `nul` and conditions, in source order. */
  head: E[];
  preContext: E[];
  keystroke: E | undefined;
  extras: E[];
}

function splitRuleParts<E extends RuleElementLike>(
  rule: RuleLike<E>,
  usingKeys: boolean,
): RuleParts<E> {
  const ctx = rule.context;
  if (rule.matchKind !== undefined) {
    return { head: [], preContext: [], keystroke: undefined, extras: [] };
  }
  let i = 0;
  const head: E[] = [];
  while (i < ctx.length) {
    const el = ctx[i] as E;
    if (isNulElement(el) || isConditionElement(el)) {
      head.push(el);
      i++;
      continue;
    }
    break;
  }
  const body = ctx.slice(i);
  let sepIdx = -1;
  for (let k = body.length - 1; k >= 0; k--) {
    if (isPlusSeparator(body[k] as E)) {
      sepIdx = k;
      break;
    }
  }
  const nonSep = (els: readonly E[]): E[] => els.filter((el) => !isPlusSeparator(el));
  if (!usingKeys) {
    return { head, preContext: nonSep(body), keystroke: undefined, extras: [] };
  }
  if (sepIdx === -1) {
    const els = nonSep(body);
    const keystroke = els[els.length - 1];
    return { head, preContext: els.slice(0, -1), keystroke, extras: [] };
  }
  const after = nonSep(body.slice(sepIdx + 1));
  return {
    head,
    preContext: nonSep(body.slice(0, sepIdx)),
    keystroke: after[0],
    extras: after.slice(1),
  };
}

/** `match`/`nomatch` group-transition rule, or an ordinary `input` rule. */
export function ruleLhsKind(rule: { matchKind?: "match" | "nomatch" | undefined }): LhsKind {
  return rule.matchKind ?? "input";
}

/** True when the rule's head carries a `nul` context element. */
export function ruleHasNulContext(rule: RuleLike): boolean {
  if (rule.matchKind !== undefined) return false;
  for (const el of rule.context) {
    if (isNulElement(el)) return true;
    if (!isConditionElement(el)) return false;
  }
  return false;
}

/** The head run of conditions (`if`, `baselayout`, `platform`), excluding `nul`. */
export function ruleConditions<E extends RuleElementLike>(rule: RuleLike<E>): E[] {
  // The head run does not depend on the group.
  return splitRuleParts(rule, false).head.filter((el) => !isNulElement(el));
}

/** The context elements between the head run and the keystroke; no separator, no `nul`. */
export function rulePreContext<E extends RuleElementLike>(
  rule: RuleLike<E>,
  group: RuleGroupLike,
): E[] {
  return splitRuleParts(rule, group.usingKeys).preContext;
}

/**
 * The keystroke element, or `undefined` for a `match`/`nomatch` rule and for any
 * rule in a group that is not `using keys`.
 */
export function ruleKeystroke<E extends RuleElementLike>(
  rule: RuleLike<E>,
  group: RuleGroupLike,
): E | undefined {
  return splitRuleParts(rule, group.usingKeys).keystroke;
}

/**
 * LOOSE variant for call sites that have no group in scope: it assumes a
 * `using keys` group, so "has a separator, or a last element" is the only
 * signal. Every use is a review flag; prefer {@link ruleKeystroke}.
 */
export function ruleKeystrokeLoose<E extends RuleElementLike>(rule: RuleLike<E>): E | undefined {
  return splitRuleParts(rule, true).keystroke;
}

/**
 * Every context element of a rule in source order with the `+` separator
 * removed: `[nul?, ...conditions, ...preContext, keystroke?, ...extras]`. For
 * shape scans that look at the whole left-hand side and have no group in scope,
 * hence the loose keystroke reader.
 */
export function ruleContextElements<E extends RuleElementLike>(rule: RuleLike<E>): E[] {
  const parts = splitRuleParts(rule, true);
  return [
    ...parts.head,
    ...parts.preContext,
    ...(parts.keystroke !== undefined ? [parts.keystroke] : []),
    ...parts.extras,
  ];
}

/** Elements after the first keystroke element; kmcmplib warns and ignores them. */
export function ruleExtraKeystrokeElements<E extends RuleElementLike>(
  rule: RuleLike<E>,
  group: RuleGroupLike,
): E[] {
  return splitRuleParts(rule, group.usingKeys).extras;
}

/**
 * The context element an `index(s,n)` / `context(n)` offset names. `n` is 1-based
 * over `[nul?, ...conditions, ...preContext, keystroke?]` as written in source;
 * the `+` separator is never counted.
 */
export function elementAtOffset<E extends RuleElementLike>(
  rule: RuleLike<E>,
  group: RuleGroupLike,
  n: number,
): E | undefined {
  if (!Number.isInteger(n) || n < 1) return undefined;
  const parts = splitRuleParts(rule, group.usingKeys);
  const list: E[] = [...parts.head, ...parts.preContext];
  if (parts.keystroke !== undefined) list.push(parts.keystroke);
  return list[n - 1];
}

// ---------------------------------------------------------------------------
// Writers (spec 116 FR-036)
// ---------------------------------------------------------------------------

export interface MakeRuleParts {
  lhsKind?: LhsKind;
  nulContext?: boolean;
  conditions?: ContextElement[];
  preContext?: ContextElement[];
  keystroke?: ContextElement;
  output: OutputElement[];
  nodeId: string;
  trailingComment?: string;
  targetSelector?: TargetSelector;
  ownedByPattern?: string;
  ownedByBehaviour?: string;
  rulesStepAdded?: true;
  sourceLine?: number;
}

/**
 * Build an `IRRule` from its parts, in exactly the shape the codec parser
 * produces. The `+` separator is written only when there is a `nul`,
 * condition or pre-context AND a keystroke in a `using keys` group.
 */
export function makeRule(parts: MakeRuleParts, group: Pick<IRGroup, "usingKeys">): IRRule {
  const lhsKind = parts.lhsKind ?? "input";
  const context: ContextElement[] = [];
  if (lhsKind === "input") {
    if (parts.nulContext === true) context.push({ kind: "raw", text: "nul" });
    context.push(...(parts.conditions ?? []));
    const pre = parts.preContext ?? [];
    const hasLead = context.length > 0 || pre.length > 0;
    context.push(...pre);
    if (parts.keystroke !== undefined) {
      if (hasLead && group.usingKeys) context.push({ kind: "raw", text: "+" });
      context.push(parts.keystroke);
    }
  }
  const rule: IRRule = { nodeId: parts.nodeId, context, output: parts.output };
  if (parts.trailingComment !== undefined) rule.trailingComment = parts.trailingComment;
  if (lhsKind !== "input") rule.matchKind = lhsKind;
  if (parts.targetSelector !== undefined) rule.targetSelector = parts.targetSelector;
  if (parts.ownedByPattern !== undefined) rule.ownedByPattern = parts.ownedByPattern;
  if (parts.ownedByBehaviour !== undefined) rule.ownedByBehaviour = parts.ownedByBehaviour;
  if (parts.rulesStepAdded !== undefined) rule.rulesStepAdded = parts.rulesStepAdded;
  if (parts.sourceLine !== undefined) rule.sourceLine = parts.sourceLine;
  return rule;
}

/**
 * Return a NEW rule with the given parts replaced; the rest are read back from
 * `rule`. Never mutates `rule`.
 */
export function withRuleParts(
  rule: IRRule,
  group: Pick<IRGroup, "usingKeys">,
  patch: Partial<Pick<MakeRuleParts, "nulContext" | "conditions" | "preContext" | "output" | "lhsKind">> & {
    /** Pass `undefined` explicitly to remove the keystroke. */
    keystroke?: ContextElement | undefined;
  },
): IRRule {
  const keystroke = "keystroke" in patch ? patch.keystroke : ruleKeystroke(rule, group);
  const parts: MakeRuleParts = {
    lhsKind: patch.lhsKind ?? ruleLhsKind(rule),
    nulContext: patch.nulContext ?? ruleHasNulContext(rule),
    conditions: patch.conditions ?? ruleConditions(rule),
    preContext: patch.preContext ?? rulePreContext(rule, group),
    output: patch.output ?? rule.output,
    nodeId: rule.nodeId,
  };
  if (keystroke !== undefined) parts.keystroke = keystroke;
  if (rule.trailingComment !== undefined) parts.trailingComment = rule.trailingComment;
  if (rule.targetSelector !== undefined) parts.targetSelector = rule.targetSelector;
  if (rule.ownedByPattern !== undefined) parts.ownedByPattern = rule.ownedByPattern;
  if (rule.ownedByBehaviour !== undefined) parts.ownedByBehaviour = rule.ownedByBehaviour;
  if (rule.rulesStepAdded !== undefined) parts.rulesStepAdded = rule.rulesStepAdded;
  if (rule.sourceLine !== undefined) parts.sourceLine = rule.sourceLine;
  return makeRule(parts, group);
}
