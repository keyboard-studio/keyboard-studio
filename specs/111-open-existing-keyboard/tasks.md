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

- [x] T008 [P] [US1] No-edit round-trip integration test over T001's sample set (SC-001, SC-002; the Cameroon `.kps` keeps 278 languages in order) in `packages/studio/src/lib/serializeWorkingCopy.open.test.ts`
- [x] T009 [P] [US1] One-rule-edit test, where the `.kmn` diff touches only that rule plus the version line (SC-003), in the same file

### Implementation

- [x] T010 [US1] Apply the Article II/III amendment exactly as in [contracts/constitution-amendment.md](contracts/constitution-amendment.md) (owner-approved 2026-11-03) to `.specify/memory/constitution.md`, editing the existing text and bumping the footer to 2.3.0
- [x] T011 [US1] On Open, keep the `.kps` in the VFS and rewrite its `../build/` `<File>` entries to the studio's build paths in `packages/engine/src/loader/fetchKeyboardSourceToVfs.ts` (option flag; Copy's call site unchanged)
- [x] T012 [US1] Add an Open branch to `patchKpsIdentity` in `packages/engine/src/package-descriptor/patch.ts`: keep `<Description>` unless the author edited it, and write `<Languages>` from the author's list instead of the single identity tag. Add tests in `patch.test.ts`, including spec 057 SC-002 still holding for Copy.
- [x] T013 [US1] Insert `&KEYBOARDVERSION` after `&VERSION` when absent, and never touch `&VERSION`, in `packages/engine/src/stub-mutator/index.ts`, with a test using a fixture without `&KEYBOARDVERSION`
- [x] T014 [P] [US1] Write the "Updated" HISTORY entry above the existing history on Open, with no "Adapted from <self>", in `packages/engine/src/shared/renderHistoryMd.ts` and its caller at `packages/studio/src/lib/serializeWorkingCopy.ts` (~:720-731)
- [x] T015 [US1] On Open, stop regenerating README.md and readme.htm in `packages/studio/src/lib/serializeWorkingCopy.ts` (~:658-659). Carry the starting files unchanged.
- [x] T016 [US1] On Open, replace the `emitKmn` calls on the edit paths of `packages/studio/src/lib/projectWorkingCopyVfs.ts` (~:859, :1045, :1079) with `projectKmnText(startText, startIr, ir)`. On `ok:false`, surface the file name and wait for the author's consent before falling back to `emitKmn` (FR-009).
- [x] T017 [US1] Seed the language list from the parsed `.kps` (`parseKps`, `packages/engine/src/start-browser/kps-parser.ts`) into working-copy identity on Open, instead of the single-tag seed, in `packages/studio/src/stores/workingCopyStore.ts` (`instantiateFromExisting`) and `packages/studio/src/lib/confirmRebase.ts` (`identitySeedFromSession`, branching on mode)
- [x] T018 [US1] Add an editable language-list question (add / remove / reorder), declared through the decision registry (Article IX), under `packages/studio/src/survey/questions/`, writing the list the `.kps` patch uses (T012)
- [x] T019 [US1] Add screen gates hiding `identity_lite`, `layout`, `choose_base` and `track` when `authoring-track` is `"adapt"` in `packages/studio/src/survey/questions/registry.ts` (`declaredScreenGates`, ~:180-186)
- [x] T020 [US1] Add an "Open an existing keyboard" entry on the welcome screen that searches by name, id or language (reusing `StartKeyboardPicker` / `StartBrowserService`), records `authoring-track = "adapt"`, and calls `instantiateFromExisting`. New file `packages/studio/src/components/OpenKeyboardEntry.tsx`, mounted in `packages/studio/src/StudioShell.tsx`. Lingui ids under `open.entry.*`, with FR translations.
- [x] T021 [US1] On Open, make the remove tool (carve) and the feature galleries optional, reachable from the menu, not in the walk, via screen gates in `packages/studio/src/survey/questions/registry.ts` and menu entries in `packages/studio/src/StudioShell.tsx`
- [x] T022 [US1] Restore old Adapt drafts. In `packages/studio/src/lib/persistWorkingCopy.ts` (`prepareWorkingCopySnapshot`, ~:537-549), when the snapshot lacks the `.kps`, refetch it at the draft's starting commit and list already-regenerated files as changes to keep or revert.
- [x] T023 [US1] Update user-facing wording from "Adapt" to "Open" in the studio (Lingui ids keep their handles; only English text changes), and run `pnpm --filter @keyboard-studio/studio messages:extract`

