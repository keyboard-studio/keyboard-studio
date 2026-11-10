/**
 * kmAssist rule classifier — spec 082 Track C read-only v1.
 *
 * Assigns every typed {@link IRRule} one of five display kinds. This is a
 * READ-ONLY assist layer: pure functions, no mutation, no IR writes.
 *
 * Kind definitions (spec 082, Track C):
 * - "plain-output": a single key (possibly with modifiers) producing output.
 *   The rules-step filter hides these by default (FR-023/FR-024: the filter
 *   hides plain key→output rules).
 * - "context": consumes prior context to condition output.
 * - "blocking": output is suppression-only (`nul`, bare `context`, `beep`).
 * - "reorder": output reorders the matched context (`context(N)`).
 * - "opaque": raw/untyped content the assist layer cannot describe honestly.
 *
 * Detection notes (codec realities this file depends on):
 * - `nul`, bare `context`, and `context(N)` in output position currently
 *   parse as `{kind:"raw"}` elements (no typed IR kind exists for them yet);
 *   they are recognised by raw-text match, case-insensitively.
 * - The structural `+` keystroke separator is `{kind:"raw", text:"+"}` and is
 *   filtered out before shape counting (see `isPlusSeparator`).
 * - `platform('…')` context guards and `layer('…')` output directives are
 *   modifiers of the rule's platform behaviour, not its shape; they are
 *   ignored for classification rather than treated as opaque.
 */
import type {
  ContextElement,
  IRRule,
  OutputElement,
} from "@keyboard-studio/contracts";
import {
  hasRawCallPrefix,
  ruleConditions,
  ruleHasNulContext,
  ruleKeystrokeLoose,
  ruleLhsKind,
  rulePreContext,
} from "@keyboard-studio/contracts";

/** Display kind for a typed rule, used by the rules-step filter and views. */
export type RuleKind =
  | "plain-output"
  | "context"
  | "blocking"
  | "reorder"
  | "opaque";

const rawText = (el: { text?: string }): string => (el.text ?? "").trim();

/** Output-side `nul` — swallowed keystroke, no output. Matches the typed
 * 076 FR-004 `{ kind: "nul" }` and the legacy raw-text encoding. */
export function isNulOutput(el: OutputElement): boolean {
  return (
    el.kind === "nul" || (el.kind === "raw" && /^nul$/i.test(rawText(el)))
  );
}

/** Output-side bare `context` — re-emits the matched context, swallowing the
 * key. Matches the typed 076 FR-004 `{ kind: "context", offset: 0 }` and the
 * legacy raw-text encoding. */
export function isBareContextOutput(el: OutputElement): boolean {
  return (
    (el.kind === "context" && el.offset === 0) ||
    (el.kind === "raw" && /^context$/i.test(rawText(el)))
  );
}

/** Output-side `context(N)` — re-emits the Nth matched context item (reorder).
 * Matches the typed 076 FR-004 `{ kind: "context", offset: N }` (N ≥ 1) and
 * the legacy raw-text encoding. */
export function isIndexedContextOutput(el: OutputElement): boolean {
  return (
    (el.kind === "context" && el.offset !== 0) ||
    (el.kind === "raw" && /^context\s*\(\s*\d+\s*\)$/i.test(rawText(el)))
  );
}

/** Context-side `platform('…')` guard — a platform modifier, not shape. */
export function isPlatformGuard(el: ContextElement): boolean {
  return el.kind === "platform" || (el.kind === "raw" && hasRawCallPrefix(rawText(el), "platform"));
}

/** Output-side `layer('…')` directive — a touch-layer modifier, not shape. */
export function isLayerDirective(el: OutputElement): boolean {
  return el.kind === "layer" || (el.kind === "raw" && hasRawCallPrefix(rawText(el), "layer"));
}

/** Output-side `set` / `save` / `reset` / `call` / `return` — option-store and flow statements. */
export function isOptionStoreOrCallOutput(el: OutputElement): boolean {
  return el.kind === "set" || el.kind === "save" || el.kind === "reset" || el.kind === "call" || el.kind === "return";
}

