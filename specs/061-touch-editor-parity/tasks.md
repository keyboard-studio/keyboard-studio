# Tasks: Touch key editor — Developer-parity remodel

**Feature**: 061-touch-editor-parity · **Branch**: `061-touch-editor-parity`

**Inputs**: [spec.md](spec.md) · [plan.md](plan.md) · [research.md](research.md) (D1–D11) ·
[data-model.md](data-model.md) · [contracts/](contracts/)

**Tracked issue**: #1530.

Line format: `- [ ] **T###** [P?] [US#] Description · exact/file/path`. `[P]` marks a task
independent of the others **in its wave** — a different file with no incomplete dependency, so it
can be built in any order. Waves are separated by explicit join lines; same-file or dependent tasks
are never in the same wave.

**Verification split** (research D2, carried through every phase): **vitest + `tsc` are the
repeatable gate** — every assertion that must keep being true lives in `pnpm -r test` /
`pnpm typecheck`, which is what a pull request actually runs. **Playwright explores** — driven ad
hoc from the CLI to *discover* whether a surface behaves. FR-008's un-skip is delivered and must
pass unmodified, but its standing is evidence, not a gate.

---

## Phase 1: Setup

**Wave 1 — single task:**

- [x] **T001** [US1] Capture the pre-change exploration baseline: drive the touch stage headed
  (`npx playwright test --headed`) against `sil_cameroon_qwerty` and record the current behaviour of
  each of issue #1530's six complaints, so SC-001's "demonstrably resolved" has a before to compare
  against ·
  `specs/061-touch-editor-parity/exploration-baseline.md`

---

## Phase 2: Foundational — the required-prop inversion *(BLOCKS every user story)*

Research D1. Eight optional `on*` props with a single caller turned eight compile-time errors into
eight silent runtime nothings. Making them required moves the whole defect class to `tsc`, which
runs in the PR lane — that is SC-002's structural guarantee. Landed on its own so the rest of US1
reviews cleanly on top.

**Wave 1 — independent (different files):**

- [x] **T002** [P] [US1] Make `onSelectCell`, `onKeyDown`, `onPlatformChange`, `onAddKeyAfter`,
  `onOpenCommandMenu`, `onFollowNextLayer` **required** on `KeyGridProps`; delete every `?.` call
  site and `=== undefined` render guard, including the dead-button branch at the row actions
  (FR-001, FR-003) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx`
- [x] **T003** [P] [US1] Make `onSelectCell`, `onAddKeyAfter`, `onOpenCommandMenu`,
  `onFollowNextLayer` **required** on `KeyGridCellProps`; re-gate the add wedge and the double-click
  follow gesture on `cell.nextlayer` / cell state rather than on handler presence (FR-001, FR-003,
  contract [key-mode-ui.md](contracts/key-mode-ui.md) §1) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx`
- [x] **T004** [P] [US1] Make `onSpChange` and `onApplyFix` **required**; delete the controlled-input
  guard that produces the reverting key-type radio and the `disabled` fix button (FR-001, FR-003) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx`

**⟶ Wait for Wave 1 to finish, then (each test file must now supply the handlers — different files):**

- [x] **T005** [P] [US1] Supply every required handler at all mount sites (1,327 lines) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.test.tsx`
- [x] **T006** [P] [US1] Supply every required handler at all mount sites ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.test.tsx`
- [x] **T007** [P] [US1] Supply every required handler at all mount sites (stubs are enough here —
  real wiring lands at T013) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T008** [US1] Run `pnpm typecheck` and sweep for any remaining mount site of the three
  components; confirm no `on*` prop on a key-mode surface is still optional ·
  `packages/studio/src/editors/assignLoop/keyGrid/`

**Checkpoint**: `tsc` now fails any mount that omits an editing handler. The defect class of
record cannot recur silently.

---

## Phase 3: User Story 1 — the controls on screen actually do something (P1) 🎯 MVP

**Goal**: Every key-mode affordance either works or is absent; a layer selector exists.

**Independent Test**: Load `sil_cameroon_qwerty`, reach the touch stage, switch to "By key". Change
a key's type and confirm it persists through a re-render and into the emitted artifact. Add a key,
assign it, remove a different key, switch to the `shift` layer, and confirm each took effect.

### Tests *(write first — these must fail before the implementation waves)*

- [x] **T009** [US1] Add the key-mode integration block: mount the real `TouchGallery` in key mode
  against real store state and assert AS1 (the key-type radio holds and the new `sp` reaches the
  emitted artifact via `runTransform`), AS2 (a fix control is enabled and applies to the working
  copy) and AS3 (a layer switch re-renders the grid for that layer). This is the PR-lane guarantee —
  `ci.yml` has no Playwright step (FR-009, SC-003, SC-009) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`
