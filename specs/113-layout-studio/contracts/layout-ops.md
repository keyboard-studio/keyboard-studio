# Contract: layout op log

The replayable record of Layout-tab edits ([research.md](../research.md) R1, R2). Persisted in the
draft envelope and in the `physical-layout` decision value, so it is a contract: the TypeScript
type lives in `packages/contracts`, with a zod schema bound by a compile-time drift guard (the
repo's standard pattern). It is additive and does not touch the locked `Pattern` schema.

## Type

```ts
/** A desktop layer: a Keyman modifier combination (tokens as in modifierCombos.ts). */
type LayerCombo = readonly ModifierToken[];          // e.g. [], ["SHIFT"], ["RALT"], ["SHIFT","RALT"], ["NCAPS"]

/** What a key or row produces — literal text, a deadkey, or nothing. */
type LayoutOutput =
  | { kind: "text"; text: string }                   // one or more characters (FR-020, Q4)
  | { kind: "deadkey"; deadkeyId: string }           // a spec 083 deadkey, by stable id
  | { kind: "nul" };

/** What came before, for a contextual row (US3 keystroke-keyed rows, US4). */
type LayoutContext = ReadonlyArray<
  | { kind: "text"; text: string }
  | { kind: "deadkey"; deadkeyId: string }
>;

type LayoutOperation = { seq: number; at: number } & (
  | { op: "set-key";    vkey: string; layer: LayerCombo; output: LayoutOutput }
  | { op: "clear-key";  vkey: string; layer: LayerCombo }   // drop the author's override
  | { op: "set-row";    vkey: string; layer: LayerCombo; context: LayoutContext; becomes: LayoutBecomes }
  | { op: "remove-row"; vkey: string; layer: LayerCombo; context: LayoutContext }
  | { op: "decline-case-partner"; vkey: string; layer: LayerCombo; partner: string }
);

/** What context + keystroke become: literal text, optionally with deadkeys (FR-029a). */
type LayoutBecomes = ReadonlyArray<
  | { kind: "text"; text: string }
  | { kind: "deadkey"; deadkeyId: string }
> | { kind: "nul" };
```

`seq` is monotonic per draft; `at` is a timestamp. Deadkey **definition** and fan-out-store pair
edits are not layout ops — they are spec 083 `DeadkeyOperation`s (R2).

## Semantics of `applyLayoutOp(ir, op): KeyboardIR` (engine, pure)

Operates on the entry keys-group (the group the `begin Unicode` statement uses).

| Op | Effect on the entry group |
|---|---|
| `set-key` | Remove every **context-free** rule whose key element is exactly `vkey` + `layer`; insert one rule `+ [layer vkey] > output` before the group's terminal rules (`insertBeforeTerminalRules`). Contextual rules on that key are untouched. |
| `clear-key` | Remove the context-free rule(s) the log's earlier `set-key` ops added for `vkey` + `layer`, restoring what replay without them would produce. Implemented by dropping matching `set-key` ops from the replayed sequence, not by an IR inverse. |
| `set-row` | Remove the rule(s) with exactly this `context` + key; insert `context + [layer vkey] > becomes`. |
| `remove-row` | Remove the rule(s) with exactly this `context` + key. |
| `decline-case-partner` | No IR effect; recorded so FR-020a does not re-propose. |

Rules the op touches are stamped `layoutTabOwned: true` (an optional `IRRule` field, mirroring
`rulesStepAdded`) so attribution can label them hand-set.

**Refusals (throw, caller shows the reason):** the target rule is inside a `readonly` group or a
`RawKmnFragment`; the keyboard is mnemonic; the deadkey id is unknown.

**Idempotence and order:** replaying the same log on the same IR yields the same IR; later ops on
the same `(vkey, layer[, context])` win.

## Seams

| Where | Call |
|---|---|
| Live edit (studio) | `applyMutatePatch(ir, { groups }, LAYOUT_WRITES)` → `setWorkingIR`; `commitLayoutOp(op)` appends to `layoutOps` and pushes undo entry `l`/`lb`. `LAYOUT_WRITES` = the entry group's `rules` path, declared in `studio/src/steps/editorMutate.ts` beside `DEADKEY_WRITES`. |
| Artifact (studio projection) | `projectWorkingCopyVfs`: after assignments and deadkey ops, parse → `layoutOps.reduce(applyLayoutOp)` → emit. |
| Decision | `PhysicalLayoutValue.layoutOps?: LayoutOperation[]`, snapshotted by `completePhysicalLayoutStep`. |
| Draft | `layoutOps` slice saved and restored by `persistWorkingCopy.ts`, beside the deadkey op log. |
