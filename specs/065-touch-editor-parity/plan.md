# Implementation Plan: Touch key editor — Developer-parity remodel

**Feature**: 065-touch-editor-parity · **Branch**: `065-touch-editor-parity` · **Spec**: [spec.md](spec.md)

**Governing**: [spec.md](../../spec.md) §3c, §8, §14 Decision 6, decision D3 · extends
[specs/063-touch-key-editor](../063-touch-key-editor/spec.md) and withdraws its FR-039 per
[ADR 0002](../../docs/adr/0002-touch-grid-renders-the-last-key-stretched.md).

**Design record**: [research.md](research.md) (D1–D11) · [data-model.md](data-model.md) ·
[contracts/](contracts/)

---

## Summary

Spec 063's engine work is sound and is kept; what shipped broken is the seam between it and the
screen. This plan fixes that seam by inverting one idiom — the eight editing callbacks on the
key-grid surfaces become **required** props, so a surface that cannot act fails `tsc` instead of
rendering inert — and then reaches Developer parity on top: a layer selector, the KeymanWeb
last-key stretch with a per-row metrics readout in place of the withdrawn slack hatch, one
merged property panel carrying all eight editable fields plus delete and four self-hiding move
buttons, gesture editing in key mode, and unrequested id/keycap proposals.

The work is five sequential slices matching the spec's five user stories, and **US1 ships
alone** — it resolves five of issue #1530's six complaints and depends on nothing else here.
Engine additions are narrow: four fields admitted to `EditableKeyFields`, a `move` operation, two
new diagnostic codes, and two new proposal modules. No `Pattern`/`Criterion` type is touched, so
Constitution Article I is not engaged.

## Project Structure

```
packages/contracts/src/
  touch-key-diagnostics.ts          # +2 codes, +2 fix descriptors, +crowding/mismatch detail
  keyboard-ir.ts                    # (read-only — TouchKeyIR already carries all four fields)

packages/engine/src/pattern-apply/
  keyEditOps.ts                     # EditableKeyFields += hint/width/pad/layer; +MoveKeyOp
  applyKeyEditsToLayout.ts          # apply "move" (splice the existing node, identity intact)
  applyKeyEditsToRawJson.ts         # same, Case B raw-JSON path
  touchKeyDiagnostics.ts            # +TOUCH_KEY_ROW_CROWDED, +TOUCH_KEY_KEYCAP_MISMATCH
  keycapRelatedness.ts              # NEW — proposeKeycap + isKeycapRelated (NFKD confined here)
  proposeTouchKeyId.ts              # NEW — inherit -> delegate to keyIdMinting.proposeKeyId
  rowMetrics.ts                     # NEW — shared row-metrics + the crowding threshold table
packages/engine/src/index.ts        # re-export the new modules (studio's only sanctioned door)

packages/keyboard-lint/src/checks/
  check-18-3-keys-per-row.ts        # read MAX_KEYS from engine's shared table, stop owning it

packages/studio/src/editors/assignLoop/
  AssignLoopShell.tsx               # rightContent becomes optional -> full-width left pane
  TouchGallery.tsx                  # supply every handler; mount the unmounted components
  keyGrid/
    KeyGrid.tsx                     # required callbacks; stretch render; row metrics; -Fill/-EvenOut
    KeyGridCell.tsx                 # required callbacks; key id on the keycap
    keyGridViewModel.ts             # +KeyGridRowMetrics; slackPct -> metrics input
    KeyPropertyPanel.tsx            # NEW — absorbs KeyInspector + AssignPanel (US3)
    LayerSelector.tsx               # NEW — family/plane grouped, rolled-up finding counts
    RowMetricsReadout.tsx           # NEW — the per-row readout
    GesturePanel.tsx                # NEW — longpress / multitap / 8 flicks (US4)
    KeyInspector.tsx                # US1: required callbacks. US3: folded into KeyPropertyPanel
    AssignPanel.tsx                 # US3: folded into KeyPropertyPanel
    findingCopy.ts                  # +copy for the 2 new codes (build-enforced exhaustive)
packages/studio/src/editors/assignLoop/TouchGallery.test.tsx   # key-mode integration (FR-009)
packages/studio/e2e/touch-key-add-remove.spec.ts               # un-skip (FR-008)
```

**Structure Decision**: the change stays inside the two packages that already own this surface —
`engine/src/pattern-apply` for operations, diagnostics and proposals; `studio/src/editors/assignLoop/keyGrid`
for the screen. New studio components are siblings of the ones they replace in `keyGrid/`, and the
studio reaches engine only through `packages/engine/src/index.ts`, per the boundary
`keyGridViewModel.ts`'s own module doc defends. No new package, no new top-level directory.