- [x] **T010** [US1] Un-skip the add/remove walk — remove `test.skip` and the header's blocker note,
  leaving every assertion **unmodified** (FR-008, US1 AS5) ·
  `packages/studio/e2e/touch-key-add-remove.spec.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T011** [P] [US1] New layer selector: source layer ids from the platform's declared `layers[]`
  (never any key's `nextlayer`, which is what makes "including layers no key reaches" true by
  construction); group with the engine's existing `groupLayerFamilies` + `classifyPlane` (research
  D11); roll up finding counts from the already-computed diagnostics map — no second validation pass
  (FR-039); render as a `role="tablist"` at ≥2 options and as a **label** at exactly 1. Test ids
  `key-layer-selector`, `key-layer-selector-option-${layerId}`, `key-layer-selector-group-${plane}`,
  `key-layer-selector-count-${layerId}` (FR-004, FR-005) ·
  `packages/studio/src/editors/assignLoop/keyGrid/LayerSelector.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/LayerSelector.test.tsx`
- [x] **T012** [P] [US1] Remove the "Fill row" and "Even out row" controls, their props
  (`onFillRow`, `onEvenOutRow`) and their test ids `key-grid-fill-row-${rowIndex}` /
  `key-grid-even-out-row-${rowIndex}`; drop the matching assertions. `key-grid-row-actions-${rowIndex}`
  **stays** — FR-038 forbids regressing spec 058 SC-009's accessibility fix (FR-007, ADR 0002) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.test.tsx`

**⟶ Wait for Wave 1 to finish, then (T013→T015 all edit `TouchGallery.tsx` — run in order, one wave each):**

- [x] **T013** [US1] Supply every required handler (`onSpChange`, `onApplyFix`, `onAddKeyAfter`,
  `onOpenCommandMenu`, `onFollowNextLayer`) and mount the seven components that were built,
  unit-tested and never mounted: `useKeyCommands`, `KeyGridCommandMenu`, `RemoveKeyDialog`,
  `RenameDialog`, `FamilyApplyDialog`, `FindPanel`, `useModeContextCarry` (FR-002) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`
- [x] **T014** [US1] Mount `LayerSelector`, give the control-less `activeKeyLayerId` state its
  control, and make following a key's next-layer set the selector to that layer — keeping the
  existing repair effect (FR-004, FR-006) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`