**Checkpoint**: T008/T009 green, Copy golden walk unchanged ([quickstart.md §6](quickstart.md)), manual walk step 1–2 of [quickstart.md §5](quickstart.md). Commit and push the phase.

---

## Phase 4: User Story 2 - See what was already wrong and what I broke (P1)

**Goal**: baseline at load, pre-existing/new findings, review notes, ratchet gate, PR blocks.

**Independent Test**: [quickstart.md §4](quickstart.md), the gate matrix (SC-005, SC-006).

- [x] T024 [P] [US2] Gate-matrix unit test (compile error / unconfirmed red / unjustified new failure / justified / pre-existing only, singly and paired) in `packages/studio/src/criteria/openRatchet.test.ts`
- [x] T025 [US2] Take the baseline at Open instantiation by running the criteria assembly over the opened working copy (reuse `judgeForeignKeyboard`, `packages/studio/src/criteria/judgeForeign.ts:284`, in its worker). Store `failing: Set<FindingKey>` (key `${lintRuleId}:${file}`) and `unresolvable` in the criteria slice of the draft envelope, generalising `baselineDocFindings` in `packages/studio/src/stores/workingCopyStore.ts`.
- [x] T026 [US2] Classify each current finding as pre-existing or new in `packages/studio/src/criteria/openRatchet.ts`, and show the mark on the criteria page rows in `packages/studio/src/criteria/CriteriaPage.tsx`
- [x] T027 [US2] Make the criteria page the landing view on Open, with each finding linking to its editor or suggested fix, in `packages/studio/src/StudioShell.tsx` (`#criteria` route) and `packages/studio/src/criteria/CriteriaPage.tsx`
- [x] T028 [US2] Review notes: write, edit and remove per new failure, auto-dropped when the key stops failing, stored in the criteria slice (never a decision), in `packages/studio/src/criteria/ReviewNoteEditor.tsx` and `openRatchet.ts`
- [x] T029 [US2] Ratchet submit gate: block on compile error, unconfirmed red item, or unjustified new failure; never block on pre-existing failures. Change `packages/studio/src/hooks/useInventoryCoverageGate.ts` (18.6) and the submit gating in `packages/studio/src/components/ManagedPRSubmitPanel.tsx`.
- [x] T030 [US2] Append the source block and review block per [contracts/pr-body.md](contracts/pr-body.md) to the body array in `packages/studio/src/components/ManagedPRSubmitPanel.tsx` (~:344-353), with markdown in notes escaped, and a test for the block text

**Checkpoint**: T024 green; manual walk step 5 of [quickstart.md §5](quickstart.md). Commit and push.

---

## Phase 5: User Story 3 - Edit the real files (P2)

**Goal**: code views show file text; Apply replaces the starting point; tools change only their parts.

**Independent Test**: edit a comment in the `.kmn` view, apply, and check that the output diff is that line only; then make a decision change and check that the edit survives replay.

