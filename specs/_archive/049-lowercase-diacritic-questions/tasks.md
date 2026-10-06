# Tasks: Show only lowercase base letters in the diacritic (marks) survey questions

**Input**: Design documents from [specs/049-lowercase-diacritic-questions/](./spec.md)

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/ui-contract.md](./contracts/ui-contract.md)

**Tests**: Included — the spec has measurable success criteria (SC-001..SC-004) and two P1 user stories with independent tests; per-story vitest coverage is required to demonstrate them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story the task belongs to (US1, US2)
- File paths are exact and relative to the repo root.

## Path Conventions

Monorepo (`packages/*`). This feature touches only:
- `packages/studio/src/survey/` — the display fold (US1) + affordance count
- `packages/engine/src/marks/` — the uppercase attachment expansion (US2)

No `@keyboard-studio/contracts` change (locked-contract PASS in [plan.md](./plan.md) Constitution Check).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: No new tooling/deps. This phase only confirms the build baseline before edits.

- [x] T001 Confirm baseline green: `pnpm --filter @keyboard-studio/engine test` and `pnpm --filter @keyboard-studio/studio test` pass on the current tree, so later regressions are attributable to this feature.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared casing-fold helpers (FR-006 single source of truth) and the pure engine expansion helper. Both user stories depend on these; they must land before US1/US2 wiring.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Add the shared casing-fold helpers to `packages/studio/src/survey/charNormUtils.ts` per [contracts/ui-contract.md](./contracts/ui-contract.md): `hiddenUppercaseBases(bases, bcp47)`, `lowercaseBaseView(bases, bcp47)`, `casedBaseCount(bases, bcp47)`. Rules from [data-model.md](./data-model.md): fold an uppercase base only when its lowercase counterpart (via `caseCounterpart`) is also present; caseless / uppercase-only-without-lowercase input yields empty hidden set, unchanged view, count 0 (FR-001, FR-003, FR-004, FR-006).
- [x] T003 [P] Add the pure engine helper `expandCaseCounterpartAttachments(alphabet, attachments, bcp47)` in new file `packages/engine/src/marks/case-fold.ts` per [contracts/ui-contract.md](./contracts/ui-contract.md): for each checked `(base, mark)`, additively check the uppercase counterpart when `caseCounterpart(base, bcp47)` returns `direction === "toUpper"` and the counterpart is present in `alphabet.bases`; return a new map, never clear an existing check (FR-002, FR-003, FR-007). Reuse the existing `caseCounterpart` primitive — introduce no new casing rule.
- [x] T004 Re-export `expandCaseCounterpartAttachments` from `packages/engine/src/index.ts` so the studio marks step can import it from `@keyboard-studio/engine` (depends on T003).

**Checkpoint**: Shared helpers exist and build (`pnpm typecheck`); US1 and US2 wiring can proceed.

---

## Phase 3: User Story 1 — Diacritic questions offer only lowercase base letters (Priority: P1) 🎯 MVP

**Goal**: On a cased-script base, mark-attachment questions show lowercase/caseless base letters only, with no uppercase duplicate of a present lowercase; caseless bases are unchanged. The "capitals follow automatically" count stays accurate.

**Independent Test**: For a cased (Latin) base, render a mark-attachment question and assert every offered base is lowercase/caseless with no uppercase duplicate; for a caseless base, assert the base-letter set is identical to pre-feature.

### Implementation for User Story 1

- [x] T005 [US1] Refactor `packages/studio/src/survey/PhaseB.tsx` to compute its inline `hiddenUppers` via the shared `hiddenUppercaseBases`/`lowercaseBaseView` helper (T002) — behavior-preserving; establishes the single source of truth with the character step (FR-006). Depends on T002.
- [x] T006 [US1] In `packages/studio/src/survey/marks/MarksSeriesStep.tsx`, pass `lowercaseBaseView(gate.alphabet.bases, bcp47)` as `AttachmentStation`'s `bases` (was `gate.alphabet.bases`) and `casedBaseCount(...)` as `casePairCount` (was `deriveCaseCounterparts(...).size`) per [contracts/ui-contract.md](./contracts/ui-contract.md). `AttachmentStation.tsx` prop surface is unchanged (FR-001, FR-005). Depends on T002.