## Constitution Check

Re-checked against the final Phase 1 design.

| Article | Assessment |
|---|---|
| I — Pattern schema is a locked contract | **PASS.** No `Pattern`/`Criterion` field is touched. `EditableKeyFields` and `KeyEditOperation` live in `engine/src/pattern-apply/keyEditOps.ts`, are absent from `packages/contracts/src/schemas.ts`, and carry no zod mirror or drift guard — confirmed by grep, not assumed. The four admitted fields already exist on `TouchKeyIR`. `TouchKeyFindingCode` gains two members: additive to a union whose own docstring documents the additive procedure. |
| II — KeyboardIR is the engine spine | **PASS.** `move` is applied by both existing appliers (`applyKeyEditsToLayout` on the IR, `applyKeyEditsToRawJson` on Case B raw JSON). No new raw-`.kmn` path. Opaque fragments are untouched; where one makes the key-id ↔ rule join unprovable, edit-time rejection downgrades to warn-and-confirm via the existing `useKeyEditGuards`, never a silent drop. |
| III — Single persistent working copy | **PASS.** Every edit is a `KeyEditOperation` appended to the one `keyEditOverlay` in `workingCopyStore`, folded by `replayKeyEditOverlay`. No second working copy, no intermediate serialization. The Case A/Case B `promotedLayout` split is inherited from `handleAssignPanelCommit`, not re-derived. |
| IV — Validator layering is fixed | **PASS.** Both new codes are edit-time `TouchKeyFinding`s riding `useTouchKeyDiagnostics`, which is a `useMemo` inside the existing 300 ms cycle — **no second timer** (FR-039). Layer C's `check-18-3` keeps ownership of the hygiene finding; it merely stops owning the *threshold literal*, which moves to one shared table (D6). |
| V — VirtualFS only during authoring | **PASS.** No host-disk write. Output is unchanged; the emitted `.keyman-touch-layout` is produced by the existing VFS projection. |
| VI — Team boundaries | **PASS.** Engine team owns all of it (SPA + validator + operations). Content owns nothing here: no pattern library, survey text, gallery ordering, or LLM prompt changes. All author-facing copy is studio-composed and localized (FR-037) — the engine returns structured fields only. |
| VII — Out of scope for v1 | **PASS.** Touch-first authoring (Decision 6) is **not** engaged: the layout stays derived from the locked desktop; this only deepens editing of it. Layer/platform add-delete-rename stays out of scope, as does the raw source view, the device-photo chooser, and byte-level patch minimization. No CJK/Ethiopic, LDML, or multi-source merge. |
| VIII — House conventions | **PASS.** No emoji in console output. Markdown links in author-facing text. No GitHub issue numbers in shipped code or comments — issue #1530 is cited in this spec/plan and will be cited in the PR body, never in a source comment. Commit titles follow `<prefix>(<area>): <description>` with `studio`/`engine`/`contracts` areas. i18n ids follow `area ( "." segment )+`. |

No violations. **Complexity Tracking omitted** — nothing to justify.

Two Article-adjacent judgements worth naming, both resolved in favour of the gate:

- **NFKD.** FR-036's relatedness heuristic needs compatibility decomposition, which the house
  rule forbids for character *identity*. Confined to `keycapRelatedness.ts` with the carve-out
  stated in its docstring (D8), so the blast radius is one file a reviewer can read whole.
- **`check-18-3` edit.** Touching a Layer C check could look like re-layering. It is not: the
  check keeps its code, severity, layer and location. Only the two-entry threshold table moves,
  and it moves *because* a third copy would otherwise exist (`RemoveKeyDialog.tsx:235` is the
  second).

## Phasing

Five slices, in spec priority order. Per the Constitution's *One conversation per phase*, each
user-story phase is built in its own conversation; Setup and Foundational ride with US1, Polish
with US5.

| Phase | Slice | Requirements | Ships independently? |
|---|---|---|---|
| Setup + Foundational + P1 | **US1** — the controls do something | FR-001…FR-009 | **Yes** — the defect of record; resolves complaints #2–#5 |
| P2 | **US2** — geometry and metrics | FR-010…FR-017 | Yes, on US1 |
| P3 | **US3** — one property panel | FR-018…FR-025 | Yes, on US1+US2 |
| P4 | **US4** — gestures in key mode | FR-026…FR-028 | Yes, on US3 |
| P5 + Polish | **US5** — proposals | FR-029…FR-036 | Yes, on US3 |
| (all) | cross-cutting | FR-037…FR-040 | held every phase, not deferred to Polish |

