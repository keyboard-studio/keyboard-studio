# Spec 065 Touch key editor, Developer-parity remodel: as built

**Status:** Retired 2026-09-29. Shipped in PR #1581 (squash `ebee1319`, "touch key editor - Developer-parity remodel"; renumbered 061 to 065 in #1643); polish closed in #1668 (`79270308`) and #1653 (`693aa12e`, T055/T057/T060/T062). Tasks: 62/62 complete.
**Full docs:** [specs/_archive/065-touch-editor-parity/](../_archive/065-touch-editor-parity/) (spec, plan, tasks, research D1-D11, data-model, contracts x4, exploration-baseline, checklists). Not read by default.
**Pinned here:** none
**Builds on:** [../063-touch-key-editor/AS-BUILT.md](../063-touch-key-editor/AS-BUILT.md).

## What shipped
- Every editing control in key mode is wired. Root cause of the 063 breakage was optional `on*` props with a single caller; the callbacks are now required and a structural test asserts every affordance has a live handler.
- Row slack is absorbed by stretching the last key (KeymanWeb behaviour, ADR 0002), with a row-metrics readout; the 063 hatch (FR-039) is withdrawn.
- One property panel for the selected key (`KeyPropertyPanel`) covering id, keycap, type, position, hint/width/pad/layer, findings and fixes.
- Gesture (longpress) editing on the key; layer selector grouped by layer family.
- Proposed key ids and keycaps by character class, with a stated reason when none can be proposed.
- Edit-time row-crowding and keycap-mismatch diagnostics; the number-row localisation case raises no mismatch.

## Public contracts (as the code has them)
- `packages/contracts/src/row-metrics.ts`: `computeRowMetrics`, `RowMetrics`, `RowMetricKey`, `countInteractiveRowKeys`, `PLATFORM_MAX_KEYS_PER_ROW`, `platformMaxKeysPerRow`, `DEFAULT_KEY_WIDTH_PCT` (100), `DEFAULT_KEY_PAD_PCT` (15). Re-exported by `engine/src/pattern-apply/rowMetrics.ts`.
- `packages/contracts/src/touch-key-diagnostics.ts`: new codes `TOUCH_KEY_ROW_CROWDED`, `TOUCH_KEY_KEYCAP_MISMATCH`, fixes `TrimRowFix`, `SetKeycapFix`; `findCrowdedTouchRows` reads Layer C's thresholds (`keyboard-lint/src/checks/check-18-3-keys-per-row.ts`) rather than restating them.
- `engine/src/pattern-apply/keyEditOps.ts`: `EditableKeyFields` gained `hint`, `width`, `pad`, `layer`; `KeyEditOperation` gained `move`.
- `engine/src/pattern-apply/keycapRelatedness.ts`: `proposeKeycap`, `isKeycapRelated`, `isCombiningMark` (display-scoped on purpose).
- `engine/src/pattern-apply/proposeTouchKeyId.ts`: `proposeTouchKeyId` (inherited-id path, sits beside `proposeKeyId`).
- Studio: `studio/src/editors/assignLoop/keyGrid/*` (`KeyPropertyPanel`, `RowMetricsReadout`, `LayerSelector`, `GesturePanel`, `KeyGridCommandMenu`, `RenameDialog`, `RemoveKeyDialog`, `FamilyApplyDialog`, `FindPanel`); `AssignLoopShell.rightContent` optional.
- E2E: `studio/e2e/touch-key-{add-remove,assign,grid-a11y,layer-switch}.spec.ts`, `touch-mode-toggle.spec.ts`.

## Key decisions
- Required callbacks, not optional (D1); Playwright explores, vitest is the repeatable gate (D2).
- Merge KeyInspector and AssignPanel into one panel (D3).
- The stretch is a render rule; `slackPct` becomes a metrics input (D5).
- Edit-time crowding reads Layer C thresholds (D6); two new codes only (D7).
- Keycap relatedness is a separate, display-scoped module (D8); inherited-id proposer is separate from `proposeKeyId` (D9).
- Layer selector groups via `groupLayerFamilies` (D11).

## Gotchas and limits
- Adding/removing/renaming layers and platforms stays out of scope (layer ids are auto-derived, spec 008 rule).
- No raw source view, no device-photo chooser, no byte-level patch minimisation.
- Untouched files must stay byte-identical and untouched keys structurally identical (SC-005).

## Divergences from the spec
- D3 says AssignPanel "does not survive as a sibling"; the code keeps `AssignPanel.tsx` and renders it nested inside `KeyPropertyPanel` at `TouchGallery.tsx:6901-6918`, and `KeyInspector` is still composed by `KeyPropertyPanel.tsx:469`. Composition, not a merge.
- Spec header still reads "Status: Draft" though all tasks are done.

## Follow-ups and open issues
- Stale links for km-doc: `docs/design-notes/touch-editor-glossary.md:118` links `../../specs/065-touch-editor-parity/spec.md` (moves to the archive).
- Stale citations for km-programmer: `engine/src/pattern-apply/proposeTouchKeyId.ts:54` (contracts/character-classes.md), `studio/e2e/touch-key-add-remove.spec.ts:69` (research.md), `KeyGridCell.tsx:36` (spec.md).
