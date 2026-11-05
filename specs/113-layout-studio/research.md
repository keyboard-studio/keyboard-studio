# Research: Layout tab (spec 113)

Phase 0 of [plan.md](plan.md). Each section resolves one unknown from the spec's "Plan-phase
research" assumption. Paths are relative to `packages/`.

## R1. How a Layout edit reaches the built keyboard

**Finding.** A write to the working IR alone never reaches the artifact.
`studio/src/lib/projectWorkingCopyVfs.ts:780-783`: "The working IR (`store.ir`, written by
`setWorkingIR`) is NEVER emitted into the artifact." The projection rebuilds from `startIr` plus
replayable overlays: carve (:635), the deadkey op log (:888-898), Assign-tab assignments
(:922-925), context tolerance (:1074-1079).

- The Assign tab is **not** an IR path. `swapAssignmentFor`
  (`studio/src/editors/assignLoop/assignmentFromSuggestion.ts:177-229`) stores literal KMN in
  `slotValues.kmnRules`; `applyAssignmentsToVfs` → `applyAssignments`
  (`engine/src/pattern-apply/applyAssignments.ts:503`) substitutes `pattern.kmnFragment` into the
  `.kmn` text. That is the text path spec 082 FR-015 forbids for behaviours, so the Layout tab
  cannot route edits through assignments.
- The rules step's "stamp and splice" (`rulesStepAdded`, `survey/rules/ruleAdditions.ts`) only
  adds rules; it cannot replace or remove one, or set `nul` on a starting-point key.
- The deadkey lifecycle's op log is the working precedent: `applyMutatePatch` + `setWorkingIR`
  for the live view, `commitDeadkeyOp` to an append-only log, `applyDeadkeyOpsToVfs`
  (`studio/src/lib/deadkeyOps.ts:66`) at projection.

**Decision.** A new append-only **layout op log**, mirroring the deadkey op log:

- Each confirmed edit is one `LayoutOperation` ([contracts/layout-ops.md](contracts/layout-ops.md)).
- Live: `applyLayoutOp(ir, op)` (pure, engine) → `applyMutatePatch(ir, patch, LAYOUT_WRITES)` →
  `setWorkingIR`.
- Artifact: the projection replays the log **after** assignments and deadkey ops (so a key-first
  edit wins over an earlier character-first one on the same key), by parsing the assembled `.kmn`,
  applying the ops to the IR, and emitting. The projection already re-parses at `:956` for the
  containment check, so the parse point exists.
- Recorded: `PhysicalLayoutValue` (`studio/src/survey/assignLoop/physicalLayoutValue.ts:19-30`)
  gains optional `layoutOps?: LayoutOperation[]` — the `displacedDeclined` precedent for an
  additive field. `completePhysicalLayoutStep` snapshots the log, as it does the assignments.

**Rationale.** Replace, remove, and `nul` need an IR op; replay needs a log; the deadkey log
already proves the shape in this codebase.

**Alternatives rejected.** (a) Route through Assign-tab assignments: text path, and the
assignment key (`modality/scope/target`, `contracts/src/assignmentMap.ts:83-85`) is character-keyed
— two keys typing one character collide, and `nul` has no key. (b) Stamp-and-splice: add-only.
(c) Make `physical-layout` apply() do the work: that is spec 105 phase 4 (the decision's replay
fold), larger than this feature and owned there; the op log is replayable now and becomes that
fold's input later.