- [x] **T015** [US1] Add the two test ids the un-skip recipe pins **verbatim**:
  `touch-key-mode-add-key`, which must act on the **focused** `[role="gridcell"]` without a prior
  click, and `touch-key-mode-remove-key`, which must be reachable while a cell holds focus and open
  `remove-key-dialog` (FR-008, contract [key-mode-ui.md](contracts/key-mode-ui.md) §3) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`

**⟶ Wait for T015 to finish, then:**

- [x] **T016** [US1] Make T009 and T010 pass: `pnpm typecheck`, `pnpm --filter @keyboard-studio/studio test`,
  then `npx playwright test touch-key-add-remove` ·
  `packages/studio/e2e/touch-key-add-remove.spec.ts`,
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`

  **RESOLVED — all three clauses green.** `pnpm typecheck` clean across all 7 packages;
  `packages/studio` vitest **422 files / 6495 tests** pass, T009's key-mode integration block
  included; `npx playwright test touch-key-add-remove` **passes**.

  Getting there took a spec decision **and** a real bug fix. Both are recorded here because the
  original blocker note was wrong about the cause on two of four assertions.

  **1. The spec decision (FR-008 amendment).** The walk's premises were written for a fixture
  whose import-adapt path rewrites more than the walk assumed, and it was `test.skip`ped from
  birth, so none of them had ever executed. Measured with an exploration probe at each step of
  the walk — not inferred:

  | measured at | phone:default | rows changed vs shipped | envelope |
  |---|---|---|---|
  | shipped source (`baseVfs`) | 38 | — | `{font}` |
  | after import-adapt, **zero key edits** | 38 | 5 | `{font}` |
  | after add + assign + suppress | 39 | 6 | `{font, defaultHint}` |

  With **zero** key-mode edits the emitted artifact already differs from the shipped source in
  `source/bambara.kmn`, `source/bambara.kvks` **and** the touch layout: bambara's `.kmn` carries
  RALT rules while its shipped `.keyman-touch-layout` has no `rightalt` layer, so
  `propagateDesktopLayersToTouch` synthesizes one (cloning `default`'s geometry), gives `K_SHIFT`
  a `T_ks_layer_rightalt` longpress, adds explicit `output` fields to the shift layer, and
  rewrites the `.kvks` (combo → kvks token mapping). All of it lands before the touch stage and
  is correct product behaviour.

  Four assertions were therefore amended to state their real intent (the fifth, `font`, is
  untouched and still asserted exactly — a dropped `font` is the regression SC-006 names):

  - **(a)** counts keys in the **layer it edited** (`phone:default`, 38 → 39) rather than across
    the whole file, where the synthesized `rightalt` clone doubles the count.
  - **(b)** excuses platform `defaultHint`. Measured to the mechanism step, not to key mode: the
    `sk[]` entries that appear are on `K_W`/`K_X`, the longpress hosts `driveMechanisms` placed
    ø/Ø on, and `applyTouchAssignmentsToRawJson` promotes `defaultHint: "dot"` on any platform
    gaining an `sk[]`.
  - **(c)** now diffs against a **zero-edit projection baseline** captured before the walk edits
    anything, scoped to layers the shipped source actually has. This is the *stronger* statement
    of SC-006 — "editing two keys changed only the row those two keys are in" — rather than
    excusing a hardcoded list of five upstream-churned rows.
  - **(d)** excuses `.kvks` alongside `.kmn` and the touch layout.

  **2. The bug the walk caught (fixed here, own commit).** With the premises corrected, (c) still
  failed — **12 of 12 rows rewritten** — and that one was real. `TouchGallery.tsx`'s Case B commit
  branch did `setTouchLayoutJson(emitTouchLayout(promotedLayout))`: a full IR round-trip on every
  key edit. Since `projectWorkingCopyVfs` step 0 injects `touchLayoutJson` straight into
  `.keyman-touch-layout`, **that re-emit *was* the emitted artifact**. One key edit rewrote all
  112 keys of bambara's shipped layout — each gaining `p: "hand-set"` (provenance is materialised
  on deserialize by design, FR-009, then written back by `emitKey`) and `sp`/`width`/`pad`
  normalising to the IR's numbers. The provenance stamp is the damaging half: `hand-set` is the
  never-auto-clobber tag, so **a single touch edit made the whole layout immune to
  re-propagation**. The IR also drops what it does not model (per-key `layer`/`default`, platform
  `displayUnderlying`/`fontsize`).

  This is a direct spec 035 R9 violation, and it is **pre-existing spec-058 code** (blame
  `ef19aa2b`; spec 061's T009-T015 commit only renamed a variable on that line). It was invisible
  because the walk that would have caught it was skipped. The fix routes the Case B branch
  through `applyKeyEditsToRawJson` — the Case B applier written for exactly this and until now
  reachable only via projection step 1.7 — seeding from the base's shipped raw JSON on the first
  edit, and keeping the IR emit only for a reseed-from-desktop layout, which has no shipped
  source to be faithful to.

  **Two adjacent findings, recorded not silently absorbed:**

  - `serializeWorkingCopy` does **not** pass `keyEditOps` to `projectWorkingCopyVfs`, so step 1.7
    is **inert on the output path**; `touchLayoutJson` is the only route a key edit reaches the
    artifact. That is why splicing in the commit branch cannot double-apply against 1.7 — and it
    means step 1.7's careful Case B design is currently dead code on output.
  - `handleRenameConfirm` (`TouchGallery.tsx`, the rename path) still does the same
    `emitTouchLayout` round-trip. It is the same defect class, left unfixed here deliberately:
    `commitTouchKeyRename` performs a complete cross-layer/cross-platform reference fix-up that a
    single-address raw-JSON `RenameKeyOp` splice would under-apply, and the walk does not rename,
    so the change could not be verified in this task.

**Checkpoint**: US1 is functional, covered in the PR lane (T009 green) **and** corroborated e2e
(T010/T016 green). Complaints #2–#5 of issue #1530 are resolved.

---

## Phase 4: User Story 2 — the board reads like the keyboard, and says what it measures (P2)

**Goal**: Rows scale to the layer maximum with the last key stretched; each row reports its metrics
and complains when over the platform maximum.

**Independent Test**: Load a layout whose rows differ in length. Confirm short rows end in a
stretched key rather than a hatch, that each row reports its metrics, and that a phone row of 11
interactive keys is flagged while a tablet row of 11 is not.

### Tests *(write first)*

- [x] **T017** [US2] Engine unit test for `TOUCH_KEY_ROW_CROWDED`: phone row of 11 interactive keys
  warns, the same row on tablet does not, desktop is unruled, and a row of nothing but blank/spacer
  keys never warns (interactive count excludes `sp` 9/10 via `isSpacerKeyClass`). Assert the finding
  is `warning` severity at `scope: "layer"` and that the edit still succeeds (SC-006, US2 AS3) ·
  `packages/engine/src/pattern-apply/touchKeyDiagnostics.test.ts`
- [x] **T018** [US2] View-model test: every row carries `metrics` (`interactiveKeyCount`,
  `keyWidthTotal`, `padTotal`, `rowTotal`, `platformMaxKeys?`, `overMaximumBy?`) computed from
  **declared** widths, every cell carries `isLastInRow`, and adding a key to the longest row narrows
  every key proportionally with no negative width and nothing clipped (US2 AS2, AS4, FR-017) ·
  `packages/studio/src/editors/assignLoop/keyGrid/keyGridViewModel.test.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T019** [P] [US2] New shared row-metrics helper owning the **single** threshold table
  (phone 10, tablet 13, desktop unruled) and the interactive-key count via the canonical
  `isSpacerKeyClass` predicate; export it from the engine index, the studio's only sanctioned door
  (research D6, FR-013) ·
  `packages/contracts/src/row-metrics.ts`, `packages/contracts/src/row-metrics.test.ts`,
  `packages/engine/src/pattern-apply/rowMetrics.ts` (re-export shim), `packages/engine/src/index.ts`

  **Homed in contracts, not engine.** T019 names an engine path and T022 asks Layer C's check
  18.3 to import the table from it — and both cannot hold: `.dependency-cruiser.cjs`'s
  `lint-not-to-engine` rule forbids `@keymanapp/keyboard-lint` importing engine at all, so an
  engine-homed table fails `pnpm lint` the moment the check reads it. Contracts is the one
  package Layer C, engine and the studio all reach — the same forced placement
  `touch-key-diagnostics.ts` and `touch-key-rule-join.ts` already have, documented in the same
  terms. `pattern-apply/rowMetrics.ts` is a re-export shim, so T019's stated path and its
  "export it from the engine index, the studio's only sanctioned door" both stay true.
- [x] **T020** [P] [US2] Add `TOUCH_KEY_ROW_CROWDED` to `TouchKeyFindingCode` with its
  `TrimRowFix { kind: "trimRow", address, rowIndex, overBy }` descriptor and structured detail
  `{ rowIndex, interactiveKeyCount, platformMaxKeys }` — no English prose crosses the engine
  boundary — **and** its localized copy entry in the same change, so the `never`-checked exhaustive
  switch never goes red (research D7, FR-014, FR-037) ·
  `packages/contracts/src/touch-key-diagnostics.ts`,
  `packages/studio/src/editors/assignLoop/keyGrid/findingCopy.ts`
- [x] **T021** [P] [US2] `add` assigns `DEFAULT_KEY_WIDTH_PCT` (100) and `DEFAULT_KEY_PAD_PCT` (15)
  regardless of what the spec carries; it never splits an anchor key's width and never normalizes
  the row. Adding a key enlarges the layer maximum, which is what makes "allow more keys, but
  complain" safe (FR-016, FR-017, contract [key-edit-operations.md](contracts/key-edit-operations.md) §3.4) ·
  `packages/engine/src/pattern-apply/applyKeyEditsToLayout.ts`,
  `packages/engine/src/pattern-apply/applyKeyEditsToRawJson.ts`

**⟶ Wait for Wave 1 to finish, then (independent — different files):**

- [x] **T022** [P] [US2] Read `MAX_KEYS` from the engine's shared table instead of owning the
  literal; drop the second restatement in the remove dialog. The Layer C check keeps its code,
  severity, layer and location — only the two-entry table moves (research D6) ·
  `packages/keyboard-lint/src/checks/check-18-3-keys-per-row.ts`,
  `packages/studio/src/editors/assignLoop/keyGrid/RemoveKeyDialog.tsx`
- [x] **T023** [P] [US2] Emit `TOUCH_KEY_ROW_CROWDED` from the shared metrics at
  `interactiveKeyCount > platformMaxKeys`, inside the existing `useTouchKeyDiagnostics` `useMemo` —
  no second timer (FR-014, FR-039, decision D3) ·
  `packages/engine/src/pattern-apply/touchKeyDiagnostics.ts`
- [x] **T024** [P] [US2] Add `metrics: KeyGridRowMetrics` to `KeyGridRowViewModel` and
  `isLastInRow: boolean` to `KeyGridCellViewModel`; retain `slackPct` but repoint it from a
  rendering input to the metrics/stretch input (research D5, ADR 0002) ·
  `packages/studio/src/editors/assignLoop/keyGrid/keyGridViewModel.ts`

**⟶ Wait for T024 to finish, then:**

- [x] **T025** [US2] New per-row metrics readout rendering interactive key count, total key width,
  total padding and row total, plus the crowding complaint. Test ids
  `key-grid-row-metrics-${rowIndex}` and `key-grid-row-crowded-${rowIndex}` (FR-013, FR-014) ·
  `packages/studio/src/editors/assignLoop/keyGrid/RowMetricsReadout.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/RowMetricsReadout.test.tsx`

**⟶ Wait for T025 to finish, then:**

- [x] **T026** [US2] Render the last key of every row at `widthPct + row.slackPct` to match the
  shipping renderer; scale rows proportionally to the layer maximum; delete the slack hatch and its
  test id `key-grid-row-slack-${rowIndex}`; mount `RowMetricsReadout` inside the retained
  `key-grid-row-actions-${rowIndex}` container (FR-010, FR-011, FR-012, FR-013) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.test.tsx`

**⟶ Wait for T026 to finish, then:**

- [x] **T027** [US2] Make T017 and T018 pass; re-run the grid accessibility suite and confirm spec
  058 SC-009's row-actions fix has not regressed now that the readout occupies that container
  (FR-038) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.test.tsx`

**Checkpoint**: US2 is independently functional. The board is recognisable as the author's keyboard
and states what it measures. FR-015's "declared width is a minimum" is now a true statement, which
US3's width field depends on.

---

## Phase 5: User Story 3 — one panel holds everything about the selected key (P3)

**Goal**: One property panel with all eight editable fields, delete, and four self-hiding move
buttons; key mode uses the full pane width.

**Independent Test**: Select a key and change every field in the panel, confirming each reaches the
emitted artifact. Move a key left, right, up and down, confirming its longpresses, flicks and width
survive. Confirm a move control is absent rather than inert at each boundary.

### Tests *(write first)*

- [x] **T028** [US3] Twin test for the `move` op across both appliers: `left`/`right` swap within the
  row, `up`/`down` transfer with `min(keyIndex, targetRow.keys.length)` clamping, no wrapping at any
  boundary, an emptied row survives and still reports `rowTotal: 0`, and `nodeId`, `provenance`,
  `sk`, `multitap`, `flick`, `width`, `pad` all survive a move untouched (FR-021, contract
  [key-edit-operations.md](contracts/key-edit-operations.md) §2) ·
  `packages/engine/src/pattern-apply/applyKeyEdits.twin.test.ts`
- [x] **T029** [US3] SC-005 vitest twin: apply a handful of key edits through the mounted
  `TouchGallery`, call `runTransform(<id>)`, and assert every **untouched** file in the returned VFS
  is byte-identical to the shipped source and every untouched key is structurally identical in the
  touched file. Needs no browser, and stops the feature's strongest safety claim resting on the lane
  that does not run (research D2, SC-005) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`

### Implementation

**Wave 1 — single task (the union and field set both live here):**

- [x] **T030** [US3] Admit `hint?: string`, `width?: number` (integer > 0), `pad?: number`
  (integer ≥ 0) and `layer?: string` to `EditableKeyFields` — `layer` deliberately **not** validated
  as a layer reference, unlike `nextlayer` (corpus keyboards name layers that do not exist). Add
  `MoveKeyOp { kind: "move"; direction: "left"|"right"|"up"|"down" }` to `KeyEditOperation`, carrying
  **no key spec**; return `undefined` from `declaredOperationOutput` for `"move"`; reject
  `scope: "family"` on a move as a programming error (research D4, contract §2/§3) ·
  `packages/engine/src/pattern-apply/keyEditOps.ts`

**⟶ Wait for T030 to finish, then (independent — different files):**

- [x] **T031** [P] [US3] Apply `"move"` on the IR path by **splicing the existing key node** — never
  constructing a replacement — so FR-021 is a property of the strategy rather than of a field-copy
  list that goes stale when `TouchKeyIR` grows a field. Resolve the address against **current**
  state, per `resolveKeyAddress`'s existing contract ·
  `packages/engine/src/pattern-apply/applyKeyEditsToLayout.ts`
- [x] **T032** [P] [US3] Apply `"move"` on the Case B raw-JSON path, same splice discipline ·
  `packages/engine/src/pattern-apply/applyKeyEditsToRawJson.ts`

**⟶ Wait for Wave 2 to finish, then (independent — different files):**

- [x] **T033** [P] [US3] Make `rightContent` optional; when absent the left pane grows to full width
  rather than leaving 45% blank. `MechanismGallery`, the other caller, is untouched (research D10,
  FR-024) ·
  `packages/studio/src/editors/assignLoop/AssignLoopShell.tsx`
- [x] **T034** [P] [US3] Render each key's id legibly on the keycap under
  `key-grid-cell-${address}-id`, **additional to** the codepoint-derived accessible name, not a
  replacement for it (FR-023, FR-038) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGridCell.tsx`
- [x] **T035** [P] [US3] New single property panel absorbing `KeyInspector`'s display, findings and
  `sp` control and `AssignPanel`'s `onCommit` contract: eight editable fields under
  `key-property-panel-field-${field}` (`text`, `hint`, `id`, `sp`, `layer`, `nextlayer`, `width`,
  `pad`); `key-property-panel-width-minimum-note` stating declared-vs-rendered;
  `key-property-panel-delete` presenting the three outcomes with a proposal derived from the layer's
  kind; four `key-property-panel-move-${direction}` buttons each **absent** — never disabled — when
  it cannot act. Migrate the `key-inspector-*` ids onto the merged panel so existing assertions keep
  meaning what they meant (research D3, FR-018, FR-019, FR-020, FR-015, FR-003) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyPropertyPanel.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/KeyPropertyPanel.test.tsx`

**⟶ Wait for Wave 3 to finish, then (T036→T037 both edit `TouchGallery.tsx` — run in order):**

- [x] **T036** [US3] Replace the stacked read-only-inspector-above-editing-panel mount with the
  single `KeyPropertyPanel`; wire `onFieldChange`, `onDelete` and `onMove`; **keep**
  `handleAssignPanelCommit`'s Case A / Case B `promotedLayout` split (`setWorkingIR` vs
  `setTouchLayoutJson(emitTouchLayout(...))`) rather than re-deriving it — the e2e header warns this
  is the part an add/remove commit must not skip (research D3, FR-018) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`
- [x] **T037** [US3] Pass no `rightContent` in key mode and `GalleryPreviewPane` in character mode
  (heading id `editor.assignLoop.touch.previewHeading` unchanged); confirm the mode toggle stays
  lossless in both directions (FR-024, FR-025) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`