### Tests for User Story 1

- [x] T007 [P] [US1] In `packages/studio/src/survey/marks/MarksSeriesStep.test.tsx`, add: (a) cased Latin base ⇒ rendered attachment base choices contain zero uppercase duplicates of a present lowercase (SC-001, AC1); (b) caseless base ⇒ base-letter set identical to unfolded `alphabet.bases` (SC-003, AC3); (c) `casePairCount` equals `casedBaseCount(...)` for a mixed-case sample (SC-004). Use existing test hooks (`data-testid="marks-attachment"`, `attachment-row-<U+xxxx>`). Depends on T005, T006.

**Checkpoint**: US1 is independently demonstrable — folded display + honest count, caseless untouched.

---

## Phase 4: User Story 2 — Uppercase attachments are still produced (Priority: P1)

**Goal**: Answering only about lowercase bases still produces uppercase-counterpart attachments in the worklist, so the finished keyboard types accented capitals; no extra attachment is forced for caseless/no-counterpart bases.

**Independent Test**: Feed an `attachmentChecked` map covering lowercase bases on a cased base through the marks step and assert the produced attachment set / worklist includes each cased base's uppercase counterpart, and nothing extra for a caseless base.

### Implementation for User Story 2

- [x] T008 [US2] In `packages/studio/src/survey/marks/MarksSeriesStep.tsx`, run the author's `attachmentChecked` through `expandCaseCounterpartAttachments(gate.alphabet, attachments, bcp47)` immediately before `buildPlacementWorklist` so the produced worklist covers uppercase counterparts (FR-002, FR-007). Depends on T004, and on T006 (same file — sequence after T006 to avoid conflicting edits).

### Tests for User Story 2

- [x] T009 [P] [US2] Add engine unit tests for `expandCaseCounterpartAttachments` in `packages/engine/src/marks/case-fold.test.ts`: checked lowercase base with present uppercase counterpart ⇒ counterpart also checked (SC-002, AC1); caseless base or lowercase with no single-char counterpart ⇒ no extra check (AC2, FR-003); existing checks never cleared, input map not mutated (FR-007). Depends on T003.
- [x] T010 [P] [US2] In `packages/studio/src/survey/marks/MarksSeriesStep.test.tsx`, add an integration assertion: attaching a mark to lowercase bases on a cased base yields a produced worklist/attachment set that includes the uppercase counterparts (SC-002, US2 AC1). Depends on T008.

**Checkpoint**: US2 correctness guarantee holds — accented capitals are produced without a second question.

---

## Phase 5: Polish & Cross-Cutting

- [x] T011 Run `pnpm lint` (includes `test-antipattern-lint`) and `pnpm typecheck`; fix any findings introduced by this feature.
- [x] T012 Run full `pnpm --filter @keyboard-studio/engine test` and `pnpm --filter @keyboard-studio/studio test`; confirm all SC-001..SC-004 assertions pass and no existing marks/character-step tests regressed (FR-007 no-behavior-change for downstream consumers).

---

## Dependencies & Execution Order

- **Phase 1 (T001)** → baseline.
- **Phase 2 (T002, T003 parallel; T004 after T003)** → blocks all story work.
- **US1 (T005, T006 after T002; T007 after both)** and **US2 engine test (T009 after T003)** can proceed in parallel once Phase 2 is done.
- **US2 wiring (T008)** depends on T004 and sequences after T006 (same file `MarksSeriesStep.tsx`). **T010** after T008.
- **Phase 5 (T011, T012)** last.

## Parallel Execution Examples

- After T001: run **T002** (studio helper) and **T003** (engine helper) together — different packages.
- After Phase 2: run **T009** (engine test) alongside the US1 studio edits **T005/T006**.
- **T005** (PhaseB.tsx) and **T003/T009** (engine) are independent files → parallelizable.

## Implementation Strategy

**MVP = US1 + US2** (both P1). US1 is the visible change (lowercase-only choices); US2 is the correctness guarantee that makes US1 safe. Ship them together: the display fold without the attachment expansion would silently drop accented capitals. Within that, land Phase 2 helpers first, then US1 display + US2 expansion, then the SC-tied tests.
