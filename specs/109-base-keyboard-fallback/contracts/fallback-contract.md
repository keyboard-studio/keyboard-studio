# Contract: Base-keyboard fallback

**Spec**: [spec.md](spec.md)

## Engine (`@keyboard-studio/engine`)

```ts
enumerateUnhandledPositions(ir: KeyboardIR): UnhandledPosition[]

proposeFallbackPolicy(input: {
  ir: KeyboardIR;
  targetScript: string;
  leaks: Leak[];          // joined by the caller from base-keyboard data
}): Proposal[]            // one per LeakClass

applySwallowUndefined(ir: KeyboardIR, input: {
  policy: FallbackPolicy;
  leaks: Leak[];
}): KeyboardIR            // via mutate(); one store, one nul rule; no nomatch
```

Rules: never includes frame keys; never emits `nomatch > nul`; skips what `isInSwallowSet` skips; a position is swallowed when its leak class is `"swallow"` on any picked base keyboard; only layers with `layerBound` are covered.

## Contracts (`@keyboard-studio/contracts`)

`FallbackPolicy` as in [data-model.md](../data-model.md). `FallbackPolicySchema` and its drift guards change in the same commit.

## Studio

- Component `FallbackPolicySection`. The summary line shows, per class, how many unhandled positions type something on the primary base keyboard.
- Message ids follow spec 046; every new id ships with French.
- The "Do nothing" copy variant is chosen by whether `swallowUndefined` is active (SC-003).

## Generated data

`packages/studio/src/lib/generated/baseLayouts.generated.json`: all catalog layouts, with `source.commit` and `source.files[id]` pinned. The codegen test fails on drift.
