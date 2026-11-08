---
description: "Task list for spec 113: Layout tab and the kmn-edits decision"
---

# Tasks: Layout tab — a visual desktop-layout editor

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included throughout. The spec makes them requirements: SC-001, SC-002, SC-007, SC-009,
and SC-010 are corpus assertions; SC-004 is "a test that fails on either" (a text write path or a
second timer); SC-011 is the spec 105 equivalence gate; each story's Independent Test is an E2E row
in [quickstart.md](quickstart.md).

**Paths**: `CT/` = `packages/contracts/src/`, `EN/` = `packages/engine/src/`,
`ST/` = `packages/studio/src/`, `LY/` = `packages/studio/src/editors/layout/`,
`E2E` = `packages/studio/e2e/layout-tab.spec.ts`. All other paths are from the repo root.

**Authority while implementing**:

- Edit entries, replay, seams: [contracts/layout-ops.md](contracts/layout-ops.md).
- Code-tab import (US8): [contracts/code-edits.md](contracts/code-edits.md).
- Attribution, `simulateEach`, verification, base join: [contracts/attribution.md](contracts/attribution.md).
- Editability is FR-013 as amended (research R3). **When in doubt, read-only.**
- Every edit is a `kmn-edits` (or, for deadkey lifecycle and fan-out tables, `deadkeys-defined`)
  decision recorded at the confirm (ruling 6). No new working-copy field; no `layoutOps` slice;
  `physical-layout` is not touched.

**Commit cadence** (CLAUDE.md):

- One commit per phase, pushed when its gates are green. The message names the tasks it closes
  (`spec 113 T0NN-T0NN`). Out-of-scope repairs get their own commit.
- **PR 1 = Phases 1–5 (Setup, Foundational, US1, US2, US3)** on `km/113-layout-studio`. Check the
  upstream before every push: `git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` must print
  `origin/km/113-layout-studio`.
- Phases 6–9 (US8, US5, US6, US4) go on a follow-up branch cut from `main` after PR 1 merges.

**Gates for every phase**: `pnpm typecheck`, `pnpm -r test`, `pnpm lint`, plus the phase's corpus
suites (`cd packages/engine && npx vitest run --config vitest.corpus.config.ts <paths>` — the
default engine config excludes `*.corpus.test.ts`). Any phase that adds UI strings also passes
`pnpm --filter @keyboard-studio/studio messages:extract`, has its French written in
`ST/locales/fr/messages.json` in the same change, and passes `pnpm run i18n-catalog-lint`.
Cell-class labels, read-only reasons, proposal copy, and review-flag text are **Content-team copy**
(FR-041): list their message ids in the phase's PR body for Content review.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task serves (US1–US6, US8)

---

## Phase 1: Setup

**Purpose**: module skeletons and the fixed corpus set every harness uses.