- [x] T031 [US3] Add `replaceStartingPointFromText(path, text)` to `packages/studio/src/stores/workingCopyStore.ts`: write the VFS text, re-parse, and set `startIr` in one update (data-model invariant), then trigger replay (`packages/studio/src/decisions/rebuildWorkingCopy.ts` reseeds on a new `startIr`). Test that a later decision change does not clobber the edit.
- [x] T032 [P] [US3] On Open, show the VFS `.kmn` text and apply via T031 in `packages/studio/src/editors/assignLoop/KmnCodePane.tsx`. Treat a formatting-only change as a change. Parse errors block Apply (FR-015).
- [x] T033 [P] [US3] Same for `.kvks` in `packages/studio/src/editors/assignLoop/OskCodePane.tsx`
- [x] T034 [P] [US3] Same for the touch layout in `packages/studio/src/editors/assignLoop/touchBuilder/TouchCodePane.tsx`, bypassing the structural-edit refusal on Open (research R7)
- [x] T035 [US3] On Open, have the OSK and touch editors edit the existing files and offer generation only when the file is missing, in `packages/studio/src/editors/assignLoop/OskEditor.tsx` and the `touch_seed_source` gate in `packages/studio/src/survey/questions/registry.ts`
- [x] T036 [US3] Consent dialog for a full re-emit (T016's `ok:false` path), naming the file, in `packages/studio/src/components/ReformatConsentDialog.tsx` (accessible per [docs/accessibility.md](../../docs/accessibility.md))

**Checkpoint**: manual walk step 2 of [quickstart.md §5](quickstart.md). Commit and push.

---

## Phase 6: User Story 4 - Choose which copy of the keyboard to open (P2)

**Goal**: pick keymanapp/keyboards or keyboard-studio/keyboards when they differ; warn on curated replacement; record the source.

**Independent Test**: three keyboards (identical, curated-in-fork, stale-in-fork) behave per spec US4.

- [x] T037 [US4] Resolve both repos' copies via `/review-proxy/:owner/:repo/:sha/:path*` (passed as `proxyBase` to `fetchKeyboardSourceToVfs`), compare the `.kmn` and `.kps` text, and compute `SourceRef.alternative.newer` from each side's last-change commit date, in `packages/studio/src/lib/openSourceChoice.ts`, with a unit test using a stubbed fetch
- [x] T038 [US4] Show both copies when they differ, plus the curated-replacement warning, in `packages/studio/src/components/OpenKeyboardEntry.tsx`. Store `SourceRef` in the working-copy snapshot (`packages/studio/src/lib/persistWorkingCopy.ts`).
- [x] T039 [US4] Feed `SourceRef` (repo, short SHA, path, version change, curated note) into the PR source block (T030)

**Checkpoint**: commit and push.

---

## Phase 7: User Story 5 - Keep the keyboard consistent (P2) + expected characters (FR-018a)

**Goal**: per-Apply consistency suggestions; the exemplar union as the expected inventory.

**Independent Test**: [quickstart.md §5](quickstart.md) step 3; open Cameroon QWERTY and check that missing exemplar characters are listed as pre-existing, with the count of languages that had data.

- [x] T040 [P] [US5] Implement the exemplar union in `packages/studio/src/lib/openExpectedInventory.ts`: `sourceExemplars(tag)` over the `.kps` languages after `loadExemplarSource()`, NFC, union, plus a `{withData, total}` count. Unit test it with a stubbed index.
- [x] T041 [US5] Feed the union to the 18.6 inventory-coverage check as its linguist inventory on Open, with missing characters offering an "add character" fix into the mechanisms gallery, in the criteria assembly under `packages/studio/src/criteria/` (ratchet from T029 applies). Re-run when the language list changes (T018).
- [x] T042 [P] [US5] Implement the per-Apply delta in `packages/studio/src/lib/consistencySuggestions.ts`: `buildProducedSet` and `computeTouchCoverage` before and after, plus 11.6 layer ids, scoped to what this change added or removed (research R10). Unit test it.
- [x] T043 [US5] Suggestion UI (accept / skip, never auto-apply; accepted and declined recorded in the 053 record so they aren't re-offered) in `packages/studio/src/components/SuggestedFixes.tsx`, mounted on the criteria page and after Apply in the code views and galleries

**Checkpoint**: commit and push.

---

## Phase 8: User Story 6 - Upgrade the keyboard's Keyman structure (P3)

**Was blocked until** criterion 7.28 (branch `km/casedkeys-criterion`) merged; it is now on this branch.

**Independent Test**: [quickstart.md §5](quickstart.md) step 4 (upstream `basic_kbdus`).

- [x] T044 [US6] Add an upgrade-pair registry (criterion lintRuleId → fixer) in `packages/studio/src/criteria/upgradePairs.ts`, with the first pair `KM_LINT_CASEDKEYS_MISSING` → `upgradeToCasedKeys` (spec 112; `packages/engine/src/caps/upgradeToCasedKeys.ts`, exported from `@keyboard-studio/engine`). The fix is offered only when `compareCapsBehaviour` (same module) is not `differs`. The fix is applied as an IR change projected through `projectKmnText`.
- [x] T045 [US6] Integration test: the spec 112 fixture `packages/engine/src/caps/__fixtures__/upstream_basic_kbdus/` shows the finding and fix; accepting it passes 7.28, and the `.kmn` diff touches only the `&CasedKeys` store and the removed CAPS rules (SC-007). In `packages/studio/src/criteria/upgradePairs.test.ts`.

**Checkpoint**: commit and push.

---

## Phase 9: User Story 7 - Fill gaps in the documentation, keep what's written (P3)

**Independent Test**: complete docs mean no doc questions; a missing help page means questions for that page only.

- [x] T046 [US7] On Open, gate Phase F help questions to documents that are missing or failing their criteria, prefilled from existing docs, via question `requires` / screen gates in `packages/studio/src/survey/questions/registry.ts` and `packages/studio/src/lib/phaseFSeeds.ts`. Fix the dead `.kps` read in `proposeProjectUrl`, now that the `.kps` is in the VFS.
- [x] T047 [US7] Turn regeneration into a suggested fix: replace only between `ks:generated` markers (`packages/engine/src/shared/docSlots.ts`, `helpDocsRender.ts` `spliceGenerated`), or append a marked block when there are no markers, with a before/after preview, in `packages/studio/src/components/SuggestedFixes.tsx`

**Checkpoint**: commit and push.

---

## Phase 10: Polish & cross-cutting

- [x] T048 [P] Amend [spec.md](../../spec.md) §15 Scenario F (replaced; a single-language keyboard from a country keyboard is a Copy), [specs/110-readme-template/spec.md](../110-readme-template/spec.md) User Story 5, and [docs/workflow-model.md](../../docs/workflow-model.md) Track 2 wording, editing the existing text, not appending
- [x] T049 [P] Run `node utilities/spec-trace check` and acknowledge the intended drift from T048
- [x] T050 Playwright E2E for the Open happy path ([quickstart.md §5](quickstart.md) steps 1–2, 5) in `packages/studio/e2e/open-existing-keyboard.spec.ts`. Check SC-009 (≤3 interactions to the first walk step, Languages, as amended) and SC-008 (no change without interaction).
- [x] T051 Full gates: `pnpm lint`, the studio/engine/contracts/keyboard-lint vitest suites, and the golden walk (SC-004)

---

## Phase 11: Start screen (FR-001, amended 2026-11-05)

The Open entry shipped as a card under the welcome screen, clipped out of view and skipped entirely for returning authors, while the old Open option stayed in the Copy walk's track step. The owner ruled: New or Open after sign-in or guest, New leading, reachable from the nav at any time, and no Open mid-walk.

- [x] T052 [US1] Add the `start` route and `StartScreen` (`packages/studio/src/components/StartScreen.tsx`): "Create a new keyboard" leads, the Open entry follows; continue an existing local or account draft; New confirms before discarding a draft. Guest leads there (`WelcomeScreen.tsx`, fresh-session reset moved to `lib/freshSession.ts`); a returning author with no draft lands there (`StudioShell.tsx` `defaultLandingRoute`); the nav wordmark links there (`NavBar.tsx`).
- [x] T053 [US1] New records `authoring-track = "copy"`; gate the track step on an unrecorded track (`registry.ts` `openScreenGates`); remove the Open option and the track proposal (`track_choice.ts`, `flowStepOptionRecords.ts`, `lib/proposeTrack.ts` deleted); retire the e2e `chooseAdaptTrack` helper
  - Follow-up 2026-11-06: the track step itself was removed (the question had only the Copy option left). The gate T053 added is gone with it: the start screen records the track, and a walk reaching base confirmation with none recorded defaults to copy (provenance `"default"`, recorded by StudioShell at instantiation).
- [x] T054 [US1] Tests: `StartScreen.test.tsx`; landing, guest and gate tests updated; `boot-smoke` checks New and Open are in the viewport after guest and the wordmark leads back; `open-existing-keyboard.spec.ts` starts from the start screen and asserts `toBeInViewport`
- [x] T055 [US1] Convert the e2e specs that walked the removed mid-walk Open route (`chooseAdaptTrack`, now throwing with a pointer to the start screen) to open from the start screen or walk Copy, per what each spec tests. None runs in the CI lanes; list: `grep -rln "chooseAdaptTrack(page)" packages/studio/e2e` Done 2026-11-06: `chooseAdaptTrack` deleted. light-theme-a11y, derived-keyboard and switch-base-rebase F1 still fail for reasons unrelated to Open (see the commit).

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

## Phase 12: The Open walk (US8, FR-021 amended, FR-031..FR-034; added 2026-11-05)

**Goal**: Open lands on a walk with Continue on every step, adding Missing letters, Upgrades and Documentation only when the keyboard has those problems, and ending at Review then Output.

**Independent test**: open upstream basic_kbdus and walk it with Continue only to Output; open a keyboard with no missing letters and no failing upgrade and check those pages are skipped.

- [x] T056 [US8] Record the baseline's problem kinds as a derived decision (`open-issues`: `missing-letters`, `upgrades`, `docs`) when the Open baseline is taken (`packages/studio/src/hooks/useKeyboardArtifact.ts`), and add the decision id (`packages/studio/src/decisions/decisionTypes.ts`)
- [x] T057 [US8] Open lands on the Languages step instead of the criteria view (`packages/studio/src/components/OpenKeyboardEntry.tsx`); update `open-existing-keyboard.spec.ts`
- [x] T058 [US8] Missing letters step: a gallery module gated on `open-issues` including `missing-letters`, rendering `MissingLettersByLanguage` with per-letter add; it replaces the character survey on Open (`packages/studio/src/survey/questions/gallery/`, `registry.ts`, `steps/advance.ts`)
- [x] T059 [US8] Upgrades step: a gallery module gated on `open-issues` including `upgrades`, listing failing upgrade criteria with preview and Apply/Skip, from `packages/studio/src/criteria/upgradePairs.ts` (7.28 cased keys is already registered there)
- [x] T059a [US8] Touch caps upgrade to the full Capsifesto behaviour of the owner's `processTouch.py` (MattGyverLee/KeymanValidation, `Template Cleanup/`): extend `syncTouchCapsLayerRaw` (`packages/engine/src/caps/syncTouchCapsLayer.ts`) to also build `rightalt-caps` and `ctrl-caps` from their shift layers (lifting spec 112 R8's exclusion), make character keys on non-default, non-caps layers return to `default` (one-shot Shift), and set Shift on shift layers to `*Shifted*` and on caps layers to `*ShiftedLock*`, each returning to the unshifted layer; register 18.16 in `upgradePairs.ts`
- [x] T059b [US8] Modifier-key upgrade: a new criterion row (`packages/contracts/data/criteria.json`) and lint check for inconsistent Ctrl/RAlt touch keys, paired with a fixer porting `process_modifier_key` from `processTouch.py` (ids `K_RALT`, labels `*Ctrl*`/`*RAlt*`, target layers, special style)
- [x] T059c [US8] Symbols-layer upgrade: a new criterion row and lint check for a touch layout without a symbols layer, paired with a fixer adding the layer from the owner's `symbols.json` and a `K_SYMBOLS` key on non-symbol layers (as the keyboards fork's "add K_SYMBOLS link key" commit did)
- [x] T060 [US8] Review step: the criteria view as the walk's last step on Open, Continue to Output with the FR-027 gate; Documentation is the existing help step (FR-029)
- [x] T061 [US8] Tests: the Open walk order with and without each problem kind (`advance.open.test.ts`); a Continue-only e2e walk of basic_kbdus to Output

