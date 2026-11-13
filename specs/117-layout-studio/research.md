# Research: Layout tab (spec 117)

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

**Decision (revised 2026-11-05, ruling 6).** Each confirmed edit is one entry in a new bundled
decision, **`kmn-edits`**, recorded at the confirm. (The first version of this plan kept a
separate `layoutOps` store slice and copied it into `physical-layout` at step completion; the
product owner ruled that edits to the KMN are decisions — see R12.)

- Each confirmed Layout-tab edit is one `LayoutOperation` ([contracts/layout-ops.md](contracts/layout-ops.md)),
  appended to the `kmn-edits` value; Code-tab Applies append `CodeEdit` entries (R13).
- Live: `applyLayoutOp(ir, op)` (pure, engine) → `applyMutatePatch(ir, patch, LAYOUT_WRITES)` →
  `setWorkingIR`, then `useDecisionStore.getState().record({ id: "kmn-edits", … })`.
- Artifact: a new projection step **2.2**, after assignments (step 2) and deadkey ops (step 1.8)
  so a key-first edit wins over an earlier character-first one on the same key, and **before**
  layer propagation (2.5), mark guards (2.6), and context tolerance (2.7), so those see the edited
  keyboard. It parses the assembled `.kmn`, replays the `kmn-edits` entries, and emits — **only
  when `kmn-edits` has entries**, the step 1.7b precedent (`projectWorkingCopyVfs.ts:848-869`), so
  keyboards with no edits keep a byte-identical artifact. The re-parse at `:954` is deliberately
  not re-emitted (comment at `:948`: the text artifact must equal the pre-flag path's), which is
  why the step is gated on a non-empty list rather than always re-emitting.
- Context tolerance (2.7) replays variants of named rules; a variant whose source rule a layout op
  removed is skipped with a warning, never left firing.
- The projection input (`lib/projectionInput.ts`) reads the `kmn-edits` value from the decision
  store, not from a working-copy slice.
- `physical-layout` is untouched: still record-only, still spec 105 phase 4's to fold.

**Rationale.** Replace, remove, and `nul` need an IR op; replay needs an ordered list; the deadkey
op log (`deadkeys-defined`, whose `apply()` replays `DeadkeyOperation`s) already proves the shape
as a decision in this codebase.

**Alternatives rejected.** (a) Route through Assign-tab assignments: text path, and the
assignment key (`modality/scope/target`, `contracts/src/assignmentMap.ts:83-85`) is character-keyed
— two keys typing one character collide, and `nul` has no key. (b) Stamp-and-splice: add-only.
(c) Make `physical-layout` apply() do the work: that is spec 105 phase 4, larger than this feature
and owned there. (d) A separate `layoutOps` store slice snapshotted into `physical-layout` at
completion (this plan's first version): rejected by ruling 6 — it adds a stored source of author
truth outside the decisions, against spec 105 Option A.

**Side finding — verified; now in scope as User Story 8 (ruling 7).** The Code tab's Apply (`KmnCodePane.tsx:195`)
calls only `setWorkingIR`. The production projection input passes only
`deriveRuleAdditions(state.ir, state.startIr)` (`lib/projectionInput.ts:129`), which collects only
rules stamped `rulesStepAdded`; a Code-tab parse stamps nothing. A probe test (2026-11-04: parse
`+ [K_Q] > 'x'`, Apply an edit to `'y'` plus a new `+ [K_W] > 'z'`, run `projectWorkingCopyVfs`
with the derived additions) passed with the projected `.kmn` still `'x'` and no `K_W`. So a
Code-tab Apply changes the live view but not the preview or download. Reported to the product
owner 2026-11-05, who ruled the fix into this spec: Code-tab edits are imported into
`kmn-edits` (R13, User Story 8). The Layout tab must not copy the Code tab's current write path.

## R2. Recording `nul`, deadkey-on-key, and contextual rows

**Decision.**
- `nul`, text, and deadkey-on-key edits are `LayoutOperation`s (`set-key`) in `kmn-edits`, keyed
  by `(vkey, modifiers)`, not by character.
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

### Phase A checks (T003, T004)

**`deadkeyId` form (T003).** The IR names a deadkey two ways: `{ kind: "deadkey"; id: number }`
for hex `dk(...)` tokens and `{ kind: "namedDeadkey"; name: string }` for every other token
(`codec/parse.ts` `parseDk` / `parseNamedDk`; the boundary is contracts' `isNamedDeadkeyName`:
all-hex is numeric, anything else is a name). `listDeadkeys` reports the same split (`id: number |
null`, `name?`). **Decision:** `deadkeyId` is the inner token of the `dk(...)` the emitter writes.
A numeric id is written as `emit.ts` `fmtDk` writes it, lowercase hex padded to four digits
(`dk(1)` → `"0001"`, a studio id → `"3001"`), and a named id keeps its verbatim spelling
(`"acute"`). The two forms cannot collide because a name is never all-hex, so the string itself
says which IR element it is. Identity: a numeric id compares by `parseInt(s, 16)` (so `"1"` and
`"0001"` are the same deadkey), a name by contracts' `deadkeyNameKey` (ASCII case fold, the
compiler's own identity). Both round-trip through parse and emit: numeric ids by value, names
verbatim. Spec 083's numeric `DeadkeyOperation.id` converts with the same four-digit hex.

**(a) Display character (→ T075): negative.** `define.accentChar` is written only as the output
of the escape rule `dk(id) + [trigger] > 'accent'` (`deadkey-lifecycle/mutations.ts`
`defineDeadkey`). It cannot serve as the display character FR-028 requires:
- Nothing reads it back. `DeadkeyInfo` has no accent field, and `cluster.ts` `matchEscapeRule`
  is engine-internal and returns a boolean.
- The escape rule is an ordinary combination row. The author can change or remove it in the table,
  and `retargetDeadkey` moves only the trigger rule, so the escape key can differ from the trigger.
- Imported deadkeys often have no escape rule (`maltese` defines `dk(1)`–`dk(4)` with fan-out
  rules only), and `matchEscapeRule` takes numeric ids only, so named deadkeys never have one.
  FR-028 says every deadkey has a display character.

T075 applies: a `set-display` lifecycle op. The trigger rule's `@deadkey:<hex>` trailing comment
(`setDeadkeyName`, which already carries `name=`) is the natural carrier for a stored `display=`.
When a deadkey has no stored display character, reads may fall back to the escape rule's output,
but only when its key equals the trigger key.

**(b) Modifier-layer triggers (→ T076): negative.** `defineDeadkey` and `retargetDeadkey` take
`triggerKey: string` and write `{ kind: "vkey", name: triggerKey, modifiers: [] }`, so every
trigger they make is on the default layer. Contracts' `matchTriggerRule` also drops modifiers:
`DeadkeyInfo.triggerKey` is the bare vkey name. So `[RALT K_QUOTE]` and `[K_QUOTE]` read as the
same trigger, and `triggerOccupant` reports a false `trigger-in-use` between them. T076 applies:
the trigger needs modifiers end to end (option, rule, `DeadkeyInfo`, occupancy check), or the gap
is recorded and new deadkeys stay on the default and Shift layers.

**(c) Undo of `remove-pair` (→ T074): holds.** `withRemovedDeadkeyPair` splices at `index`, and
`withAddedDeadkeyPair` pushes to the end of both stores. Undoing a removal with `add-pair` puts
the pair last, so the emitted store order (and the `.kmn` text) differs from before the edit, even
though the keyboard behaves the same when bases are unique. SC-003 compares the emitted text, so
T074 applies: `insert-pair { id, index, base, accented }`.

**Keyboards with no web target (found by T011).** Three corpus picks set `&TARGETS` to
`'desktop'` or `'windows'` (`sil_yoruba8`, `korean_phonetic`, `cs_pinyin`). kmcmplib then emits a
`.kmx` and no `.js`. The simulator runs only the `.js`, and the studio's preview takes the same
path (`useKeyboardArtifact` uses an empty script URL when there is no `.js`). So on such a
keyboard the verification pass has nothing to run, and every cell would stay unverified. Forcing
`&TARGETS 'any'` is not a general fix: `cs_pinyin` then fails to compile ("Virtual keys are not
valid for mnemonic layouts" and KeymanWeb's unsupported virtual character keys), while
`korean_phonetic` compiles.

**Ruling (product owner, 2026-11-06).** Keyboards without an OSK and touch layout get them in the
process: the physical layout is adapted to the OSK, and then a starting touch layout is
generated. So the web build arrives during the workflow, and the Layout tab adds no compile path
of its own (D3 holds: it reads the one published artifact). Until the working copy has a `.js`,
its cells use the existing not-compiled state (FR-018), never a guess. Two consequences for later
phases:
- The step that adds the OSK and touch layout must also widen `&TARGETS` to a web target, or
  kmcmplib still emits no `.js`. Checked in Phase 3: no studio or engine code writes
  `header.targets` or `&TARGETS` today. The docs preview and the output bundle only read them
  (`useDocsPreview.ts`, `buildOutputBundle.ts`). **Closed (product owner ruling, 2026-11-07):**
  every produced keyboard targets `'any'`, because desktop and touch are both required and both
  adapt per OS. The projection's step 3.1 (`applyTargetsAnyMutation`) writes
  `store(&TARGETS) 'any'` for the preview and both outputs, so every working copy has a web build
  for the Layout tab to verify.
- A keyboard such as `cs_pinyin`, whose rules do not compile for the web, fails at that step
  whatever the Layout tab does. That is the OSK/touch step's error to report, not this tab's.

The corpus suites keep the three in `NO_WEB_TARGET` because they test the source as released,
before the process adds those layouts. They skip simulation for exactly those three and assert
the list still matches what the compile produces.

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

**Decision.** Undo is **local**, never a rebuild. A rebuild from `startIr` + overlays would drop
live-IR edits that sit in no overlay (the Code tab's, above), and `rebuildWorkingCopy` replays the
decision set, not editor overlays.
- Each live application of a layout op records what it did: the node ids it inserted and the rules
  it removed with their positions (`LayoutOpEffect`, data-model). The effect is held in the undo
  entry only, not in the persisted op.
- New kinds: `l` (one op by seq, mirroring `k`), `lb` (an edit plus its accepted case partner),
  and `c` (one Code-tab Apply, R13). Undo records `kmn-edits` without the entry (so replay and
  projection run without it; the spec 053 decision log keeps the history) and applies the
  inverse effect to the live IR: drop the inserted nodes, restore the removed ones at their
  positions, through `applyMutatePatch`.
- `clear-key` is an entry whose live effect restores the context-free rules for its
  `(vkey, layer)` as the IR would have them without the cleared `set-key`s (the earlier set-key
  effects' removed rules, or the starting point's rules after a reload); replay drops the cleared
  `set-key`s instead ([contracts/layout-ops.md](contracts/layout-ops.md)). The two are tested
  equal.
- Deadkey-table edits from the Layout tab push `ld`, holding the **inverse** `DeadkeyOperation`
  (add-pair ↔ remove-pair). Undo appends the inverse, so the deadkey log stays append-only. Spec 083
  kept its ops off the undo stack because undo was "out of scope for spec 083"
  (`workingCopyStore.ts:1185-1188`), not because it is unsafe; FR-029b needs it here.

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

**Decision (revised 2026-11-05, ruling 6).** New entry `kmn-edits` (decisionIds `["kmn-edits"]`),
storeActions `commitKmnEdit`, `undoKmnEdit` (the live-IR half of each edit and undo); no new
`WorkingCopyState` field, because the edit list lives in the decision, not the store. Status
**equivalence-proven** in the change that adds it: extend `derivedEquivalence.test.ts`'s replay
arm (rebuild from decisions reproduces the rules after Layout edits) and draft-load arm (the
decision reloads from the draft envelope). The `phase` field takes the number spec 105 assigns
for a surface born derived (Phase 0 precedent: `survey-decision-replay`, phase 0); confirm with
the registry's type when adding it. The census and coverage arms fail until the store actions
are registered, which is the gate FR-026 wants.

## R11. Size re-estimate

The draft's 2,500–3,500 lines assumed a single-character, existing-deadkey editor writing through
an existing seam. The clarified spec adds deadkeys at MSKLC depth and beyond, literal contextual
rows, any modifier layer, ligatures, case-partner proposals, and — from R1 — a replayable op log
with projection replay, persistence, and undo. Estimate by phase (production + tests):

| Phase | Scope | Production | Tests | Total |
|---|---|---|---|---|
| A | Foundation: ISO geometry, attribution module (+ shadowed-rule check), `simulateEach`, emit line map, `LayoutOperation` + `KmnEditsValue` contracts, `applyLayoutOp` + replay | ~1,400 | ~1,150 | ~2,550 |
| B | US1 read-only tab: grid, cells, layer selector, detail panel, view in code, base fallback join, tab bar | ~1,300 | ~800 | ~2,100 |
| C | US2 change keys: editor, case partner, key-first displacement, `kmn-edits` decision module + edit-time recording + projection replay, registry (equivalence-proven), undo | ~1,400 | ~1,150 | ~2,550 |
| D | US3 deadkeys: lifecycle surface, display character, both table shapes, "after deadkey" view, inverse-op undo | ~1,100 | ~800 | ~1,900 |
| E | US8 Code-tab edits: structural diff, content-anchored apply, error gate, ownership + review flags, review list | ~1,200 | ~1,000 | ~2,200 |
| F | US5 + US6: richer read-only detail; provisional counts and fallback-policy link | ~800 | ~500 | ~1,300 |
| G | US4 contextual rows: context list, "after …" for literal contexts, "becomes" editor, never-fires | ~900 | ~700 | ~1,600 |
| — | E2E (Playwright) + SC-001/SC-007/SC-009/SC-010 corpus harness | ~200 | ~450 | ~650 |
| **v1 total** | | **~8,300** | **~6,550** | **~14,850** |
| H | US7 tray (gated, not counted) | ~600 | ~400 | ~1,000 |

**US1–US3 ship first** (phases A–D plus their E2E): about **9,100 lines** (~5,200 production).
That is roughly three times the draft's figure for the same stories; the difference is mostly the
replayable edit decision (R1, R12) and deadkeys at full depth. Phase E (US8) adds ~2,200 and ships
next.

## R12. `kmn-edits` — the bundled decision (ruling 6, 2026-11-05)

**Finding.**
- `decisionStore.record({ id, value, provenance })` stores the value; it does not apply it
  (`lib/mechanismStepCompletion.ts`, every `complete*Step`). A module's `apply()` runs on replay,
  in `decisions/replayKeyboard.ts:216`, and in `decisions/impact.ts:118`.
- Precedent: `deadkeys-defined` (`survey/questions/gallery/deadkeysDefined.ts`) is a gallery
  module whose value is an op list and whose `apply()` replays it over `ctx.ir`, composing from
  `ctx.decisions` when called with `undefined`. Its declared writes are mirrored in
  `decisions/decisionTypes.ts` (`decisionIRPaths`).
- Spec 105's phase 2 asks the deadkey surface to move to edit-time recording (its T201); this
  decision is born that way.

**Decision.**
- New `DecisionId` `"kmn-edits"` in `decisions/decisionTypes.ts`, with IR paths `groups`,
  `stores`, `raw` (plus the header path if Code-tab entries may touch headers — check
  `irPath`'s kinds).
- New gallery module `survey/questions/gallery/kmnEdits.ts`: `provides: ["kmn-edits"]`;
  `apply(value, ctx)` replays the entries in order (`replayKmnEdits`, engine), composing from
  `ctx.decisions` like `deadkeysDefined`; renderer lists the entries (Content-team copy).
- Ordering: `kmn-edits` must replay after every decision that writes rules (`carved-layout`,
  `deadkeys-defined`, `rule-set`, `physical-layout`). It is recorded at edit time, before
  `physical-layout` is recorded at step completion, so the ordering must not make it wait for an
  unrecorded decision. Confirm how `orderByDependencies` and `replayKeyboard` treat a `requires`
  entry with no recorded value before choosing `requires` vs an ordering-only declaration.
- Value: `KmnEditsValue = { entries: KmnEdit[] }`, `KmnEdit = LayoutOperation | CodeEdit`
  (contracts; `CodeEdit` added in phase E as an additive union arm). Recorded with provenance
  `"asked"` on every confirm, Apply, review action, and undo.
- Live: the editor applies the entry to the working IR through `applyMutatePatch` (the
  deadkey precedent) and records the decision; it never relies on `record` to apply.

### R12 addendum -- how recording interacts with rebuild (T056, settled 2026-11-07)

**Does recording trigger a replay? No.**
- `useDecisionStore.record` is a plain zustand `set`. Its only subscriber is the draft saver
  (`lib/draftPersistence.ts`, which just schedules a save). `rebuildWorkingCopyFromStores` is
  reached only from `completeStep` -> `ReducerDeps.rebuildFromDecisions`, i.e. at a step
  completion, never at an edit-time `record`. `usePreviewArtifact` does not subscribe to the
  decision store for rebuilds; the artifact refresh is driven by working-copy changes.
- So the live path stays: `applyLayoutOp` -> `applyMutatePatch` -> `setWorkingIR`, then `record`.
  No double apply, no race.
- **But a later completion rebuilds and installs over the live IR.** `replayFromCheckpoint`
  resumes from the cached `sessionTrail` checkpoint before the first changed decision. A
  checkpoint at or after `kmn-edits` in the order was built before the edit and lacks it, so a
  rebuild resuming there would silently drop Layout edits. Resolution: `kmn-edits` is the LAST
  decision in the derived order (it is registered after every other module and `requires` the
  four rule writers), so every rebuild resumes at or before it and re-folds the recorded
  entries. This is pinned by `derivedEquivalence.test.ts` (asserts `kmn-edits` is last, then
  rebuilds from the last other decision and keeps the edit). A module registered later than
  `kmn-edits`, or one that requires it, fails that test; the fix then is to add `kmn-edits` to
  the `changed` set in `rebuildWorkingCopyFromStores`.
- **Undo after a rebuild.** The `l`/`lb` undo entry holds the node ids minted in the live IR; a
  rebuild re-parses and may mint different ids. `undoKmnEdit` checks that every inserted node is
  still in the entry group and otherwise returns false, writing nothing and keeping the entry on
  the stack (tested). A known limit; revisit with spec 105 phase 2.

**Ordering. `requires` is used.**
- `orderByDependencies` only checks that a requirement has a registered provider; it does not
  need a recorded value. `replayKeyboard` folds only records that exist. So `kmn-edits`
  `requires: ["carved-layout", "deadkeys-defined", "rule-set", "physical-layout"]` replays after
  all four without waiting for them to be recorded.
- `downstreamClosure` puts `kmn-edits` downstream of those four. `recalculate` on an `asked`
  record whose module has no `validate` keeps it unchanged (scenario 3), so a closure visit
  neither re-proposes nor drops it.

**Registration.** The module is registered in `questionRegistry` (so `decisionIndex`, replay, and
`rebuildWorkingCopy` see it) but NOT in `galleryModules` / `decisionModules`: a gallery module
forms its own wizard screen (`deriveScreens`), and `kmn-edits` is not a wizard step. It is a
separate `layoutEditModules` list in `survey/questions/registry.ts`; `galleryModuleFor` also
searches it so the trail label resolves. `galleryModules.coverage.test.ts` is therefore unchanged
and stays green.

**Re-recording `deadkeys-defined` mid-step (T080).** `record` is inert (above), so a mid-step
re-record does not mark downstream decisions for re-proposal; only a completion's
`rebuildFromDecisions(changed)` does, and the Deadkeys step's own completion already records it.
T080 may record `deadkeys-defined` at each Layout-tab deadkey confirm. `recalculate` keeps an
`asked` value with no `validate` unchanged, so there is no re-proposal push.

**`LAYOUT_WRITES`.** `applyMutatePatch` treats an array as a leaf, so the patch leaf is `groups`
itself; the declared path is `irPath("groups")` (the whole array), not `groups[].rules`.

### R12 addendum -- replay cost (T063, ruled 2026-11-07)

Quiet 60-run re-measure (`rebuildPerf.measure`, sil_euro_latin, mnemonic store stripped,
medians [min-max]):

| | edit (warm) | resume (cold) |
|---|---|---|
| 0 edits | 17.4 [16.0-21.6] | 16.9 [15.7-18.5] |
| 20 edits, no new characters | 22.0 [20.1-30.0] | 21.0 [19.9-22.6] |
| 20 edits, 20 new characters | 22.7 [20.7-27.3] | 22.0 [20.4-40.5] |

The mechanism costs ~4.7 ms per edit pass: the two replays this design makes (the module's
`apply` in the rebuild and projection step 2.2), ~2.6 ms; step 2.2's parse and re-emit, ~2 ms;
`applyMutatePatch`'s clone of the groups patch, ~1.4 ms; step 2.5 touch propagation on edited
keys, ~0.6 ms. New characters add ~1 ms (docs). The 20-edit medians sit above the 0-edit range,
so the original noise-band gate failed. Ruling 8 replaces it with a ≤ 30 ms median budget for
20 entries, which these figures meet; the cost is accepted, and spec 093's proposed thresholds
(< 300 ms edit / < 2 s resume) are an order of magnitude away.

## R13. Code-tab import (ruling 7, 2026-11-05)

**Finding.**
- `KmnCodePane.handleApply` (`editors/assignLoop/KmnCodePane.tsx:~195`) lints synchronously,
  parses, skips a formatting-only change (`current === canonical`), then `setWorkingIR(after.ir)`
  — a wholesale replacement.
- Node ids are minted per parse in order (`engine/src/shared/node-ids.ts`: `rule#0`, `rule#1`, …),
  so one inserted rule renumbers every later rule. A diff cannot match by node id, and the
  wholesale replacement renumbers nodes that overlays keyed by node id may reference (not
  verified here; FR-060's in-place apply avoids it by construction).
- The download path already compiles on an explicit author action
  (`lib/buildOutputBundle.ts`), outside the D3 cycle.

**Decision.**
1. **Diff** — new pure engine module `engine/src/kmn-diff/`: `diffIR(before, after): IRChange[]`.
   Groups and stores align by name; the begin statement and headers by kind; rules and comments
   within a group by a longest-common-subsequence over each node's canonical emitted text; opaque
   fragments by text. Changes: insert, remove, replace (node), set-store, add/remove group,
   set-begin, set-header.
2. **Anchors** (FR-065) — each change locates its target by content: the node's canonical text
   plus its previous and next siblings' text within its container. `applyIRChanges(ir, changes)`
   returns `{ ir, effect, misses }`; a miss is a change whose anchor is not found (FR-063 b).
   Inserted nodes get fresh ids above the IR's highest id; untouched nodes keep theirs.
3. **Error gate** (FR-061, FR-067) — on Apply: parse and lint (existing), Layer A validator
   errors on the parsed IR (`engine/src/validator`), then one compile of the candidate through the
   compile service the download path uses. Explicit, one-shot, no timer. km-validator reviews this
   against D3 before phase E lands.
4. **Ownership** (FR-062) — a changed or removed node is "owned by another decision" when it is
   not identical to a node of `startIr`. The owner is named from markers where they exist: the
   `@deadkey` marker or a `dk_*` store → deadkeys; `rulesStepAdded` → rules step; `authorEdit` →
   Layout or Code tab; identity's header stores → identity; otherwise "another step" (Assign-tab
   rules carry no marker; the label stays honest rather than guessing).
5. **Flags** (FR-063) — (a) owner overrides, recorded on the entry at Apply; (b) replay misses,
   computed on each replay, never stored; (c) shadowed rules, from the engine's
   `findShadowedRules` (phase A, shared with US4's never-fires). "Keep" records a
   `review-kept` entry naming the flagged entry's `seq`; "revert" undoes the latest entry, or
   appends the inverse of an older one (`invertChanges`; removed and replaced nodes are stored
   with the change for this), so the list stays append-only and nothing is rebuilt (FR-064).
6. **Stamping** — rules a code entry inserts or replaces carry `authorEdit: "code-tab"`, so the
   Layout tab labels them hand-set and the owning editors show "changed in code".

**D3 review of the Apply error gate (T088).** Verdict: **accepted, no amendment**. km-validator
reviewed the gate against CLAUDE.md decision D3 and confirmed it (guards: Apply disabled while the
compile runs; a result is discarded if the working-copy revision changed).
- D3 forbids a second *debounce timer* in the validation cycle: the TS-check and the WASM oracle
  share one 300 ms cycle. The Apply gate starts no timer. It is one candidate compile, run once,
  on the author's explicit click, through the same compile service the download path uses
  (`lib/buildOutputBundle.ts`, which R13 already places outside the D3 cycle). It races nothing.
- The Code pane's existing `LINT_DEBOUNCE_MS` timer is the pane's own lint and is left untouched;
  Phase 6 adds no timer.
- Because the compile is asynchronous, Apply disables itself while it runs, and before committing
  re-reads the working IR and the editor text; a result for text that has since changed is
  discarded, never recorded.
- The candidate is compiled from a clone of the VFS (the same staging rule as `buildKmp`), so the
  shared projection and the caller's VFS are never mutated, and nothing touches host disk.
- The fallback (Layer A only at Apply, compile failure offered as one-click undo) is therefore not
  invoked, and FR-061's compile half stands as written.

**Contract corrections found while writing the types (T090).** `IRNode`, `IRBegin`, and
`StoreValue` did not exist in `keyboard-ir.ts`: `IRNode` is `IRRule | IRComment | RawKmnFragment`;
`IRBegin` is `{ encoding, main }` (the emitted `begin` line); `StoreValue` is an `IRStore` without
its node id and source line. The header is one object, so there is no "headers" container:
`set-header` carries a patch of the changed fields and `set-store` / `remove-store` carry
`after` (the preceding store) for position. A group container's anchor also records `usingKeys`
(rule text depends on it), and `add-group` / `remove-group` carry the group with empty `rules`;
a group's items travel as ordinary insert / remove changes.

## R14. Editable share per corpus keyboard (SC-009 baseline, T119)

Printed by `layout-attribution.corpus.test.ts` (the SC-009 case). A rule counts as editable when some
layer shows it as an editable row after the verification pass against the compiled keyboard; the
total is every rule (and opaque rule fragment) in the entry group. The last column is true when an
independent scan of the IR finds no FR-013 read-only shape (store, `context()`, `beep`, `use()`,
condition, match rule, opaque fragment, readonly group, frame-key rule, or never-fires duplicate);
those keyboards are asserted at 100%. Everything else is the store-based next-frontier baseline.
A mnemonic keyboard is read-only throughout (FR-018), so it reads 0%.

| Keyboard | Category | Rules | Editable | Share | No read-only shapes |
|---|---|---:|---:|---:|---|
| akha_lahu | store-based | 7 | 3 | 42.9% | no |
| basic_kbdfr | simple-positional | 110 | 109 | 99.1% | no |
| basic_kbdgr | iso | 111 | 110 | 99.1% | no |
| basic_kbduk | iso | 111 | 111 | 100.0% | yes |
| basic_kbdus | simple-positional | 97 | 97 | 100.0% | yes |
| cs_pinyin | opaque | 7 | 0 | 0.0% | no |
| dzardzongke | deadkey-fanout | 4 | 2 | 50.0% | no |
| enga | conditional | 12 | 4 | 33.3% | no |
| enggano | mnemonic | 23 | 0 | 0.0% | no |
| koalibrere | deadkey-keystroke | 23 | 23 | 100.0% | no |
| korean_phonetic | opaque | 13 | 0 | 0.0% | no |
| maltese | deadkey-fanout | 8 | 6 | 75.0% | no |
| northern_sierra_miwok | literal-context | 30 | 30 | 100.0% | yes |
| pau_cin_hau | store-based | 1 | 0 | 0.0% | no |
| persian_phonetic | later-group | 72 | 71 | 98.6% | no |
| postmodern_english_us_dualstroke | deadkey-keystroke | 138 | 138 | 100.0% | yes |
| sil_cameroon_qwerty | simple-positional | 264 | 175 | 66.3% | no |
| sil_euro_latin | opaque | 131 | 0 | 0.0% | no |
| sil_madurese | conditional | 3 | 0 | 0.0% | no |
| sil_sgaw_karen | later-group | 96 | 95 | 99.0% | no |
| sil_wayuu | deadkey-fanout | 12 | 5 | 41.7% | no |
| sil_yoruba8 | conditional | 147 | 0 | 0.0% | no |
| sxava_eo | iso | 34 | 34 | 100.0% | yes |
| taiwan_austronesian | literal-context | 20 | 6 | 30.0% | no |
| thai_kedmanee_mattix | literal-context | 101 | 101 | 100.0% | yes |
| txo_toto | literal-context | 52 | 51 | 98.1% | no |

## R15. The Code tab's built view, and what Apply keeps (owner ruling 2026-11-13)

**OWNER RULING 2026-11-13.** The product owner chose "built view plus kept edits" over keeping
either side of the merge with main. On Copy the Code tab shows the keyboard as it will be built (the
projected `.kmn`), and Apply records the difference from that view as a kept `kmn-edits` entry, so
the tab, the preview, and the download agree. It supersedes in rulings 9 and 10 the premise that
the Code tab hides Assign-tab rules: an edit to an Assign-tab rule is now an edit the author can
see, ruling 10's outcome stands (the most recent edit wins on an assigned key, keyed to the
keystroke, the confirm names the Assign tab, "changed in code" is shown), and ruling 9 still
governs only an edit made before its key is assigned (the edit's rule is gone in the build, so it
is flagged under FR-063 b; that case still arises, so its tests stay). It supersedes in main's
Code-tab fix the Apply that wrote a re-parsed IR the output ignored, and its accepted trade-off
that an applied edit vanishes from view: the edit is now in the build, so it stays.
On Open nothing changes: the tab shows the file text and Apply replaces the starting point.

**OWNER RULING 2026-11-13 (generated rules).** The product owner ruled on the question the interim
behaviour left open, in these words: "Have those things [mark guards, context tolerance, caps rules]
added before the user gets to the Code tab. Then they can edit, and if it becomes non-compliant
they'll have to deal with the compiler and the reviewer." In plain terms: the rules mark guards,
context tolerance and caps handling generate are ordinary text by the time the author edits code. An
edit to one is allowed and stays in the build; nothing is refused for being generated, and
compliance is left to the compile gate (which already runs on Apply) and to review. This replaces
the interim behaviour, in force until this ruling, that refused an Apply whose diff touched such a
rule (and recorded nothing for the rest of that Apply).

Implementing the ruling moves where `code-apply` entries replay. They now replay at projection step
2.9, after caps handling (2.8) and before identity (3); Layout-tab entries (every other `kmn-edits`
op) stay at step 2.2, so guards, tolerance and caps rules are still generated for keys the author
changed in the Layout tab. Consequence, stated plainly: a code edit is applied after ALL Layout-tab
edits, whatever order they were recorded in, except where the supersede rule below applies. Where a
Layout-tab edit and a code edit touch different rules, both land, in either order. Where a later
assignment or a later change in what a step generates removes the rule a code change was anchored
on, the code change finds no anchor, is not applied, and the existing "no longer fits" flag
(FR-063 b) names it; the rest of the build is intact. Ruling 10 holds: its tests pass
unchanged, because the keystroke anchor is resolved at the new replay point too. One expectation did
change with the supersede rule below: in `projectWorkingCopyVfs.codeEditOrder.test.ts`, a Layout-tab
edit recorded after a code edit on the same rule used to leave the code change as a reported miss;
it is now superseded (skipped, no flag). Coverage: `projectWorkingCopyVfs.codeEditOrder.test.ts`.

**LEAD RULING (scope)** (changes no architecture; a decision about how the ruling is carried out):
- An edit to a generated rule gets the existing owner confirm ("Apply anyway") naming the step it
  came from (the marks step, the context-tolerance fix, the caps handling choice), and the entry is
  flagged in the existing review list as an override by "another step"; the `OwnerRef` carries an
  additive optional `step` (`mark-guards`, `context-tolerance`, `caps`) so the review list names the
  step as well. The step is named from the stage-text comparison below; it no longer refuses.
- `&TARGETS` stays refused by name: an earlier owner ruling forces it to `any` on Copy (step 3.1).
  `&NAME` and the other identity edits keep the identity confirm.
- The prediction backstop stays: the build is predicted with the entry included (the same replay as
  the real projection) and Apply refuses at the first differing line if some later step still
  overrides the edit. After this change the prediction equals the applied text for edits to
  generated rules.
- The live IR holds no generated rule, so these edits are built-keyboard-only like Assign-tab rule
  edits (`skipLiveMisses`). `replayKmnEdits` itself orders code entries after the others, so a
  full rebuild matches the projection; incremental and full-rebuild paths are proved equivalent for a
  generated-rule edit, and undo returns the built text to the pre-Apply text
  (`kmnEdits.rebuildEquivalence.test.ts`).
- Cost: at most one more parse and emit of the `.kmn`, only when `code-apply` entries exist; an
  unedited keyboard, or a log with only `review-kept` entries, re-emits at neither replay point. On
  Open every `.kmn` write at both points goes through the splice.

**How it works.**
- *Diff base.* The base is the parse of the text the author was shown, not the working IR. The
  replay at step 2.9 acts on the `.kmn` after the assignments, the Layout-tab edits and the
  generating steps; anchors are content-based (`ContentAnchor`: the node's emitted text, neighbours
  only to break ties), so a change computed against the built text finds the same rule in the
  replay's text. The recorded entry therefore rebuilds to the applied text (proved in
  `KmnCodePane.test.tsx`, "built view plus kept edits", for a starting rule, an Assign-tab rule,
  and an added and a removed rule), and a second Apply with no typing, or with formatting only,
  records nothing.
- *Naming the generating step.* By differential, not by inspecting rules. The projection takes an
  optional observer, `kmnStageTap`, that reports the `.kmn` after steps 2.2, 2.6, 2.7, 2.8, 2.9
  (`code-edits`), 3 (`identity`), 3.1 (`targets`) and 4 (`id-rename`) (reads only; supplying it
  changes no output, and a tap that throws is ignored). The step-2.2 text is the keyboard with the
  Layout-tab edits and nothing generated. A change whose anchor is in it is an ordinary edit; one
  that is in a generating stage's text only was made by that stage, and names it for the confirm.
  A rule an earlier code edit made is in none of those texts and is not called generated (the owner
  check covers it). One found nowhere is left to the candidate compile's "does not fit". A store a
  generating step rewrote (for example `&CasedKeys`) is caught by comparing the store's content as
  well as its name. `lib/builtKmnView.ts` (`findGeneratedRuleTouches`).
- *Live IR.* The working IR does not hold Assign-tab or other projected rules, so a change that
  names one cannot anchor there. `commitKmnEdit(..., { skipLiveMisses: true })` (Code tab only)
  leaves such a change out of the live IR and its undo instead of refusing the entry; the recorded
  entry carries all changes and the projection places them.
- *Header and identity.* Steps 3, 3.1 and 4 rewrite header stores only. Editing `&NAME` and the
  like keeps its FR-062 owner "identity" confirm. The exception is `&TARGETS`, which step 3.1 forces
  to `any` on Copy: an edit to it is refused with a message that names it.
- *A rule a later step still overrides.* Steps after the code replay write header stores only, so
  this should not arise for rules; the backstop remains. Apply predicts the build with the entry
  included (the real projection run with the candidate entry, `ProjectForOutputOptions.candidateKmnEdit`
  / the transform's third argument) and refuses, at the first differing line, when that is not the
  text the author applied (header items aside).
- *Snapshot.* The shown text and the stage texts of that same projection are held together. If the
  build changed while the draft was dirty, Apply refuses (the simpler of the two sound options)
  and offers to reload the current text; the draft stays in the editor until the author reloads.
  Apply is not re-entrant.
- *The candidate compile.* It compiles the output projection run with the candidate entry
  appended, so the compiled `.kmn` is what the real replay (step 2.9) builds, not the entry laid over
  the final text.
- *View in code.* The working IR's node id is matched to its line in the shown text by content
  (group or store by name, a rule by its group and emitted line, the nth duplicate to the nth),
  since the shown text is a different parse. A rule the build does not hold reveals nothing.
- *Dirty draft.* Apply now moves the canonical (the projection changes after `commitKmnEdit`), so
  a successful Apply sets a flag consumed by the next render, which snaps the clean editor to the
  built text. A change to the built text while a draft is dirty never snaps it (unchanged).
- *Pattern map.* The pane resolves patterns with `getPatternByIdSync`, the memoized index the
  preview's async `getById` wraps, loaded eagerly on first use; it is never colder than the
  preview's map, so the pane does not wait.
- *Known limit.* An edit to an Assign-tab rule on a key with no starting rule is content-anchored,
  and its confirm says "another step" rather than "the Assign tab" (ruling 10's keystroke anchor
  and owner label come from the starting rules an assignment claims).

**LEAD RULING (supersede and the live model)** (implements ruling 10, "on a key the most recent
edit wins"; it changes no writer, no output producer, and nothing the `kmn-edits` decision stores).

*The supersede rule.* Replay runs Layout-tab entries first and code entries last, so by order alone a
code change would beat a later Layout-tab edit on the same key. The rule restores "most recent wins":
a change inside a `code-apply` entry is skipped when a Layout-tab entry with a HIGHER `seq` targets the
same key or the same rule. The relation is defined in one place, `supersededChangeIndexes`
(engine `layout-ops/supersede.ts`), and used by the one replay both the projection (step 2.2 replays
the Layout-tab scope, step 2.9 the code scope, each given the whole log) and the whole-log replay use:
- `set-key` / `clear-key` on (vkey, layer): a change that touches a context-free rule on exactly that
  vkey and modifier set, where "touches" is the change's keystroke anchor, or the rule it inserts,
  removes or replaces. A `clear-key` counts even though replay spends it: the key goes back to its
  starting rule, so an earlier code edit on that key does not come back.
- `set-row` / `remove-row`: the same, for the contextual row with exactly that context.
- `decline-case-partner` and `review-kept` have no IR effect and supersede nothing. Store, group,
  `begin` and header changes touch no rule and are never superseded. Deadkey lifecycle ops are not
  `kmn-edits` entries (they replay at step 1.8, before every entry), so they are not in the relation.
- A superseded change is not a miss: no "no longer fits" flag. The other changes of the same entry
  still apply. A code edit made AFTER a Layout-tab edit still wins (its seq is higher).

*The live model follows the build order.* The live (incremental) path used recording order, which
disagreed with the build. Now, whenever the log holds a `code-apply` entry, the live IR after every
`kmn-edits` commit and every undo is re-derived, not patched: it is the decision fold (the rebuild's
own `replayKeyboard` over the decision order, started at the starting point) with the candidate log
standing in for the recorded `kmn-edits` value, so the same order and supersede rule apply
(`workingCopyStore` `deriveLiveIr`, fold registered by `decisions/rebuildWorkingCopy.ts`, as `registerRouteProvider` is). With no registered fold, or a fold that returns nothing, the commit or undo is refused and the previous live IR kept; there is no `startIr`-only fallback. Deadkey (`ld`) undo entries are marked stale too and re-derive from the decisions. Undo drops the
entry from the log and re-derives; the undo entries below a re-derive are marked stale (their effects
name nodes the re-derive re-minted) and re-derive when undone. A log with no code entry keeps the
incremental path and its local-inverse undo unchanged (performance budget, ruling 8). `clearKeyLive`
therefore only ever runs on logs without a code entry, where its code-last replay and the live IR agree.

**Known limits (R15).**
- A later `clear-key` returns the key to its starting rule and discards an earlier code edit on that
  key, with no notice to the author (it follows ruling 10: the most recent edit on a key wins, and a
  `clear-key` is an edit on the key).
- The live IR, and so the Layout tab, never contains rules the build generates at steps 2.6-2.8
  (mark guards, context tolerance, caps handling). A code edit to a generated rule is built-keyboard-only
  (skipped live); the Layout tab does not show generated rules. Live and build agree on every rule
  the live IR can hold.
- Attribution is by comparing stage texts, so a rule that is identical in two stages (a step that
  rewrites a rule into the text it already had, or two equal rules) can be named for the wrong step
  or not named; the edit is kept either way, only the confirm's wording and the flag differ.
- A code change anchored on a generated rule is a content anchor on the rule as built. If what a
  step generates later changes (another assignment, another caps choice), the rule is gone and the
  change is reported as not fitting rather than moved; the author reviews it.
- A keystroke-anchored change (ruling 10) on a key the caps step rewrites matches by key and
  modifiers, which the caps step may have changed; the prediction check refuses it then.
- The pane runs its own projection (the same function, the same inputs as the preview) rather than
  reading the preview's; the two agree because they share `projectWorkingCopyVfs`, not because the
  pane observes the preview.
- "View in code" matches a working-IR rule to a line by content; a rule a later step rewrote or an
  Assign-tab rule replaced has no line, and the tab says so.
