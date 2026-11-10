# Implementation Plan: Output from the replayed keyboard

**Branch**: `118-replayed-ir-output` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)
| **Research**: [research.md](research.md) | **Data model**: [data-model.md](data-model.md)
| **Contract**: [contracts/](contracts/)

**Scale note**: this change spans `packages/studio` (projection, decisions, editors, validation) and
`packages/engine` (pattern-apply, codec, touch and visual-keyboard models). It lands as six
separately landable phases. Watch the byte-identical golden gate on every phase and the ordering
with spec 117.

## Summary

Today the studio produces a keyboard twice: replay builds a working copy, and
`lib/projectWorkingCopyVfs.ts` (about 1,600 lines, 7 `parseKmn` calls, about 14 ordered text steps)
builds the files from other inputs. This plan makes replay the only producer. Every decision's
`apply` returns the transformed keyboard, including its touch layout and visual keyboard. One
`emit(state, mode)` stage writes the files for preview, download, archive, pull request and LDML.
The projection shrinks to that call plus file-level work (descriptor, id renames, docs, fonts).
Defects (FR-020) are fixed first, each with a failing test, so the migration is checked against
correct output. No timer is added, no Pattern field changes.

## Technical Context

- **Language**: TypeScript, React and Zustand in `packages/studio`; codec and appliers in
  `packages/engine`.
- **Replay**: `packages/studio/src/decisions/replayKeyboard.ts` (checkpoints of `{ ir, overlay }`),
  `applyDeterminism.ts`, `derivedSurfaceRegistry.ts`, `derivedEquivalence.test.ts` (spec 105 gate).
- **Output today**: `lib/projectWorkingCopyVfs.ts`, `lib/projectionInput.ts`,
  `lib/buildOutputBundle.ts`, `lib/openMode.ts`, `lib/ldmlExportInputs.ts`.
- **Engine appliers to turn into IR transforms**: `engine/src/pattern-apply/` (`applyAssignments.ts`,
  `applyAssignmentsToVfs.ts`, `applyCarveToVfs.ts`, `applyKeyEditsToVfs.ts`,
  `applyTouchAssignments.ts`, `keyEditOps.ts`, `mark-guards.ts`, `context-tolerance-overlay.ts`,
  `spliceKmn.ts`).
- **Testing**: Vitest per package; the spec 105 equivalence gate; golden fixtures
  (`__fixtures__/flagParity/fullSpine.kmn`); `rebuildPerf.measure` for FR-032.
- **Performance**: after-edit rebuild under 300 ms, draft restore under 2 s (SC-006), baselines from
  spec 093 / 105 FR-012.

## Constitution Check

| Article | Verdict |
|---|---|
| I Pattern contract | PASS. `kmnFragment` stays a string and the `{{slotId}}` syntax runs first (FR-012). No schema edit. |
| II KeyboardIR spine | PASS. This brings pattern application and projection onto the IR. Opened keyboards splice; a full reformat needs consent (FR-015). |
| III State model | PASS. Output is the replayed copy; replay wins over the draft snapshot cache (ruled 2026-11-10, no constitution change). |
| IV Validator layering | PASS. Layers unchanged; FR-017 only changes the input. |
| V VirtualFS only | PASS. One emit stage; compiled artifacts stay on the download path. |
| VII Out of scope | PASS. No decisions-only drafts, no restructure (117), no new authoring features. |
| IX Registry | PASS. Ordering becomes `requires` edges in the registry (FR-013), derived by `orderByDependencies`. |
| X No silent decisions | PASS. A recorded choice that can no longer apply is reported (Edge Cases); reformat needs consent. |
| XI Done means integrated | PASS. Each phase ends with its caller switched over; the old stage is deleted in Phase 5, with owner and trigger below. |
| D3 single debounce | PASS. FR-017 reuses the one cycle. |

No violations, so no Complexity Tracking.

## Project Structure

```text
packages/engine/src/
  pattern-apply/        applyAssignments -> IR merge; carve/keyEdit/touch appliers gain IR twins
  codec/                emit modes (unedited | open | copy), touch + kvks emit
  output/               single emit(state, mode) entry
packages/studio/src/
  decisions/            replayKeyboard, decision modules' apply, requires edges, derivedSurfaceRegistry
  lib/                  projectWorkingCopyVfs (reduced to emit + file work), openMode, buildOutputBundle
  StudioShell.tsx       D3 validation input
specs/118-replayed-ir-output/   plan, research, data-model, contracts, tasks
```

**Structure Decision**: no new package. The state-in, files-out `emit` lives in the engine
(`output/`), the studio only supplies state and file-level inputs. This keeps studio code from
reading text back.

## Phases

Each phase is landable alone and holds the golden fixtures byte-identical except where an FR-020
fix changed them on purpose (FR-030). Each that changes replay re-measures rebuild time (FR-032).

| Phase | Content | Needs |
|---|---|---|
| 0 | Defect fixes FR-020 (a)-(i), one change each, failing test first. (i) shares code with Phase 2 and lands first as a narrow fix. | - |
| 1 | `emit(state, mode)` and the three modes beside the projection. Preview, download, archive, pull request and LDML read it through an adapter; no behaviour change. Fixes (d) and (e) by routing every `.kmn` write through the modes. | 0 |
| 2 | Pattern application on the model (FR-012): slot-substitute as text, parse inside a scaffold (the `rulePacks/install.ts` precedent), merge into the model. Existing merge behaviours each get a test. | Spec 117 explicit-keystroke change; 0 |
| 3 | Touch layout and visual-keyboard models in replayed state (FR-011, FR-016): twins for carve keycap removal, layer propagation and keycap labels; no spurious hand-set marks; unknown members kept. `.kvks` stays a documented text pass after emit. Retires spec 063 R10.2 as a separate pass; raw-JSON twins retire once the twin-equivalence tests are green. | 1 |
| 4 | Ordering edges (FR-013): every position-implied constraint in the projection becomes a `requires` edge; a gate fails when derived order changes output. | 1 |
| 5 | Surfaces apply (spec 105 phases with amended FR-007) land; projection reduced to emit plus file work with no `parseKmn`; `rulesStepAdded`, `deriveRuleAdditions` and the "never emitted" comment deleted; FR-017 validation on the replayed keyboard. | 105 phases; 2, 3, 4 |

**Follow-up ownership (Art XI)**: the `.kvks` text pass is owned by this spec and expires when a
fidelity-preserving visual-keyboard model exists; the trigger to revisit is the end of Phase 5.

## Risks

- **Phase 5 waits on spec 105.** Phases 0 to 4 are useful alone: they fix the defects and prepare
  the seams. If 105 slips, Phase 5 does not start; nothing earlier depends on it.
- **Ordering with spec 117.** Phase 2 waits for 117's explicit-keystroke change, so the merge is
  written once. Phases 0, 1, 3 and 4 do not wait.
- **Byte-identical gate noise.** A red gate counts against a phase only if it does not reproduce on
  an unchanged tree (spec 105 A/B rule).
- **Context tolerance** needs a compile and a simulation. Its decision records the computed result,
  so replay stays synchronous (Assumptions).
