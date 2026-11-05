# Data model: Layout tab (spec 113)

Types are specified in [contracts/layout-ops.md](contracts/layout-ops.md) and
[contracts/attribution.md](contracts/attribution.md); this page names the entities, where each
lives, and its rules.

## Persisted (draft envelope and decision)

| Entity | Lives in | Fields | Rules |
|---|---|---|---|
| **LayoutOperation** | `contracts` (type + zod schema + drift guard) | `seq`, `at`, `op`, `vkey`, `layer`, and per op `output` / `context` / `becomes` / `partner` | Append-only per draft. `seq` monotonic. Later ops on the same `(vkey, layer[, context])` win at replay. Never holds a rule from a `readonly` group or a `RawKmnFragment`. |
| **layoutOps** (store slice) | `workingCopyStore` | `LayoutOperation[]` | Saved and restored with the draft (`persistWorkingCopy.ts`), beside the deadkey op log. Classified `EDITOR-AUTHORED`; registered under surface `layout-tab` (FR-026). |
| **PhysicalLayoutValue.layoutOps** | `studio/src/survey/assignLoop/physicalLayoutValue.ts` | optional `LayoutOperation[]` | Snapshot of the slice at step completion. Additive (the `displacedDeclined` precedent). The decision stays record-only (registry phase 4, pending). |
| **IRRule.layoutTabOwned** | `contracts/src/keyboard-ir.ts` | optional `boolean` | Set only by `applyLayoutOp`. Drives the hand-set label. Additive, mirrors `rulesStepAdded`; not part of the `Pattern` schema. |
| **Deadkey ops** | existing, spec 083 | `DeadkeyOperation` | Deadkey define/rename/retarget/delete and fan-out pair edits from the Layout tab go here, not into `layoutOps`. |
| **Deadkey display character** | existing deadkey record (spec 083) or, if it has no slot, a `set-name`-style lifecycle field | `displayChar?: string` | Plan task A checks spec 083's deadkey record for a label field before adding one; if added, it is a lifecycle field, not a layout op. |

## Undo entries (`workingCopyStore` `UndoEntry`)

| Kind | Holds | Undo does |
|---|---|---|
| `l` | one layout op `seq` + its `LayoutOpEffect` | Remove that op from `layoutOps`; apply the inverse effect to the live IR (drop inserted rules, restore removed rules at their positions). No rebuild. |
| `lb` | layout op `seq`s + effects (edit + accepted case partner) | The same for each, as one step. |
| `ld` | the inverse `DeadkeyOperation` of a Layout-tab table edit | Append the inverse to the deadkey log (the log stays append-only). |

**LayoutOpEffect** (undo entry only, not persisted in the op): `{ insertedNodeIds: string[];
removed: Array<{ groupNodeId: string; index: number; rule: IRRule }> }`. Recorded when the op is
applied to the live IR.

## Derived, never stored

| Entity | Computed from | Notes |
|---|---|---|
| **KeyCellAttribution** | IR (static pass) + published compile artifact (verification) | One per `(vkey, layer)`. `plain` behaviour + contextual `rows` + `unhandled` + `frame`. |
| **RowAttribution** | same | `shape`, `editable`, `readOnlyReason`, `provenance`. |
| **Layer list** | `collectLayerCombosInUse(startIr ∪ workingIr)` + session-added layers | An added layer with no rules is session state only and is labelled "not saved until a key is set" (edge case). |
| **Context list** | `listContexts(ir)` | Literal contexts and deadkeys in use, with key counts (US4). |
| **Base fallback cell** | `enumerateUnhandledPositions` × `referenceBaseLayouts` × picked base keyboards | Primary first; "unknown" / "system shortcut" where no data. |
| **Provisional count per layer** | base fallback cells not covered by a confirmed class policy | Fed to `LayerSelector`'s per-layer count (FR-030). |

## State transitions of a cell

```
unhandled (base-derived, provisional)
   │ set-key                         │ class policy confirmed (spec 109 surface)
   ▼                                 ▼
hand-set ◄── set-key ── starting-point     unhandled (confirmed: base char, or "types nothing"
   │                                         once swallowUndefined ships)
   │ clear-key / undo
   ▼
starting-point (or unhandled, if the starting point had no rule)
```
