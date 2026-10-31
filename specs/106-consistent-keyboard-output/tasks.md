# Tasks: Consistent keyboard output from base + decisions + carve

**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md) (R1-R10; R5 is the binding
km-keyman ruling), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: REQUIRED. The spec's verification requirement (SC-006) is that every story is proven first by
decision-point fixtures, and only then by the walk.

**Format**: `- [ ] TNNN [P?] [USn?] description (file)`. All paths are repo-relative.

**Branch/PR cadence (plan.md "Delivery sequencing")**: one PR per story phase, one commit per phase gate,
pushed to the story branch. Never merge. Never push to `main`.

Each story phase ends with the same three gate tasks:

1. its fixture assertions flip from `it.fails` to passing;
2. `pnpm lint` reports 0 errors with warnings at or below the 389 baseline;
3. the touched package suites pass.

---

## Phase 1: Setup

- [x] T001 Rebase `106-consistent-keyboard-output` on `km/s02-deadkey-purpose` if PR #2358 changed. Confirm `pnpm build` is green and `../keyboards` is on the keyboard-studio fork's master (CLAUDE.md "Keyboard phonebook").
- [x] T002 [P] Add phonebook rows for `cabecar`, `winchus` and `dega` (cited in research R5) to `docs/keyboard-index.md`. Follow the "Keep this current" recipe and read each keyboard's `.kps`.
- [x] T003 [P] Extract `.studio/decision-record.json` from four case zips in `../ks-2302-main/tools/testing-profiles-2302/zips/` (`p1-whole-bafut-kbdus.zip`, `p4-unwrap-bafut-camqwerty.zip`, plus one Ewondo kbdfr and one Ewondo camazerty case; the records are inside the zips, not extracted on disk) into `packages/studio/src/lib/__fixtures__/decision-points/records/` (one per base keyboard: kbdus, kbdfr, camqwerty, camazerty). Add a `PROVENANCE.md` naming the case id and the build it came from.

---

## Phase 2: Foundational (blocks every story)