/**
 * Context elements that carry rule shape: everything except the codec's
 * synthetic `+` keystroke separator and `platform('…')` guards.
 */
export function shapeContext(rule: IRRule): ContextElement[] {
  // No group is in scope for a flat rule list, so every element after the head
  // run is read as pre-context (`usingKeys: false`) and the keystroke is found
  // separately by `splitShapeContext`.
  const nul: ContextElement[] = ruleHasNulContext(rule) ? [{ kind: "raw", text: "nul" }] : [];
  return [
    ...nul,
    ...ruleConditions(rule),
    ...rulePreContext(rule, { usingKeys: false }),
  ].filter((el) => !isPlatformGuard(el));
}

/**
 * Split a rule's shape context into the guard set (everything but the struck
 * key) and the struck key itself, when the keystroke is a vkey. A keystroke that
 * is not a vkey (`any()`, a char) stays among the guards: this view only names
 * vkey-struck rules.
 */
export function splitShapeContext(rule: IRRule): {
  guards: ContextElement[];
  key?: Extract<ContextElement, { kind: "vkey" }>;
} {
  const shape = shapeContext(rule);
  const keystroke = ruleKeystrokeLoose(rule);
  if (keystroke !== undefined && keystroke.kind === "vkey") {
    return { guards: shape.filter((el) => el !== keystroke), key: keystroke };
  }
  return { guards: shape };
}

/**
 * Output elements that carry rule shape: everything except `layer('…')`
 * touch directives.
 */
export function shapeOutput(rule: IRRule): OutputElement[] {
  return rule.output.filter((el) => !isLayerDirective(el));
}

/** True when the rule's output is suppression-only: `nul`, bare `context`, `beep`. */
export function isSuppressionOnlyOutput(output: OutputElement[]): boolean {
  return (
    output.length > 0 &&
    output.every(
      (el) =>
        el.kind === "beep" || isNulOutput(el) || isBareContextOutput(el),
    )
  );
}

/**
 * Classify a typed rule's shape.
 *
 * Precedence: group-transition → opaque; unrecognised raw → opaque;
 * suppression → blocking; context(N) → reorder; single-key output →
 * plain-output; anything else with context → context; otherwise opaque.
 */
export function classifyRuleKind(rule: IRRule): RuleKind {
  // Group-transition rules (`match > use(g)` / `nomatch > use(g)`) are
  // control flow, not keystroke rules.
  if (ruleLhsKind(rule) !== "input") return "opaque";

  const ctx = shapeContext(rule);
  const out = shapeOutput(rule);

  // Any untyped content outside the recognised idioms is opaque — never
  // guess at semantics for raw tokens we cannot name.
  if (ctx.some((el) => el.kind === "raw")) return "opaque";
  if (
    out.some(
      (el) =>
        el.kind === "raw" &&
        !isNulOutput(el) &&
        !isBareContextOutput(el) &&
        !isIndexedContextOutput(el),
    )
  ) {
    return "opaque";
  }
  // `use(group)` in output is a control-flow jump, not produced output.
  if (out.some((el) => el.kind === "useGroup")) return "opaque";
  // Option-store statements and call/return were whole-rule opaque fragments
  // before they were typed; the assist layer still cannot describe them.
  if (out.some(isOptionStoreOrCallOutput)) return "opaque";

  // An empty output side is malformed — nothing honest to say about it.
  if (out.length === 0) return "opaque";

  if (isSuppressionOnlyOutput(out)) return "blocking";
  if (out.some(isIndexedContextOutput)) return "reorder";

  const isSingleKey = ctx.length === 1 && ctx[0]?.kind === "vkey";
  const producesOutput = out.some(
    (el) =>
      el.kind === "char" ||
      el.kind === "deadkey" ||
      el.kind === "namedDeadkey" ||
      el.kind === "index" ||
      el.kind === "outs",
  );
  if (isSingleKey && producesOutput) return "plain-output";

  if (ctx.length > 0) return "context";

  return "opaque";
}
