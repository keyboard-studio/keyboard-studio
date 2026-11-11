# Data model: Layout tab (spec 117)

Types are specified in [contracts/layout-ops.md](contracts/layout-ops.md),
[contracts/code-edits.md](contracts/code-edits.md), and
[contracts/attribution.md](contracts/attribution.md); this page names the entities, where each
lives, and its rules.

Revised 2026-11-05 (rulings 6 and 7): edits to the KMN are one bundled decision, `kmn-edits`,
recorded at each confirm. There is no `layoutOps` store slice and no snapshot into
`physical-layout`.

## Persisted (the decision set, in the draft envelope)

| Entity | Lives in | Fields | Rules |
|---|---|---|---|
| **`kmn-edits` decision** | `DecisionId` in `studio/src/decisions/decisionTypes.ts`; gallery module `studio/src/survey/questions/gallery/kmnEdits.ts` | value `KmnEditsValue = { entries: KmnEdit[] }` | Recorded (provenance `asked`) on every confirm, Apply, review action, and undo. `apply()` replays `entries` in order, after every other rule-writing decision. Persists with the decision set; no working-copy field. Registered as surface `kmn-edits` in the derived-surface registry, equivalence-proven (FR-026, SC-011). |
| **KmnEdit** | `contracts` (type + zod schema + drift guard) | `LayoutOperation` \| `CodeEdit` \| `ReviewKept` | `seq` monotonic within the value; later entries win. Never holds a `.kmn` text string to re-parse. |
| **LayoutOperation** | `contracts/src/layoutOps.ts` | `seq`, `at`, `op`, `vkey`, `layer`, per op `output` / `context` / `becomes` / `partner` | Never targets a rule in a `readonly` group or a `RawKmnFragment`. |
| **CodeEdit** (phase E) | `contracts/src/kmnEdits.ts` | `seq`, `at`, `op: "code-apply"`, `changes: IRChange[]`, `overrides: OwnerRef[]` | One Code-tab Apply. `changes` are located by content (FR-065). `overrides` records the FR-062 owners found at Apply (review flag a). |
| **ReviewKept** (phase E) | `contracts/src/kmnEdits.ts` | `seq`, `at`, `op: "review-kept"`, `target: number` | The author kept a flagged entry (FR-064). Clears flag (a) for `target`; no IR effect. |
| **IRRule.authorEdit** | `contracts/src/keyboard-ir.ts` | optional `"layout-tab" \| "code-tab"` | Set only by `applyLayoutOp` and `applyIRChanges`. Drives the hand-set and "changed in code" labels. Additive, beside `rulesStepAdded`; not part of the `Pattern` schema. |
| **Deadkey ops** | existing, spec 083, decision `deadkeys-defined` | `DeadkeyOperation` | Deadkey define/rename/retarget/delete and fan-out pair edits from the Layout tab go here, not into `kmn-edits`. |
| **Deadkey display character** | spec 083 `define.accentChar` (also the trigger's double-tap escape output) or, if that cannot serve, a `set-display` lifecycle op | `accentChar` / `displayChar?` | Phase A confirms; a new field is a lifecycle op, not a `kmn-edits` entry. |

## Undo entries (`workingCopyStore` `UndoEntry`)

Every undo records `kmn-edits` (or `deadkeys-defined`) anew and applies a local inverse to the
live IR. No rebuild (R6).

| Kind | Holds | Undo does |
|---|---|---|
| `l` | one entry `seq` + its `KmnEditEffect` | Record `kmn-edits` without that entry; apply the inverse effect to the live IR (drop inserted nodes, restore removed nodes at their positions). |
| `lb` | entry `seq`s + effects (edit + accepted case partner) | The same for each, as one step. |
| `ld` | the inverse `DeadkeyOperation` of a Layout-tab table edit | Append the inverse to the deadkey op list and record `deadkeys-defined`. |
| `c` (phase E) | one `CodeEdit` `seq` + its `KmnEditEffect` | As `l`. |

**KmnEditEffect** (undo entry only, not in the decision): `{ insertedNodeIds: string[];
removed: Array<{ containerNodeId: string; index: number; node: IRNode }> }`. Recorded when the
entry is applied to the live IR.

## Derived, never stored

| Entity | Computed from | Notes |
|---|---|---|
| **KeyCellAttribution** | IR (static pass) + published compile artifact (verification) | One per `(vkey, layer)`. `plain` behaviour + contextual `rows` + `unhandled` + `frame`. |
| **RowAttribution** | same | `shape`, `editable`, `readOnlyReason`, `provenance`. |
| **Layer list** | `collectLayerCombosInUse(startIr ∪ workingIr)` + session-added layers | An added layer with no rules is session state only and is labelled "not saved until a key is set" (edge case). |
| **Context list** | `listContexts(ir)` | Literal contexts and deadkeys in use, with key counts (US4). |
| **Base fallback cell** | `enumerateUnhandledPositions` × `referenceBaseLayouts` × picked base keyboards | Primary first; "unknown" / "system shortcut" where no data. |
| **Provisional count per layer** | base fallback cells not covered by a confirmed class policy | Fed to `LayerSelector`'s per-layer count (FR-030). |
| **Review flags** (phase E) | `CodeEdit.overrides` minus `ReviewKept`; replay misses; `findShadowedRules` | Misses and shadowed rules are recomputed on every replay, never stored (FR-063). |

## State transitions of a cell

```
unhandled (base-derived, provisional)
   │ set-key                         │ class policy confirmed (spec 109 surface)
   ▼                                 ▼
hand-set ◄── set-key / code edit ── starting-point     unhandled (confirmed: base char, or
   │                                                     "types nothing" once swallowUndefined ships)
   │ clear-key / undo
   ▼
starting-point (or unhandled, if the starting point had no rule)
```
