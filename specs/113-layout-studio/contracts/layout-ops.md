# Contract: Layout-tab edits in the `kmn-edits` decision

The replayable record of Layout-tab edits ([research.md](../research.md) R1, R2, R12). Each
confirmed edit is one entry in the bundled `kmn-edits` decision (ruling 6, 2026-11-05), which
persists with the decision set, so it is a contract: the TypeScript type lives in
`packages/contracts`, with a zod schema bound by a compile-time drift guard (the repo's standard
pattern). It is additive and does not touch the locked `Pattern` schema. Code-tab entries are in
[code-edits.md](code-edits.md).

```ts
/** The `kmn-edits` decision value. Entries replay in order; later entries win. */
interface KmnEditsValue { entries: KmnEdit[] }
type KmnEdit = LayoutOperation | CodeEdit | ReviewKept;   // CodeEdit, ReviewKept: phase E
```

## Type

```ts
/** A desktop layer: a Keyman modifier combination. `ModifierToken` moves from
 *  engine/src/pattern-apply/modifierCombos.ts to contracts (engine re-exports it):
 *  contracts is the dependency root and cannot import the engine. */
type LayerCombo = readonly ModifierToken[];          // e.g. [], ["SHIFT"], ["RALT"], ["SHIFT","RALT"], ["NCAPS"]

/** What a key or row produces — literal text, a deadkey, or nothing.
 *  `deadkeyId` (research R2, T003): the inner token of the emitted `dk(...)`. A numeric id is
 *  four-digit lowercase hex as `fmtDk` writes it ("0001", "3001"); a named id keeps its verbatim
 *  spelling ("acute"). A name is never all-hex, so the forms cannot collide. Compare numeric ids
 *  by `parseInt(s, 16)` and names by `deadkeyNameKey`. */
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

## Semantics of `applyLayoutOp(ir, op): { ir: KeyboardIR; effect: KmnEditEffect }` (engine, pure)

Operates on the entry keys-group (the group the `begin Unicode` statement uses).

| Op | Effect on the entry group |
|---|---|
| `set-key` | Remove every **context-free** rule whose key element is exactly `vkey` + `layer`; insert one rule `+ [layer vkey] > output` before the group's terminal rules (`insertBeforeTerminalRules`). Contextual rules on that key are untouched. |
| `clear-key` | Remove the context-free rule(s) the log's earlier `set-key` ops added for `vkey` + `layer`, restoring what replay without them would produce. Implemented by dropping matching `set-key` ops from the replayed sequence, not by an IR inverse. |
| `set-row` | Remove the rule(s) with exactly this `context` + key; insert `context + [layer vkey] > becomes`. |
| `remove-row` | Remove the rule(s) with exactly this `context` + key. |
| `decline-case-partner` | No IR effect; recorded so FR-020a does not re-propose. |

Rules the op inserts are stamped `authorEdit: "layout-tab"` (an optional `IRRule` field, beside
`rulesStepAdded`) so attribution can label them hand-set.

**Replay is not a plain reduce.** `replayKmnEdits(ir, entries)` first normalises the list (a
`clear-key` drops the earlier `set-key` entries for its `(vkey, layer)`; a `ReviewKept` has no IR
effect), then applies the rest in order with `applyLayoutOp` / `applyIRChanges`. It returns
`{ ir, misses }`. The live path does not replay: it applies one entry and records its
`KmnEditEffect`, and a live `clear-key` restores the context-free rules for its `(vkey, layer)`
from the IR built without the cleared `set-key`s — tested equal to what replay produces. As built,
`clearKeyLive(ir, op, startIr, earlier)` takes the starting-point IR and the earlier entries, so
the live `commitKmnEdit` for a `clear-key` needs both. It rebuilds the slot from
`replayKmnEdits(startIr, [...earlier, op])`, and its effect records only the delta, so
`invertEffect` undoes it.

**Refusals (throw, caller shows the reason):** the target rule is inside a `readonly` group or a
`RawKmnFragment`; the keyboard is mnemonic; the deadkey id is unknown. As built, a refusal during
`replayKmnEdits` propagates as a throw, and `misses` stays empty. Whether replay turns a refusal
into a miss is settled in Phase 6 (US8), where misses first carry entries.

**Idempotence and order:** replaying the same log on the same IR yields the same IR; later ops on
the same `(vkey, layer[, context])` win.

## Seams

| Where | Call |
|---|---|
| Live edit (studio) | `commitKmnEdit(entry)`: `applyLayoutOp` → `applyMutatePatch(ir, { groups }, LAYOUT_WRITES)` → `setWorkingIR`; then `useDecisionStore.getState().record({ id: "kmn-edits", value: { entries: [...prev, entry] }, provenance: "asked" })`; pushes undo entry `l`/`lb`. `LAYOUT_WRITES` = the entry group's `rules` path, declared in `studio/src/steps/editorMutate.ts` beside `DEADKEY_WRITES`. |
| Decision replay | Gallery module `survey/questions/gallery/kmnEdits.ts`: `apply(value, ctx)` → `replayKmnEdits(ctx.ir, entries)`; composes from `ctx.decisions["kmn-edits"]` when called with `undefined` (the `deadkeysDefined` precedent). |
| Artifact (studio projection) | `projectWorkingCopyVfs` step 2.2 — after assignments (2) and deadkey ops (1.8), before layer propagation (2.5), mark guards (2.6), context tolerance (2.7). Only when `kmn-edits` has entries: parse → `replayKmnEdits` → emit. The value reaches the projection through `lib/projectionInput.ts`. |
| Undo (studio) | `undoKmnEdit()`: record `kmn-edits` without the entry; local inverse from the `KmnEditEffect` held in the undo entry (inserted node ids; removed nodes with positions). No rebuild. |
| Draft | Nothing new: the decision set already persists in the draft envelope. |
| `physical-layout` | Unchanged. Stays record-only (spec 105 phase 4). |
