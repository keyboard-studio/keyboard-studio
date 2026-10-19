# Spec 105 Phase 0 — Inventory I2: Carve + Deadkey editor surfaces (and other `editors/` writers)

- Repo / tree state: `~/workspace/ks-105-plan`, branch `km/105-derived-working-copy-plan`, at `origin/dev` `d9e3d63a`.
- Scope read: `packages/studio/src/editors/carve/`, `packages/studio/src/editors/deadkey/`,
  and every other non-test surface under `packages/studio/src/editors/` that writes
  `useWorkingCopyStore` state (`assignLoop/`, `panels/`, `adapters/`, `touchSuggest/`),
  plus one carve-adjacent writer outside `editors/` that writes a carve-overlay field
  (`components/rules/FamilyCardList.tsx`, flagged as adjacent wherever it appears).
- Method: `rg` over non-test sources for every write action declared on
  `WorkingCopyState` in `packages/studio/src/stores/workingCopyStore.ts`, then traced
  each call site to (a) the store field it mutates and (b) any decision machinery on
  that path. Line numbers are 1-based, at `d9e3d63a`; `rg` is the authority.
- Counting unit: one table row = one grouped write (a store action / field as called
  from one surface), not one call site. Call-site multiplicity is listed inside the row.

## Vocabulary (as used in every table)

Decision evidence:

- **NONE** — no decision record, no journal entry on this path.
- **LOG-ONLY** — `recordEditorStep` (`packages/studio/src/decisions/recordEditorStep.ts`,
  wired at `packages/studio/src/decisions/createDecisionRecorder.ts:266`) or
  `recordGalleryDecisions` appends an entry to the **decision log**
  (`decisionLogStore`) at step completion. That is a journal / audit summary
  (counts + bounded id sample). It is **not** a `DecisionSet` record and cannot
  rebuild state.
- **SOURCE** — a `DecisionSet` record (in `decisionStore`) exists whose replay
  reproduces the state: either its module `apply()` returns the patch, or — the
  carve exception, §A.0 — `replayKeyboard` folds the record's **value** directly
  into an overlay slice. The decision id + module are named in the row.
- **RECORD-ONLY** (sub-case of bridge, below) — a `DecisionSet` record *is*
  snapshotted from the working copy at step completion, but its module `apply()`
  is a deliberate no-op and replay has no fold for the field, so the record does
  **not** reproduce the working-copy state on rebuild.

Verdicts:

- **HAS-DECISION-SOURCE** — evidence is SOURCE.
- **BRIDGE-ONLY** — the only decision-side trace is LOG-ONLY and/or RECORD-ONLY:
  a bridge journals or snapshots the finished working copy after the fact
  (exactly the pattern Spec 105 removes).
- **NO-DECISION-SOURCE** — evidence NONE, or the written field is absent from
  every decision value that snapshots its neighbours.

Two cross-cutting facts apply to almost every row below, so they are stated once:

1. **All DecisionSet recording for editor surfaces is completion-time only.**
   Every adapter records once, in its `onComplete` handler
   (`editors/adapters/carveAdapter.tsx:32`, `deadkeyAdapter.tsx:35`,
   `addPhysicalAdapter.tsx:43`, `addTouchAdapter.tsx:88`; same values via the
   decision-host renderers, e.g. `survey/carve/CarveDecisionRenderer.tsx:19`).
   During editing, the working copy is the only holder of the state; a rebuild
   from decisions alone *mid-step* loses everything since the last completion.
   "HAS-DECISION-SOURCE" below always means "…once the step has completed and
   recorded." This timing gap is inference from the adapter code shape, but the
   record call sites themselves are exhaustive per `rg` — no other
   `useDecisionStore.getState().record(` exists under `editors/`.
2. **`recordEditorStep` does not cover deadkeys at all.** Its step map
   (`decisions/recordEditorStep.ts:48`) is exactly
   `{ carve: "gallery_edit", mechanisms: "mechanism_edit", touch: "touch_edit" }`.
   The deadkeys step gets only the generic `recordGalleryDecisions` log entry for
   its settled `deadkeys-defined` record at completion.

---

## A. Carve editor — `editors/carve/CarveGalleryV2.tsx`

### A.0 Precisely which carve state is already decision-sourced (do not flatten)

The `carved-layout` decision is the one carve surface with real decision
machinery, and its mechanism is **not** its module `apply()`:

- Value: `CarvedLayoutValue { removals, dispositions, closedKeyboardCard }`,
  built from the live overlay by `carvedLayoutValueFromOverlay` /
  `currentCarvedLayoutValue()` in `packages/studio/src/survey/carve/carveValue.ts:77`
  and `:100`. `removals` partitions the four id sets by `kind`
  (`node` ← `deletedNodeIds`, `item` ← `deletedItemIds`,
  `family` ← `disabledFamilyIds`, `char` ← `carveChars`); `dispositions` ride
  verbatim; `closedKeyboardCard` rides verbatim.
- Recorded as DecisionSet id **`carved-layout`**, provenance `asked`, at carve
  completion only: `editors/adapters/carveAdapter.tsx:32` (and via
  `survey/carve/CarveDecisionRenderer.tsx:19` under the decision host).
