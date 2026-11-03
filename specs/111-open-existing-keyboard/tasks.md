# Tasks: Open an existing keyboard

**Input**: Design documents from `/specs/111-open-existing-keyboard/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included where a success criterion or contract names them (SC-001…SC-009, [contracts/kmn-projection.md](contracts/kmn-projection.md)). New non-trivial logic leaves a test.

**Organization**: one phase per user story, in spec priority order. Phases are built one per conversation (constitution, Authoring workflow). Copy must stay unchanged throughout: every studio change is guarded by the Open mode helper (T004).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1…US7 from [spec.md](spec.md)

---

## Phase 1: Setup

- [x] T001 Add the sample-keyboard list for corpus round-trip tests (≥20 ids incl. `sil_cameroon_qwerty`, `basic_kbdus`, touch-enabled and deadkey-heavy keyboards, CRLF files) in `packages/studio/src/test/openSampleKeyboards.ts`, with each id checked against [docs/keyboard-index.md](../../docs/keyboard-index.md). Add phonebook rows for any id not yet in the index.

---

## Phase 2: Foundational (blocking)

**Purpose**: the splice projection and shared types every story uses.

- [x] T002 [P] Export `emitRule` and `emitStore` from `packages/engine/src/codec/index.ts` and the engine barrel `packages/engine/src/index.ts`
- [x] T003 [P] Add `SourceRef`, `FindingKey` and `ReviewNote` types (additive, no Pattern change) to `packages/contracts/src/openKeyboard.ts`, exported from `packages/contracts/src/index.ts` (fields per [data-model.md](data-model.md))
- [x] T004 [P] Add `isOpenMode(mode)` (`mode === "adapt-existing"`) in `packages/studio/src/lib/openMode.ts`. Every Open-only branch below uses it.
- [x] T005 Write the contract tests from [contracts/kmn-projection.md](contracts/kmn-projection.md#tests-must-exist-before-the-studio-uses-it) in `packages/engine/src/pattern-apply/spliceKmn.test.ts`: no-op identical; delete/replace/insert on corpus files touch only their lines; a continued (`\`) rule replaced whole; an ineligible edit returns `ok:false` with the node id; CRLF stays CRLF
- [x] T006 Implement `diffIrToKmnEdits`, `spliceKmn` and `projectKmnText` in `packages/engine/src/pattern-apply/spliceKmn.ts` per the contract. Spans come from `sourceLine` + `joinContinuations` (`packages/engine/src/codec/continuation.ts`). Export them from `packages/engine/src/index.ts`.
- [x] T007 Re-implement `carveViaSplice` as `spliceKmn` with delete edits only in `packages/engine/src/pattern-apply/carveViaSplice.ts`, keeping its LF behaviour for Copy. Its existing tests must pass unchanged.

**Checkpoint**: engine tests green (`pnpm --filter ./packages/engine exec vitest run`).

---

## Phase 3: User Story 1 - Update a multilingual keyboard without losing anything (P1) MVP

**Goal**: Open a keyboard, edit or don't, submit; languages, docs, comments and formatting survive.

**Independent Test**: [quickstart.md §2–3](quickstart.md). The no-edit round trip over the sample set is identical apart from the version and HISTORY; a one-rule edit changes only that rule.

### Tests

- [ ] T008 [P] [US1] No-edit round-trip integration test over T001's sample set (SC-001, SC-002; the Cameroon `.kps` keeps 278 languages in order) in `packages/studio/src/lib/serializeWorkingCopy.open.test.ts`
- [ ] T009 [P] [US1] One-rule-edit test, where the `.kmn` diff touches only that rule plus the version line (SC-003), in the same file

### Implementation

- [ ] T010 [US1] Apply the Article II/III amendment exactly as in [contracts/constitution-amendment.md](contracts/constitution-amendment.md) (owner-approved 2026-11-03) to `.specify/memory/constitution.md`, editing the existing text and bumping the footer to 2.3.0
- [ ] T011 [US1] On Open, keep the `.kps` in the VFS and rewrite its `../build/` `<File>` entries to the studio's build paths in `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts` (option flag; Copy's call site unchanged)
- [ ] T012 [US1] Add an Open branch to `patchKpsIdentity` in `packages/engine/src/package-descriptor/patch.ts`: keep `<Description>` unless the author edited it, and write `<Languages>` from the author's list instead of the single identity tag. Add tests in `patch.test.ts`, including spec 057 SC-002 still holding for Copy.
- [ ] T013 [US1] Insert `&KEYBOARDVERSION` after `&VERSION` when absent, and never touch `&VERSION`, in `packages/engine/src/stub-mutator/index.ts`, with a test using a fixture without `&KEYBOARDVERSION`
- [ ] T014 [P] [US1] Write the "Updated" HISTORY entry above the existing history on Open, with no "Adapted from <self>", in `packages/engine/src/shared/renderHistoryMd.ts` and its caller at `packages/studio/src/lib/serializeWorkingCopy.ts` (~:720-731)
- [ ] T015 [US1] On Open, stop regenerating README.md and readme.htm in `packages/studio/src/lib/serializeWorkingCopy.ts` (~:658-659). Carry the starting files unchanged.
- [ ] T016 [US1] On Open, replace the `emitKmn` calls on the edit paths of `packages/studio/src/lib/projectWorkingCopyVfs.ts` (~:859, :1045, :1079) with `projectKmnText(startText, startIr, ir)`. On `ok:false`, surface the file name and wait for the author's consent before falling back to `emitKmn` (FR-009).
- [ ] T017 [US1] Seed the language list from the parsed `.kps` (`parseKps`, `packages/engine/src/start-browser/kps-parser.ts`) into working-copy identity on Open, instead of the single-tag seed, in `packages/studio/src/stores/workingCopyStore.ts` (`instantiateFromExisting`) and `packages/studio/src/lib/confirmRebase.ts` (`identitySeedFromSession`, branching on mode)
- [ ] T018 [US1] Add an editable language-list question (add / remove / reorder), declared through the decision registry (Article IX), under `packages/studio/src/survey/questions/`, writing the list the `.kps` patch uses (T012)
- [ ] T019 [US1] Add screen gates hiding `identity_lite`, `layout`, `choose_base` and `track` when `authoring-track` is `"adapt"` in `packages/studio/src/survey/questions/registry.ts` (`declaredScreenGates`, ~:180-186)
- [ ] T020 [US1] Add an "Open an existing keyboard" entry on the welcome screen that searches by name, id or language (reusing `StartKeyboardPicker` / `StartBrowserService`), records `authoring-track = "adapt"`, and calls `instantiateFromExisting`. New file `packages/studio/src/components/OpenKeyboardEntry.tsx`, mounted in `packages/studio/src/StudioShell.tsx`. Lingui ids under `open.entry.*`, with FR translations.
- [ ] T021 [US1] On Open, make the remove tool (carve) and the feature galleries optional, reachable from the menu, not in the walk, via screen gates in `packages/studio/src/survey/questions/registry.ts` and menu entries in `packages/studio/src/StudioShell.tsx`
- [ ] T022 [US1] Restore old Adapt drafts. In `packages/studio/src/lib/persistWorkingCopy.ts` (`prepareWorkingCopySnapshot`, ~:537-549), when the snapshot lacks the `.kps`, refetch it at the draft's starting commit and list already-regenerated files as changes to keep or revert.
- [ ] T023 [US1] Update user-facing wording from "Adapt" to "Open" in the studio (Lingui ids keep their handles; only English text changes), and run `pnpm --filter @keyboard-studio/studio messages:extract`

**Checkpoint**: T008/T009 green, Copy golden walk unchanged ([quickstart.md §6](quickstart.md)), manual walk step 1–2 of [quickstart.md §5](quickstart.md). Commit and push the phase.

---

## Phase 4: User Story 2 - See what was already wrong and what I broke (P1)

**Goal**: baseline at load, pre-existing/new findings, review notes, ratchet gate, PR blocks.

**Independent Test**: [quickstart.md §4](quickstart.md), the gate matrix (SC-005, SC-006).

- [ ] T024 [P] [US2] Gate-matrix unit test (compile error / unconfirmed red / unjustified new failure / justified / pre-existing only, singly and paired) in `packages/studio/src/criteria/openRatchet.test.ts`
- [ ] T025 [US2] Take the baseline at Open instantiation by running the criteria assembly over the opened working copy (reuse `judgeForeignKeyboard`, `packages/studio/src/criteria/judgeForeign.ts:284`, in its worker). Store `failing: Set<FindingKey>` (key `${lintRuleId}:${file}`) and `unresolvable` in the criteria slice of the draft envelope, generalising `baselineDocFindings` in `packages/studio/src/stores/workingCopyStore.ts`.
- [ ] T026 [US2] Classify each current finding as pre-existing or new in `packages/studio/src/criteria/openRatchet.ts`, and show the mark on the criteria page rows in `packages/studio/src/criteria/CriteriaPage.tsx`
- [ ] T027 [US2] Make the criteria page the landing view on Open, with each finding linking to its editor or suggested fix, in `packages/studio/src/StudioShell.tsx` (`#criteria` route) and `packages/studio/src/criteria/CriteriaPage.tsx`
- [ ] T028 [US2] Review notes: write, edit and remove per new failure, auto-dropped when the key stops failing, stored in the criteria slice (never a decision), in `packages/studio/src/criteria/ReviewNoteEditor.tsx` and `openRatchet.ts`
- [ ] T029 [US2] Ratchet submit gate: block on compile error, unconfirmed red item, or unjustified new failure; never block on pre-existing failures. Change `packages/studio/src/hooks/useInventoryCoverageGate.ts` (18.6) and the submit gating in `packages/studio/src/components/ManagedPRSubmitPanel.tsx`.
- [ ] T030 [US2] Append the source block and review block per [contracts/pr-body.md](contracts/pr-body.md) to the body array in `packages/studio/src/components/ManagedPRSubmitPanel.tsx` (~:344-353), with markdown in notes escaped, and a test for the block text

