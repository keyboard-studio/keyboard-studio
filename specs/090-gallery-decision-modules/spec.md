# Feature Specification: Gallery and picker decisions become modules

**Feature:** specs/090-gallery-decision-modules
**Branch:** cut from `main` after 089 merges (`km/gallery-decision-modules`); may land as
several PRs, one per user story
**Created:** 2026-10-06
**Status:** Draft
**Series:** 3 of 6, and the largest. The plan is
[088 HANDOFF.md](../088-modular-decisions/HANDOFF.md) (see its per-step write-site table).
**Depends on:** 089 (`apply` and the patch runner).

## Summary

Fourteen steps (`layout`, `choose_base`, `characters`, `marks`, `punctuation`, `invisibles`,
`convenience`, `carve`, `deadkeys`, `rules`, `mechanisms`, `touch_seed_source`, `touch`, and the
gallery part of `help`) name their decisions only as `settles: [...]` strings. Their components
write straight to stores. This spec gives each a decision module whose `renderer` is the existing
component. The working-copy overlays become the **values** of those decisions, and the in-place
IR rewrites move into `apply`. Custom UI keeps its look.

## User Scenarios & Testing

Each story is a slice that can land independently. Every story ends with the golden walk
(089 SC-001) byte-identical.

### User Story 1 — Small pickers (Priority: P1)
`layout` (`windows-layout`), `touch_seed_source`, `choose_base` (`base-keyboard`). Each becomes a
module, and its renderer reports through `onChange` instead of writing
`surveyAnswerStore` / `setTouchSeedSource` / `setLocalBase`.

### User Story 2 — The alphabet and inventories (Priority: P1)
`characters`, `marks`, `punctuation`, `invisibles`, `convenience`. `phaseBDraftStore`'s
accept/decline becomes the value of the inventory decisions. The MARKS reducer's
`applyMarkGuards` → `setWorkingIR` and the context-tolerance patch move into
`marks-treatment`'s `apply`.

### User Story 3 — Carve, deadkeys and rules (Priority: P2)
`carved-layout`'s value is the removal set (`deletedNodeIds`, `deletedItemIds`,
`disabledFamilyIds`, `carveChars`, `carveDispositions`, `closedKeyboardCard`), each item with its
own provenance (`asked` for a hand removal, `derived` for a proposal). `deadkeys-defined`'s value
is the deadkey op list (`deadkeyOverlay`). `rule-set` records the builder's result, so the rules
step leaves a decision.

### User Story 4 — Mechanisms and touch (Priority: P2)
`physical-layout`'s value is the assignments (`recordAssignments`). R1 `lockDesktop` moves into
its `apply`. `touch-layout`'s value is the key-edit ops plus deletions (`keyEditOverlay`,
`deletedTouchKeyIds`, `touchDraft`), with the per-key provenance spec 014 already defines
(`base-derived`, `physical-suggested`, `hand-set`). R2 `setTouchLayoutJson` moves into `apply`.

### User Story 5 — Every decision leaves a log entry (Priority: P2)
`layout`, `rules`, `touch_seed_source`, `deadkeys`, `punctuation` and `convenience` currently
leave none (HANDOFF G7). Each decision's completion records one.

### Edge Cases
- A gallery's in-progress draft while open (for example carve's live overlay for the OSK
  preview) stays renderer-internal. It is never saved, and its commit goes through `onChange`.
- Undo (`undoStack`) operates on the decision value, not on an overlay beside it.
- An orphaned hand-set item (its key no longer exists) is kept in the value and shown, never
  deleted (spec 014 R6).

## Requirements
- **FR-001** `QuestionModule` MUST gain `renderer: "question" | Component<DecisionRendererProps>`
  (default `"question"`). `DecisionRendererProps` gains `provenance` and `source`, so any
  renderer can show "from <keyboard>".
- **FR-002** Each `settles` name MUST have a module with `provides`, `requires`, `apply` and a
  `renderer`. `settles` entries in `stepDependencies.ts` become redundant with the modules (091
  deletes the file).
- **FR-003** No renderer, adapter or gallery component may call a working-copy setter, a
  `surveyAnswerStore` save, or a session setter. A depcruise or ESLint rule MUST enforce this.
- **FR-004** The overlays listed in US3 and US4 MUST become fields of decision values in
  `decisionStore`. The working copy still holds an applied view until 093, but that view is
  written only by `apply`.
- **FR-005** The in-place IR rewrites (MARKS guards, R1, R2, deadkey ops, context tolerance) MUST
  run only inside `apply`, as functions of (IR, value, inputs).
- **FR-006** Collection values MUST carry provenance per item (`asked`, `derived`, `extracted`).
- **FR-007** `phaseBDraftStore` and the gallery answers in `surveyAnswerStore` MUST be deleted.
  `surveyAnswerStore` keeps only within-step view position, or is renamed to say so.
- **FR-008** Every decision MUST produce a decision-log entry on completion.

## Duplication ledger

| duplicate | after 090 | retired by |
|---|---|---|
| gallery answers in `surveyAnswerStore`, `phaseBDraftStore` | **deleted** | 090 |
| overlays as independent state | **now decision values**; the working copy holds only an applied view | 093 |
| in-place IR rewrites outside modules | **deleted** | 090 |
| `settles` strings | redundant | 091 |

Named handoff on the "overlays" row (lead ruling D-090-30/D-090-31, 2026-10-07): the
carve overlay is the one overlay whose applied view is NOT produced by a module `apply`
(089's contract has no carve-overlay channel; `projectWorkingCopyVfs` remains the
canonical producer, and the `carved-layout` decision records the overlay at completion).
**093's I-1 overlay accumulator grows a carve-overlay fold — reconstruct the overlay
from carved-layout decision values during replay; 092's T037 remains pending on carve
until that fold exists.** Addendum (D-090-33): if the TouchKeepInertControl surface ever
mounts, the carved-layout value needs a field for `carveTouchKeepInert` before the fold
can be complete — it has no live writer today.

## Success Criteria
- **SC-001** The golden walk is byte-identical after each user story lands.
- **SC-002** The lint rule from FR-003 passes with zero exceptions.
- **SC-003** A live walk leaves one decision-log entry per decision for every step.
- **SC-004** Zero references to `phaseBDraftStore`.
- **SC-005** Unit tests show each `apply` is deterministic: same (IR, value, inputs) in, same
  patch out, with no store access (a test harness with stores frozen).

## Assumptions
- Renderers keep their current look. Visual changes are out of scope.
- Carve's per-item provenance needs a shape decision during `/speckit-plan`; the spec 014
  touch-key provenance is the model.