- Module: `packages/studio/src/survey/questions/gallery/carvedLayout.ts` —
  `provides: ["carved-layout"]` (:51), `writes: []` (:58),
  **`apply: () => ({})` (:59) — a deliberate no-op** (lead ruling D-090-30:
  089's patch contract has no carve-overlay channel).
- Reproduction happens **beside** `apply()`: `packages/studio/src/decisions/replayKeyboard.ts:235`
  folds any active `carved-layout` record at its own position in the derived
  order via `carveOverlayFromValue(record.value)`
  (`packages/studio/src/decisions/carveOverlay.ts`, `carveOverlayFromValue`),
  and `packages/studio/src/decisions/rebuildWorkingCopy.ts:294` /
  `installRebuiltState` (from :284) installs that slice wholesale into the
  store (`rebuildWorkingCopy.ts:303`–`308`: `deletedNodeIds`, `deletedItemIds`,
  `disabledFamilyIds`, `carveChars`, `carveDispositions`, `closedKeyboardCard`).

So, field by field, at carve-completion time:

| Carve field | In `carved-layout` value? | Rebuilt by replay fold + install? |
|---|---|---|
| `deletedNodeIds` | Yes (`kind:"node"`) | Yes |
| `deletedItemIds` | Yes (`kind:"item"`) | Yes |
| `disabledFamilyIds` | Yes (`kind:"family"`) | Yes |
| `carveChars` | Yes (`kind:"char"`) | Yes |
| `carveDispositions` | Yes (verbatim) | Yes |
| `closedKeyboardCard` | Yes | Yes |
| `undoStack` | **No** | **No** — `rebuildWorkingCopy.ts` install comment (at :294–:302) states the value cannot reconstruct it; left as it stands |
| `carveTouchKeepInert` | **No** (no field — D-090-31) | **No** — same install comment; also no live writer exists (see §A.2) |
| Per-item removal provenance | No — fold reconstructs *state, not provenance* (`decisions/carveOverlay.ts` header); the value stamps every removal `provenance:"asked"` (`survey/carve/carveValue.ts:77` builder) | n/a — provenance lives only in the decision record |

Additionally LOG-ONLY on this surface: step `carve` is in
`EDITOR_ACTION_STEPS` as `gallery_edit` (`decisions/recordEditorStep.ts:49`),
so completion also appends a decision-log summary (keys removed = nodes+items,
touch keys affected, bounded sample of deleted ids). That journal entry is in
addition to, and independent of, the DecisionSet source above.

### A.1 Writes

| # | Store action / field written (exact) — call site(s) | Author state carried (lost on a decisions-only rebuild, if not sourced) | Decision evidence | Verdict |
|---|---|---|---|---|
| A1 | `cascadeDelete` → `deletedItemIds` + `carveChars` (+ batch `undoStack` entry, see A5). Store impl `stores/workingCopyStore.ts:2055` (routes **both** rule-node ids and store-slot ids through the *item* channel; `deletedNodeIds` is not written by this action). Gallery bindings `CarveGalleryV2.tsx:711`; call sites `:863` (recommended row), `:878` (bulk rows), `:933` (cell), `:952` (group), `:965` (details-card cell), `:977` (details-card row) | Which rule/store contributors are carved away, per character incl. case-group aggregation (#1809); the NFC carved-character set `carveChars` | SOURCE — `carved-layout` value (`removals` kinds `item`/`char`), §A.0, at completion. Plus LOG-ONLY (`gallery_edit`) | HAS-DECISION-SOURCE |
| A2 | `cascadeRestore` → removes from `deletedItemIds` / `carveChars`, prunes `carveDispositions` for restored combos. Store impl `workingCopyStore.ts:2090`. Binding `CarveGalleryV2.tsx:712`; call sites `:861`, `:882`, `:931`, `:953`, `:967`, `:979`, `:1051` (removed-dropdown restore) | The un-carve itself: a rebuild that only replayed deletions without the restore would resurrect removed characters | SOURCE — same `carved-layout` snapshot: the value is built from the *net* overlay at completion (`currentCarvedLayoutValue()`, `carveValue.ts:100`), so restores are reflected as absence. Plus LOG-ONLY | HAS-DECISION-SOURCE |
| A3 | `keepAll` / `restoreAll` (one impl; `keepAll` impl `workingCopyStore.ts:2038`, `restoreAll: () => get().keepAll()` at `:2053`) → clears `deletedNodeIds`, `deletedItemIds`, `deletedTouchKeyIds`, `carveChars`, `undoStack`, `keyEditOverlay`, `carveDispositions`, `carveTouchKeepInert`, **`deadkeyOverlay`** (impl at `workingCopyStore.ts:2038`). Bindings `CarveGalleryV2.tsx:713`–`714`; call sites `:1115` (`keepAll()` on Skip), `:1207` (`restoreAll` via `RemovedDropdown onRestoreAll`) | For carve fields: "keep everything" = empty removal/disposition state. **Collateral:** this carve-surface action also wipes two *other* surfaces' overlays — `deadkeyOverlay.ops` (§B) and `keyEditOverlay.ops` (§D) — which are **not** part of the `carved-layout` value; pressing Skip/Restore-all in carve silently discards un-completed deadkey and touch key-edit work | SOURCE for the carve fields (net-empty snapshot at completion). The collateral clears have the evidence of their own surfaces (§B: SOURCE at deadkey completion — voided here before it can record; §D: RECORD-ONLY) | HAS-DECISION-SOURCE (carve fields only; collateral flagged) |
| A4 | `prefillCarveDispositions` → `carveDispositions` (bulk-default `block`/`allow-host` per combo, `deadkey-requirement` forced `block`; never overwrites an existing disposition). Store impl `workingCopyStore.ts:2135`. Binding `CarveGalleryV2.tsx:827`; sole call site `:837`, inside a `useEffect` on every change of recommended combos / `closedKeyboardCard` | Per-combo allow/block dispositions (spec 076 FR-022) that drive engine carve suppression at compile; pre-filled automatically, not by an explicit author gesture per combo | SOURCE — `carved-layout` value carries `dispositions: [...overlay.carveDispositions]` verbatim (`carveValue.ts:77`), fold installs them (`rebuildWorkingCopy.ts:307`), at completion | HAS-DECISION-SOURCE |
| A5 | `undoStack` batch entries — written as a side effect of A1/A2 (and popped/pruned by restores). Store impl inside `cascadeDelete`/`cascadeRestore`, `workingCopyStore.ts:2055` / `:2090` | The undo history itself: which cascade batches can still be undone, and each batch's `chars` (needed to unwind `carveChars` correctly when batches overlap) | NONE for the stack — explicitly excluded from the value and from install (§A.0 table). The *net effect* of an undo is sourced via A1/A2's net snapshot; the stack is not | NO-DECISION-SOURCE |
| A6 | `toggleFamilyDisabled` → `disabledFamilyIds`. **Adjacent, not in `editors/carve/`:** `packages/studio/src/components/rules/FamilyCardList.tsx:51` (binding), `:165` (click). No writer under `editors/` | Which rule families (groups) are disabled — excluded from compiled output by the working-copy transform | SOURCE (field-level) — `disabledFamilyIds` is in the `carved-layout` value (`kind:"family"`) and in the fold/install (§A.0). **Timing caveat (inference):** the value is only (re-)recorded at *carve* completion, and the family toggle lives on the rules surface, which is reached after carve in the flow — a toggle made after carve completion will not be in the recorded `carved-layout` value until carve is re-completed, so on rebuild it reverts to the carve-completion snapshot | HAS-DECISION-SOURCE (field-level, with timing caveat) |

Not a working-copy write (excluded from counts): `CarveGalleryV2.tsx:895`
`decidedChs` and the other `useState` UI state are component-local; they die on
unmount regardless of Spec 105 and carry no compiled-output state.

### A.2 Dormant carve store actions (declared, in the value or not, but no live writer)

These are **not counted** in §A.3 — `rg` finds no non-test call site in the whole
of `packages/studio/src` — but Phase 0 should know they exist, because a future
writer would silently change the counts:

| Store action (decl. / impl in `workingCopyStore.ts`) | Field | In `carved-layout` value? | Note |
|---|---|---|---|
| `setCarveDisposition` (decl. :1066, impl :2169) | `carveDispositions` (single combo, `author-override`) | Yes | The Allow/Block per-row UI was archived (`docs/archive/carve-disposition-ui`, per `CarveGalleryV2.tsx` comment at the prefill site); only the bulk prefill (A4) writes dispositions today |
| `setClosedKeyboardCard` (decl. :1030, impl :2133) | `closedKeyboardCard` | Yes | No UI writes it at `d9e3d63a` — the 076 closed-keyboard card UI is not mounted; the field is `null` in live flow, so the value's card slot is `null` |
| `setCarveTouchKeepInert` (decl. :739, impl :2200) | `carveTouchKeepInert` | **No** | No writer anywhere (live or dormant-path) **and** no value field (D-090-31, §A.0): if a writer is ever mounted, this becomes a NO-DECISION-SOURCE write immediately |
| `deleteNode` / `restoreNode` / `deleteItem` / `restoreItem` / `deleteTouchKey` / `restoreTouchKey` / `undoDelete` (single-item carve actions) | `deletedNodeIds` / `deletedItemIds` / `deletedTouchKeyIds` | Partially (node/item sets yes; touch-key set is §D's) | No call sites under `editors/carve/` — the v2 gallery uses only the cascade pair. (`undoDelete` *is* called live, but from `TouchGallery`, §D) |

### A.3 Carve headline counts

- Writes inventoried: **6** (A1–A6)
- NO-DECISION-SOURCE: **1** (A5 `undoStack`)
- BRIDGE-ONLY: **0** (the `gallery_edit` journal is LOG-ONLY *in addition to* a
  real source, so no row is bridge-only)
- HAS-DECISION-SOURCE: **5** (A1, A2, A3, A4, A6 — all completion-time, all via
  the replay fold, **not** via module `apply()`; A3 and A6 carry the flagged
  caveats in their rows)

---

## B. Deadkey editors — `editors/deadkey/`

Shape of every write on this surface (verified by `rg`): there is exactly one
commit funnel. `DeadkeySurface.tsx:73` binds `setWorkingIR`, its
`onCommitIr` callback (`DeadkeySurface.tsx:98`, body `:108`) is passed to all
three children (`:175` inventory as `onCommitRepair`, `:182` define form,
`:194` detail editor), and **every** IR commit in those children goes through a
local `commitAndRecord` that pairs the IR commit with
`commitDeadkeyOp(op)` — the op append is the decision-source half of the pair:

- `DeadkeyDefineForm.tsx:172` binding, `:173` `commitAndRecord` definition,
  `:175` `recordDeadkeyOp(op)`.
- `DeadkeyDetailEditor.tsx:197` binding, `:198` `commitAndRecord` definition,
  `:200` loops `recordDeadkeyOp` over the op list.
- `DeadkeyInventory.tsx:198` binding; its one commit (duplicate repair) pairs
  manually at `:199`–`:203`.
- No other `onCommitIr` / `onCommitRepair` / `setWorkingIR` call exists in
  `editors/deadkey/` non-test sources. `DeadkeyConflictDialog.tsx` and
  `BaseDisclosure.tsx` write nothing (callbacks / pure render only).

Decision machinery: DecisionSet id **`deadkeys-defined`**, value
`{ ops: [...deadkeyOverlay.ops] }`, recorded at completion only
(`editors/adapters/deadkeyAdapter.tsx:22` `currentDeadkeyValue()`, record at
`:35`; same via `survey/deadkeys/DeadkeyDecisionRenderer.tsx`).
Module `packages/studio/src/survey/questions/gallery/deadkeysDefined.ts`:
`provides: ["deadkeys-defined"]` (:44), `writes: [groups, stores, raw]` (:50),
and — unlike carve/physical/touch — a **real `apply()`** (:51) that replays the
ops over the context IR via `applyDeadkeyOpsToIr`
(`packages/studio/src/survey/deadkeys/deadkeyOps.ts`, IR replay in that module)
and returns `{ ir: { groups, stores, raw } }`. The op type and replay live in
`survey/deadkeys/deadkeyOps.ts`, re-exported by `lib/deadkeyOps.ts`; the studio
IR-edit primitives the ops mirror are in `editors/deadkey/deadkeyWrite.ts`
(`commitDeadkeyResult` / `commitDeadkeyEdit` route engine mutations through
`applyMutatePatch` / `DEADKEY_WRITES`).

Two caveats that apply to the whole surface:

- **The `deadkeyOverlay.ops` slice itself is not reinstalled by rebuild.**
  `installRebuiltState` (`rebuildWorkingCopy.ts:284`) installs IR, identity,
  attribution, helpDocs, historyEntryState and the carve slice — there is no
  deadkey channel. A rebuild reproduces the *IR effect* of the ops via
  `deadkeys-defined`'s `apply()`, but the store's live `deadkeyOverlay.ops`
  after a rebuild is whatever the live store already held (inference from the
  install code's exhaustive channel list). A subsequent deadkey completion
  re-snapshots from that live log, so any divergence between the recorded
  decision and the live log would propagate into the next record.
- **Completion-time only**, as §1: edits made after the last deadkeys-step
  completion (or before the first) exist only in `ir` + `deadkeyOverlay`
  until the step is completed again. Also: carve's `keepAll` (A3) clears
  `deadkeyOverlay` wholesale.

| # | Store action / field written (exact) — call site(s) | Author state carried | Decision evidence | Verdict |
|---|---|---|---|---|
| B1 | `setWorkingIR` → `ir` (`groups`/`stores`/`raw` via `DEADKEY_WRITES` mutate seam, `deadkeyWrite.ts` `commitDeadkeyResult`/`commitDeadkeyEdit`). Funnel: `DeadkeySurface.tsx:73` binding, `:108` sole call; invoked as `onCommitIr`/`onCommitRepair` from every row below | The entire deadkey lifecycle state of the working IR: trigger rules, fan-out stores, escape rules, name comment tokens, raw fragments for named deadkeys | SOURCE — reproduced by `deadkeys-defined` `apply()` replaying B2–B13's ops (module above). The IR write itself is never the source; the paired op is | HAS-DECISION-SOURCE |
| B2 | `commitDeadkeyOp` { kind:"define" } → `deadkeyOverlay.ops`. `DeadkeyDefineForm.tsx:258` via `commitAndRecord` (:173) | New deadkey: trigger key, allocated id, accent char, optional author name | SOURCE — `deadkeys-defined`; `applyDeadkeyOpsToIr` `define` case re-runs engine `defineDeadkey` | HAS-DECISION-SOURCE |
| B3 | `commitDeadkeyOp` { kind:"add-pair" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:265` | One base→accented pair appended to the fan-out stores | SOURCE — `deadkeys-defined`; replay `withAddedDeadkeyPair` | HAS-DECISION-SOURCE |
| B4 | `commitDeadkeyOp` { kind:"remove-pair" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:280` | Removal of the pair at a zipped fan-out index | SOURCE — `deadkeys-defined`; replay `withRemovedDeadkeyPair` (index-based: replay order is semantic) | HAS-DECISION-SOURCE |
| B5 | `commitDeadkeyOp` { kind:"rename" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:298` | Deadkey id change (atomic rewrite of all `dk(id)` references) | SOURCE — `deadkeys-defined`; replay engine `renameDeadkey` | HAS-DECISION-SOURCE |
| B6 | `commitDeadkeyOp` { kind:"merge-pairs" } + { kind:"delete" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:321` (rename-conflict "merge into existing" resolution) | Pair migration into the surviving deadkey, then deletion of the merged-from entity — no pair loss | SOURCE — `deadkeys-defined`; replay `withMergedDeadkeyPairs` + `deleteDeadkey` | HAS-DECISION-SOURCE |
| B7 | `commitDeadkeyOp` { kind:"set-name" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:343` | Author-chosen deadkey name (the `@deadkey:<hex> name=` trigger-rule comment token) | SOURCE — `deadkeys-defined`; replay `withDeadkeyAuthorName` | HAS-DECISION-SOURCE |
| B8 | `commitDeadkeyOp` { kind:"retarget-named" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:391` | Trigger change for a named `dk(name)` deadkey (typed rule or pre-#2238 raw fragment) | SOURCE — `deadkeys-defined`; replay `retargetNamedDeadkey` (raw channel is why the module's `writes` includes `raw`) | HAS-DECISION-SOURCE |
| B9 | `commitDeadkeyOp` { kind:"retarget" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:413` | Trigger-key move for a numeric deadkey | SOURCE — `deadkeys-defined`; replay engine `retargetDeadkey` | HAS-DECISION-SOURCE |
| B10 | `commitDeadkeyOp` { kind:"delete-named" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:440` | Deletion of a named deadkey's typed rules + raw fragments | SOURCE — `deadkeys-defined`; replay `deleteNamedDeadkey` | HAS-DECISION-SOURCE |
| B11 | `commitDeadkeyOp` { kind:"delete" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:463` | Whole-entity deletion of a numeric deadkey | SOURCE — `deadkeys-defined`; replay engine `deleteDeadkey` | HAS-DECISION-SOURCE |
| B12 | `commitDeadkeyOp` { kind:"merge-pairs"? } + { kind:"repoint" } + { kind:"delete" } → `deadkeyOverlay.ops`. `DeadkeyDetailEditor.tsx:534` (`handleRepointAndDelete`: optional merge first, then repoint of the conflict's exact referrer strings, then delete) | Referential integrity work: every rule/store referrer rewritten from the deleted id to the target id, with the recorded referrer list (replay rewrites exactly that list, never a fresh scan) | SOURCE — `deadkeys-defined`; replay `withRepointedDeadkeyRefs` (refuses on unparsed referrers, mirroring the editor) | HAS-DECISION-SOURCE |
| B13 | `commitDeadkeyOp` { kind:"repair-duplicate-ids" } → `deadkeyOverlay.ops`. `DeadkeyInventory.tsx:199`–`:203` (`repairDuplicates`, fired from `:232`) | Duplicate-id repair: extra trigger rules re-minted onto fresh ids; their pairs stay with the first deadkey | SOURCE — `deadkeys-defined`; replay `withRepairedDuplicateTriggerIds` | HAS-DECISION-SOURCE |

Store impl for the op append: `workingCopyStore.ts:2306` `commitDeadkeyOp`
(append-only; deliberately **not** on the shared `undoStack` — interface doc
at `workingCopyStore.ts:1195`).

### B.1 Deadkey headline counts

- Writes inventoried: **13** (B1 the IR funnel + B2–B13 the twelve op-commit rows)
- NO-DECISION-SOURCE: **0**
- BRIDGE-ONLY: **0** (no `recordEditorStep` entry exists for deadkeys, §2; the
  completion `recordGalleryDecisions` log entry rides on a record that *is* a
  source, so it does not make any row bridge-only)
- HAS-DECISION-SOURCE: **13** — with the surface-wide caveats above:
  completion-time snapshot only, and the live `deadkeyOverlay` slice is not
  reinstalled by rebuild even though its IR effect is

---

## C. Other editors — assign loop, physical (`editors/assignLoop/MechanismGallery.tsx`, `SequenceBuilderPanel.tsx`)

Decision machinery on this surface: DecisionSet id **`physical-layout`**,
value `{ assignments }` = `selectDesktopAssignments(phaseResults)` snapshotted
at completion (`editors/adapters/addPhysicalAdapter.tsx:43`;
`survey/assignLoop/physicalLayoutValue.ts` `currentPhysicalLayoutValue()`).
Module `packages/studio/src/survey/questions/gallery/physicalLayout.ts`:
`provides: ["physical-layout"]` (:52), `writes: []` (:59),
**`apply: () => ({})` (:60) — deliberate no-op** (D-090-38: its effects —
`lockDesktop`, repropagate — re-homed to `lib/assignLoopCompletion.ts` step
wiring). Replay has **no fold** for `phaseResults`/assignments (contrast §A.0:
`replayKeyboard.ts` folds only the carve slice beside patch channels).
Therefore the record is RECORD-ONLY, and additionally LOG-ONLY applies:
step `mechanisms` is in `EDITOR_ACTION_STEPS` as `mechanism_edit`
(counts assignments + newly-occupied keys).

| # | Store action / field written (exact) — call site(s) | Author state carried | Decision evidence | Verdict |
|---|---|---|---|---|
| C1 | `recordAssignments` → `phaseResults` phase-C entry's `assignments`. Binding `MechanismGallery.tsx:1574`; call sites `:2687`, `:3111`, `:3204`, `:3230`, `:3299`, `:3349`, `:3374`, `:3436`, `:3484` | Every physical mechanism assignment: character → mechanism(s), host key, per-assignment provenance (`source`: hand-set vs suggested) — the entire desktop layout the author built | RECORD-ONLY (`physical-layout` snapshot at completion; `apply` no-op, no replay fold) + LOG-ONLY (`mechanism_edit`) | BRIDGE-ONLY |
| C2 | `cascadeDelete` → `deletedItemIds` (shared carve overlay, §A). Binding `MechanismGallery.tsx:1626`; call sites `:3736` (rule row), `:3738` (slot row), in `handleRemoveExistingMethod` | Removal of a pre-existing (base-keyboard) production method, made from the mechanisms step — i.e. a carve decision taken *after* the carve step | NONE on this path. The field is in the `carved-layout` value (A1), but that value was already recorded at carve completion; (inference) nothing re-records it when the mechanisms step completes, so a rebuild restores the carve-completion set and this removal reverts | NO-DECISION-SOURCE |
| C3 | `unflagCharForSequence` → strips that char's `multi_char_sequence` assignments from phase-C (via `recordAssignments`) **and** removes the char from `sequenceFlaggedChars`. Binding `MechanismGallery.tsx:1582`; call sites `:4856`, `:5050` | The assignment strip is C1's state; `sequenceFlaggedChars` is the flagged-for-sequence list itself | Assignments part: RECORD-ONLY as C1. `sequenceFlaggedChars`: NONE — it appears in neither `physical-layout`'s value (`assignments` only) nor any other decision value found by `rg` | NO-DECISION-SOURCE |
| C4 | `setAxisFills` → `axisFills`. Binding `MechanismGallery.tsx:1593`; call site `:1978` (pattern-loading effect publishing default-fill provenance) | Which discovery axes were default-filled vs elicited, and by which prior — provenance the Flow Map renders | NONE — store field doc (`workingCopyStore.ts`, `axisFills` at the default-fill slice) calls it "a UI-visibility field only" and no decision value carries it | NO-DECISION-SOURCE |
| C5 | `unlockDesktop` → `desktopLocked`; `markStale` → `staleSteps` (touch step). Bindings `MechanismGallery.tsx:1571`–`1572`; call sites `:3770`, `:3772` (`handleEditAfterDone`) | "Author re-opened a completed desktop layout for correction" and the downstream touch step's staleness flag | NONE — session flags; the completion effects in `lib/assignLoopCompletion.ts` are step wiring fired by the adapter, not a decision `apply()` | NO-DECISION-SOURCE |
| C6 | `markGalleryIntroSeen("mechanism")` → `galleryIntrosSeen.mechanism`. Binding `MechanismGallery.tsx:1632`; call site `:3875` | Intro-splash seen flag only (no compiled-output state) | NONE | NO-DECISION-SOURCE |
| C7 | `recordAssignments` → same field as C1, called from `SequenceBuilderPanel.tsx:290` (apply), `:318` (remove), `:329` (edit) — the panel receives `recordAssignments` as a prop from `MechanismGallery.tsx:5129` | Multi-char sequence assignments (content + indicator) for a character | RECORD-ONLY, as C1 (+ LOG-ONLY via the mechanisms step) | BRIDGE-ONLY |

### C.1 Mechanism/physical headline counts

- Writes inventoried: **7** (C1–C7)
- NO-DECISION-SOURCE: **5** (C2, C3, C4, C5, C6)
- BRIDGE-ONLY: **2** (C1, C7)
- HAS-DECISION-SOURCE: **0**

---

## D. Other editors — assign loop, touch (`editors/assignLoop/TouchGallery.tsx` + `keyGrid/`)

Decision machinery: DecisionSet id **`touch-layout`**, value
`{ ops: KeyEditOperation[], deletedTouchKeyIds: string[] }` snapshotted from
`keyEditOverlay.ops` + `deletedTouchKeyIds` at completion
(`editors/adapters/addTouchAdapter.tsx:88`;
`survey/assignLoop/touchLayoutValue.ts` `currentTouchLayoutValue()`).
Module `packages/studio/src/survey/questions/gallery/touchLayout.ts`:
`provides: ["touch-layout"]` (:53), `writes: []` (:60),
**`apply: () => ({})` (:61) — deliberate no-op** (its header: the R2 build's
output "lands in the bare `touchLayoutJson` store string, for which 089's
patch contract has no channel"; replaying the ops reproduces the *gallery's
derived layout*, never the IR). Replay has **no fold** for `keyEditOverlay`,
`deletedTouchKeyIds`, `touchDraft`, or `touchLayoutJson` — the direct contrast
with carve (§A.0), whose identical snapshot pattern *did* get a fold in 093.
RECORD-ONLY therefore applies to D1/D2/D6, plus LOG-ONLY (`touch` →
`touch_edit`, counts targets from the step result).

The `keyGrid/` sub-surfaces (`AssignPanel.tsx`, `KeyPropertyPanel.tsx`,
`RenameDialog.tsx`, `RemoveKeyDialog.tsx`, `FamilyApplyDialog.tsx`,
`useKeyCommands.ts`) write **nothing** directly — their headers state
store-free / props-out, and `rg` confirms no `useWorkingCopyStore` write call
in them; every edit funnels into `TouchGallery`'s `commitKeyEditOp` (D1).

| # | Store action / field written (exact) — call site(s) | Author state carried | Decision evidence | Verdict |
|---|---|---|---|---|
| D1 | `commitKeyEdit` → `keyEditOverlay.ops` (append, store assigns `seq`). Via `commitKeyEditCore`, `TouchGallery.tsx:2755` (`store.commitKeyEdit(op)`), reached from `commitKeyEditOp` (:2961) and its ~25 call sites (property panel :3737/:3758/:3761/:3775, gesture/sub-key :3806–:3843, lint fixes :3876–:3940, dialogs :3548/:3979/:3982, bulk/family :4130/:6471/:7413, rename pairing :4032) | Every key-level touch layout edit in order: set/rename/move/add/remove, sub-key (longpress/multitap/flick) edits — order is semantic, replay resolves each op against prior ops' layout | RECORD-ONLY (`touch-layout` value carries the ops verbatim; `apply` no-op, no fold) + LOG-ONLY (`touch_edit`) | BRIDGE-ONLY |
| D2 | `deleteTouchKey` / `restoreTouchKey` → `deletedTouchKeyIds`. Bindings `TouchGallery.tsx:1843`–`1844`; call sites `:7150` (`deleteTouchKey(row.id)`), `:5100` (`restoreTouchKey(method.id)`) | Which pre-existing base touch methods (main / longpress / multitap / flick, by touch address) the author deleted | RECORD-ONLY — `deletedTouchKeyIds` *is* the second half of the `touch-layout` value (`touchLayoutValue.ts`), but with `apply` a no-op and no replay fold, the snapshot does not rebuild the set (contrast A1/A2, same pattern plus the 093 fold) + LOG-ONLY | BRIDGE-ONLY |
| D3 | `setTouchDraft` → `touchDraft { charTouchEntries, suggestionResolvedChars, bulkAccentGroups }`. Binding `TouchGallery.tsx:1985`; sole call site `:4742` (effect writing back on every `charTouch` / `suggestionResolved` / `bulkAccentGroups` change) | Per-character touch assignments in progress, which suggestion cards are already resolved, and sibling-accent bulk groups — the character-mode half of the touch step | NONE — `currentTouchLayoutValue()` snapshots only `keyEditOverlay.ops` + `deletedTouchKeyIds`; `touchDraft` is in no decision value | NO-DECISION-SOURCE |
| D4 | `setTouchLayoutJson` → `touchLayoutJson`. Call sites `TouchGallery.tsx:2813`, `:2819` (splice/promotion path in `commitKeyEditCore`), `:4036` (rename), `:4098` (identity/relink path) | The built `.keyman-touch-layout` JSON string — the actual touch artifact the preview/download consumes | NONE — the `touchLayout` module header names this explicitly: the output "lands in the bare `touchLayoutJson` store string", no patch channel, `apply` no-op | NO-DECISION-SOURCE |
| D5 | `setWorkingIR` → `ir` (incl. `ir.touchLayout`). Call sites `TouchGallery.tsx:2764` (promoted layout stitched onto IR), `:3017`, `:3065` (synthesis/merge results), `:4050` (severance removal IR), `:4095` / `:4097` (identity decision result), `:6008` (`promoteOnManualEdit`), `:6473` (`onInstallIr` from the key-grid host) | Touch-layout promotions and rule/layout splices landed directly on the working IR: provenance promotions to `hand-set`, severance/transplant IR results, manual-edit promotions | NONE for the write itself. Some call sites are paired with a D1 op commit in the same handler (e.g. :3015–:3017), so the *intent* is RECORD-ONLY via D1, but the IR mutation as written is not reproduced by any `apply()` (inference: pairing varies by call site; :6008 and :6473 have no adjacent `commitKeyEdit` in their handlers per `rg` context) | NO-DECISION-SOURCE |
| D6 | `commitTouchKeyRename` → `ir` (all `.kmn` bindings + layout key ids) via its internal `setWorkingIR`, plus `deletedTouchKeyIds` address remap. Call site `TouchGallery.tsx:4025`; paired by the caller with D1's `commitKeyEdit` at `:4032` and `setTouchLayoutJson` at `:4036` | A touch key's identity rename — every binding, guard and layout occurrence retargeted from old id to new id | RECORD-ONLY — the rename op rides in D1's ops snapshot; the store action's own IR fix-up (workingCopyStore doc at `commitTouchKeyRename`, decl. :1225) is a working-copy procedure, not a decision `apply()` | BRIDGE-ONLY |
| D7 | `setTouchKeyIdentity` → `touchKeyIdentity`; `recordKeyIdentityDecision` → `keyIdentityDecisions`. Call sites `TouchGallery.tsx:3042` + `:3284` + `:3301` (`setTouchKeyIdentity`, severance transplant/identity-decision/choice-state appends), `:4100` (`recordKeyIdentityDecision`) | Spec 104 key-identity state: repair proposals, severance/relink/kept-by-choice identity decisions, transplant records, inline choice states (keyRef, source/target ids, rule fingerprint, decisionRecordId) | NONE in the DecisionSet sense — these are the spec-104 decision-*spine* records persisted inside the working-copy snapshot itself; `rg` over `survey/questions/gallery/*.ts` finds no DecisionSet provider for them (inference: they are their own record system, not a 088/090 decision) | NO-DECISION-SOURCE |
| D8 | `setTouchEditorMode` → `touchEditorMode` (`"character"` / `"key"`). Binding `TouchGallery.tsx:1762`; call site `:4502` | View-mode toggle only (FR-036b: switching clears neither mode's state) | NONE | NO-DECISION-SOURCE |
| D9 | `undoDelete` → pops shared `undoStack` (dispatches per entry kind, incl. truncating `keyEditOverlay.ops`); `undoKeyEdit` → pops tail op + its `undoStack` entry. Bindings `TouchGallery.tsx:1778`; call sites `:7976` (`undoDelete`), `:7693` (`undoKeyEdit`) | The undo operations themselves — they *remove* previously committed key edits / deletions, changing what a later snapshot would contain | NONE — undo is session state (cf. A5); only the net post-undo state is snapshotted, under D1/D2's RECORD-ONLY | NO-DECISION-SOURCE |
| D10 | `markGalleryIntroSeen("touch")` → `galleryIntrosSeen.touch`. Binding `TouchGallery.tsx:1989`; call site `:6346` | Intro-splash seen flag only | NONE | NO-DECISION-SOURCE |

### D.1 Touch headline counts

- Writes inventoried: **10** (D1–D10)
- NO-DECISION-SOURCE: **7** (D3, D4, D5, D7, D8, D9, D10)
- BRIDGE-ONLY: **3** (D1, D2, D6)
- HAS-DECISION-SOURCE: **0**

---

## E. Other editors — panels (`editors/panels/`)

| # | Store action / field written (exact) — call site(s) | Author state carried | Decision evidence | Verdict |
|---|---|---|---|---|
| E1 | `setIdentity` → `identity` (IdentityPatch). Binding `TrackOneIdentityPanel.tsx:39`; call sites `:107` (display name), `:122` (keyboard id — valid values only). Panel is rendered on the Output screen for Track 1 | The new keyboard's display name and keyboard id (plus `bcp47`/`languageName` carried through from the decision-derived identity result the panel reads) | NONE on this path — the panel records no DecisionSet record (`rg`: its only `useDecisionStore` use is reading `decisions` for the derived identity result). Note (inference): rebuild *has* an identity channel — `installRebuiltState` (`rebuildWorkingCopy.ts:288`) installs `overlay.identity` when a decision folds one — but this panel's direct writes do not go through any such record, so a rebuild would overwrite/restore identity from decisions and lose a panel edit made after the relevant decision recorded | NO-DECISION-SOURCE |
| E2 | `setStartDocProfile` → `startDocProfile`. Binding `StartResolution.tsx:110`; call site `:247` (at base-selection confirm) | The chosen base's documentation-completeness classification (spec 080 FR-008), consumed by Phase F adaptive-description seeds | NONE — set at selection time from a fetched profile; no decision record on this path | NO-DECISION-SOURCE |

Non-writers in `panels/` (no table row, no count): `ScaffoldForm.tsx` — pure
props (`onSubmit(spec)`), no store import for writes.

### E.1 Panels headline counts

- Writes inventoried: **2** (E1, E2)
- NO-DECISION-SOURCE: **2**
- BRIDGE-ONLY: **0**
- HAS-DECISION-SOURCE: **0**

---

## F. Other editors — adapters & misc (`editors/adapters/`, `editors/touchSuggest/`)

The adapters under `editors/adapters/` are the bridges cited as evidence
throughout §§A–D (`carveAdapter.tsx`, `deadkeyAdapter.tsx`,
`addPhysicalAdapter.tsx`, `addTouchAdapter.tsx`): they write the **decision
store**, not the working copy, so they are not rows. `PhaseFGate.tsx:110`
likewise only records the `help-docs` DecisionSet record. Two exceptions /
non-writers complete the sweep:

| # | Store action / field written (exact) — call site(s) | Author state carried | Decision evidence | Verdict |
|---|---|---|---|---|
| F1 | `setHistoryEntryState` → `historyEntryState`. `editors/adapters/flowStepOptions.tsx:515`, in Phase F `onMount` (identity-guarded: writes only when `deriveHistoryEntryState` returns a new object) | The HISTORY-entry proposal state (`proposed`/`confirmed`/`edited`/`dismissed`, version, date, bullets) for the help-docs step | BRIDGE-adjacent — the written value is *derived* from `buildHistoryProposalSeed()` (which reads the decision record/log) rather than recorded as one, and the composite `help-docs` module (`survey/questions/gallery/helpDocs.ts`) has `apply: () => ({})`, `writes: []`. `historyEntryState` is a recognised overlay channel in replay's `foldPatch` / `installRebuiltState` (`rebuildWorkingCopy.ts:291`) when a flow decision folds it, but this mount-time write itself is not a DecisionSet record | BRIDGE-ONLY |

Non-writers (no row, no count):

- `editors/adapters/panelAdapters.tsx` `IdentityLiteAdapter` — header states
  it "writes NOTHING (spec 089)"; its effects are the recorded decisions and
  applies at the StepHost boundary. Decision-sourced by construction.
- `editors/touchSuggest/touchSuggest.ts` (+ `defaults.ts`) — pure generator
  over a locked IR (provenance-stamping suggestion producer); no store access.
- `editors/assignLoop/` remainder — `AssignLoopShell.tsx`, `PreviewPane.tsx`,
  `parts/*`, `keyGrid/*` (see §D preamble), `casePairCompanion.ts`,
  `siblingAccents.ts`, `touchBehavior.ts`, `existingMethodLabels.ts`:
  `rg` finds no working-copy write action call in any of them; they are
  presentational or pure, or funnel through C1/D1.

### F.1 Adapters/misc headline counts

- Writes inventoried: **1** (F1)
- NO-DECISION-SOURCE: **0**
- BRIDGE-ONLY: **1** (F1)
- HAS-DECISION-SOURCE: **0**

Out of `editors/` scope, noted once so it is not re-flagged as a gap: the
rules builder surface (`survey/rules/`, `RulesStep`) is a rule-editing surface
whose DecisionSet id `rule-set` has a **real** `apply()`
(`survey/questions/gallery/ruleSet.ts:48`, `spliceRuleAdditions` over
`groups`/`stores`, skipping carve-removed additions) — HAS-DECISION-SOURCE by
the §B standard. It is not counted here because it does not live under
`editors/`; the one rules-surface write that touches a field inventoried
above (`toggleFamilyDisabled`) is counted as A6.

---

## G. Roll-up

| Surface | Writes inventoried | NO-DECISION-SOURCE | BRIDGE-ONLY | HAS-DECISION-SOURCE |
|---|---:|---:|---:|---:|
| A. Carve (`editors/carve/` + A6 adjacent) | 6 | 1 | 0 | 5 |
| B. Deadkey (`editors/deadkey/`) | 13 | 0 | 0 | 13 |
| C. Assign loop — physical (`MechanismGallery`, `SequenceBuilderPanel`) | 7 | 5 | 2 | 0 |
| D. Assign loop — touch (`TouchGallery`, `keyGrid/`) | 10 | 7 | 3 | 0 |
| E. Panels (`editors/panels/`) | 2 | 2 | 0 | 0 |
| F. Adapters / misc (`editors/adapters/`, `touchSuggest/`) | 1 | 0 | 1 | 0 |
| **Total** | **39** | **15** | **6** | **18** |

Headline for Phase 0 planning:

1. **Carve and deadkeys are the only editor surfaces with a decision source,
   and the two mechanisms differ.** Deadkeys: a real module `apply()`
   (`deadkeys-defined`) replaying an op log that every commit site provably
   pairs with its IR write. Carve: a no-op `apply()` plus a one-off replay
   fold (`carveOverlayFromValue`) — the fold, not the module contract, is
   what makes `carved-layout` a source, and two carve fields
   (`undoStack`, `carveTouchKeepInert`) sit outside it.
2. **Both are completion-time snapshots of a directly-authored working
   copy.** Nothing under `editors/` records a decision at edit time. That —
   not missing decision modules — is the gap Option A has to close for
   A and B; for C and D it additionally has to give `physical-layout` /
   `touch-layout` a reproducing `apply()` or a carve-style fold, since
   today their records are snapshots that rebuild ignores.
3. **The largest unsourced author state is in the touch gallery:**
   `touchDraft` (D3), `touchLayoutJson` (D4), direct `setWorkingIR`
   promotions (D5), and the spec-104 `touchKeyIdentity` records (D7) have
   no DecisionSet source at all; the mechanisms gallery's core write
   (`recordAssignments`, C1/C7) is bridge-only, and its carve-overlay
   write from the mechanisms step (C2) silently desyncs the
   `carved-layout` snapshot.
4. **Cross-surface hazard:** carve's `keepAll`/`restoreAll` (A3) clears
   `deadkeyOverlay` and `keyEditOverlay` as a side effect — under a
   derived working copy this becomes a decision-visibility question, not
   just a store bug: one surface's "keep all" discards two other
   surfaces' un-recorded work.