**Checkpoint**: T024 green; manual walk step 5 of [quickstart.md §5](quickstart.md). Commit and push.

---

## Phase 5: User Story 3 - Edit the real files (P2)

**Goal**: code views show file text; Apply replaces the starting point; tools change only their parts.

**Independent Test**: edit a comment in the `.kmn` view, apply, and check that the output diff is that line only; then make a decision change and check that the edit survives replay.

- [ ] T031 [US3] Add `replaceStartingPointFromText(path, text)` to `packages/studio/src/stores/workingCopyStore.ts`: write the VFS text, re-parse, and set `startIr` in one update (data-model invariant), then trigger replay (`packages/studio/src/decisions/rebuildWorkingCopy.ts` reseeds on a new `startIr`). Test that a later decision change does not clobber the edit.
- [ ] T032 [P] [US3] On Open, show the VFS `.kmn` text and apply via T031 in `packages/studio/src/editors/assignLoop/KmnCodePane.tsx`. Treat a formatting-only change as a change. Parse errors block Apply (FR-015).
- [ ] T033 [P] [US3] Same for `.kvks` in `packages/studio/src/editors/assignLoop/OskCodePane.tsx`
- [ ] T034 [P] [US3] Same for the touch layout in `packages/studio/src/editors/assignLoop/touchBuilder/TouchCodePane.tsx`, bypassing the structural-edit refusal on Open (research R7)
- [ ] T035 [US3] On Open, have the OSK and touch editors edit the existing files and offer generation only when the file is missing, in `packages/studio/src/editors/assignLoop/OskEditor.tsx` and the `touch_seed_source` gate in `packages/studio/src/survey/questions/registry.ts`
- [ ] T036 [US3] Consent dialog for a full re-emit (T016's `ok:false` path), naming the file, in `packages/studio/src/components/ReformatConsentDialog.tsx` (accessible per [docs/accessibility.md](../../docs/accessibility.md))

**Checkpoint**: manual walk step 2 of [quickstart.md §5](quickstart.md). Commit and push.

---

## Phase 6: User Story 4 - Choose which copy of the keyboard to open (P2)

**Goal**: pick keymanapp/keyboards or keyboard-studio/keyboards when they differ; warn on curated replacement; record the source.

**Independent Test**: three keyboards (identical, curated-in-fork, stale-in-fork) behave per spec US4.

- [ ] T037 [US4] Resolve both repos' copies via `/review-proxy/:owner/:repo/:sha/:path*` (passed as `proxyBase` to `fetchKeyboardSourceToVfs`), compare the `.kmn` and `.kps` text, and compute `SourceRef.alternative.newer` from each side's last-change commit date, in `packages/studio/src/lib/openSourceChoice.ts`, with a unit test using a stubbed fetch
- [ ] T038 [US4] Show both copies when they differ, plus the curated-replacement warning, in `packages/studio/src/components/OpenKeyboardEntry.tsx`. Store `SourceRef` in the working-copy snapshot (`packages/studio/src/lib/persistWorkingCopy.ts`).
- [ ] T039 [US4] Feed `SourceRef` (repo, short SHA, path, version change, curated note) into the PR source block (T030)

**Checkpoint**: commit and push.

---

## Phase 7: User Story 5 - Keep the keyboard consistent (P2) + expected characters (FR-018a)

**Goal**: per-Apply consistency suggestions; the exemplar union as the expected inventory.

**Independent Test**: [quickstart.md §5](quickstart.md) step 3; open Cameroon QWERTY and check that missing exemplar characters are listed as pre-existing, with the count of languages that had data.

- [ ] T040 [P] [US5] Implement the exemplar union in `packages/studio/src/lib/openExpectedInventory.ts`: `sourceExemplars(tag)` over the `.kps` languages after `loadExemplarSource()`, NFC, union, plus a `{withData, total}` count. Unit test it with a stubbed index.
- [ ] T041 [US5] Feed the union to the 18.6 inventory-coverage check as its linguist inventory on Open, with missing characters offering an "add character" fix into the mechanisms gallery, in the criteria assembly under `packages/studio/src/criteria/` (ratchet from T029 applies). Re-run when the language list changes (T018).
- [ ] T042 [P] [US5] Implement the per-Apply delta in `packages/studio/src/lib/consistencySuggestions.ts`: `buildProducedSet` and `computeTouchCoverage` before and after, plus 11.6 layer ids, scoped to what this change added or removed (research R10). Unit test it.
- [ ] T043 [US5] Suggestion UI (accept / skip, never auto-apply; accepted and declined recorded in the 053 record so they aren't re-offered) in `packages/studio/src/components/SuggestedFixes.tsx`, mounted on the criteria page and after Apply in the code views and galleries

**Checkpoint**: commit and push.

---

## Phase 8: User Story 6 - Upgrade the keyboard's Keyman structure (P3)

**Blocked until** criterion 7.28 (branch `km/casedkeys-criterion`) merges to main.

**Independent Test**: [quickstart.md §5](quickstart.md) step 4 (upstream `basic_kbdus`).

- [ ] T044 [US6] Add an upgrade-pair registry (criterion lintRuleId → fixer) in `packages/studio/src/criteria/upgradePairs.ts`, with the first pair `KM_LINT_CASEDKEYS_MISSING` → `stripCapsRules` + `ensureCasedKeysStore` (`packages/engine/src/scaffolder/scaffold-ir.ts`, exported if not already). The fix is applied as an IR change projected through `projectKmnText`.
- [ ] T045 [US6] Integration test: upstream `basic_kbdus` fixture shows the finding and fix; accepting it passes 7.28, and the `.kmn` diff touches only the `&CasedKeys` store and the removed CAPS rules (SC-007). In `packages/studio/src/criteria/upgradePairs.test.ts`.

**Checkpoint**: commit and push.

---

## Phase 9: User Story 7 - Fill gaps in the documentation, keep what's written (P3)

**Independent Test**: complete docs mean no doc questions; a missing help page means questions for that page only.

- [ ] T046 [US7] On Open, gate Phase F help questions to documents that are missing or failing their criteria, prefilled from existing docs, via question `requires` / screen gates in `packages/studio/src/survey/questions/registry.ts` and `packages/studio/src/lib/phaseFSeeds.ts`. Fix the dead `.kps` read in `proposeProjectUrl`, now that the `.kps` is in the VFS.
- [ ] T047 [US7] Turn regeneration into a suggested fix: replace only between `ks:generated` markers (`packages/engine/src/shared/docSlots.ts`, `helpDocsRender.ts` `spliceGenerated`), or append a marked block when there are no markers, with a before/after preview, in `packages/studio/src/components/SuggestedFixes.tsx`

**Checkpoint**: commit and push.

---

## Phase 10: Polish & cross-cutting

- [ ] T048 [P] Amend [spec.md](../../spec.md) §15 Scenario F (replaced; a single-language keyboard from a country keyboard is a Copy), [specs/110-readme-template/spec.md](../110-readme-template/spec.md) User Story 5, and [docs/workflow-model.md](../../docs/workflow-model.md) Track 2 wording, editing the existing text, not appending
- [ ] T049 [P] Run `node utilities/spec-trace check` and acknowledge the intended drift from T048
- [ ] T050 Playwright E2E for the Open happy path ([quickstart.md §5](quickstart.md) steps 1–2, 5) in `packages/studio/e2e/open-existing-keyboard.spec.ts`. Check SC-009 (≤3 interactions to the criteria view) and SC-008 (no change without interaction).
- [ ] T051 Full gates: `pnpm lint`, the studio/engine/contracts/keyboard-lint vitest suites, and the golden walk (SC-004)

---

## Dependencies

```
Setup (T001) ─┐
Foundational (T002–T007) ──▶ US1 (T008–T023) ──┬──▶ US2 (T024–T030) ──┬──▶ US5 (T040–T043)
                                              ├──▶ US3 (T031–T036) ──┤
                                              └──▶ US4 (T037–T039)   ├──▶ US6 (T044–T045)  [+ criterion 7.28 merged]
                                                                     └──▶ US7 (T046–T047)
Polish (T048–T051) after the last story shipped in this spec
```

- US2, US3 and US4 are independent of each other after US1.
- US5 needs US2 (ratchet, criteria page) and US3 (apply path).
- US6 needs US2, US3 and the 7.28 merge.
- US7 needs US2.

## Parallel opportunities

- Foundational: T002, T003 and T004 together; T005 before T006.
- US1: T008, T009 and T014 alongside T011–T013 (different packages).
- US3: T032, T033 and T034 (three panes) after T031.
- US5: T040 and T042 together.
- Across stories: after US1, US2 / US3 / US4 can go to separate conversations.

## Implementation strategy

- **MVP**: Foundational plus US1. Opening and submitting stops destroying keyboards: Cameroon keeps its 278 languages, docs and comments survive, one-rule edits stay local.
- **Then** US2 (the ratchet) before handing Open to authors at large, because it's the guardrail that makes free editing safe.
- **Then** US3 / US4 in either order, then US5, US7, and US6 once 7.28 lands.
- Every phase ends green and is committed and pushed (CLAUDE.md cadence). A red phase commits only what's genuinely done, with the diagnosis in the message.