### Phase 12 follow-up: the revised Open walk (owner ruling 2026-11-06)

**Goal**: Languages, Letters, Upgrades (only if any), Mechanisms, OSK, Touch, CSS, Documentation (only if needed), Review, Output; the order derives from declared inputs and outputs.

- [x] T062 [US8] Record whether the opened keyboard is basic as a derived decision (`open-basic-keyboard`) when it is opened (`OpenKeyboardEntry.tsx`, reusing `lib/basicKeyboard.ts`); gate Letters and Mechanisms on it (`decisions/openIssues.ts`, `survey/questions/registry.ts`)
- [x] T063 [US8] Letters step (was Missing letters): always walked for a non-basic keyboard, shows the characters the keyboard types, per-letter and free-form Add into the character inventory (`lib/openInventory.ts`), the missing-by-language grouping with Remove language; for a basic keyboard only with missing letters (`survey/openWalk/MissingLettersStep.tsx`)
- [x] T064 [US8] Mechanisms and Touch are walked on Open (Mechanisms not for a basic keyboard); Open's pages become gated spine screens whose order comes from `provides` / `screenRequires` (Mechanisms screen-requires Upgrades), and `advance.ts` no longer hard-codes the Open sequence
- [x] T065 [US8] Footer labels for the Open pages, the OSK, CSS and welcome-page steps; the first help question is not required on Open; criteria findings for 18.6 and upgrades open the Letters and Upgrades steps
- [x] T066 [US8] Tests: `advance.open.test.ts` asserts dependency order, gates and the Open/Copy split instead of literal sequences; the Continue-only e2e asserts Languages, Letters, Mechanisms, OSK, Touch