- [x] T004 Create `packages/studio/src/lib/projectionInput.ts` with a pure `projectionInputFromState(state, extras)` that returns the full `ProjectWorkingCopyVfsInput`. It must include `fallbackPolicy`, `suppressionExemptIds`, `disabledFamilyIds` merged into `deletedItemIds`, `carveTouchKeepInert` and `keyEditOps`, which today only the preview passes (research R1 F-DIVERGE).
- [x] T005 Switch `packages/studio/src/lib/serializeWorkingCopy.ts` (~:505) and `packages/studio/src/hooks/useWorkingCopyTransform.ts` (~:494) to `projectionInputFromState` (FR-005). The hook's `useMemo` dependency keys must cover every field.
- [x] T006 Add a preview/download parity test in `packages/studio/src/lib/projectionInput.parity.test.ts`. Seed the store with fallbackPolicy, a disabled family and keyEditOps, then assert that the preview transform VFS equals the `projectWorkingCopyForOutput()` VFS.
- [x] T007 Commit `fix(studio): one projection input for preview and download` and push it to `106-consistent-keyboard-output`.
> **Deferred (tracking issue #2361):** the method for starting stores follows the outcome of keymanapp/keyboards#4181. T070-T072 are **blocked** until then; do not implement them. T073 goes ahead for generated stores only.

- [ ] T070 [BLOCKED #2361] Write tests in `packages/engine/src/pattern-apply/store-legality.test.ts` for `splitIllegalStoreItems(ir)` (research R11). Cover:
  - a `dk(x) + any(K) > index(V,2)` store with `nul` items becomes separate `dk(x) + 'k' > nul` rules, with the remaining items still aligned;
  - `beep` items are split the same way and emitted as `nul` (the simulator equivalence compares final output only, because beep and nul behave the same);
  - it is idempotent;
  - a store shared by rules where a safe split is impossible is left alone with a warning;
  - a corpus case on `sil_cameroon_qwerty.kmn:352` `store(dkt003b)`: compile succeeds and the simulator output plus beep flag are identical for every key after `;`, before and after the split.
  The corpus case is a `*.corpus.test.ts` and is skipped when `../keyboards` is absent.
- [ ] T071 [BLOCKED #2361] Implement `splitIllegalStoreItems` in `packages/engine/src/pattern-apply/store-legality.ts` and export it from `packages/engine/src/index.ts`. It operates on the IR (Art. II) and never mutates its input.
- [ ] T072 [BLOCKED #2361] Add projection step 1.9 in `packages/studio/src/lib/projectWorkingCopyVfs.ts`, after the 1.8 deadkey overlay and before step 2. It does parse, then `splitIllegalStoreItems`, then emit only when the IR changed, and pushes one `[project-working-copy]` warning per split store. Update the header comment.
- [x] T073 Add the G8 gate to `checkConsistencyGates` when T010 lands. It is enforced for generated stores; for starting stores it is `it.fails` with the test name citing #2361 until T070-T072 unblock.

---

## Phase 3: User Story 1 — Decision-point fixtures (P1) MVP

**Goal**: base + DecisionSet at a point, run through the real download path, compiled, simulated and gate-checked.

**Independent test**: `npx vitest run --config vitest.corpus.config.ts src/test/decisionPoint` reports every gate per fixture. Today's gaps E1-E7 are `it.fails`.

- [x] T008 [US1] Export `loadVfs` from `packages/studio/src/test/sc004Harness.ts` (:58) and widen it from `(typeof KEYBOARDS)[number]` (KEYBOARDS :29-35 lacks basic_kbdfr and sil_cameroon_*) to `{ id, group }`, so it can load any corpus keyboard. Keep the existing callers unchanged.
- [x] T009 [US1] Implement `recordToDecisionSet(record, upTo)` in `packages/studio/src/test/recordToDecisionSet.ts`.
  - Parse the record with `parseDecisionRecord` (`engine/src/decision-audit/record.ts:251`) and keep the non-superseded entries.
  - Map `decision` entries to `decisionId`.
  - Map `survey-answer` entries through each registry module's `provides` (`survey/questions/registry.ts`).
  - Cut at `DecisionPoint`, in this order: `marks` -> `carve` -> `assignments` -> `caps` -> `tolerance`. Do **NOT** use `decisionOrderFor`: in registry order carve comes before assignments, `caps-handling` may sort before marks, and `tolerance` is not a decision id (it is `marks-treatment.value.contextTolerance`, `contracts/src/surveyPhaseResult.ts:202`). Each point is an explicit allow-list of ids plus sub-field masks:
    - `marks`: the identity, inventory and layout decisions, plus `marks-treatment` with `contextTolerance` set to null;
    - `carve`: adds `carved-layout`;
    - `assignments`: adds `deadkeys-defined`, `rule-set` and `physical-layout`;
    - `caps`: adds `caps-handling` (absent in pre-US5 records, so the harness seeds the module default);
    - `tolerance`: restores `contextTolerance`.
  - Add a unit test against the p1 record (entry counts, the cut keeps only decisions at or before the point).
- [x] T010 [US1] Implement `checkConsistencyGates` (G1-G8, see [contracts/consistency-gates.md](contracts/consistency-gates.md)) in `packages/studio/src/test/consistencyGates.ts`, with unit tests on synthetic IRs: one passing and one failing case per gate.
- [x] T011 [US1] Implement `buildDecisionPointFixture` in `packages/studio/src/test/decisionPointFixture.ts` (see [contracts/decision-point-fixture.md](contracts/decision-point-fixture.md)).
  1. Reset the stores.
  2. Run `loadVfs`.
  3. Instantiate the way `sc004Harness.runAdaptFlow` (:143-158) does: `parseKmn`, then `makeStartKeyboard`, then `instantiateFromStart` for copy or `instantiateFromExisting` for adapt. Add the `recognizePatterns` and touch-layout parse from `tests/survey/walkEmit.compile.test.ts` :149-156. (`instantiateLikeStudio` itself loads from `tests/fixtures/walkBases`, not the corpus.)
  4. Replay with `rebuildWorkingCopy`.
  5. Install the slices that replay does not put where the projection reads them:
     a. Carve: replay already installs it (`rebuildWorkingCopy.ts:294-307`). Do not set it again.
     b. `deadkeyOverlay.ops`: set it from `deadkeys-defined.value.ops`. Replay applies the ops to the IR, but the projection reads the store (`serializeWorkingCopy.ts:511`).
     c. Assignments: `physical-layout.value.assignments` -> `recordAssignments` (`stores/workingCopyStore.ts:994`).
     d. `contextToleranceOverlay`: it cannot be derived from the value. At `tolerance`, await `applyContextToleranceDecision` (`lib/contextToleranceApply.ts:62`, async compile + simulate).
     e. `fallbackPolicy`: it is in no decision value and not in the record (`survey/carve/carveValue.ts:29-33`). The harness uses DEFAULT; this limitation is recorded in the fixture header.
  6. Call `buildOutputBundle()`.
  7. Return the compiled result, a `simulate` closure and the gates.
- [x] T012 [US1] Add the script `fixtures:decision-points` to `packages/studio/package.json`. It runs `scripts/genDecisionPoints.ts`, which writes `src/lib/__fixtures__/decision-points/<base>/<profile>/<point>.decisions.json` from the T003 records, and its output must be deterministic. Generate and commit the JSON.
- [x] T013 [US1] Write `packages/studio/src/test/decisionPoint.corpus.test.ts`.
  - Run every committed fixture through `buildDecisionPointFixture` and assert the gates.
  - Mark the known gaps `it.fails` with the owning story in the test name: G3 → US2, G4 → US3, G1 → US4 (G1 applies at `assignments` and later, because unreachable hints come from assignment shadowing), G2 → US6. As built, G5 has no row: the four records contain no cased pair the gate misses (see T042). The camazerty G2 row is owned by an engine bug, not US6: the tolerance analysis throws on rules keyed to touch-only `T_` keys.
  - Add G7 determinism: project twice, byte-equal.
  - Gate missing corpus with `announceSc004Skip`.
- [x] T014 [US1] Add a fidelity assertion to the same file: for p1-whole-bafut-kbdus at the last point, the fixture's `source/bafut.kmn` equals the walk zip's `.kmn` modulo the known E-gaps. Any diff outside those gaps fails, and the diff is printed. This proves the fixtures reproduce what the UI produces. **Lifecycle**: the match is exact at US1. The zip predates the T005 F-DIVERGE fix and contains `zzq` placeholders, so normalise both of those first. From US2 on, each story records its expected diff in the test (`expectedDiffs[story]`). T064 re-baselines everything against the fresh walk zip.
- [x] T015 [US1] Gate: run the quickstart steps 1, 3 and 4. Commit `feat(studio): decision-point fixtures with consistency gates` and push. Open a PR from `106-consistent-keyboard-output` (base: `km/s02-deadkey-purpose` until #2358 merges, then `main`) carrying the spec folder and Phases 1-3.

---

## Phase 4: User Story 2 — Mark guards reach the artifact (P1)

**Goal**: the marks decision is enforced in the download (FR-010 to FR-013). **Independent test**: the US2-tagged `it.fails` in T013 now pass, plus the simulator cases below. **Branch**: `km/106-mark-guards`.

- [x] T016 [P] [US2] Write engine tests in `packages/engine/src/pattern-apply/mark-guards.test.ts`. Rules are now one per mark (`notany(generated_marks_allowed_<n>) '<mark>' > context(1)`) plus the buffer-start rule. Cover:
  - an allowed context with U+0020 when the space column is ticked;
  - the bare-mark `emit` behaviour at buffer start;
  - idempotency on re-application.
  **Amended 2026-10-30 (#2374 ruling):** the bare-mark behaviour is now the per-mark start-of-line box (unticked default). Replaced by T071.
- [x] T017 [P] [US2] Write simulator tests in `packages/studio/src/test/decisionPoint.guards.corpus.test.ts` against the Bafut kbdus fixture at `marks`. **As built**: the fixture is cut at `assignments`, because before assignments no key types a bare mark (K_5 types U+0300 there); `k` stands in for the unchecked base, since the grave's row checks `a`. The touch case is a recorded skip: the fixtures do not reproduce the touch step.
  - `a` then `5` is blocked when `à` is unchecked.
  - `5` after `1` is blocked.
  - `5` after a space is blocked when the column is unticked and allowed when it is ticked.
  - `5` at buffer start is blocked under swallow.
  **Amended 2026-10-30 (#2374 ruling):** now blocked when the mark's start-of-line box is unticked, allowed when ticked (incl. after Enter). Replaced by T071.
  - Touch `T_0300` follows the same route; use the touch simulator `TouchTapSession` if it is reachable, otherwise record a skip with the reason.
- [x] T018 [US2] Add `allowedContexts?: Record<string, string[]>` to `PlacementWorklist` in `packages/engine/src/marks/worklist.ts` (:52-97). Space is never a base and never a blocked combination.
- [x] T019 [US2] (Generated stores never contain `nul`/`beep`, and generated rules use `nul`, never `beep`: R11, G8.) Rewrite the blocking emission in `packages/engine/src/pattern-apply/mark-guards.ts` (:106-124) as per-mark `notany` rules over a generated allowed store (case-expanded bases plus allowedContexts), with a `nul '<mark>'` buffer-start rule driven by a new `bareMarkBehaviour` parameter. Keep the existing stripping of `generated_marks_*` and keep the result counts. **As built**: stores are named by the mark's code point (`generated_marks_allowed_0301`). The allowed set also takes, from the attested stacks, the mark before a stacked mark and the precomposed prefix, so multi-mark stacks are not swallowed. A mark with nothing allowed gets a plain `'<mark>' > nul` rule (an empty store cannot back `notany`). Stripping now also recognises the guard hop parsed back from a `.kmn` (trailing comment in the raw `use()`), so the projection's re-parse is idempotent. **Amended 2026-10-30 (#2374 ruling):** the buffer-start rule is now driven by the per-mark start-of-line box, not `bareMarkBehaviour`; a ticked mark also adds `"\n"` to its allowed store. Replaced by T071.
- [x] T020 [US2] Add projection step 2.6 to `packages/studio/src/lib/projectWorkingCopyVfs.ts` at ~:890, between 2.5 and 2.7 (research R3):
  - add a new `marksGuards` input;
  - parse, then `applyMarkGuards`, then emit only when the IR changed;
  - warn on `guardHopSkipped`;
  - update the header comments at :14-56 and :670-674.
- [x] T021 [US2] Fill `marksGuards` in `projectionInputFromState` (`packages/studio/src/lib/projectionInput.ts`) from `getMarksTreatmentValue()` (`survey/marks/marksValue.ts:136`) for the download, and from the decision store selector for the preview. `bareMarkBehaviour` comes from `guardSpecification.behaviour`. **Amended 2026-10-30 (#2374 ruling):** the per-mark start-of-line box replaces `bareMarkBehaviour`. Replaced by T071.
- [x] T022 [US2] In `packages/studio/src/survey/questions/gallery/marksTreatment.ts`, make `apply` return `{}` and `writes` `[]` (FR-011). Also change the write map at `decisions/decisionTypes.ts:393` (`"marks-treatment": [["groups"],["stores"]]`, i.e. `MARKS_WRITES`) to `[]`. Update every test that asserted guard groups in the working IR or referenced the marks writes so it asserts them in the projection instead; this includes `lib/carvePipelineParity.test.ts` and `lib/silCameroonQwerty.carve.test.ts`.
- [x] T023 [US2] Add the space column to `packages/studio/src/survey/marks/AttachmentStation.tsx`:
  - a "space" checkbox per mark row, unchecked by default, stored as `marks_attachment.<mark>| `;
  - in `reconciledAttachmentChecked` (`marksViews.ts:90`) and the `MarksSeriesStep.tsx` case expansion (:384-390), pass it through without case-expanding it;
  - in `buildPlacementWorklist`, map it to `allowedContexts`;
  - add the en/fr i18n catalog entries (named placeholders only), following `packages/studio/CLAUDE.md`.
  **Template for T070** (start-of-line column).
- [x] T024 [US2] Gate. Re-run T013 first: G2 on basic_kbdus/basic_kbdfr passes today only because no guard is emitted. If it flips once guards land, add its US6 row in this PR. Commit `fix(studio): mark guards reach the downloaded keyboard`, push, and open a PR. **As built**: G3 flipped on all 20 fixture rows and G2 on basic_kbdus/basic_kbdfr still holds, so no US6 row was added. The T014 fidelity diff is now a multiset diff with per-story allowed patterns (US2: only marks-series lines are added). Review fixes: the completion records only the stacks the stacking station kept, and the guard case-expands stacks.

- [ ] T070 [US2] (Added 2026-10-30, #2374 ruling; mirrors T023.) Add the start-of-line column to `packages/studio/src/survey/marks/AttachmentStation.tsx`: an `ATTACHMENT_START_OF_LINE` symbolic sentinel in `marksViews.ts` (never `""`, never a real char; never enters `allowedContexts`; excluded from the FR-008 `checkedBases` summary); one checkbox per mark row after the space box, answer id `marks_attachment.<mark>|<KEY>`, default `false`, never case-expanded, never proposed; saved on the attachment station's commit with `origin: confirmed/overturned` (`MarksSeriesStep.tsx:1252–1260`); en/fr i18n label + an explicit help line stating the unchecked-blocks semantics; copy the FR-008 closed-`<details>` posture of the space box.
- [ ] T071 [US2] (Added 2026-10-30, #2374 ruling; replaces the `bareMarkBehaviour` halves of T016/T017/T019/T021.) Replace the keyboard-wide bare-mark behaviour with the per-mark start-of-line box: new per-mark boolean channel in `packages/engine/src/marks/worklist.ts` set from the reconciled row; `mark-guards.ts` `buildGuard` takes the per-mark behaviour — unticked → keep `nul '<mark>' > nul`, ticked → omit the `nul` rule AND add `"\n"` to the mark's `generated_marks_allowed_<hex>` store; `projectionInput.ts`/`projectWorkingCopyVfs.ts` stop reading `guardSpecification.behaviour`. Update `mark-guards.test.ts` and the `decisionPoint.guards.corpus.test.ts` simulator cases: ticked/unticked marks typed at buffer start AND after Enter (the `"\n"` idiom is unverified — if Keyman does not match it, report back per ruling §2; no silent fallback).
- [ ] T072 [US2] (Added 2026-10-30, #2374 ruling §3–§5; spec 104 FR-013 tail.) Per-mark touch-key minting and retired-question removal: `keyIdMinting.ts` (`decideKeyIdForm`), `proposeTouchKeyId.ts`, `touchProduction.ts`, `touchKeyIdentity.ts` read the per-mark box instead of the keyboard-wide `GuardSpecification` — unticked → guarded `T_` (old swallow), ticked → plain `U_` (old emit); remove `GuardQuestionPrompt`/`handleGuardAnswer`/`onGuardAnswer`/`guardAnswerNeeded` from `TouchGallery.tsx`/`AssignPanel.tsx` (late-added marks take the guarded default: unticked → `T_`, blocked); delete `GuardStation.tsx`, `guardSpecification.ts` and their tests; migrate only confirmed `GuardSpecification` records (`swallow` = no-op, `emit` = tick every mark's box with `origin: "migrated-from-guard"`; seeded-unconfirmed dropped); retire `detectImportedGuardBehaviour`'s keyboard-wide seed into per-mark import seeding (`origin: "imported"`); delete the `decisionRecord.ts` type once unreferenced; regenerate the 4 decision-point fixtures + records and re-baseline the golden walk; `messages.json` en/fr: remove the 10 `marks.guard.*` ids, add the column ids; e2e `surveyFlow.ts`: remove `answerGuardStationIfPresent`, fix the `driveMarksSeries` count comment and the four callers.

---

## Phase 5: User Story 3 — Output follows the output-form decision (P1)

**Goal**: one form everywhere (FR-020 to FR-023). **Independent test**: the US3 `it.fails` (G4) pass across the four profiles x {deadkey, mark key}. **Branch**: `km/106-output-form`.

- [x] T025 [P] [US3] Write engine tests in `packages/engine/src/pattern-apply/applyAssignments.outputForm.test.ts`. Each mechanism (S-01, S-02, S-03, S-08) under both forms emits only that form. Under base-plus-mark with a multi-codepoint item, S-08 and S-01 emit per-key rules rather than a store pair. **As built**: 21 tests, including the advisor's mixed-group vector and a pin of the content fragments against the engine's inline mirrors.
- [x] T026 [P] [US3] Write simulator tests for the R5 vectors in `packages/studio/src/test/decisionPoint.outputForm.corpus.test.ts`: **As built**: the escapes type the trigger's own `;` (a studio deadkey's accentChar), not U+030C; the U+030C escape vectors live in the pattern YAML. The fall-through key is `K_K` (Bafut reassigns `K_X` to ŋ).
  - `[K_QUOTE,K_A]` gives a U+030C;
  - shifted `A` gives A U+030C;
  - `e` gives e U+030C;
  - the double-tap and space escapes give U+030C;
  - `K_X` falls through to plain `x`;
  - postfix compose `a` + `K_5` gives `à` under ready-made, and the bare mark appears only when kept.
- [x] T027 [US3] Add `outputFormString(s, form)` next to `outputStringForStack` in `packages/engine/src/marks/output-form-policy.ts`, decomposing fully under base-plus-mark. Export it from `engine/src/index.ts`.
- [x] T028 [US3] Add options `{ outputForm? }` to `applyAssignments` in `packages/engine/src/pattern-apply/applyAssignments.ts` (:480). **As built (advisor-approved amendment)**: the seam is a new module `pattern-apply/outputFormSeam.ts`, applied after the merges. When an output form is set, the legacy deadkey/AltGr slot-merges are skipped and the seam plans each trigger+name group (both deadkey ids) from a normalised pair list: single-code-point pairs stay in the parallel pair; multi-code-point pairs get one self-indexing store per mark sequence (`dk_N_<HEX>_bases`, or `deadkey_single_tap_nfd` when that is the whole group); a precomposed base key gets its own `dk(N) + U+.. > U+..` rule. AltGr multi-code-point outputs become per-key rules. No form = byte-identical output. `OUTPUT_FORM_SEAM_PATTERN_IDS` must be preloaded by every resolver.
  - Rewrite the output-bearing slots on the merged refs before `substituteSlots` (:675).
  - Switch the S-08 and S-01 multi-codepoint items to per-key rules.
  - Generalise every `DEADKEY_PATTERN` check to the set `{deadkey_single_tap, deadkey_single_tap_nfd}`: the merge (:540-651) and the `applyDeadkeyEscapes` gate (:709). Do the same in studio: `editors/assignLoop/patternIds.ts:14` (`PATTERN_DEADKEY`), `lib/extractMechanismBaseKey.ts:59` and `lib/occupiedBaseKeys.ts:67-78`.
  - Thread the option through `applyAssignmentsToVfs.ts:31` (its only caller of `applyAssignments` is :62). Then grep for every `applyAssignmentsToVfs` caller and thread it there too.
- [x] T029 [P] [US3] Content: add `content/patterns/desktop-input/deadkey-single-tap-nfd.yaml` with exactly the R5 shape: a self-indexing store, the mark literal after `index(..,2)`, no `accentedForms`, the escapes unchanged, `strategyId: S-02`, the R5 test vectors, and `sourceKeyboards: [cabecar, winchus]`. Regenerate the content i18n catalogs; never hand-edit them. Needs content-team review.
- [x] T030 [P] [US3] Content: add `content/patterns/desktop-input/postfix-compose.yaml` with the R5 (a) shape, the `bare` escape slot, a test vector, and `sourceKeyboards: [dega]`. Regenerate the catalogs. **As built**: `strategyId: S-03` (spec 007 rule 3a: postfix order is S-03 + S-04). The engine emits it from an S-01 lone-mark key + the attachment matrix under ready-made; the bare line is kept by default (no escape answer exists yet).
- [x] T031 [US3] Add a recognizer test so an imported keyboard containing the NFD deadkey shape is recognised as `deadkey_single_tap_nfd` (`packages/engine/src/recognizer`). **As built**: `s02-families.ts` accepts a self-indexing fan-out with trailing marks and lifts it as `deadkey_single_tap_nfd` with `markChars`; winchus now yields one NFD lift. cabecar's shape is not caught (different context form, not investigated).
- [x] T032 [US3] Pass `outputForm` into step 2 in `packages/studio/src/lib/projectWorkingCopyVfs.ts` (~:797), via `projectionInputFromState`. Also add the projection-time uniformity assertion (plan P2.4, the retired FR-022 lint). After step 2, scan the generated rules and stores for characters in the wrong form and push a `[project-working-copy]` warning; it is not a user-facing lint. **As built**: `lib/markAttachments.ts` derives the allowed bases per mark from the worklist; `lib/outputFormUniformity.ts` reports only runs new after step 2.
- [x] T033 [US3] In `packages/studio/src/editors/assignLoop/MechanismGallery.tsx`: **As built (amended)**: stored assignments stay form-independent, so `buildDeadkeyAssignment` keeps `deadkey_single_tap` and the engine picks the NFD shape at emit time (changing the output form later rewrites nothing). Postfix compose is derived in the engine, so there is no studio postfix builder. The S-01 write sites all route through the multi-code-point builders (`toUPlusSequence`). Deadkey reads use `isDeadkeyPatternId`.
  - `buildDeadkeyAssignment` (:595) picks `deadkey_single_tap_nfd` under base-plus-mark and drops `accentedForms`;
  - the S-01 builders (:2829-2845, :3323, :3408, :3709, :3736) write every code point of `currentChar`, not just the first;
  - the postfix mark-key flow emits a `postfix_compose` assignment, with stores derived from the attachment matrix rows (allowed pairs only).
- [x] T034 [US3] Case counterparts: assert in `casePairCompanion.ts` tests that the companion output passes through the same form (FR-023).
- [x] T035 [US3] Gate. Record the R5 ruling text in the PR body. Commit `feat(engine): emitted output follows the output-form decision`, push, and open a PR.

---

## Phase 6: User Story 4 — Carve removes unreachable rules (P2)

**Goal**: zero unreachable hints, approvable suggested discards, and needed punctuation never silently lost (FR-040 to FR-043). **Independent test**: G1 passes on every fixture at `carve` and later. **Branch**: `km/106-carve-claimed`.

- [x] T036 [P] [US4] Write tests in `packages/studio/src/lib/claimedInputs.test.ts`:
  - a plain override drops the base rule;
  - a Shift-only difference is kept;
  - a rule with preceding context, deadkey or `if()` survives;
  - removing the assignment restores the rule;
  - the S-02 trigger and the RALT escape are claimed;
  - the postfix mark key is claimed.
- [x] T037 [US4] Extend `mechanismSlotEntries` in `packages/studio/src/survey/slotOccupancy.ts` (:202) with S-02 (the trigger, plus `RALT trigger` when `escapes` has `altgr`) and `postfix_compose` (the mark key). Also fix S-01 parsing (:215), which reads only the first `U+XXXX` of a rule's RHS: an NFD S-01 output must yield the full NFC-normalised char. Audit callers (`buildSlotOccupancy`, `maybeRaiseDisplacement`) for behaviour changes and keep their tests green.
- [x] T038 [US4] Implement `claimedInputRuleIds(startIr, assignments)` in `packages/studio/src/lib/claimedInputs.ts` and union the result into `effectiveItemIds` in step 1 of `projectWorkingCopyVfs.ts` (~:446-462), per projection only.
- [x] T039 [US4] Suggested discards as an approvable default, in `packages/studio/src/editors/carve/CarveGalleryV2.tsx` (:771, :846-863, :1342-1361) and `survey/carve/carveValue.ts`:
  - on the first visit, when the value's `suggestionFingerprint` does not match, apply `toggleRecommendedRows(primaryRows, true)` with provenance `derived`;
  - render those rows as "discarded, suggested — click to keep";
  - `editors/adapters/carveAdapter.tsx` (:28-40) records `carved-layout` with provenance `default` while only derived items exist, and `asked` once the author has toggled anything;
  - add en/fr i18n entries;
  - add a component test.
- [x] T040 [US4] Needed punctuation.
  1. Write a fixture test: Bafut kbdus with `'` → `’` must raise the demotion proposal.
  2. Diagnose which gate in `maybeRaiseDisplacement` (`MechanismGallery.tsx:2224-2304`) skips it, and fix it.
  3. Record a decline in `carved-layout.displacedDeclined` (`useDisplacementProposal.ts` dismiss path).
- [x] T041 [US4] Gate: G1 = 0 on all fixtures. Commit `fix(studio): carve drops starting rules that assignments claimed`, push, and open a PR.

---

## Phase 7: User Story 5 — Caps handling decision (P2)

**Goal**: FR-050 to FR-055. **Independent test**: G5 passes on every fixture at `caps`; the NCAPS WASM check is green on the four bases; the sil_cameroon_qwerty adapt offer compiles with zero warnings. **Branch**: `km/106-caps-handling`.

- [ ] T042 [P] [US5] Write tests in `packages/studio/src/survey/questions/gallery/capsHandling.test.ts`:
  - the casing gate (a caseless alphabet gives mode none, not asked);
  - the copy default with QWERTY and AZERTY floors;
  - the union with a non-letter key carrying ŋ/Ŋ on base/shift and on RAlt/Shift+RAlt.
  - The four decision-point fixtures cannot show the US5 gap (all are copy-track bases that already carry `&CasedKeys`). Add a synthetic fixture with ŋ/Ŋ on a non-letter key and a caseless base, and extend G5 to read store-routed pairs (`any(altgrKeys) > index(...)`), so G5 fails before T048 and passes after it.
- [ ] T043 [P] [US5] Write adapt-track tests:
  - an explicit CAPS/NCAPS start IR is offered only when the simulator outputs under {none, SHIFT, CAPS, SHIFT+CAPS} match for every key;
  - otherwise the offer is withheld with a reason;
  - `&CasedKeys` already present is extracted.
- [ ] T044 [US5] Add the `caps-handling` decision id to `packages/studio/src/decisions/decisionTypes.ts`. Add the `CapsHandlingValue` type and its zod mirror (if decision values are schema-validated) next to the module.
- [ ] T045 [US5] Write the module `packages/studio/src/survey/questions/gallery/capsHandling.ts`:
  - `screen: "layout"`, `requires: ["character-inventory","windows-layout"]`, `apply: () => ({})`;
  - `lookupDefault` for copy and `extract` for adapt;
  - register it in `survey/questions/registry.ts` (Art. IX).
- [ ] T046 [US5] Write the renderer `packages/studio/src/survey/caps/CapsHandlingStep.tsx`:
  - provenance shown;
  - the key set listed;
  - an adapt offer with before/after evidence;
  - auto-complete as `not-asked` for caseless scripts, following the `ConvenienceCharsStep` :250-267 precedent;
  - en/fr i18n;
  - accessibility per spec 056.
- [ ] T047 [US5] Remove the `ensureCasedKeysStore` call from `scaffoldIR` in `packages/engine/src/scaffolder/scaffold-ir.ts` (:274) and export the family key constants. Update the scaffolder tests that expected the silent store.
- [ ] T048 [US5] Add projection step 2.8 to `packages/studio/src/lib/projectWorkingCopyVfs.ts`, after 2.7 and before 3. It writes or removes `store(&CasedKeys)` from the decision plus the assigned keys that carry a pair. When the adapt simplification is accepted, it also strips the CAPS/NCAPS rules. Wire it through `projectionInputFromState`.
- [ ] T049 [US5] Companion pre-accept: in `packages/studio/src/editors/assignLoop/casePairCompanion.ts` and `MechanismGallery.tsx` (:5219, :3630), Apply includes the companion when the key is in the derived set and the counterpart is in the alphabet. The banner stays visible and dismissible.
- [ ] T050 [P] [US5] Add a touch parity test in `packages/engine/src/scaffolder/cleanTouchLayout.test.ts`: every cased letter on `default` is on `shift` and `caps`, and `caps` keys carry no `nextlayer`.
- [ ] T051 [US5] Gate. Commit `feat(studio): caps handling as a decision with &CasedKeys`, push, and open a PR.

---

## Phase 8: User Story 6 — NFC/NFD tolerant contexts by default (P3)

**Goal**: FR-060 and FR-061. **Independent test**: G2 = 0 on every fixture at `tolerance`. **Branch**: `km/106-tolerance-default`.

- [ ] T052 [P] [US6] Write seeded-context simulator tests in `packages/studio/src/test/decisionPoint.tolerance.corpus.test.ts`: NFC `ǎ` and NFD `a`+U+030C behave identically for the guard, peel and whole-stack.
- [ ] T053 [US6] Add `origin?: "default" | "asked"` to `MarksContextToleranceDecision` in `packages/contracts/src/surveyPhaseResult.ts` (:202), with the zod mirror in the same commit.
- [ ] T054 [US6] In `packages/studio/src/survey/marks/ContextToleranceStation.tsx`, when there are gap findings and no decision, show the normalization as pre-accepted (default, with a "change" link), and record `decisionFromProposal` with `origin: "default"` on the station's **Continue**, not on render. This keeps Art. X: nothing applies before the author continues. Add en/fr i18n. `recordToDecisionSet` and the fixtures record the same default.
- [ ] T055 [US6] Gate. Commit `feat(studio): context normalization accepted by default`, push, and open a PR.

---

## Phase 9: User Story 7 — Clean emitted rules (P3)

**Goal**: FR-070 to FR-073. **Independent test**: a snapshot of the Bafut fixture `.kmn` shows the mechanism order and `dk(caron)`, and G7 still passes. **Branch**: `km/106-clean-rules`.

- [ ] T056 [P] [US7] Write snapshot and ordering tests in `packages/engine/src/pattern-apply/applyAssignments.layout.test.ts`. Extend `packages/studio/src/lib/serializeWorkingCopy.determinism.test.ts`.
- [ ] T057 [US7] In `packages/engine/src/pattern-apply/applyAssignments.ts`, emit one comment header per pattern id per group (`isDuplicateLine` :164-169). Replace the prepend in `mergeGroupBlock` (:346-399) with the stable mechanism order: AltGr, then deadkey clusters, then swaps, then sequences, then starting rules.
- [ ] T058 [P] [US7] Content: trim the S-03 header in `content/patterns/desktop-input/multi-char-sequence.yaml` to one line, then regenerate the catalogs.
- [ ] T059 [US7] Named deadkeys: `resolveS02DeadkeyIdentity` (`MechanismGallery.tsx:527`) uses the sanitised purpose name from `deadkeyPurposeOf` (`deadkeyPurpose.ts`). It falls back to `hex4` on a collision with a starting-keyboard deadkey. Existing sessions keep their stored names. Add tests.
- [ ] T060 [US7] In `packages/studio/src/components/rules/DemoPane.tsx` (:435-441), render `plainDiagnosticMessage` (`lib/plainDiagnosticMessage.ts:392`) and hide hints. Add a component test.
- [ ] T061 [US7] Gate. Commit `maint(engine): grouped, named, single-comment generated rules`, push, and open a PR.

---

## Phase 10: User Story 8 — Pre-selected proposals and the 32-case walk (P3)

**Goal**: FR-080, FR-081 and SC-002. **Independent test**: the walk passes 32/32 on G1-G7. **Branch**: `km/106-preselect-walk` (studio). The harness changes go on `km/2302-walk-zips` in `../ks-2302-main`.

- [ ] T062 [US8] In `packages/studio/src/editors/assignLoop/MechanismGallery.tsx` (:2532-2557), pre-select the top chip of `orderedVisibleSuggestions` when the card opens, so Accept applies it. The S-02 purpose trigger and spare-key order are already proposed. Add a component test.
- [ ] T063 [US8] Harness (`../ks-2302-main/tools/testing-profiles-2302`):
  - drop the `zzq` placeholder path in `scripts/phase2.template.js` and accept the pre-selected proposals, recording them;
  - port `checkConsistencyGates` (or a parity-tested copy) into `harness/run-zip.mjs`;
  - add the G6 touch diff;
  - restore `.playwright/cli.config.json` to its committed form, or make the Chromium path configurable through an environment variable.
- [ ] T064 [US8] Run the 32 cases (quickstart step 5) against a dev server serving the merged stack. When a case fails G6, file a `bug(studio)` issue with the zip attached (ruling 5). Commit the zips and `INDEX.md` on `km/2302-walk-zips`.
- [ ] T065 [US8] Gate: the T013 corpus test has zero `it.fails` left. Commit `feat(studio): pre-selected placement proposals`, push, and open a PR.

---

## Phase 11: Polish

- [ ] T066 [P] Run `/speckit-analyze` (km-doc / km-synthesis review) on spec, plan and tasks before the first story PR, and fix the drift it finds.
- [ ] T067 [P] Update `docs/architecture.md` with the projection step list (2.6, 2.8, claimed-inputs carve, shared projection input) and record the R5 ruling cross-link.
- [x] T068 Move the two root notes into this folder as [source-plan.md](source-plan.md) and [handoff-s02.md](handoff-s02.md) (done 2026-10-29, on the user's instruction).
- [ ] T069 After all story PRs merge, run `km-retire` for spec 106 (AS-BUILT + archive).

---

## Dependencies

```
Setup (T001-T003) -> Foundational (T004-T007; T073 with US1; T070-T072 blocked on #2361) -> US1 (T008-T015)
US1 -> US2 -> US3 -> US4 -> US6 -> US8
              US3 -> US5 (independent of US4/US6)
              US3 + US4 -> US7
```

- Within a story, tests marked [P] are written first and fail, or are `it.fails`.
- Engine changes come before studio wiring, and wiring comes before UI.

## Parallel opportunities

- T002 and T003. T016 and T017.
- T025, T026, T029 and T030: the content YAMLs are independent files and can go to the content-team reviewer in parallel.
- T036. T042, T043 and T050. T052. T056 and T058.
- US5 can run in parallel with US4 and US6 once US3 lands. Use a separate worktree per story branch.

## Implementation strategy

- **MVP**: Phases 1-3. These cover the shared projection input and the decision-point fixtures, and report all seven gaps as expected failures.
- **Then**: one story per PR in the dependency order above. Each PR flips its own `it.fails`. A story is done only when its fixtures pass and it is reachable in the live walk (Art. XI).
- **Subagents** (km-lead dispatch per phase):
  - km-programmer implements;
  - km-testing writes the fixture and simulator tests;
  - km-keyman reviews every emitted-rule change (US2, US3, US5, US7);
  - km-verification runs the gates;
  - km-qc reviews before each PR;
  - km-archivist commits, pushes and opens PRs.

## Review log

The 2026-10-29 advisor review (Fable) found 11 issues: 1 blocker, 6 major and 4 minor. All are folded in above:

- The decision-point order and allow-lists were fixed (T009, T013).
- The slices T011 installs are now listed.
- The loader was widened (T008, T011).
- T014 has a lifecycle.
- The tolerance default is recorded on Continue (T054).
- Pattern-id couplings are listed (T028, T037).
- The write map and its tests are covered (T022).
- Paths were corrected (T028, T039).
- The output-form assertion was restored (T032).
- The spec's assumption line and fixture count were fixed.

2026-10-29: the user pointed to keymanapp/keyboards#4181. `nul`/`beep` are illegal inside stores under the 19.0 compiler. As a result, FR-014, gate G8, research R11 and tasks T070-T073 were added (foundational: they run before the fixtures, because two walk bases carry illegal stores). The R3 "no beep" wording was corrected: beep exists in IR, codec and simulator; only the marks decision lacks a beep option.

2026-10-29 (later): the method for `nul`/`beep` inside starting stores is deferred to the outcome of keymanapp/keyboards#4181, tracked in #2361. T070-T072 are blocked. Generated stores and rules (no `nul`/`beep` in stores; `nul` over `beep` in rules) remain decided.

2026-10-30 (US4): rulings and deviations recorded during implementation.
- **Punctuation is never core** (owner ruling, T040). The walk's lost `'` was a both-core standoff: the punctuation step had put `'` in the inventory, and "Keep both" only dismissed. `orthographyTier` now ranks every digit, punctuation mark and symbol as convenience, so an overwritten `'` gets the "move to AltGr" proposal. A script that writes a letter with an apostrophe records it as U+02BC, which stays core.
- **Declines live in `physical-layout`, not `carved-layout`** (T040 step 3; R6 preferred carve). The decline happens in the gallery step, and writing an upstream decision from a later step would rewrite it.
- **Claimed inputs are group(main) only and gated on mergeable mechanisms** (T038, advisor review). Assignments merge only into `main`; a mechanism step 2 would skip claims nothing.
- **Duplicate inputs are a studio bug, not a carve job** (owner ruling). Two rules with the same input in one group hide all but the first. US4 drops only starting rules an assignment replaces; session-vs-session and starting-vs-starting duplicates must be prevented where they are created, not deduplicated in the projection. Known generators: two S-02 deadkeys on one trigger (fixed at record time by #2358; older drafts still carry it), "Keep both" on a both-core displacement, and hand-chosen triggers colliding with S-01/S-08. A guard at the assignment-record seam is proposed as a follow-up story.
- **kbdfr re-recorded, not left as a gap** (owner ruling, T041). Its round-3 record predated the S-02 fix (three deadkeys on K_COLON). The Ewondo kbdfr case was re-walked on this branch (502fb061) and its record copied unedited; K_COLON now carries one deadkey and G1 passes, so the KNOWN_GAPS row is gone. Only the camqwerty and camazerty records still predate the S-02 fix.
- **Group names match case-insensitively** (found by the T041 e2e run). bj_cree_woods declares `group(Main)`; once "." and "_" were placed (punctuation ruling), `applyAssignments` appended a second `group(main)` and kmcmplib rejected the keyboard. Fixed in its own commit, 502fb061 (`sameGroupName`, plus the same check in rule-pack install and the normalization step). The INDEXSTORELONG hint seen at the same time is in the starting keyboard and was not the cause.
- **US8 T063/T064 depend on spec 107** (headless scripted author, branch `107-headless-scripted-author`). The 32 harness cases move to a headless vitest run; the walk zips stay on `km/2302-walk-zips`, never on main. T065 stays here.
- **Suggested discards are marked, not removed, until Continue** (owner ruling, T039, Art. X). The default is discard, but carve only marks the suggested characters; clicking one keeps it (and clicking again re-marks it). Continue on the carve screen is the confirmation that applies the marked ones as `derived` removals; Skip keeps them all; Back changes nothing. An earlier build that applied the default on arrival was rejected.