**Foundational work riding with US1** (needed by US1 itself, not speculative): required-prop
inversion across three components and their four test files; the layer selector; and the
`TouchGallery` mount of `useKeyCommands`, `KeyGridCommandMenu`, `RemoveKeyDialog`, `RenameDialog`,
`FamilyApplyDialog`, `FindPanel` and `useModeContextCarry` — seven components built, unit-tested,
and never mounted.

**Ordering constraint that is not obvious**: US2's geometry change must land before US3's panel,
because FR-015 ("declared width is a minimum") is a *statement about the panel's width field*
that is only true once the stretch renders. Building the panel first would ship a width field
whose help text was wrong.

## Verification strategy

**Two tools, two roles** (research D2). **Playwright explores** — drive the real SPA from the CLI
(`npx playwright test`, headed or `--debug`) to *discover* whether a surface behaves. **vitest is
the repeatable gate** — every assertion that must keep being true after this ships lives in
`pnpm -r test`, which is what a pull request actually runs. No success criterion rests on the
Playwright lane alone.

| Criterion | Repeatable gate (vitest / tsc — PR lane) | Exploration (Playwright — ad hoc) |
|---|---|---|
| **SC-002** zero inert controls | `pnpm typecheck` — by construction after D1 | click every affordance in key mode |
| **SC-003** edit id/keycap/type/position + longpress without leaving key mode | key-mode integration block in `TouchGallery.test.tsx` | the same walk, by hand |
| **SC-005** untouched files byte-identical | **new vitest twin**: apply edits through the mounted component, `runTransform(<id>)`, compare the emitted VFS against the shipped source | the un-skipped e2e's own copy of the assertion |
| **SC-006** crowding fires, edit still succeeds | engine unit test on `TOUCH_KEY_ROW_CROWDED`, asserting phone-11-warns / tablet-11-does-not directly | see the readout on a real Cameroon row |
| **SC-007** proposal or stated reason per character class | table-driven engine test over the enumerated classes | — |
| **SC-008** localized number row raises no mismatch | engine unit test on `isKeycapRelated` (NFKD test) | — |
| **SC-004** keyboard-only, no serious a11y violations | existing grid a11y suite + axe over the touch stage; spec 063 SC-009's row-actions fix must not regress (FR-038) | tab through the whole stage |
| **SC-001** all six complaints resolved | — (a judgement, not an assertion) | click-through at PR review |
| **SC-009** the skipped walk passes; key mode covered on every PR | the integration block above | un-skip `e2e/touch-key-add-remove.spec.ts` |

**FR-008** is delivered as specified: un-skip `e2e/touch-key-add-remove.spec.ts` and let it pass
**unmodified**, supplying the two test ids its recipe pins — `touch-key-mode-add-key` and
`touch-key-mode-remove-key`. Its standing under this split is *evidence*, not a gate.

**Why SC-005 gains a vitest twin.** Its assertions live today only inside the skipped e2e walk,
which would leave the feature's strongest safety claim — "editing a few keys does not corrupt the
rest of the author's keyboard" — resting entirely on the lane that does not run. It needs no
browser: `TouchGallery.test.tsx` already reaches the emitted artifact via `runTransform`. Both
copies compare the *touched* file structurally and *untouched* files byte-exactly, the same split
the e2e header documents; byte-level patch minimization stays out of scope.

**Prerequisite**: SC-007's table is untestable until the reachable character classes are
enumerated — titlecase, free-standing modifier symbols, emoji sequences, variation selectors. That
enumeration is the **first task of US5**, per the spec's own assumption.

## Risks

- **`TouchGallery.tsx` is 6,147 lines** and is where all the wiring lands. Mitigation: the new
  surfaces are separate files (`LayerSelector`, `KeyPropertyPanel`, `RowMetricsReadout`,
  `GesturePanel`); `TouchGallery` gains handlers and mounts, not logic.
- **Required-prop inversion is a wide, mechanical diff** across four large test files
  (`KeyGrid.test.tsx` alone is 1,327 lines). Mitigation: it is the first task of US1, landed on
  its own so the rest of US1 reviews cleanly on top.
- **US3 folds two 800-line panels into one.** Mitigation: US1 wires the existing controls first,
  so the defect of record is fixed and shippable before the merge is attempted; the merge can
  slip a phase without un-fixing anything.
- **US2's re-proportioning is a surprising edit-time effect** — adding a key to the longest row
  visibly resizes every other row. Called out and accepted in ADR 0002; the metrics readout is
  the mitigation, and US2 AS4 asserts nothing clips or goes negative.