## Phase 13: Ctrl and removing letters (moved)

T070-T077 (FR-035..FR-040) moved to [spec 114](../114-ctrl-and-letter-removal/spec.md) on 2026-11-06. Their ids are not reused here.

## Phase 14: One read source (live-files amendment 2026-11-13, FR-043)

**Goal**: on Open, the preview and the criteria read the working copy's current files, and the preview places changes the way the output does. No constitution change.

**Independent test**: open a keyboard, apply a code edit to the source with no other change, and check the preview and the criteria follow it; edit the on-screen keyboard and check the preview shows it (SC-012).

- [x] T078 On Open, the preview projection starts from the working copy's current files, not the files as fetched (`packages/studio/src/hooks/useWorkingCopyTransform.ts`, `packages/studio/src/hooks/useKeyboardArtifact.ts`). A change to any working-copy file re-runs the projection in the existing validation cycle; no new timer (FR-022). Copy is unchanged.
- [x] T079 On Open, the preview passes Open mode to the projection, so a changed source is spliced as in the output (`useWorkingCopyTransform.ts`, `packages/studio/src/lib/projectionInput.ts`). Where the splice cannot place a change, the preview compiles the reformatted text the author would be asked to accept.
- [x] T080 Tests for SC-012: a source code edit with no other change, an on-screen keyboard edit, and an accepted documentation fix each reach the projected preview files; an applied upgrade's criterion passes; the session baseline (FR-019) is still the keyboard as opened; preview and output files agree on Open (extend `projectionInput.parity.test.ts`).