- [x] T001 [P] Create the engine module skeletons `EN/layout-attribution/index.ts` and `EN/layout-ops/index.ts` (barrels, empty), and re-export both from `EN/index.ts`, following how `EN/deadkey-lifecycle/` is exported (check `packages/engine/package.json` `exports` for a subpath pattern and match it)
- [x] T002 [P] Pick the corpus set in `EN/layout-attribution/__fixtures__/corpusSet.ts`: at least 20 keyboard ids from `../keyboards`, each with its category — simple positional; deadkey fan-out (spec 083 shape); deadkey keystroke-keyed (`dk(x) + [K_E]`); literal context (`'n' + [K_G]`); store-based (`any()`/`index()`); `if()`/`platform()`/options; later-group normalisation; opaque fragment; mnemonic (`&mnemoniclayout`); ISO (`K_oE2`). Add `EN/layout-attribution/corpusSet.corpus.test.ts` asserting every id parses with `parseKmn` (a non-parseable pick is replaced, not skipped). In the **same commit**, add a row to [docs/keyboard-index.md](docs/keyboard-index.md) for every picked keyboard not already there (read its `<id>.kps` for name, BCP47 languages, and author, per that file's "Keep this current" recipe)

---

## Phase 2: Foundational (plan phase A — blocks every story)

**Purpose**: contracts, the attribution engine, `simulateEach`, the emit line map, ISO geometry,
and the pure edit operations and replay.

**Checks that settle contract details (do first; record results where named)**

- [x] T003 Decide the form of `deadkeyId` in `LayoutOutput` / `LayoutContext` / `LayoutBecomes`: spec 083's `DeadkeyOperation.id` is a `number` (`ST/survey/deadkeys/deadkeyOps.ts:58`), while the IR names deadkeys in `dk(...)` (named, e.g. `dk(acute)`, or hex, e.g. `dk(3001)`). Read `listDeadkeys` in `EN/deadkey-lifecycle/` and pick one stable string form that round-trips through parse/emit for both kinds. Record the decision in [research.md](research.md) R2 and in the type comment in [contracts/layout-ops.md](contracts/layout-ops.md)
- [x] T004 Check three spec 083 facts US3 depends on, reading `EN/deadkey-lifecycle/mutations.ts` and `ST/editors/deadkey/deadkeyWrite.ts`, and record each result in [research.md](research.md) R2 with the Phase 5 task it decides:
  - (a) whether `define.accentChar` (the trigger's double-tap escape output) serves as the deadkey's **display character**, readable back from the IR (→ T075);
  - (b) whether `defineDeadkey` / `retargetDeadkey` accept a `triggerKey` on a modifier layer (e.g. `[RALT K_QUOTE]`), since FR-010 makes every layer editable (→ T076);
  - (c) whether undoing `remove-pair` with `add-pair` reorders the fan-out stores (`add-pair` appends; `remove-pair` takes an index), which would break SC-003's "emitted `.kmn` matches after undo" (→ T074)

**Contracts**

- [x] T005 [P] Move `ModifierToken` from `EN/pattern-apply/modifierCombos.ts` to `CT/layoutOps.ts` and add `LayerCombo = readonly ModifierToken[]`; `modifierCombos.ts` imports and re-exports it so existing engine imports keep working. No behaviour change; existing engine tests stay green
- [x] T006 Add to `CT/layoutOps.ts`: `LayoutOutput`, `LayoutContext`, `LayoutBecomes`, `LayoutOperation` exactly as in [contracts/layout-ops.md](contracts/layout-ops.md) (with T003's `deadkeyId` form). Add `CT/kmnEdits.ts` with `KmnEditsValue = { entries: KmnEdit[] }` and `KmnEdit = LayoutOperation` (the `CodeEdit` / `ReviewKept` arms are added in T090). Export both files from `CT/index.ts`
- [x] T007 Add `LayoutOperationSchema` and `KmnEditsValueSchema` to `CT/schemas.ts`, each with a compile-time drift guard against its type (the repo's existing guard pattern in that file). Tests in `CT/kmnEdits.test.ts`: every op kind parses; unknown `op`, missing `vkey`, non-monotonic `seq` within a value, and empty `text` are rejected
- [x] T008 [P] Add `authorEdit?: "layout-tab" | "code-tab"` to `IRRule` in `CT/keyboard-ir.ts`, beside `rulesStepAdded` (~line 496), with a doc comment naming its only writers (`applyLayoutOp`, `applyIRChanges`). Confirm `CT/schemas.ts` has no zod mirror of `IRRule` (none exists for `rulesStepAdded`); if one exists, add the field there too. Add an assertion to `EN/codec/emit.test.ts` that a rule carrying `authorEdit` emits byte-identically to the same rule without it

**Geometry, simulator, emitter**

- [x] T009 [P] ISO-aware desktop geometry in `EN/layout-chart/geometry.ts`: move `FORM_ROWS`, `FORM_ONLY_KEYS`, and `isFrameKey` from `EN/ldml-export/lower/positions.ts` into it (positions.ts imports them back — one copy), and export `DESKTOP_ISO_GEOMETRY` with `K_oE2`, a space row, and a per-key `frame` flag. `DESKTOP_GEOMETRY` (ANSI) is unchanged for existing callers. Tests in `EN/layout-chart/geometry.test.ts` (create if absent): `K_oE2` present, space row present, Backspace/Enter/Tab/arrows flagged frame, ldml-export tests still green
- [x] T010 [P] Add `simulateEach(compiled, inputs, seed?)` to `EN/simulator/index.ts` (and the Node entry `EN/simulator/node.ts` if the loader split requires it): load the keyboard once, reset context to `seed` before each input, return one `SimulationStep` per input with `firedRule`. Unit tests in `EN/simulator/simulateEach.test.ts` on a fixture keyboard: empty seed, text seed (`'n'`), `pendingDeadkeys` seed; each step equals `simulate()` for the same input
- [x] T011 `simulateEach` parity corpus suite `EN/simulator/simulateEach.corpus.test.ts`: for every keyboard in T002's set and every key of `DESKTOP_ISO_GEOMETRY` in every layer `listLayers` returns, `simulateEach` equals per-key `simulate()` (output text and `firedRule`); and a full-grid run for 8 layers completes under 200 ms in the Node harness (plan performance goal). **Nothing in Phase 3+ consumes `simulateEach` until this suite is green** (plan risk)
- [x] T012 [P] Emit line map in `EN/codec/emit.ts`: `emitKmn(ir, { lineMap: true })` returns `{ text, lineByNodeId }`; the existing call signature and output are unchanged byte-for-byte. Tests in `EN/codec/emit.test.ts`: every rule, store, group, and raw node id maps to the 1-based line that emits it; `text` equals plain `emitKmn(ir)` on the codec's round-trip fixtures

**Attribution engine** ([contracts/attribution.md](contracts/attribution.md))

- [x] T013 Write `EN/layout-attribution/types.ts`: `RowShape`, `ReadOnlyReason`, `RowAttribution`, `KeyCellAttribution` per the contract, adding `"complex-output"` to `ReadOnlyReason` for `beep`, context reordering (`context(n)` outputs), and `index()` outside the fan-out shape (FR-012 "Complex output"); update [contracts/attribution.md](contracts/attribution.md) with that value in the same commit
- [x] T014 [P] Tests first, `EN/layout-attribution/classifyRule.test.ts`: one fixture rule per `RowShape`; the R3 fan-out exemption (`dk(x) + any(bases) > index(outs, n)` with both stores plain character lists → `deadkey-fanout`, editable; the same with a non-plain store → `store-based`); `if()`, `platform()`, option stores → `conditional`; `RawKmnFragment` → `opaque`; a rule in a `readonly` group → read-only; `beep` → `complex-output`; a character key rule (`+ 'a'`) on a positional keyboard attributed to the vkey Keyman uses (`EN/simulator/reverseUsLayout.ts`)
- [x] T015 Implement `EN/layout-attribution/classifyRule.ts` to pass T014
- [x] T016 [P] Tests first, `EN/layout-attribution/attributeLayer.test.ts`: plain behaviour editable with one context-free rule; two context-free rules on one key/layer → first is `plain`, second is a `never-fires` row; a read-only context-free rule that precedes and changes the plain output makes `plain` read-only, while a read-only **contextual** row never does (FR-013); contextual rows listed with shape and provenance; `authorEdit` → provenance `hand-set`; no matching rule → `unhandled`; frame keys → `frame`; the entry group is the one `begin Unicode` uses
- [x] T017 Implement `EN/layout-attribution/attributeLayer.ts` to pass T016
- [x] T018 [P] Implement `EN/layout-attribution/listLayers.ts` (wraps `collectLayerCombosInUse`, `EN/pattern-apply/modifierCombos.ts:711`), `listContexts.ts` (literal contexts and deadkeys in use, with key counts), `isMnemonic.ts` (`&mnemoniclayout`), and `findShadowedRules.ts` (an earlier rule in the same group with the same context and key element always matches first), with tests in `EN/layout-attribution/listings.test.ts`
- [x] T019 Implement `EN/layout-attribution/verifyCells.ts` (pure): given attributions, the `SimulationStep`s for their keys, and an optional fired-rule check callback, demote every editable plain or row whose simulated output differs from its own output to `later-group-change`. It lives in the engine so the corpus harness and the studio hook share one implementation; note this in [contracts/attribution.md](contracts/attribution.md) ("Studio: verification" calls it). Tests in `EN/layout-attribution/verifyCells.test.ts`, including a normalisation group that rewrites a key's output
- [x] T020 Export T013–T019 from `EN/layout-attribution/index.ts`

**Edit operations and replay** ([contracts/layout-ops.md](contracts/layout-ops.md))

- [x] T021 [P] Tests first, `EN/layout-ops/applyLayoutOp.test.ts`: `set-key` removes every context-free rule for exactly `vkey` + `layer` and inserts one before the terminal rules (`insertBeforeTerminalRules`, `EN/pattern-apply/ir-insert.ts:34`), leaving contextual rules alone; `set-row` / `remove-row` match exactly `context` + key; `decline-case-partner` has no IR effect; inserted rules carry `authorEdit: "layout-tab"`; the returned `KmnEditEffect` lists inserted node ids and removed rules with positions; refusals throw for a `readonly` group, a `RawKmnFragment` target, a mnemonic keyboard, and an unknown deadkey id
- [x] T022 Implement `EN/layout-ops/applyLayoutOp.ts` returning `{ ir, effect }`, with `KmnEditEffect` exported from `EN/layout-ops/types.ts`, to pass T021
- [x] T023 [P] Tests first, `EN/layout-ops/replayKmnEdits.test.ts`: replaying the same entries twice yields the same IR (idempotence); later entries on the same `(vkey, layer[, context])` win; a `clear-key` drops the earlier `set-key`s for its slot (the normalising pre-pass — replay is not a plain reduce); the **live** `clear-key` path (T024) produces the same rules for that slot as replay, both with the earlier effects available and after a reload when only the starting point is (restore from `startIr`)
- [x] T024 Implement `EN/layout-ops/replayKmnEdits.ts` (`replayKmnEdits(ir, entries) → { ir, misses }`, misses always empty until US8) and `EN/layout-ops/clearKeyLive.ts` (the live `clear-key` restoration) to pass T023
- [x] T025 [P] Implement `EN/layout-ops/invertEffect.ts` (`invertEffect(ir, effect)`: drop inserted nodes, restore removed nodes at their positions) with tests in `EN/layout-ops/invertEffect.test.ts`: for every op kind, `emitKmn(invertEffect(applyLayoutOp(ir, op)))` equals `emitKmn(ir)`
- [x] T026 Export T021–T025 from `EN/layout-ops/index.ts`

**Corpus harness skeleton**

- [x] T027 Create `EN/layout-attribution/layout-attribution.corpus.test.ts`: for every keyboard in T002's set, parse, compile through the Node compile path the existing engine corpus suites use (`EN/ldml-export/compile.corpus.test.ts` shows it), `listLayers`, `attributeLayer` for every layer over `DESKTOP_ISO_GEOMETRY`, `simulateEach`, `verifyCells`. Assert nothing throws (SC-002 precursor) and print per-keyboard cell counts by class. Honesty assertions are added in T046

**Checkpoint**: contracts, engine attribution, `simulateEach`, line map, geometry, and the pure
edit ops are green. Commit `spec 113 T001-T027`.

---

## Phase 3: User Story 1 — See what every key really types (Priority: P1) MVP

**Goal**: a read-only Layout tab that is always right: every key in every listed layer shows what
the compiled keyboard produces and where it comes from, with "view in code" for read-only cells.

**Independent Test**: load the corpus set; for every key in every listed layer, the cell matches
the compiled keyboard with an empty context or is read-only with its reason; no keyboard is
refused (SC-001, SC-002).

### Tests for User Story 1

- [x] T028 [P] [US1] `LY/desktopGridViewModel.test.ts`: the provenance × output matrix of FR-012 (hand-set / starting point / base fallback × text / deadkey with display char and combination count / types nothing / complex / opaque / frame); the has-contextual-rows flag never makes a cell read-only; frame keys show no provenance; `K_oE2` labelled when the primary base keyboard lacks it; stale and not-compiled states
- [x] T029 [P] [US1] `LY/baseFallbackCells.test.ts`: primary base keyboard first and every picked base listed in the detail; "unknown" when a picked base has no reference data or the layer is outside none/shift/altgr/shiftAltgr; "system shortcut" for Ctrl/Alt+letter; a "Do nothing" class policy shows the base character with "policy not yet in effect" (spec 109 `swallowUndefined` not built); the simulator's US fallback is never used (FR-014)
- [x] T030 [P] [US1] `LY/useLayoutAttribution.test.ts`: reads only `ST/stores/rulesDemoArtifactStore.ts`; while loading every cell is `not-compiled`; on a failed compile the last good result is shown stale; mismatches are demoted via `verifyCells`; the hook starts no timer and calls no compile (spy on `setTimeout` and the compile service)
- [x] T031 [P] [US1] `LY/DesktopKeyGrid.test.tsx`: `role="grid"`, arrow-key navigation, one selected cell with roving tabindex, each cell's accessible name includes key, layer, output, and class (FR-040); axe check as in `ST/editors/assignLoop/keyGrid/KeyGrid.test.tsx`
- [x] T032 [P] [US1] `ST/editors/adapters/addPhysicalAdapter.test.tsx` (create): three tabs Assign | Code | Layout as an APG tablist (arrow keys, `aria-controls` via `useId`, roving tabindex — the `TouchGallery.tsx` mode-tab model); switching tabs keeps each tab's state (FR-002)
- [x] T033 [P] [US1] Add to `ST/editors/assignLoop/KmnCodePane.test.tsx`: a `revealNodeId` prop reveals that node's line (from T012's line map) in Monaco; a node with no line (opaque fragment) opens at its group header

### Implementation for User Story 1

- [x] T034 [P] [US1] Loosen `ST/editors/assignLoop/keyGrid/useGridNav.ts`'s input type to the structural minimum it uses (`address`, `padPct`, `widthPct`, `rows[].keys[]`); `useGridNav.test.tsx` and the touch grid tests stay green unchanged
- [x] T035 [P] [US1] Let `ST/editors/assignLoop/keyGrid/LayerSelector.tsx` take desktop layer ids and labels (a `LayerCombo` rendered as e.g. "Shift+AltGr"); `LayerSelector.test.tsx` stays green
- [x] T036 [US1] Implement `LY/baseFallbackCells.ts` (`enumerateUnhandledPositions`, `EN/base-fallback/unhandledPositions.ts:81` × `lookupHostOutput`, `ST/lib/referenceBaseLayouts.ts:181` × `usePickedWindowsLayouts`, `ST/lib/layoutFamily.ts`) to pass T029
- [x] T037 [US1] Implement `LY/useLayoutAttribution.ts` (`attributeLayer` + `simulateEach` + `verifyCells` over the `rulesDemoArtifactStore` artifact; fired-rule check via `ST/components/rules/firedRuleMapping.ts`) to pass T030
- [x] T038 [US1] Implement `LY/desktopGridViewModel.ts` (geometry × attribution × base fallback → cell view models) to pass T028
- [x] T039 [US1] Implement `LY/DesktopKeyCell.tsx` and `LY/DesktopKeyGrid.tsx` on `useGridNav` to pass T031
- [x] T040 [US1] Implement the layer list and "Add layer" (FR-010a) in `LY/layerList.ts` and `LY/AddLayerDialog.tsx`: the selector lists default, Shift, and every layer `listLayers(startIr ∪ workingIr)` returns; the author adds any other modifier combination explicitly; a Ctrl/Alt+letter combination (without AltGr) shows the system-shortcut consequence before confirming; an added empty layer is session state labelled "not saved until a key is set". Tests in `LY/layerList.test.ts`
- [x] T041 [US1] Implement `LY/KeyDetailPanel.tsx` (basic): empty-context output, class and provenance, the read-only reason in plain words (FR-015), the contextual rows the key takes part in, each marked editable or read-only, and "view in code". Tests in `LY/KeyDetailPanel.test.tsx`
- [x] T042 [US1] Add `revealNodeId` to `ST/editors/assignLoop/KmnCodePane.tsx` (Monaco `revealLineInCenter` using `emitKmn(ir, { lineMap: true })`) and lift the active tab in `ST/editors/adapters/addPhysicalAdapter.tsx` so the Layout tab's "view in code" switches to the Code tab with the node revealed; passes T033
- [x] T043 [US1] Implement `LY/LayoutPane.tsx`: layer selector, grid, detail panel; a mnemonic keyboard renders read-only with the reason and a Code-tab link (FR-018); the stale/not-compiled banner links the compile errors; a locked desktop step (`desktopLocked`) renders read-only with the Assign tab's lock message. Tests in `LY/LayoutPane.test.tsx`
- [x] T044 [US1] Add the third tab to `ST/editors/adapters/addPhysicalAdapter.tsx`: `LayoutPane` lazy-loaded (as `KmnCodePane` is), and the tab bar upgraded to the `TouchGallery.tsx` accessible model; passes T032
- [x] T045 [US1] i18n for Phase 3: run `messages:extract`, write the French in `ST/locales/fr/messages.json`, pass `i18n-catalog-lint`; message ids follow [packages/studio/CLAUDE.md](packages/studio/CLAUDE.md) (`editor.layout.*`)
- [x] T046 [US1] Add the honesty assertions to `EN/layout-attribution/layout-attribution.corpus.test.ts`: zero editable cells (every listed layer) whose display differs from the compiled empty-context output (SC-001); every non-matching cell read-only with a reason; every keyboard opens (SC-002); mnemonic keyboards entirely read-only
- [x] T047 [US1] US1 scenario 7 in `LY/LayoutPane.test.tsx`: after an Assign-tab assignment and a republished artifact, the cell reflects it. Add the Code-tab half as `it.todo` naming T101, which asserts it once US8 ships (research R1: a Code-tab Apply never reaches the artifact today) — it must not pass silently
- [x] T048 [US1] E2E US1 row in `E2E`: copy a simple positional keyboard; open Mechanical Gallery → Layout; default-layer cells show the copied characters labelled "from the starting point"; a store-based key shows its read-only reason; "view in code" opens the Code tab at the rule

**Checkpoint**: US1 reachable in the gallery and honest on the corpus. Commit `spec 113 T028-T048`.

---

## Phase 4: User Story 2 — Change what a key types (Priority: P1)

**Goal**: an author changes a key's output; the edit is a `kmn-edits` decision recorded at the
confirm, reaches the built keyboard, is undoable, and survives reload.

**Independent Test**: on a simple positional keyboard, change three keys in two layers; the Assign
tab, the Code tab, the simulator, and the downloaded `.kmn` show them; undo each and the emitted
`.kmn` returns to its previous text (SC-003).

### Tests for User Story 2

- [x] T049 [P] [US2] `ST/survey/questions/gallery/kmnEdits.test.ts`: `apply` replays entries via `replayKmnEdits`; called with `undefined` it composes from `ctx.decisions["kmn-edits"]` (the `deadkeysDefined` precedent); an empty list returns `{}`; `ST/decisions/galleryModules.coverage.test.ts` passes with the module registered
- [x] T050 [P] [US2] `ST/stores/workingCopyStore.kmnEdits.test.ts`: `commitKmnEdit` applies the entry to the live IR through `applyMutatePatch` and records `kmn-edits` (provenance `asked`) with the entry appended; `undoKmnEdit` for kinds `l` and `lb` records the value without the entry/entries and restores the live IR via `invertEffect`; commits are refused (nothing written) when the cell is read-only, the artifact is not compiled, or the step is locked (FR-025)
- [x] T051 [P] [US2] Add to `ST/lib/projectWorkingCopyVfs.test.ts`: with no `kmn-edits` entries the artifact is byte-identical to today's; a `set-key` entry appears in the emitted `.kmn`; it replays after assignments (step 2) and deadkey ops (step 1.8) and before layer propagation (2.5); a context-tolerance variant whose source rule an entry removed is skipped with a warning (2.7)
- [x] T052 [P] [US2] `LY/casePartner.test.ts`: Unicode simple case mapping; the paired layer for default ↔ Shift and for every other layer with and without Shift; Caps Lock layers covered where the key distinguishes Caps; a read-only partner key is reported, not offered; a declined partner (a `decline-case-partner` entry) is not proposed again for that key and layer
- [x] T053 [P] [US2] `LY/keyFirstDisplacement.test.ts`: `keyFirstDisplacementFor(ir, vkey, mods, incoming)` reports where `incoming` is already typed and what it displaces on this key, reusing `buildSlotOccupancy` / `isProducedOnOtherSlot` and the existing decline key `displaced|vkey|mods|incoming`; the ledger sees `kmn-edits` outputs
- [x] T054 [P] [US2] `LY/KeyEditPanel.test.tsx`: text, inventory pick, and nothing; the preview lists the deadkey combinations the key completes and what each still produces (US2 s4); the case-partner proposal accepts or declines in the same confirm; a duplicate or displacement offers the Assign tab's choices (FR-022); overriding an Assign-tab assignment warns first; assigning the base character to a provisional key makes it hand-set (FR-023); select → enter → confirm is at most three interactions (SC-005)
- [x] T055 [P] [US2] SC-004 guard `LY/oneSpine.test.ts`: a static scan of `LY/**`, `ST/survey/questions/gallery/kmnEdits.ts`, and the `commitKmnEdit` path fails on `kmnFragment`, on `parseKmn(` in a write path, on `setTimeout`/`setInterval`, and on any compile-service import

### Implementation for User Story 2

- [x] T056 [US2] Settle how recording `kmn-edits` interacts with rebuild, then its ordering (research R12), and record both answers in [research.md](research.md) R12 before T060:
  - **Does recording trigger a replay?** Find every path that reacts to a recorded decision: `useDecisionStore` subscribers (`ST/lib/draftPersistence.ts` subscribes for saving), `rebuildWorkingCopyFromStores` (`ST/decisions/rebuildWorkingCopy.ts:319`, documented as "rebuild after a completion" via `ReducerDeps.rebuildFromDecisions` in `ST/steps/reducer.ts` / `ST/lib/studioReducerDeps.ts`), and `ST/hooks/usePreviewArtifact.ts`. If an edit-time `record` of `kmn-edits` can start a rebuild, T060's manual live apply would double-apply or race it, and a rebuild would drop live-only edits (R6) — in that case T060 records through whichever path avoids the rebuild, or relies on the rebuild instead of the manual apply; decide here.
  - **Ordering:** read `orderByDependencies` (`ST/decisions/orderDecisions.ts`) and `ST/decisions/replayKeyboard.ts` to see how a `requires` on a decision with no recorded value behaves (`kmn-edits` is recorded at edit time, before `physical-layout` is recorded at completion). Choose `requires` or an ordering-only declaration so `kmn-edits` replays after `carved-layout`, `deadkeys-defined`, `rule-set`, and `physical-layout` without waiting for them.
  - The same question for re-recording `deadkeys-defined` mid-step (T080): would it mark downstream decisions for re-proposal (spec 093 downstream closure, `ST/decisions/downstreamClosure.ts`)? Record the answer; T080 follows it.
- [x] T057 [US2] Add `"kmn-edits"` to `DecisionId` in `ST/decisions/decisionTypes.ts` with its IR paths `[["groups"]]` in `decisionIRPaths` (US8 extends them in T094)
- [x] T058 [US2] Implement the gallery module `ST/survey/questions/gallery/kmnEdits.ts` (`provides: ["kmn-edits"]`, T056's ordering, `writes: [irPath("groups")]`, `apply` → `replayKmnEdits`) with a trail renderer `ST/survey/questions/gallery/KmnEditsRenderer.tsx` listing the entries in plain words, and register it in `ST/survey/questions/registry.ts` beside `deadkeysDefined`; passes T049
- [x] T059 [US2] Declare `LAYOUT_WRITES` (the entry group's `rules` path) in `ST/steps/editorMutate.ts` beside `DEADKEY_WRITES`
- [x] T060 [US2] Add `commitKmnEdit` and `undoKmnEdit` and undo kinds `l` / `lb` to `ST/stores/workingCopyStore.ts` (live: `applyLayoutOp` → `applyMutatePatch(ir, patch, LAYOUT_WRITES)` → `setWorkingIR`; then `useDecisionStore.getState().record({ id: "kmn-edits", … })`; the undo entry holds the `KmnEditEffect`). No new state field. **The live-apply-then-record sequence is conditional on T056's answer**: if recording triggers a rebuild, follow the path T056 chose instead. Passes T050
- [x] T061 [US2] In the **same commit as T060**: register surface `kmn-edits` in `ST/decisions/derivedSurfaceRegistry.ts` (decisionIds `["kmn-edits"]`, storeActions `commitKmnEdit`, `undoKmnEdit`, evidence citing R12), status **equivalence-proven**, and extend `ST/decisions/derivedEquivalence.test.ts`'s replay arm (a rebuild from decisions reproduces the entry group's rules after Layout edits) and draft-load arm (the value reloads from the draft envelope) — SC-011. The census and coverage arms must be green in that commit (FR-026)
- [x] T062 [US2] Pass the `kmn-edits` value into the projection through `ST/lib/projectionInput.ts`, and add projection step 2.2 to `ST/lib/projectWorkingCopyVfs.ts` (parse → `replayKmnEdits` → emit, only when there are entries) plus the step 2.7 tolerance-variant skip; passes T051
- [x] T063 [US2] Re-measure replay performance with `ST/decisions/rebuildPerf.measure.ts` (sil_euro_latin) with and without 20 `kmn-edits` entries; record the numbers in the phase commit message; **gate (ruling 8, 2026-11-07, replacing the spec 105 / 093 noise band):** the 20-entry warm-edit and cold-resume medians are each ≤ 30 ms. Met: 22.7 / 22.0 ms (research R12, "Replay cost")
- [x] T064 [P] [US2] Implement `LY/casePartner.ts` to pass T052
- [x] T065 [P] [US2] Implement `LY/keyFirstDisplacement.ts` and extend the ledger in `ST/survey/slotOccupancy.ts` to see `kmn-edits` outputs; passes T053
- [x] T066 [US2] Implement `LY/KeyEditPanel.tsx` and wire it into `LY/LayoutPane.tsx` (text, inventory pick, nothing; preview; case partner; duplicate and displacement choices via `declineDisplacement`; Assign-tab override warning; FR-025 refusals with "view in code"); the deadkey option is added in T080. Passes T054 and T055
- [x] T067 [US2] Label keys set by `kmn-edits` entries "set in the Layout tab" in the Assign tab (`ST/editors/assignLoop/MechanismGallery.tsx`), with a test in `ST/editors/assignLoop/MechanismGallery.layoutEdits.test.tsx`
- [x] T068 [US2] SC-003 round trip in `LY/roundTrip.test.ts`: three keys in two layers changed, then each undone; after each step the emitted `.kmn` equals the expected text (emitter normalisation aside), and the Assign tab, Code tab, and simulator agree within one validation cycle
- [x] T069 [US2] i18n for Phase 4 (as T045)
- [x] T070 [US2] E2E US2 rows in `E2E`: assign `ŋ` and accept `Ŋ` on Shift in one confirm; Assign and Code tabs show both; the downloaded `.kmp`/source zip's `.kmn` has both rules; one undo removes both; reload keeps the edit (the decision persisted); at most three interactions per key

**Checkpoint**: US2 edits are decisions, reach the build, and the equivalence gate is green.
Commit `spec 113 T049-T070`.

---

## Phase 5: User Story 3 — Make a deadkey and fill its combinations, MSKLC-style (Priority: P1)

**Goal**: deadkeys at MSKLC depth and beyond — define, display character, both table shapes,
"after this deadkey", chains — through the spec 083 lifecycle.

**Independent Test**: on a keyboard with no deadkeys, make the key right of `P` an acute deadkey
with five combinations and a space row; each sequence types the table's result. On a corpus
deadkey keyboard, every table row matches the compiled keyboard (SC-007 deadkey half).

### Spec 083 follow-ups decided by T004

- [x] T071 [P] [US3] `ST/editors/deadkey/deadkeyWrite.test.ts` additions for T074 (if T004 c found reordering): removing then re-inserting a pair at its index restores the stores' order exactly
- [x] T072 [P] [US3] `EN/deadkey-lifecycle/mutations.test.ts` additions for T076 (if T004 b found no modifier-layer triggers): define and retarget on `[RALT K_QUOTE]` and `[SHIFT K_6]`
- [x] T073 [P] [US3] Tests for T075 (if T004 a found `accentChar` cannot serve as the display character) beside the existing deadkey op tests in `ST/lib/deadkeyOps.test.ts`
- [x] T074 [US3] If T004 (c) holds: add an `insert-pair { id, index, base, accented }` `DeadkeyOperation` to `ST/survey/deadkeys/deadkeyOps.ts` with `withInsertedDeadkeyPair` in `ST/editors/deadkey/deadkeyWrite.ts`, as a spec 083 lifecycle operation (never a Layout-only path). Otherwise mark this task N/A with T004's evidence
- [x] T075 [US3] If T004 (a) is negative: add a `set-display` lifecycle op beside `set-name` in `ST/survey/deadkeys/deadkeyOps.ts` and `EN/deadkey-lifecycle/`. Otherwise mark N/A, citing T004
- [x] T076 [US3] If T004 (b) is negative: extend `defineDeadkey` / `retargetDeadkey` in `EN/deadkey-lifecycle/mutations.ts` to modifier-layer triggers, **or**, if that is larger than this phase, record the gap with owner and trigger in [spec.md](spec.md) Assumptions ("Spec 083 dependency") and restrict new deadkeys to the default and Shift layers in the UI with that reason shown. Never a Layout-only deadkey path

### Tests for User Story 3

- [x] T077 [P] [US3] `LY/DeadkeyTablePanel.test.tsx`: fan-out tables shown as rows of base character → result with the key that types it; keystroke-keyed rows shown as key + layer → result; add, change, remove rows of both shapes; a store-using row outside the fan-out shape read-only with "view in code" while the others stay editable; for a new deadkey the space row is **proposed**, and the author confirms or removes it (FR-028); a row whose result is a deadkey links to "after" that deadkey; a deadkey with no combinations is flagged
- [x] T078 [P] [US3] `LY/AfterContextView.test.tsx` (deadkey mode): every key shows what typing it after the chosen deadkey produces, from `simulateEach` with a `pendingDeadkeys` seed; a key with no row shows what actually happens instead; chains are followed
- [x] T079 [P] [US3] Add to `ST/stores/workingCopyStore.kmnEdits.test.ts`: undo kind `ld` appends the inverse `DeadkeyOperation` (add-pair ↔ remove-pair, using `insert-pair` when T074 applies) and records `deadkeys-defined`; the emitted `.kmn` after undo equals the text before the edit

### Implementation for User Story 3

- [x] T080 [US3] Add the deadkey option to `LY/KeyEditPanel.tsx`: **new** deadkey → `commitDeadkeyOp({ kind: "define", … })` showing spec 083's base-keyboard disclosure (reuse the component in `ST/editors/deadkey/`), **existing** deadkey → a `set-key` entry with a deadkey output. Every Layout-tab deadkey op also records `deadkeys-defined` at the confirm with the current op list (ruling 6: edits are decisions; the Deadkeys step's completion record stays as is) — **unless T056 found that re-recording it mid-step pushes re-proposals onto downstream decisions**; then record it at the Mechanisms step's completion instead, and note the gap against spec 105 phase 2 (its T202) in [research.md](research.md) R12
- [x] T081 [US3] Implement `LY/DeadkeyTablePanel.tsx`: fan-out rows via `add-pair` / `remove-pair` (`insert-pair` per T074), pushing undo kind `ld`; keystroke-keyed rows via `set-row` / `remove-row` `kmn-edits` entries, pushing `l`; the space-row proposal; passes T077 and T079. Add undo kind `ld` to `ST/stores/workingCopyStore.ts`
- [x] T082 [US3] Implement `LY/AfterContextView.tsx` (deadkey mode) and the switch into it from the grid and the table; passes T078
- [x] T083 [US3] Implement `LY/DeadkeyList.tsx` in `LayoutPane`: every deadkey the keyboard defines, including ones on no key (place or delete — delete through spec 083), and the "no combinations yet" flag; one deadkey on several keys or layers shows one table. Tests in `LY/DeadkeyList.test.tsx`
- [x] T084 [US3] SC-007 deadkey half in `EN/layout-attribution/layout-attribution.corpus.test.ts`: on every corpus keyboard with deadkeys, every editable row (both shapes) matches `simulateEach` seeded with that deadkey plus the keystroke — zero mismatches
- [x] T085 [US3] SC-008 MSKLC parity in `LY/msklcParity.test.ts`: build an MSKLC-expressible layout (characters and ligatures in four shift states; two deadkeys with combination tables and space rows) using only `kmn-edits` entries and spec 083 ops; the simulator types every sequence correctly and no step uses the Code tab
- [x] T086 [US3] i18n for Phase 5 (as T045)
- [x] T087 [US3] E2E US3 row in `E2E`: make a key a new deadkey (spec 083 disclosure shown), add three rows and confirm the proposed space row; "after this deadkey" shows them; simulator typing matches; the download contains the rules

**Checkpoint — PR 1**: Phases 1–5 green. Commit `spec 113 T071-T087`, push, then km-archivist
opens PR 1 against `main` with `refs #N` (US4–US6, US8 remain), reconciling the issue's AC per the
`issue-closure` skill.

---

## Phase 6: User Story 8 — Edits in the Code tab are kept (Priority: P2)

**Branch**: a follow-up branch cut from `main` after PR 1 merges.

**Goal**: Code-tab Apply imports the edit as a structural IR diff into `kmn-edits`: the code edit
wins, errors are blocked, inconsistencies are flagged for review (ruling 7).

**Independent Test**: change, add, and delete a rule in the Code tab and Apply; the downloaded
`.kmn` has exactly those changes and reload keeps them; re-assign an overridden key in the Assign
tab and the edit still wins, flagged; a syntax error and a compile error each record nothing
(SC-010).

- [x] T088 [US8] Ask km-validator to review the Apply error gate ([contracts/code-edits.md](contracts/code-edits.md) "Studio: Apply" step 1: one candidate compile on the author's click, no timer, the download path's compile service) against decision D3; record the verdict in [research.md](research.md) R13. If rejected, FR-061's compile half becomes "Layer A only at Apply; a compile failure in the next validation cycle offers one-click undo", amended in [spec.md](spec.md) in the same commit

### Tests for User Story 8

- [x] T089 [P] [US8] `EN/kmn-diff/diffIR.test.ts`: `diffIR(a, parse(emit(a)))` is empty (FR-066); one test per `IRChange` kind; rules aligned by canonical text (an inserted rule early in a group yields one insert, not a cascade); an opaque fragment edit is one replace; a renamed group is remove + add
- [x] T090 [P] [US8] Add `CodeEdit`, `ReviewKept`, `IRChange`, `ContentAnchor`, `OwnerRef` to `CT/kmnEdits.ts` as additive `KmnEdit` arms, with schemas and drift guards in `CT/schemas.ts` and cases in `CT/kmnEdits.test.ts` (confirm the IR type names used in [contracts/code-edits.md](contracts/code-edits.md) against `CT/keyboard-ir.ts` and fix the contract if they differ)
- [x] T091 [P] [US8] `EN/kmn-diff/applyIRChanges.test.ts`: `emit(applyIRChanges(a, diffIR(a, b)).ir) === emit(b)`; untouched nodes keep their ids; inserted and replaced nodes carry `authorEdit: "code-tab"` and fresh ids above the IR's highest; a change whose anchor is gone is listed in `misses`, never thrown or dropped; `findOwners` names `deadkeys`, `rules-step`, `layout-tab`, `code-tab`, `identity`, `another-step` per marker and returns nothing for a `startIr`-identical node; `emit(applyIRChanges(applyIRChanges(a, c).ir, invertChanges(c)).ir) === emit(a)`
- [x] T092 [P] [US8] Add to `ST/editors/assignLoop/KmnCodePane.test.tsx`: Apply records nothing and leaves the IR unchanged on a parse error, a Layer A error, and a compile error, showing each at its line; a formatting-only change records nothing; an override shows the owner confirm; a confirmed Apply records one `CodeEdit` and pushes undo kind `c`; Apply never calls `setWorkingIR` with a wholesale re-parsed IR
- [x] T093 [P] [US8] `ST/editors/assignLoop/reviewFlags.test.ts`: flag (a) per `CodeEdit` with `overrides` and no `ReviewKept` for it; (b) per replay miss; (c) per shadowed rule a code entry inserted (`findShadowedRules`); keep clears (a); revert of the latest entry undoes it, of an older one appends `invertChanges` as a new entry

### Implementation for User Story 8

- [x] T094 [US8] Extend `kmn-edits` IR paths in `ST/decisions/decisionTypes.ts` and the module's `writes` in `ST/survey/questions/gallery/kmnEdits.ts` to groups, stores, raw, and headers (check `irPath`'s kinds for headers); declare `CODE_WRITES` in `ST/steps/editorMutate.ts`
- [x] T095 [US8] Implement `EN/kmn-diff/diffIR.ts`, `applyIRChanges.ts`, `findOwners.ts`, `invertChanges.ts`, and `index.ts`, exported from `EN/index.ts`; passes T089 and T091
- [x] T096 [US8] Add the `CodeEdit` and `ReviewKept` arms to `EN/layout-ops/replayKmnEdits.ts` (code entries via `applyIRChanges`, `misses` returned with each entry's `seq`; `ReviewKept` has no IR effect), with cases in `EN/layout-ops/replayKmnEdits.test.ts`
- [x] T097 [US8] Code-edit corpus set `EN/kmn-diff/__fixtures__/codeEditSet.ts` (on at least five corpus keyboards: change, add, delete a rule; edit a store; edit a header; edit inside an opaque fragment) and `EN/kmn-diff/kmn-diff.corpus.test.ts` asserting diff → apply reproduces the edited text and → replay onto a re-parse reproduces it (SC-010 engine half)
- [x] T098 [US8] Rewire Apply in `ST/editors/assignLoop/KmnCodePane.tsx`: the error gate (existing parse and lint, Layer A errors from `EN/validator`, and the candidate compile per T088), `diffIR(workingIr, parsed)`, nothing recorded when empty, the owner confirm dialog from `findOwners`, then `commitKmnEdit` with a `CodeEdit` (live `applyIRChanges` through `applyMutatePatch(…, CODE_WRITES)`); add undo kind `c` to `ST/stores/workingCopyStore.ts`; passes T092
- [x] T099 [US8] Implement `ST/editors/assignLoop/reviewFlags.ts` and `ST/editors/assignLoop/CodeReviewList.tsx` (each flag: what changed, why, "view in code", keep, revert), a flag count on the Code tab in `ST/editors/adapters/addPhysicalAdapter.tsx`, and flags on the `kmn-edits` entry in `ST/survey/questions/gallery/KmnEditsRenderer.tsx`; flags block neither completion nor download; passes T093
- [x] T100 [US8] Show "changed in code" where a code entry overrode another editor's node: the Layout tab's provenance detail (`LY/KeyDetailPanel.tsx`), the Assign tab (`ST/editors/assignLoop/MechanismGallery.tsx`), and the deadkey editor (`ST/editors/deadkey/`), driven by `authorEdit: "code-tab"`; tests beside each
- [x] T101 [US8] Replace T047's `it.todo` with the Code-tab half of US1 scenario 7 in `LY/LayoutPane.test.tsx`: after a Code-tab Apply and a republished artifact, the Layout tab shows the change, hand-set from the Code tab
- [x] T102 [US8] Extend the `kmn-edits` surface in `ST/decisions/derivedSurfaceRegistry.ts` (Code-tab evidence) and `ST/decisions/derivedEquivalence.test.ts`'s replay and draft-load arms with a mix of Layout and Code entries (SC-011)
- [x] T103 [US8] Three paths must agree: add `ST/lib/projectWorkingCopyVfs.codeEdits.test.ts`. For T097's SC-010 code-edit set, apply each edit live (`commitKmnEdit` on the working IR), then run `projectWorkingCopyVfs` (step 2.2 replays onto the IR the projection assembles from `startIr` plus overlays — a different IR from the live one). Assert the projected `.kmn` contains every edit with **zero misses**, and that it equals the decision-rebuild result from T102 for the same rules. A change that applies live but misses in the projection fails this test (the R1 trap)
- [x] T104 [US8] i18n for Phase 6 (as T045)
- [ ] T105 [US8] E2E US8 row in `E2E`: change, add, and delete a rule and Apply; the download has exactly those changes; reload keeps them; a syntax error and a compile error each record nothing; overriding a Layout-tab rule shows the owner confirm and a review flag; **(ruling 9)** re-assigning an edited key in the Assign tab leaves that code edit not applied in the download and flagged with the reason (scenario 4), and the same holds when the key was assigned before the code edit. Before the E2E, make flag (c) also run `findShadowedRules` on the projected keyboard (`ST/editors/assignLoop/CodeReviewList.tsx`, `reviewFlags.ts`, per [contracts/code-edits.md](contracts/code-edits.md) "Review"), with a unit case in `reviewFlags.test.ts`: a code-inserted rule shadowed by an Assign-tab rule in the projection is flagged

**Checkpoint**: Commit `spec 113 T088-T105`.

---

## Phase 7: User Story 5 — See complex keys honestly and jump to their code (Priority: P2)

**Goal**: the full FR-016 detail for every key, read-only ones especially.

**Independent Test**: on a context-heavy keyboard, open the detail of three read-only keys and
follow "view in code"; the Code tab opens at the rule that fires.

- [ ] T106 [P] [US5] Extend `LY/KeyDetailPanel.test.tsx`: the number of rules that match the key in this layer; every matching rule listed with its shape and editability; the replaced starting-point value when a hand-set value replaced it; "view in code" per rule, defaulting to the rule that fires
- [ ] T107 [US5] Extend `LY/KeyDetailPanel.tsx` to pass T106 (FR-016 complete)
- [ ] T108 [US5] i18n for Phase 7 (as T045)
- [ ] T109 [US5] E2E US5 row in `E2E`: open a read-only key's detail; "view in code" reveals the rule's line

**Checkpoint**: Commit `spec 113 T106-T109`.

---

## Phase 8: User Story 6 — Confirm what the base keyboard proposes (Priority: P2)

**Goal**: provisional keys are counted, distinct, announced, and confirmable through spec 109's
policy surface.

**Independent Test**: on a sparse keyboard, count provisional keys per layer; confirm the
punctuation policy; those keys stop being provisional; assign one letter key; it stops being
provisional; nothing else changes (SC-006).

- [ ] T110 [P] [US6] Extend `LY/desktopGridViewModel.test.ts` and `LY/DesktopKeyGrid.test.tsx`: provisional cells visually distinct and announced "provisional" to assistive technology; per-layer provisional counts passed to `LayerSelector`'s `findingCountsByLayerId`; a confirmed class policy removes its keys from the count and shows the confirmed result; an author-assigned key is never provisional (SC-006)
- [ ] T111 [US6] Implement the provisional styling, announcement, and per-layer counts in `LY/DesktopKeyCell.tsx`, `LY/desktopGridViewModel.ts`, and `LY/LayoutPane.tsx`; passes T110
- [ ] T112 [US6] Add "change the fallback policy" to a provisional key's detail in `LY/KeyDetailPanel.tsx`, reaching `ST/editors/fallback/FallbackPolicySection.tsx` for that key's character class (the Layout tab never sets policy, FR-031); test in `LY/KeyDetailPanel.test.tsx`
- [ ] T113 [US6] SC-006 over the corpus set in `LY/provenance.test.ts` (or the engine corpus suite if it needs no studio state): every unhandled key provisional, no `authorEdit` key provisional
- [ ] T114 [US6] i18n for Phase 8 (as T045)
- [ ] T115 [US6] E2E US6 row in `E2E` (uses `packages/studio/e2e/fallback-policy.spec.ts`'s helpers where they fit)

**Checkpoint**: Commit `spec 113 T110-T115`.

---

## Phase 9: User Story 4 — Edit what a key does after something was typed (Priority: P2)

**Goal**: the "after …" view for literal contexts: list, add, and edit contextual replacements;
never-fires duplicates shown read-only.

**Independent Test**: on a keyboard with `'n' + [K_G] > 'ŋ'`, open "after `n`"; every key with a
replacement matches the simulator seeded with `n`; add "after `a`, `e` becomes `æ`"; typing `a e`
gives `æ`.

- [ ] T116 [P] [US4] Add `isContextReachable(ir, layers, context)` to `EN/layout-attribution/` (can some listed layer type the context's characters?) with tests in `EN/layout-attribution/isContextReachable.test.ts`
- [ ] T117 [P] [US4] Extend `LY/AfterContextView.test.tsx` with literal-context mode: the context list (literal contexts and deadkeys, with key counts, from `listContexts`); entering a new context, with an unreachable one flagged before confirm (FR-029a); a "becomes" edit writes exactly the entered text, optionally with deadkeys, and never guesses what is kept; two rules for one context and key show the firing one editable and the other "never fires", read-only, with "view in code"
- [ ] T118 [US4] Implement literal-context mode in `LY/AfterContextView.tsx` and the "becomes" editor `LY/BecomesEditor.tsx` writing `set-row` / `remove-row` `kmn-edits` entries (undo kind `l`); passes T117
- [ ] T119 [US4] SC-007 context half and SC-009 in `EN/layout-attribution/layout-attribution.corpus.test.ts`: every editable literal-context row matches `simulateEach` seeded with its context; for every positional corpus keyboard with no FR-013 read-only shapes, 100% of rules editable; print the editable share per keyboard for the rest and paste the table into [research.md](research.md) as the store-based next-frontier baseline
- [ ] T120 [US4] i18n for Phase 9 (as T045)
- [ ] T121 [US4] E2E US4 row in `E2E`: "after `n`", set `g` → `ŋ`; typing `n g` gives `ŋ`; the download has the rule; a never-fires duplicate shows read-only

**Checkpoint**: Commit `spec 113 T116-T121`.

---

## User Story 7 — Placement tray (Priority: P3) — gated, no tasks

Gated per [spec.md](spec.md) Assumptions ("Placement tray gate"). Owner: the product owner.
Trigger: when US1–US6 have shipped, the product owner decides go or no-go. No decision recorded by
the retirement pass → FR-050 and US7 are removed from the spec, not rolled forward (Art XI).

---

## Phase 10: Polish & cross-cutting

- [ ] T122 [P] Update [docs/packages.md](docs/packages.md) (new engine modules `layout-attribution`, `layout-ops`, `kmn-diff`; contracts `layoutOps`, `kmnEdits`) and [docs/architecture.md](docs/architecture.md) (the `kmn-edits` decision as the record of all KMN edits; projection step 2.2)
- [ ] T123 [P] Run `/speckit-analyze` over spec, plan, and tasks; fix the drift it reports in `specs/113-layout-studio/spec.md`, `plan.md`, `research.md`, `data-model.md`, and `contracts/*.md`
- [ ] T124 Run every command and E2E row in [quickstart.md](quickstart.md) and record the results in the final PR body
- [ ] T125 Close out the Art XI notes in `specs/113-layout-studio/spec.md` (Assumptions): the store-based next frontier (owner + trigger) and the tray gate stay as written; confirm no other deferred item in `spec.md` or `plan.md` lacks an owner and trigger

---

## Dependencies & execution order

### Phase dependencies

- **Setup (1)** → **Foundational (2)** → every story.
- Inside Foundational: T003 before T006; T004 before Phase 5's T074–T076; T011 green before
  anything in Phase 3 uses `simulateEach`.
- **US1 (3)** depends on Foundational only.
- **US2 (4)** depends on US1 (the grid and detail panel it edits from).
- **US3 (5)** depends on US2 (`KeyEditPanel`, `commitKmnEdit`, undo).
- **PR 1** = Phases 1–5.
- **US8 (6)** depends on US2's `kmn-edits` decision, store actions, and projection step; not on US3.
- **US5 (7)** and **US6 (8)** depend on US1 only; they ship after US8 per the plan's order but can
  be built in parallel with it.
- **US4 (9)** depends on US3's `AfterContextView` and Foundational's `findShadowedRules`.
- **Polish (10)** after the stories being shipped.

### Within each story

Tests are written first and fail before implementation. Same-commit pairs: T060 + T061 (registry
with the store actions); T002 + its phonebook rows.

## Parallel opportunities

- Setup: T001 ∥ T002.
- Foundational: T005, T008, T009, T010, T012 in parallel; then T014 ∥ T016 ∥ T018 ∥ T021 ∥ T023 ∥
  T025 (different files).
- US1: T028–T033 (tests) in parallel; T034 ∥ T035.
- US2: T049–T055 (tests) in parallel; T064 ∥ T065.
- US3: T071–T073 and T077–T079 in parallel.
- US8: T089–T093 in parallel.
- US5 ∥ US6 once US1 is done.

### Parallel example: User Story 1

```text
Task: "LY/desktopGridViewModel.test.ts — provenance x output matrix (T028)"
Task: "LY/baseFallbackCells.test.ts — primary first, unknown, system shortcut (T029)"
Task: "LY/useLayoutAttribution.test.ts — reads the D3 artifact only, no timer (T030)"
Task: "LY/DesktopKeyGrid.test.tsx — grid a11y (T031)"
Task: "addPhysicalAdapter.test.tsx — three-tab APG tablist (T032)"
Task: "KmnCodePane.test.tsx — revealNodeId (T033)"
```

### Parallel example: User Story 8

```text
Task: "EN/kmn-diff/diffIR.test.ts (T089)"
Task: "CT/kmnEdits.ts CodeEdit arms + schemas (T090)"
Task: "EN/kmn-diff/applyIRChanges.test.ts (T091)"
Task: "KmnCodePane.test.tsx Apply gate cases (T092)"
Task: "reviewFlags.test.ts (T093)"
```

## Implementation strategy

### MVP (User Story 1)

Phases 1–3: a read-only Layout tab that is honest on the corpus. Stop and validate SC-001/SC-002.

### PR 1 (User Stories 1–3)

Add US2 (edits as `kmn-edits` decisions, reaching the build, undoable, equivalence-proven), then
US3 (deadkeys at MSKLC depth). Open PR 1.

### Incremental delivery after PR 1

US8 (Code-tab edits kept — fixes the live R1 data loss) → US5 + US6 → US4. Each phase is one
commit, gates green, pushed.

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- A phase whose gates are not green is not a success: commit what is done, leave the failing
  task unchecked, and put the diagnosis in the commit message.
- `tasks.md` checkboxes and `.spec-context.json` land with or after the work, never ahead of it.