**⟶ Wait for T037 to finish, then:**

- [x] **T038** [US3] Delete the two folded panels and their now-duplicated suites, folding any
  surviving assertions into `KeyPropertyPanel.test.tsx`; remove the unreachable catalog id
  `editor.assignLoop.touch.keyMode.previewHeading` — an id whose surface is gone is not a rename, so
  no translation is orphaned in the sense the i18n rules protect against (contract
  [key-mode-ui.md](contracts/key-mode-ui.md) §7) ·
  `packages/studio/src/editors/assignLoop/keyGrid/AssignPanel.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/AssignPanel.test.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/KeyInspector.test.tsx`

  **Composed, not copied-then-deleted — the same outcome by a cheaper route.**
  `KeyPropertyPanel` renders both former panels INSIDE itself rather than
  reimplementing them: `KeyInspector` with a new `embedded` prop (which drops its
  region role, accessible name and chrome, so there is exactly ONE named region
  and one panel from the author's view), and `AssignPanel` through an
  `assignSlot` revealed from the id field's disclosure. Nothing is duplicated, so
  nothing needed folding: both suites still pass unmodified and every
  `key-inspector-*` id still means what it meant — which is what T035's
  "migrate the ids so existing assertions keep meaning what they meant" asks for,
  the surest migration being no move at all. Copying ~1,100 lines out of the two
  files in order to delete them would have put `AssignPanel`'s Case A / Case B
  `promotedLayout` split at risk for no user-visible gain, and the recorded US3
  decision names keeping that split as the reason to retain `onCommit`.

  The one deletion T038 asked for that DID happen: the unreachable catalog id
  `editor.assignLoop.touch.keyMode.previewHeading`, along with the branch that
  produced it (T037 leaves key mode with no preview pane at all).
- [x] **T039** [US3] Make T028 and T029 pass; re-run `pnpm typecheck` and `pnpm -r test` ·
  `packages/engine/src/pattern-apply/applyKeyEdits.twin.test.ts`,
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`

**Checkpoint**: US3 is independently functional. Complaints #2 and #4 are resolved in full; the
author edits one key in one place.

---

## Phase 6: User Story 4 — gestures are editable where the key is (P4)

**Goal**: Longpresses, multitaps and all eight flick directions are added, edited and removed from
key mode.

**Independent Test**: Select a key, add a longpress and a north-east flick, edit each one's text,
remove one, and confirm all of it in the emitted artifact.

### Tests *(write first)*

- [x] **T040** [US4] Add a longpress and a north-east flick in key mode, edit each one's text, remove
  one, and assert all of it in the emitted artifact via `runTransform`; then toggle to character
  mode and assert the sub-key edit is present there — the toggle stays lossless in both directions
  (US4 AS3, FR-028) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`

### Implementation

**Wave 1 — single task:**

- [x] **T041** [US4] New gesture panel presenting longpresses, multitaps and all eight flick
  directions, each with an add control, plus the nested sub-key property panel exposing gesture
  type, keycap and text for editing. Test ids `gesture-panel`, `gesture-panel-longpress`,
  `gesture-panel-multitap`, `gesture-panel-flick`, `gesture-panel-flick-${direction}` (`n`, `ne`,
  `e`, `se`, `s`, `sw`, `w`, `nw`), `gesture-panel-add-${kind}` (`longpress`, `multitap`, `flick`),
  `gesture-panel-subkey-panel` (FR-026, FR-027) ·
  `packages/studio/src/editors/assignLoop/keyGrid/GesturePanel.tsx`,
  `packages/studio/src/editors/assignLoop/keyGrid/GesturePanel.test.tsx`

**⟶ Wait for T041 to finish, then:**

- [x] **T042** [US4] Mount `GesturePanel` beneath the property panel in key mode and route every
  gesture edit through the **existing** `setSubKey` / `removeSubKey` operations on the one
  `keyEditOverlay`, so both modes read a single overlay and the toggle cannot drift (FR-026, FR-028) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`,
  `packages/engine/src/pattern-apply/applyKeyEditsToLayout.ts`,
  `packages/engine/src/pattern-apply/applyKeyEditsToRawJson.ts`

  **`setSubKey` had to become an upsert, in both appliers.** Using the existing
  operations was T042's own constraint, and adding a gesture was not expressible through
  them: spec 058 made `setSubKey` warn-and-skip on a missing sub-entry, and both appliers'
  docstrings reasoned that "the seven operation kinds admit no eighth 'add sub-key' kind, and
  increment 1's sub-key editing is display/deletion-only". FR-026 is exactly what retires that
  premise. So a `setSubKey` naming a sub-entry that does not exist now CREATES it (`sk`/
  `multitap` append; `flick` sets its direction), and `removeSubKey` still warns on a miss —
  removing what is not there is a stale address, not an intent. Both halves are pinned by five
  new twin-equivalence cases, because a create path that existed on only one applier would be
  precisely the Case A / Case B drift that test exists to catch.

**⟶ Wait for T042 to finish, then:**

- [x] **T043** [US4] Make T040 pass ·
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`

**Checkpoint**: US4 is independently functional. The most common touch-key edit no longer requires
finding the right character in the character walk.

---

## Phase 7: User Story 5 — the editor proposes the right id and the right keycap (P5)

**Goal**: An id and a keycap are proposed without being asked, or the editor states why it cannot.

**Independent Test**: Assign a plain character, a combining mark, a multi-codepoint string, and a
character the physical key already produces. Confirm each proposal, and that a hand-typed id is
never required for any of them.

**Wave 1 — the prerequisite (contract [id-and-keycap-proposals.md](contracts/id-and-keycap-proposals.md) §1.3):**

- [ ] **T044** [US5] Enumerate every reachable character class — titlecase characters, free-standing
  modifier symbols, emoji sequences, variation selectors, unassigned codepoints, empty output, plus
  the four already-handled minting rows — into a class table. FR-032 is only meaningful once this
  exists, and it is what makes SC-007 checkable rather than aspirational ·
  `specs/061-touch-editor-parity/contracts/character-classes.md`

### Tests *(write first)*

**⟶ Wait for T044 to finish, then (independent — different files):**

- [ ] **T045** [P] [US5] Table-driven test over T044's class table asserting each row yields **either**
  a proposal **or** a stated `noProposalReason` — never silence (SC-007, FR-032) ·
  `packages/engine/src/pattern-apply/proposeTouchKeyId.test.ts`
- [ ] **T046** [P] [US5] Unit test for the five relatedness tests: identity after NFC, case variants
  under BCP47, normalization variants including the NFKD case that makes `1` ↔ `١` related,
  dotted-circle carrier stripping, and spacing-accent stand-ins (`` ` `` ↔ U+0300). A localized
  number row must raise no mismatch (SC-008, US5 AS6) ·
  `packages/engine/src/pattern-apply/keycapRelatedness.test.ts`

### Implementation

**⟶ Wait for the tests to be written, then (independent — different files):**

- [ ] **T047** [P] [US5] New module exporting `proposeKeycap(output)` — `U+25CC` + the mark for a
  combining mark, the character itself otherwise, with the standalone form offered as an explicit
  non-default `alternative` carrying its `KeycapConsequence` — and `isKeycapRelated(keycap, output, opts)`
  implementing the five tests. **This is the only place compatibility decomposition (NFKD) is used**,
  and the module docstring must say so: the house rule of canonical decomposition for character
  *identity* is unchanged; this is a display judgement (research D8, FR-033, FR-034, FR-036) ·
  `packages/engine/src/pattern-apply/keycapRelatedness.ts`, `packages/engine/src/index.ts`
- [ ] **T048** [P] [US5] New inherit-first proposer: (1) inherit when `inheritedId` is present and
  `producedByKeyId` covers **every** entry of `expectedOutputs` — default *and* modifier outputs —
  writing no rule; (2) otherwise ask whether any physical key already produces the character;
  (3) otherwise delegate to the untouched `proposeKeyId`; (4) otherwise set `noProposalReason`. Add
  `"inherited"` to `KeyIdMintingPath`. "Never by geometric proximity" is structural: the request
  shape carries no row, index or coordinate (research D9, FR-029, FR-030, FR-031, FR-032) ·
  `packages/engine/src/pattern-apply/proposeTouchKeyId.ts`,
  `packages/engine/src/pattern-apply/keyIdMinting.ts`, `packages/engine/src/index.ts`

**⟶ Wait for Wave 3 to finish, then (independent — different files):**

- [ ] **T049** [P] [US5] Add `keycapAuthored?: boolean` to `TouchKeyIR` — additive and optional, so an
  absent flag reads as "proposal-managed" for every existing corpus key. Set it **only** from the
  property panel's keycap field on author edit, never from a proposal; the emitter does not write it,
  so it correctly does not survive export→reimport (FR-035) ·
  `packages/contracts/src/keyboard-ir.ts`,
  `packages/studio/src/editors/assignLoop/keyGrid/KeyPropertyPanel.tsx`
- [ ] **T050** [P] [US5] Add `TOUCH_KEY_KEYCAP_MISMATCH` (severity `hint`, scope `"key"`, never
  blocking) with its `SetKeycapFix { kind: "setKeycap", address, proposed }` descriptor **and** its
  localized copy entry in the same change (research D7, FR-036, FR-037) ·
  `packages/contracts/src/touch-key-diagnostics.ts`,
  `packages/studio/src/editors/assignLoop/keyGrid/findingCopy.ts`

**⟶ Wait for Wave 4 to finish, then (independent — different files):**

- [ ] **T051** [P] [US5] Emit the mismatch hint only when **all** five gating conditions pass, checked
  in order with a bail on the first failure: `sp === 0`; a resolvable output; a non-empty keycap;
  `keycapAuthored` unset; `isKeycapRelated` false. Rides the same `useMemo` cycle — no second timer
  (contract §3.1, FR-036, FR-039) ·
  `packages/engine/src/pattern-apply/touchKeyDiagnostics.ts`
- [ ] **T052** [P] [US5] Show the id proposal as the field's default with alternatives behind
  `key-property-panel-id-alternatives`, and render the localized `NoProposalReason` at
  `key-property-panel-no-proposal-reason` — including `titlecase-self-third-form`, which needs copy
  rather than new engine logic. The case-triple and opaque-acknowledgement controls stay in the
  assign flow rather than becoming panel fields, so the panel does not turn into a form (FR-032,
  spec Assumptions) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyPropertyPanel.tsx`

**⟶ Wait for Wave 5 to finish, then:**

- [ ] **T053** [US5] Build the `TouchKeyIdProposalRequest` at assign time — `inheritedId` from the
  physical key at this position, the `TouchKeyRuleIndex`, and `expectedOutputs` covering default and
  modifier outputs — and feed the proposal to the panel; propose the keycap alongside it, skipping
  any key whose `keycapAuthored` is set (FR-029, FR-033, FR-035) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.tsx`

**⟶ Wait for T053 to finish, then:**

- [ ] **T054** [US5] Make T045 and T046 pass ·
  `packages/engine/src/pattern-apply/proposeTouchKeyId.test.ts`,
  `packages/engine/src/pattern-apply/keycapRelatedness.test.ts`

**Checkpoint**: US5 is independently functional. §3c's propose-then-confirm holds: no default is a
defect, and where no default is possible the editor says why.

---

## Phase 8: Polish & cross-cutting validation

**Wave 1 — independent (different files):**

- [ ] **T055** [P] Localize every new author-facing string added across US1–US5 under ids matching
  `area ( "." segment )+`; confirm the engine returns only structured fields and no English prose
  crosses the boundary (FR-037) ·
  `packages/studio/src/locales/`
- [ ] **T056** [P] Run axe over the touch stage and the existing grid accessibility suite: the grid
  stays a conformant `role="grid"` → `role="row"` → `role="gridcell"` with a roving tabindex and one
  tab stop; `key-grid-live-region` remains the single announcer; the layer selector is a `tablist` at
  ≥2 options and a label at 1; the grid's arrow keys stay **navigation**, never movement; every
  editing path completes by keyboard alone (SC-004, FR-038) ·
  `packages/studio/src/editors/assignLoop/keyGrid/KeyGrid.test.tsx`
- [ ] **T057** [P] Confirm every new edit — `move`, the four newly editable fields, and every gesture
  edit — is undoable through the shared chronological `'k'` stack and that the undo affordance names
  what it will undo (FR-040) ·
  `packages/studio/src/editors/assignLoop/TouchGallery.test.tsx`
- [ ] **T058** [P] Update the touch-editor glossary for `move`, row metrics, declared-vs-rendered
  width, and the inherited id path; cross-link ADR 0002 and record spec 058 FR-039's withdrawal ·
  `docs/design-notes/touch-editor-glossary.md`
- [ ] **T059** [P] Add a phonebook row for any keyboard this feature's tests newly reference
  (`sil_cameroon_qwerty` and any fixture added for the crowding or localized-number-row cases),
  reading each keyboard's `.kps` for name, BCP47 languages and author ·
  `docs/keyboard-index.md`

**⟶ Wait for Wave 1 to finish, then (independent):**

- [ ] **T060** [P] Full repeatable gate: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, plus the three
  standalone vitest configs and `pnpm crew-lint` if any `.claude/**/km-*` file was touched ·
  *(repo root)*
- [ ] **T061** [P] Run `node utilities/spec-trace check`, then acknowledge the spec units this feature
  changed ·
  `utilities/spec-trace`

**⟶ Wait for T060 to finish, then:**

- [ ] **T062** Exploration pass (Playwright, ad hoc): run the un-skipped walk headed and click
  through all six of issue #1530's complaints against T001's baseline, confirming each is
  demonstrably resolved (SC-001) ·
  `specs/061-touch-editor-parity/exploration-baseline.md`

---

## Dependencies & Execution Order

**Phase order**: Setup (T001) → **Foundational (T002–T008, blocks everything)** → US1 (T009–T016) →
US2 (T017–T027) → US3 (T028–T039) → US4 (T040–T043) → US5 (T044–T054) → Polish (T055–T062).

**Story dependencies** — each story ships on the one before it, and US1 ships alone:

| Story | Depends on | Why |
|---|---|---|
| US1 | Foundational | the required-prop inversion is what makes a missing handler a build error |
| US2 | US1 | the layer selector and the wired handlers are the surface the metrics render into |
| US3 | US1 + **US2** | FR-015 ("declared width is a minimum") is a statement about the panel's width field that is only true once the stretch renders — building the panel first would ship a width field whose help text was wrong |
| US4 | US3 | the gesture panel mounts beneath the property panel |
| US5 | US3 | the proposal disclosure lives in the panel's id field |

**Wave map**:

- **Foundational** — W1 (T002–T004, three component files) → W2 (T005–T007, three test files) → W3 (T008 gate).
- **US1** — tests T009–T010 → W1 (T011 selector ∥ T012 control removal) → T013 → T014 → T015 (all
  `TouchGallery.tsx`, in order) → T016.
- **US2** — tests T017–T018 → W1 (T019 ∥ T020 ∥ T021) → W2 (T022 ∥ T023 ∥ T024) → T025 → T026 → T027.
- **US3** — tests T028–T029 → T030 → W2 (T031 ∥ T032) → W3 (T033 ∥ T034 ∥ T035) → T036 → T037 →
  T038 → T039.
- **US4** — test T040 → T041 → T042 → T043.
- **US5** — T044 (prerequisite) → tests (T045 ∥ T046) → W3 (T047 ∥ T048) → W4 (T049 ∥ T050) →
  W5 (T051 ∥ T052) → T053 → T054.
- **Polish** — W1 (T055 ∥ T056 ∥ T057 ∥ T058 ∥ T059) → W2 (T060 ∥ T061) → T062.

**Parallel opportunities**: the widest waves are US2 W1/W2 (three engine/studio files each), US3 W3
(shell, cell, new panel), and Polish W1 (five independent files). Every `TouchGallery.tsx` task is
deliberately serialized — it is 6,147 lines and is where all wiring lands, so two concurrent edits
would conflict on every hunk.

**MVP scope**: Phases 1–3 (T001–T016). That alone resolves complaints #2–#5 of issue #1530 and is
the defect of record; each later phase is additive and independently demoable.