## Phase 15: The apply seam for the keyboard source (FR-041, FR-042, FR-009 amended)

**Goal**: on Open, the remove tool, Mechanisms assignments and added rules write the source file when applied, and decisions are no longer replayed. The Article III amendment lands with this phase (owner approval needed).

- [x] T081 One Open-only apply function: compute the change on the model, splice it into the current text, replace the file and re-read the model; ask for reformat consent here (FR-009 amended).
- [x] T082 Route the remove tool, Mechanisms assignments and rule additions through it on Open; applied changes then read as existing content.
- [x] T082a Route Layout-tab edits (spec 117) through the apply function on Open, keeping their decision as the record; Copy keeps the replay. Depends on the Layout tab having merged. Until then the Open output row of `PROJECTION_STEPS` keeps `layoutEdits` as a temporary replay of that one decision (spliced through `writeKmn`) so Layout-tab edits made on Open are not lost; this task removes it from that row. Code-tab edits on Open never use a `code-apply` entry (`codeEdits` is in no Open row). (Done: `lib/layoutOpenCommit.ts`; the store's `commitKmnEdit` and `commitLayoutDeadkeyOp` write a `model` change scoped to the groups (and stores/raw for deadkeys) on Open; `layoutEdits` left the Open `output` row; the Layout tab reads `startIr` on Open; its own undo is hidden there and the footer Open undo takes the step back.)
- [x] T082b The preview drops a file the working copy no longer holds (phase 14's overlay only adds and replaces); needed before any tool can remove a file. (Phase 15 S6: `removedPaths` on the undo store, derived from the log; the preview drops them, undo restores; tests in `projectionInput.openWorkingCopy.test.ts` and `projectionInput.parity.open.test.ts`.)
- [x] T082c Trace whether the caps step and the id rename can re-emit the whole source on Open, and route them through the splice if so. (S3a: the caps step splices on Open and runs only for an answered decision; the id rename never runs on Open. Applying caps at the moment it is answered waits for the Layout tab, T082a.)
- [x] T083 Stop replaying decisions after a code edit on Open; decisions remain as the record (trail, review notes, PR body).
- [x] T084 Measure across the corpus sample how often a tool change cannot be spliced; report before converting more tools.
- [x] T085 Apply the Article III wording from the spec amendment to `.specify/memory/constitution.md`, with the version bump (owner-approved only).
- [x] T086 Tests: SC-010 and SC-011 for the source file. (S3a: SC-011 done in `openApply.s3a.test.ts`; SC-010 remains.) (Phase 15: SC-010 for removal, restore, code-view edit, assignment, marks guards, deadkey, context-tolerance fix and normalization step in `projectionInput.parity.open.test.ts`, `openApply.assign.test.ts`, `openApply.s2.test.tsx`, `openApply.s3b.test.tsx`; SC-011 in `openApply.s3a.test.ts`.)
- [x] T086a (slice S2) Retire on Open the disabled-families overlay (`disabledFamilyIds`): disabling a family writes the file when applied, then the overlay and its replay are dropped for Open.
- [x] T086b (slice S2) Retire on Open the marks-guards overlay: guard rules are written into the file when applied; no guard state is replayed at output.
- [x] T086f (do before slice 3b, so 3b adds its steps to the table rather than new flags) Replace the projection's per-kind skip flags (`applyOnly`, `skipMarkGuards`, `skipIntendedCheck`) with one per-kind table of steps (`APPLY_STEPS`) before T087.
- [x] T086c (slice S3) Retire on Open the context-tolerance overlay store: the fix is spliced when applied, so `contextToleranceOverlay` is never held on Open (S1 carries a held one into the file on the next apply as a stopgap).
- [ ] T086d (slice S3) Retire on Open the deadkey-ops overlay and the key-edit-ops overlay: each op is written to the file when applied; `keepAll` no longer needs the Open exception that keeps them (FR-041). S3b: deadkey ops done (written when made, undo record, no projection step replays the log; the log stays only as the `deadkeys-defined` decision record). Key-edit ops are touch-only and stay for phase 16 (T087/T087a).
- [x] T086e (slice S1 follow-up) Wire the generic `files` change (`OpenChange` kind `files`) and `undoLastOpenApply` to their first editors; S4 builds the undo UI over the session undo list.
- [ ] T086g (slice S3; S3b narrowed it) Remove the held-overlay flush in `openApply` (the flush that writes held overlays ahead of another change) once T086c and T086d retire the overlays. S3b: older Open drafts need no compatibility (owner ruling), so the flush no longer carries carves or a context-tolerance fix: the Mechanisms gallery and the carve suggestion write through the seam, and the tolerance fix is written when applied. The flush stays only for touch key-identity rule additions (`rulesStepAdded`, until phase 16); remove it with them.
- [ ] T086h Retire on Open the output's rule-additions step (step 1.8's `ruleAdditions` splice from the working IR): the rules step's additions are written when applied (through the patch sink, `model` change), so the output derives none. Depends on T086c and T086g. S3b: NOT done; the touch key-identity commit still writes `rulesStepAdded` rules through `setWorkingIR`, so the step stays in the output set (`PROJECTION_STEPS.output`) until phase 16.

## Phase 16: Touch (FR-044)

- [ ] T087 Settle which touch host is live on Open, then make key-grid, builder and character edits patch the touch file's text when applied; Continue no longer rebuilds the layout on Open.
- [ ] T087a Retire on Open the touch overlays that S1 leaves in place: `deletedTouchKeyIds` and `carveTouchKeepInert` (touch-key deletions and keep-inert characters) are written into the touch layout file when applied.
- [ ] T087b Reseed touch from desktop on Open: an understated secondary action (OWNER RULING 2026-11-14); replaces the touch file as one applied change, shown and agreed first (FR-009), undoable; creates the file when none exists (FR-017). Desktop letter placements reach touch only as suggestions in the touch step, as on Copy (OWNER RULING 2026-11-14). Until then an opened keyboard without a touch file keeps the build-at-output path; this is the one place the touch editor writes the working model on Open.
- [ ] T088 Tests: SC-013.
- [ ] T087c (S2a prerequisite) The `touch` change kind needs a layer-add path (an intended-layout edit or a layer applier) before the builder's add-layer is routed (S2a).

## Phase 17: Remaining files (FR-041, FR-047)

- [ ] T089 The documentation and style editors write their files on Open; no separate edited copy replaces a file at output.
- [ ] T089a Retire on Open the CSS output override: the OSK stylesheet (`customCss`, projection steps 0b and 4b) is written into the stylesheet file when the author applies it, so the output writes none. Goes with T089.
- [ ] T090 The language list patches the package descriptor when applied.
- [ ] T091 On-screen keyboard key labels after a Mechanisms change, per the owner's answer to open question 1.
- [ ] T092 Tests: SC-014, and SC-010 for these files.

## Phase 18: Undo, drafts, unapplied text (FR-045, FR-046, FR-049)

- [x] T093 Undo and "Discard changes and go back" restore file text on Open, including code-view edits (depth per open question 3). (Phase 15 S4: `OpenUndoButton` in the footer cluster; Discard restores the log as at arrival, `RevisionSnapshot.openUndo`; no redo exists in the studio, so none added; no undo shortcut exists, so none added; touch key edits keep the touch Undo until T087. Tests: `OpenUndoButton.test.tsx`.)
- [ ] T094 Leaving a code view with unapplied text asks whether to apply or discard it.
- [ ] T095 Open drafts save the current files and the record. No migration of drafts saved earlier (OWNER RULING 2026-11-13, FR-049 amended).

## Phase 19: Cleanup

- [ ] T096 Remove the Open branches of the output projection that no longer do anything, leaving the version bump and HISTORY entry (FR-048). Includes: remove the output-time reformat consent on Open from the download, test-build and PR paths (consent is asked when the change is applied, so output never asks).
- [ ] T097 Extend the Open end-to-end walk to assert SC-010 on every step.
