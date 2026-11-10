# Contract: rule-shape accessors and helpers (FR-032 to FR-038)

Home: [packages/contracts/src/rule-shape.ts](../../../packages/contracts/src/rule-shape.ts).
`packages/engine/src/shared/rule-shape.ts` re-exports it, as it already does for `isPlusSeparator`.

All functions are pure. They read today's IR shapes and change nothing in the contract.

## Readers

```ts
type LhsKind = "match" | "nomatch" | "input";

ruleLhsKind(rule: IRRule): LhsKind
ruleHasNulContext(rule: IRRule): boolean
ruleConditions(rule: IRRule): ContextElement[]       // head run: if (+ platform/baselayout after Phase 4)
rulePreContext(rule: IRRule, group: IRGroup): ContextElement[]
ruleKeystroke(rule: IRRule, group: IRGroup): ContextElement | undefined
ruleExtraKeystrokeElements(rule: IRRule, group: IRGroup): ContextElement[]   // > 1 element: kmcmplib warns and uses the first
elementAtOffset(rule: IRRule, group: IRGroup, n: number): ContextElement | undefined
```

Rules:

- **`ruleKeystroke`** returns `undefined` for a rule in a group that is not `using keys`, and for
  `match`/`nomatch`. Otherwise it returns the first element after the last `+` separator. If there is
  no separator, it returns the first element after the head run (`nul` and conditions), which is how
  the emitter re-adds `+` today.
- **Single splitter.** `ruleKeystroke` is the extraction of the struck-key logic in
  `touch-key-rule-join.ts` (§2.1). The LDML classifier's splitter (`ldml-export/classify/`) and the
  kmAssist splitter are deleted in favour of it. Research R5 records any disagreement between today's
  splitters, and resolves each one by the kmcmplib rule:
  - the keystroke is the element at position `context.length + 1`;
  - only one element is used.
- **`elementAtOffset(n)`** counts 1-based over `[nul?, ...conditions, ...preContext, keystroke?]`,
  matching kmcmplib `CheckStatementOffsets` (Compiler.cpp:1436–1454). The separator is never counted.
  `n` is the offset as written in the source; nothing re-bases it.
- **No `group` argument.** Readers that don't have one call `ruleKeystrokeLoose(rule)`, which treats
  "has a separator" as the only signal. The return type is marked so call sites are visible in review.
  Research R5 lists which call sites need it.

## Writers

```ts
makeRule(parts: {
  lhsKind?: LhsKind;                 // default "input"
  nulContext?: boolean;
  conditions?: ContextElement[];
  preContext?: ContextElement[];
  keystroke?: ContextElement;
  output: OutputElement[];
  // passthrough of the non-shape fields:
  nodeId: string; trailingComment?: string; targetSelector?: TargetSelector;
  ownedByPattern?: string; ownedByBehaviour?: string; rulesStepAdded?: true; sourceLine?: number;
}, group: Pick<IRGroup, "usingKeys">): IRRule

withRuleParts(rule: IRRule, group: Pick<IRGroup, "usingKeys">,
  patch: Partial<Pick<Parameters<typeof makeRule>[0],
    "nulContext" | "conditions" | "preContext" | "keystroke" | "output" | "lhsKind">>): IRRule
```

Writer rules:

- `makeRule` produces today's shape. It writes the separator only when the rule has a pre-context or
  conditions **and** a keystroke in a `using keys` group, which is exactly the shape the current
  parser produces for the same source. This keeps emit byte-identical.
- `withRuleParts` returns a new rule. Mutating in place is not supported. Writers that mutate in place
  today move to a "replace the rule in its group" step, through `mutate()` where they already use it.
- Neither helper mints node ids. Callers pass them in, as they do today.

## Guard (FR-037)

An ESLint `no-restricted-syntax` rule, with the selectors fixed in tasks. It fails on member access to
`.context` or `.matchKind` on an `IRRule`-typed value, and on an object literal that has both
`context:` and `output:` keys. It applies outside these paths:

- `packages/engine/src/codec/**`
- `packages/contracts/src/rule-shape.ts`
- test files under the test-helper allow-list.

The type-aware variant uses `@typescript-eslint` type information if the repo's ESLint setup already
enables it (research R5). Otherwise it is a syntactic match on the property names, with an inline
disable that requires a reason.

## Equivalence

Phase 1 is accepted only if, for every rule in the corpus and fixtures, each reader returns what the
consumer computed by hand before. This is proven by a property test over the parsed corpus, comparing
each migrated helper's old inline logic (kept in the test, not in source) with the accessor.