**Side finding (not this spec's scope).** The Code tab's Apply (`KmnCodePane.tsx:195`) calls only
`setWorkingIR`, with no overlay. By R1 it would not reach the artifact. This is inferred from the
code, not tested. Owner: Engine team. Trigger: Phase A task T-verify writes a test; if it
reproduces, file `bug(studio): Code tab Apply never reaches the built keyboard` and fix it outside
this spec.

## R2. Recording `nul`, deadkey-on-key, and contextual rows

**Decision.**
- `nul`, text, and deadkey-on-key edits are `LayoutOperation`s (`set-key`), keyed by
  `(vkey, modifiers)`, not by character.
- Deadkey definition, rename, retarget, delete, and **fan-out-store pair edits** go through the
  existing spec 083 lifecycle and its op log (`survey/deadkeys/deadkeyOps.ts:58-97`;
  `commitDeadkeyOp`, `workingCopyStore.ts:2352`). Spec 083 is implemented
  (`engine/src/deadkey-lifecycle/mutations.ts`: `defineDeadkey` :154, `renameDeadkey` :298,
  `deleteDeadkey` :470, `retargetDeadkey` :581; `editors/deadkey/deadkeyWrite.ts`:
  `withAddedDeadkeyPair` :181, `withRemovedDeadkeyPair` :207, `readDeadkeyPairs` :236).
- Keystroke-keyed deadkey rows (`dk(x) + [K_E] > 'é'`, common in imported keyboards) and literal
  contextual rows (`'n' + [K_G] > 'ŋ'`) are `LayoutOperation`s (`set-row` / `remove-row`).

**Rationale.** Reuse the lifecycle where it owns the shape (FR-027); use the layout log only for
shapes the lifecycle does not model.

## R3. Deadkey tables are store-based — an exemption FR-013 needs

**Finding.** The studio's own deadkeys are **fan-out stores**: `dk(x) + any(bases) >
index(outputs, n)`, edited pairwise by `withAddedDeadkeyPair` (lockstep append to the bases and
outputs stores). FR-013 as written makes every `any()`/`index()` rule read-only, which would lock
every studio-made deadkey table — contradicting US3.

**Decision.** Spec amendment (made with this plan): the spec 083 recognised fan-out shape (a
deadkey context, `any(store)` key-side, `index(parallelStore, n)` output, both stores plain
character lists) is a **deadkey table**, editable as rows of base character → result. Any other
store use stays read-only. Rows of that shape are keyed by the base character (MSKLC-like) and
shown with the key that types it.

## R4. Attribution: which rules match a key and layer

**Finding.**
- IR: `IRGroup { nodeId, name, usingKeys, rules, readonly, sourceLine? }`, `IRRule { nodeId,
  context: ContextElement[], output: OutputElement[], sourceLine?, ... }`
  (`contracts/src/keyboard-ir.ts:421-450`). Named deadkeys are typed `namedDeadkey` elements, not
  opaque (`engine/src/codec/opaque-reasons.ts:26-30`).
- `collectLayerCombosInUse(ir)` (`engine/src/pattern-apply/modifierCombos.ts:711`) lists the
  modifier combinations in use; `buildComboKeyMap(ir, combo)` (:814) maps vkey → character for a
  combination. Both are reusable starting points; neither classifies rules.
- Simulator: `SimKeyInput { vkey, modifiers[], caps? }`, `SimulatorContextSeed { text?, caretPos?,
  pendingDeadkeys? }` (`contracts/src/simulation.ts:15-45`); each step carries `firedRule`.
- Compiled bytes: the single D3 compile artifact is published by SurveyView into
  `rulesDemoArtifactStore`; `DemoPane.tsx:9-13` reads it with no compile or debounce of its own.
- Fired rule → IR rule: `components/rules/firedRuleMapping.ts` maps the compiled ordinal through
  kmc's `// Line N` to `IRRule.sourceLine` (kmc reorders rules, so ordinals alone are wrong).

**Decision.** A new pure engine module, `engine/src/layout-attribution/`
([contracts/attribution.md](contracts/attribution.md)):
1. **Static pass** (IR only): for each `(vkey, layer)`, find the entry keys-group rules whose key
   element matches, classify each (FR-012/FR-013, plus R3's exemption), and list the contexts the
   keyboard uses.
2. **Verification pass** (studio, against the published artifact): simulate each editable cell
   and row with an empty or seeded context; a mismatch with the rule's own output demotes it to
   read-only ("changed by a later rule"). Uses `firedRuleMapping` to confirm the rule that fired.

**Performance.** `simulate()` loads the keyboard interface per call
(`simulator/index.ts:253-275`). One layer of ~48 keys times several layers per recompute is too
many loads. **Decision:** add `simulateEach(compiled, inputs[], seed?)` to the simulator that
loads once and resets the context between keystrokes. Target: a full-grid verification under
200 ms for 8 layers in the Node test harness.

## R5. "View in code" — finding the rule's line in the Code tab

**Finding.** The Code tab shows `emitKmn(workingIr)`. `IRRule.sourceLine` is the line in the
starting-point `.kmn`, not in that emitted text; no emit source map was found.

**Decision.** Extend the emitter with an optional line map: `emitKmn(ir, { lineMap: true })`
returns `{ text, lineByNodeId }`. `KmnCodePane` gains a `revealNodeId` prop (Monaco
`revealLineInCenter`). Fallback when a node has no line (opaque fragment): open the Code tab at the
group header.

## R6. Undo

**Finding.** `UndoEntry` kinds `n | i | t | batch | k | kb` (`workingCopyStore.ts:224-230`);
`undoDelete` branches per kind (:1957-2042). `setWorkingIR` pushes nothing. Deadkey ops are
deliberately off the stack (:1185-1189). The stack is persisted in drafts, so IR snapshots are
out.

**Decision.** New kind `l` (one layout op by seq, mirroring `k`) and `lb` (a batch: an edit plus
its accepted case partner). Undoing a layout op removes it from the log and rebuilds the live IR
from `startIr` + overlays (the existing rebuild path in `decisions/rebuildWorkingCopy.ts`).
Deadkey-table edits made from the Layout tab push a `ld` entry that holds the **inverse**
`DeadkeyOperation` (add-pair ↔ remove-pair); undo appends the inverse to the deadkey log rather
than popping it, keeping that log append-only as spec 083 intends.

## R7. Desktop geometry and grid components

**Finding.**
- `DESKTOP_GEOMETRY` (`engine/src/layout-chart/geometry.ts`) is ANSI-only: 4 rows, no `K_oE2`, no
  space bar, frame keys unflagged. An ISO-aware table exists but is unexported:
  `FORM_ROWS` / `FORM_ONLY_KEYS` / `isFrameKey` (`engine/src/ldml-export/lower/positions.ts:51-91`).
- `OskEditor.tsx` is the only interactive desktop picture: geometry → rows, but plain buttons, no
  `role=grid`, and it silently drops keys missing from the geometry (:332).
- Touch `keyGrid/`: `keyGridViewModel` and `KeyGrid`/`KeyGridCell` are touch-specific; `useGridNav`
  needs only `address`, `padPct`, `widthPct`, `rows[].keys[]` — reusable after loosening its type
  to a structural minimum; `LayerSelector` is a full APG tablist, reusable with desktop layer ids
  (its `findingCountsByLayerId` prop can carry per-layer provisional counts, FR-030).
- Tab precedent with full accessibility: TouchGallery's mode tabs (`TouchGallery.tsx:7830-7940`,
  `useId` for `aria-controls`, arrow keys, roving tabindex). `addPhysicalAdapter.tsx`'s tab bar has
  none of that.

**Decision.** Export an ISO-aware desktop geometry from `layout-chart` (add `K_oE2`, a space row,
and a frame-key flag; keep `DESKTOP_GEOMETRY` as the ANSI view for existing callers). Build a new
`DesktopKeyGrid` + `DesktopKeyCell` + `desktopGridViewModel` on `useGridNav` and `LayerSelector`.
Upgrade `addPhysicalAdapter.tsx`'s tab bar to the TouchGallery model while adding the third tab.

## R8. Base-keyboard fallback (spec 109 pieces)

**Finding.** More exists than spec 109's "Draft" status suggests:
- `enumerateUnhandledPositions(ir, vkeys)` (`engine/src/base-fallback/unhandledPositions.ts:81`,
  exported) — states none, shift, altgr, shiftAltgr.
- Per-key characters for five reference base keyboards (us, us-intl, azerty, qwertz, uk) in
  `studio/src/lib/referenceBaseLayouts.ts` (generated JSON, includes `K_OE2`, marks base deadkeys);
  `lookupHostOutput` :181, `likelyBaseLayouts` :284; `usePickedWindowsLayouts` in
  `lib/layoutFamily.ts`.
- `swallowUndefined`: not built (only `engine/src/pattern-apply/swallowSet.ts`'s skip-set).

**Decision.** Use the enumerator and reference data as they are. For a picked base keyboard with
no reference data, and for layers outside the four states, the cell says "unknown" (spec 109
FR-032) — or "system shortcut" for Ctrl/Alt+letter. Because `swallowUndefined` is not built, the
FR-014 branch "policy not yet in effect for never-defined keys" is the live branch today.

## R9. Duplicate and displacement handling, key-first

**Finding.** `displacementProposalFor` (`mechanismPlacement.ts:363-431`) is character-first and
returns null with no current character; the slot-occupancy ledger skips multi-glyph outputs,
deadkey contexts, and raw fragments (`survey/slotOccupancy.ts:18-36`). Declines are keyed
`displaced|vkey|mods|incoming` (`useDisplacementProposal.ts:86`).

**Decision.** Add a key-first entry point, `keyFirstDisplacementFor(ir, vkey, mods, incoming)`,
that reuses `buildSlotOccupancy` / `isProducedOnOtherSlot` and the existing decline key and store
action (`declineDisplacement`), so FR-022's choices are the Assign tab's choices. Extend the
ledger to see layout ops' outputs.

## R10. Derived-surface registry

**Decision.** New entry `layout-tab` (phase 4, status pending, decisionIds `["physical-layout"]`),
storeActions `commitLayoutOp`, `undoLayoutOp`; field `layoutOps`, classified
`EDITOR-AUTHORED` in `WORKING_COPY_MEMBER_CLASSIFICATION`. `derivedEquivalence.test.ts`'s census
fails until both are added, which is the gate FR-026 wants.

## R11. Size re-estimate

The draft's 2,500–3,500 lines assumed a single-character, existing-deadkey editor writing through
an existing seam. The clarified spec adds deadkeys at MSKLC depth and beyond, literal contextual
rows, any modifier layer, ligatures, case-partner proposals, and — from R1 — a replayable op log
with projection replay, persistence, and undo. Estimate by phase (production + tests):

| Phase | Scope | Production | Tests | Total |
|---|---|---|---|---|
| A | Foundation: ISO geometry, attribution module, `simulateEach`, emit line map, `LayoutOperation` contract + `applyLayoutOp` | ~1,300 | ~1,100 | ~2,400 |
| B | US1 read-only tab: grid, cells, layer selector, detail panel, base fallback join, tab bar | ~1,300 | ~800 | ~2,100 |
| C | US2 change keys: editor, case partner, key-first displacement, op log store/persist/replay, decision field, registry, undo | ~1,400 | ~1,100 | ~2,500 |
| D | US3 deadkeys: lifecycle surface, display character, both table shapes, "after deadkey" view, inverse-op undo | ~1,100 | ~800 | ~1,900 |
| E | US5 + US6: read-only detail + view in code; provisional counts and fallback-policy link | ~800 | ~500 | ~1,300 |
| F | US4 contextual rows: context list, "after …" for literal contexts, "becomes" editor, never-fires | ~900 | ~700 | ~1,600 |
| — | E2E (Playwright) + SC-001/SC-007/SC-009 corpus harness | ~200 | ~400 | ~600 |
| **v1 total** | | **~7,000** | **~5,400** | **~12,400** |
| G | US7 tray (gated, not counted) | ~600 | ~400 | ~1,000 |

**US1–US3 ship first** (phases A–D plus their E2E): about **8,900 lines** (~5,100 production).
That is roughly three times the draft's figure for the same stories; the difference is mostly the
op log (R1) and deadkeys at full depth.
