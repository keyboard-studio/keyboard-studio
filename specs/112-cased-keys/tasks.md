# Tasks: Caps Lock and `&CasedKeys`

**Input**: Design documents from `specs/112-cased-keys/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: included. Every story names an independent test and fixtures, and the repo convention
(specs 106, 111) is test-first per story.

**Organization**: by user story. US1 is partly shipped (commit `2ea3d0d3`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4, from [spec.md](spec.md)

Gates for every phase commit: `pnpm lint` (depcruise `lint-not-to-engine` included), the touched
packages' `typecheck` and tests (never bare `vitest` at the root), and `pnpm build` before judging
studio typecheck. One commit per phase, pushed to `km/casedkeys-criterion`
(`git push -u origin km/casedkeys-criterion`).

---

## Phase 1: Setup (fixtures)

**Purpose**: the fixtures every later phase tests against (research R7).

- [x] T001 Add upstream keymanapp `basic_kbdus.kmn` and `basic_kbdus.keyman-touch-layout` (from `gh api repos/keymanapp/keyboards/contents/release/basic/basic_kbdus/source/...` on `master`) to `packages/engine/src/caps/__fixtures__/upstream_basic_kbdus/`, with a `PROVENANCE.md` recording the upstream commit SHA and that it differs from the fork copy (NCAPS/CAPS rules on K_A–K_Z, no `&CasedKeys`, `&VERSION 10.0`, no touch caps layer). Keep the file bytes exactly as fetched (CRLF if upstream has it); add a `.gitattributes` entry if needed so git does not normalise them.
- [x] T002 [P] Add synthetic `.kmn` fixtures in `packages/engine/src/caps/__fixtures__/` (one file each, header comment saying what each proves): `eng_ralt.kmn` (`ŋ`/`Ŋ` on `K_LBRKT` base/Shift and on `RALT K_N` / `SHIFT RALT K_N`, plus A–Z); `conflict.kmn` (`ŋ`/`Ŋ` on `K_E` base/Shift, `€`/`£` on RAlt/Shift+RAlt); `turkish.kmn` (`i`/`İ` and `ı`/`I`); `caseless.kmn` (digits and punctuation only); `numrow_caps.kmn` (CAPS rules on `K_1`..`K_0` that type digits under Caps and symbols otherwise); `no_caps.kmn` (letters as plain `[K_A]`/`[SHIFT K_A]` rules, no CAPS and no `&CasedKeys`); `mixed.kmn` (`&CasedKeys [K_A]..[K_Z]` plus leftover `[CAPS K_Q]` rules).
- [x] T003 [P] Add touch fixtures in `packages/engine/src/caps/__fixtures__/touch/`: `caps_missing_letters.keyman-touch-layout` (caps layer present, missing two letters, one caps key with `nextlayer: "default"`) and `caps_no_doubletap.keyman-touch-layout` (caps layer complete, default `K_SHIFT` without the `T_CAPS` multitap).

---

## Phase 2: Foundational (blocking)

**Purpose**: the shared derivation and the key-scoped caps transform (research R2, R6). Blocks US1's extension, US2, US3 and US4.

- [x] T004 Move `caseCounterpart` and its `localeCase` helper from `packages/engine/src/character-discovery/casePair.ts` into `packages/contracts/src/ir/casedKeys.ts`, export them from the contracts barrel, and make `casePair.ts` re-export them so every engine import path keeps working. Move the matching cases from `casePair.test.ts` to `packages/contracts/src/ir/casedKeys.test.ts` unchanged (behaviour byte-for-byte the same). Confirm the depcruise rule forbidding `packages/contracts/src` imports of other packages still passes.
- [x] T005 Write failing tests in `packages/contracts/src/ir/casedKeys.test.ts` for `keyPlaneOutputs`, `declaredCasedKeys`, `casedKeySet` and `casedKeysStoreText` per [contracts/caps-api.md](contracts/caps-api.md): parse the T002 fixtures with the engine codec's test-support loader, or build IR by hand if contracts tests can't import the codec. Cases: `eng_ralt` → keys = floor + `K_LBRKT` + `K_N`, `extra` = those two; `conflict` → `K_E` excluded **even though it is in the floor**, reported in `conflicts`; `turkish` with `bcp47: "tr"` pairs `i`/`İ`; `caseless` → empty; `any(store) > index(store, n)` RAlt form is read; deadkey-context rules are skipped; CAPS/NCAPS siblings fold to the NCAPS output; `casedKeysStoreText` writes `[K_A]..[K_Z]` when the floor is complete, then extra keys in key-code order.
- [x] T006 Implement `Plane`, `keyPlaneOutputs`, `declaredCasedKeys` (moved logic from `packages/engine/src/ldml-export/lower/capsExpand.ts` `casedKeys()`), `casedKeySet` and `casedKeysStoreText` in `packages/contracts/src/ir/casedKeys.ts`, and export them from the barrel, so T005 passes. Apply research R1's two rules exactly (data-model "Cased key set").
- [x] T007 [P] Make `casedKeys()` in `packages/engine/src/ldml-export/lower/capsExpand.ts` delegate to `declaredCasedKeys` (one store parser); the ldml-export tests must stay green unchanged.
- [x] T008 [P] Export the family floors from `packages/engine/src/scaffolder/scaffold-ir.ts` as key arrays (`CASED_KEYS_FLOOR_QWERTY`, `CASED_KEYS_FLOOR_AZERTY`, expanding the current strings at :249-251) plus a `casedKeysFloor(group: RoutingGroup)` helper returning `[]` for `non-roman`.
- [x] T009 Write failing tests, then implement `replaceCapsRules(ir, keys)` in `packages/engine/src/caps/replaceCapsRules.ts` (research R6): on keys in `keys`, delete rules whose vkey context tests `CAPS`, and remove the `NCAPS` token from rules that test it; other keys untouched; readonly groups skipped. Test in `replaceCapsRules.test.ts` on `upstream_basic_kbdus` (each letter's four rules become `[K_x]` and `[SHIFT K_x]`, digits and punctuation rules byte-identical after emit) and on `numrow_caps` with only A–Z in `keys` (number-row CAPS rules kept).
- [x] T010 [P] Write failing tests, then implement `writeCasedKeysStore(ir, keys)` and `removeCasedKeysStore(ir)` in `packages/engine/src/caps/casedKeysStore.ts`: replace an existing store in place, or insert one where `ensureCasedKeysStore` inserts it today; raise `&VERSION` to `14.0` when lower, add it when absent; return `versionRaised`. Tests in `casedKeysStore.test.ts`.
- [x] T011 Add `packages/engine/src/caps/index.ts` exporting T009/T010 (and, later, T034, T036 and T044), and expose it from the engine's public entry `packages/engine/src/index.ts`.
- [x] T012 Gate and commit `feat(engine): shared cased-key derivation and key-scoped caps rewrite` (spec 112 T001–T011), push.

**Checkpoint**: the derivation and the transforms exist; nothing user-visible has changed.

---

## Phase 3: User Story 1 — The criterion flags cased keyboards without `&CasedKeys` (P1) MVP

**Goal**: 7.28 merges green, and also reports a declared store that misses keys (FR-001, FR-002).

**Independent Test**: `pnpm --filter @keymanapp/keyboard-lint test -- check-cased-keys`; corpus sweep classifies all 921 keyboards with zero parse errors (SC-001).

- [x] T013 [US1] Rebase `km/casedkeys-criterion` onto `origin/main` once main's engine build is green again (the missing `osk` step module noted in the spec assumptions); if main is still red, record that in the phase commit and continue. Run `pnpm build`, then the studio tests commit `2ea3d0d3` touched: `packages/studio/src/criteria/CriteriaPage.test.tsx`, `criteriaCatalog.test.ts`, `resolveCriteria.test.ts`, `packages/studio/src/hooks/useCompareCriteria.test.ts`, `packages/studio/src/review/battery.drift.test.ts`. Fix counts only where main added criteria since.
- [x] T014 [US1] Add failing cases to `packages/keyboard-lint/src/checks/criteria/check-cased-keys.test.ts`: declared `[K_A]..[K_Z]` on `eng_ralt` fails naming `[K_LBRKT]` (ŋ/Ŋ) and `[K_N]` RAlt; `conflict` lists `K_E` as information and doesn't demand it; `turkish` with a `tr` package language is judged with Turkish pairs; `mixed` passes 7.28.
- [x] T015 [US1] Extend `checkCasedKeysDeclared` in `packages/keyboard-lint/src/checks/criteria/check-cased-keys.ts` per [contracts/criteria.md](contracts/criteria.md): when declared, compare `declaredCasedKeys` against `casedKeySet(ir, { bcp47, floor: [] })` and fail with a distinct message listing the missing keys and their pairs, conflicts appended as information. Take an optional `bcp47` parameter; in `packages/keyboard-lint/src/criteriaChecks.ts` pass the first language of the parsed `.kps` when there is one.
- [x] T016 [P] [US1] Add an opt-in corpus test `packages/keyboard-lint/src/checks/criteria/check-cased-keys.corpus.test.ts` (skips with a reason when `../keyboards` is absent, following `packages/studio/src/test/decisionPoint.corpus.test.ts`): every `.kmn` under `../keyboards/release` and `experimental` parses and lands in exactly one of fail-missing / fail-incomplete / pass-declared / not-applicable-caseless / not-applicable-mnemonic. Print the counts.
- [x] T017 [US1] Propose the updated 7.28 description in `packages/contracts/data/criteria.json` (add "covering every key with a case pair"); the wording is content's, so mark it for content review in the commit body. Re-run `node scripts/generate-review-battery.mjs` if the battery changes.
- [x] T018 [US1] Gate and commit `feat(criteria): 7.28 reports incomplete &CasedKeys` (spec 112 T013–T017), with the re-baselined corpus counts from T016 in the message (research R4), push.

**Checkpoint**: Story 1 is complete and independently shippable.

---

## Phase 4: User Story 2 — Caps handling is a visible choice when copying (P1)

**Goal**: a `caps-handling` decision on the layout screen; projection step 2.8 derives the store, the rule handling and (in US4) the touch caps layer; the scaffolder no longer touches caps (FR-004–FR-007, research R9, R10).

**Independent Test**: `pnpm --filter @keyboard-studio/studio test -- capsHandling projectWorkingCopyVfs decisionPoint`: QWERTY/AZERTY stores, `ŋ`/`Ŋ` non-letter and RAlt keys covered (SC-002), caseless not asked, G5 green on the four bases and chechen_latin.

### Tests for User Story 2

- [x] T019 [P] [US2] Write failing tests in `packages/studio/src/survey/questions/gallery/capsHandling.test.ts`: cased alphabet seeds `{ mode: "cased-keys" }` with provenance `"default"`; caseless alphabet makes the step `not-asked` with no decision; `explicit-rules` is offered only when the copied keyboard has CAPS/NCAPS rules; the rendered summary lists the extra keys and any conflicts.
- [x] T020 [P] [US2] Write failing projection tests in `packages/studio/src/lib/projectWorkingCopyVfs.caps.test.ts` for the R10 table: `cased-keys` writes the derived store (floor + assigned `ŋ` keys, a key assigned later included) and rewrites the copied keyboard's caps rules with `replaceCapsRules`; `explicit-rules` keeps the rules and writes no store; `none` writes no store and rewrites every caps rule; `null` (not asked) writes no store. Include the R6 regression: a copied keyboard whose letters are NCAPS/CAPS rules keeps typing its letters in every mode (assert on the projected rules, and on `simulate` output for `a`/`A`).

### Implementation for User Story 2

- [x] T021 [US2] Add `"caps-handling"` to `DecisionId` and a `CapsHandlingValue = { mode: "cased-keys" | "explicit-rules" | "none" }` type in `packages/studio/src/decisions/decisionTypes.ts`; update any exhaustive switches the compiler flags.
- [x] T022 [US2] Implement `packages/studio/src/survey/questions/gallery/capsHandling.ts` in the `windowsLayout.ts` shape: `provides: ["caps-handling"]`, `screen: "layout"`, `requires: ["character-inventory", "windows-layout"]`, `apply: () => ({})`; seed through `lookupDefault` with provenance `"default"`; the casing gate is `caseCounterpart` over the confirmed alphabet; the not-asked path follows `packages/studio/src/survey/convenience/ConvenienceCharsStep.tsx` (`setStatus(..., { kind: "not-asked" })`). Show the derived set's extra keys ("also covers") and R1 conflicts. Follow [docs/accessibility.md](../../docs/accessibility.md) for the option group (radio group, programmatic labels).
- [x] T023 [US2] Register the module in `packages/studio/src/survey/questions/registry.ts` (no hand-ordered list; the sort derives its place).
- [x] T024 [US2] Wrap the module's strings with Lingui ids under `survey.caps.*`, run `messages:extract`, and write the French for every new id in `packages/studio/src/locales/fr/messages.json`; `pnpm run i18n-catalog-lint` passes.
- [x] T025 [US2] Add `capsHandling: CapsHandlingValue | null` to the projection input and fill it in `projectionInputFromState`, in `packages/studio/src/lib/projectWorkingCopyVfs.ts` (the shared preview/download input builder, spec 106 FR-005).
- [x] T026 [US2] Implement projection step 2.8 "caps" in `packages/studio/src/lib/projectWorkingCopyVfs.ts`, after step 2.7 (:1058) and before step 3: parse the `.kmn` as 2.7 does, compute `casedKeySet(ir, { bcp47: target language, floor: casedKeysFloor(group) })`, apply the R10 table (`writeCasedKeysStore` / `removeCasedKeysStore` + `replaceCapsRules`), emit back. Wrap it in the same try/warn pattern as 2.7, so a failure never drops the step's input. Update the header comment that lists the steps.
- [x] T027 [US2] Remove caps handling from `scaffoldIR` in `packages/engine/src/scaffolder/scaffold-ir.ts` (:290-292); delete `stripCapsRules`, `removeCapsContextElements` and `ensureCasedKeysStore`; replace their cases in `scaffold-ir.test.ts` with an assertion that `scaffoldIR` leaves CAPS rules and `&CasedKeys` exactly as the copied keyboard had them. Grep for remaining callers (none expected beyond tests).
- [x] T028 [US2] In `packages/studio/src/editors/assignLoop/casePairCompanion.ts` (`useCasePairCompanion`, :271), render the companion pre-accepted when the target key is in the derived cased set (decision `cased-keys`) and the counterpart is in the alphabet: Apply includes the companion unless the author dismisses it; the banner stays visible (Art. X). Add a case to its tests.
- [x] T029 [US2] Rewrite gate G5 in `packages/studio/src/test/consistencyGates.ts` (:235-273) on `casedKeySet` (R1 conflicts excluded, store-routed RAlt pairs read through `keyPlaneOutputs`), and remove the chechen_latin G5 row (owner `US5`) from `packages/studio/src/test/decisionPointKnownGaps.fixture.ts`, dropping `"US5"` from `Owner` if no row is left.
- [x] T030 [US2] Add decision-point coverage in `packages/studio/src/test/`: a synthetic copy fixture with `ŋ`/`Ŋ` assigned to a non-letter key and to RAlt (G5 fails before T026, passes after), a caseless one (no store), and an `explicit-rules` one, registered beside the four bases in `decisionPointBases.ts`; update the four existing `caps.decisions.json` records under `packages/studio/src/lib/__fixtures__/decision-points/*/` with the `caps-handling` decision.
- [x] T031 [US2] Manual walk with the Playwright CLI against `pnpm dev`: copy `basic_kbdus` for a Bafut alphabet, confirm the layout screen shows "cased keys (default)" with its also-covers list, place `ŋ` and see `Ŋ` pre-accepted and dismissible, download and check the `.kmn` store and `&VERSION`. Save screenshots under the spec folder's `walk/` and note the result in the commit. **Result (walk/):** found and fixed a seeding gap (Copy confirms layout before the alphabet exists, so `caps-handling` was never recorded; now seeded from the characters step via `seedCapsHandlingDefault`). Layout screen shows "Cased keys (default)" (03); also-covers list empty for basic_kbdus, since the `[K_LBRKT]` assignment lands only at projection. Companion `Ŋ` pre-accepted with Keep/Undo (02). Output checked via the shared projection (`snapshotOutputFiles`), not a compiled download: `&VERSION 14.0`, `&CasedKeys [K_A] .. [K_Z] [K_LBRKT]` (download.kmn.txt).
- [x] T032 [US2] Gate and commit `feat(studio): caps handling as a decision with &CasedKeys` (spec 112 T019–T031), push.

**Checkpoint**: Copy keyboards get a visible caps choice; the silent scaffold insert and the NCAPS-letter loss are gone.

---

## Phase 5: User Story 3 — Opened keyboards are offered the upgrade, safely (P2)

**Goal**: the engine fixer and the caps comparison that spec 111's upgrade pair offers (FR-008–FR-010, research R5, R6). The suggested-fix UI and registry are spec 111's (T044/T045 there).

**Independent Test**: `pnpm --filter @keyboard-studio/engine test -- upgradeToCasedKeys compareCaps` on `upstream_basic_kbdus`, `no_caps` and `numrow_caps` (SC-003); the opt-in corpus sweep (SC-004).

- [x] T033 [P] [US3] Write failing tests in `packages/engine/src/caps/upgradeToCasedKeys.test.ts`: on `upstream_basic_kbdus`, the emitted `.kmn` differs from the input only in the added store, `&VERSION` 10.0 → 14.0, and each letter's four NCAPS/CAPS rules reduced to two (line diff assertion); the input IR is not mutated; on `no_caps`, only the store and version change; on `numrow_caps`, number-row CAPS rules are kept.
- [x] T034 [US3] Implement `upgradeToCasedKeys(ir, { bcp47 })` in `packages/engine/src/caps/upgradeToCasedKeys.ts`: clone, `casedKeySet` with an empty floor, `replaceCapsRules` on that set, `writeCasedKeysStore`; return `{ ir, set, versionRaised }`.
- [x] T035 [P] [US3] Write failing tests in `packages/engine/src/caps/compareCaps.test.ts`: `upstream_basic_kbdus` before/after → `identical`; `no_caps` before/after → `gains-uppercase`, only `caps`/`shiftCaps` cells changed; `numrow_caps` with the strip forced onto the number row → `differs`, rows naming those keys; a deadkey keyboard covers outputs after each reaching deadkey.
- [x] T036 [US3] Implement `compareCapsBehaviour` in `packages/engine/src/caps/compareCaps.ts` per research R5 and the data-model "Caps comparison": compile both texts with the same compiler path the download uses, simulate {none, Shift, Caps, Shift+Caps} per key and used plane from an empty context (plus after each deadkey that reaches a key in the set), and classify rows. Expose it through a lazy, browser-safe engine subpath like `@keyboard-studio/engine/context-tolerance` (loaded in studio the way `packages/studio/src/lib/contextToleranceEngine.ts` does), and add the subpath to depcruise's browser-safety rule if that rule lists subpaths.
- [x] T037 [US3] Add a test that the `upgradeToCasedKeys` output for `upstream_basic_kbdus` compiles with zero warnings (SC-003), in `upgradeToCasedKeys.test.ts`.
- [x] T038 [P] [US3] Add an opt-in corpus sweep `packages/engine/src/caps/compareCaps.corpus.test.ts` (skips without `../keyboards`): for every corpus keyboard that fails 7.28 and is not mnemonic, run `upgradeToCasedKeys` + `compareCapsBehaviour`; assert that where the verdict isn't `differs`, no row changes except by gaining uppercase (SC-004); print offered / withheld counts.
- [x] T039 [US3] Mixed keyboards (spec Story 3 scenario 5): add a `mixed.kmn` case to `packages/keyboard-lint/src/checks/criteria/check-caps-ncaps.test.ts` showing 7.26 reports the leftover `[CAPS K_Q]` rules. If 7.26 doesn't flag them (consistent per-key CAPS handling), add a finding to 7.28's pass path instead, listing CAPS rules on keys the store already covers, and record which way it went in the commit.
- [x] T040 [US3] Gate and commit `feat(engine): cased-keys upgrade fixer with caps comparison` (spec 112 T033–T039), push.

**Checkpoint**: engine-level Story 3 complete; reachable by authors when spec 111 Phase 8 lands (plan, Art. XI follow-up).

---

## Phase 6: User Story 4 — Caps Lock works on touch (P2)

**Goal**: a complete, reachable touch caps layer on Copy, and a criterion with a fix on Open (FR-003, FR-011, FR-012, research R8).

**Independent Test**: `pnpm --filter @keymanapp/keyboard-lint test -- check-touch-caps-layer` and `pnpm --filter @keyboard-studio/engine test -- syncTouchCapsLayer`; every Copy fixture with a cased alphabet passes the new check (SC-005).

- [x] T041 [P] [US4] Write failing tests in `packages/keyboard-lint/src/checks/criteria/check-touch-caps-layer.test.ts`: upstream basic_kbdus touch layout fails (no caps layer); the fork `basic_kbdwol` layout pattern passes; `caps_missing_letters` lists the two letters and the switching key; `caps_no_doubletap` reports the missing double-tap; no touch layout / caseless / mnemonic pass with a reason.
- [x] T042 [US4] Implement `packages/keyboard-lint/src/checks/criteria/check-touch-caps-layer.ts` (`KM_LINT_TOUCH_CAPS_LAYER`) per [contracts/criteria.md](contracts/criteria.md), reading the parsed touch layout and using `caseCounterpart` from contracts; wire it in `packages/keyboard-lint/src/criteriaChecks.ts` beside the other touch checks and export it from `packages/keyboard-lint/src/index.ts`.
- [x] T043 [US4] Add the proposed `18.16-touch-caps-layer-complete` row to `packages/contracts/data/criteria.json` (content wording, flagged for content review), then register the code in `packages/studio/src/criteria/implementedChecks.ts` and `packages/studio/src/test/gateCoverage.ts`, regenerate `packages/studio/src/review/battery.generated.json` with `node scripts/generate-review-battery.mjs`, and update the count tests 7.28 touched (`CriteriaPage.test.tsx`, `criteriaCatalog.test.ts`, `resolveCriteria.test.ts`, `useCompareCriteria.test.ts`).
- [x] T044 [P] [US4] Write failing tests, then implement `syncTouchCapsLayer(ir, { bcp47 })` and `syncTouchCapsLayerRaw(rawJson, { bcp47 })` in `packages/engine/src/caps/syncTouchCapsLayer.ts` (R8 steps 1–4). Tests in `syncTouchCapsLayer.test.ts`: after sync, every fixture passes the T042 check; in the raw form, keys outside the caps layer and the default `K_SHIFT` are byte-identical to the input; idempotent (second run no change); `rightalt-caps` untouched.
- [x] T045 [US4] Run the touch sync in projection step 2.8 (`packages/studio/src/lib/projectWorkingCopyVfs.ts`) when the decision is `cased-keys`, on the projected touch layout file, after `mutateCleanTouchLayout`'s clone has run; add a case to `projectWorkingCopyVfs.caps.test.ts` where a letter assigned after scaffolding appears uppercase on `caps`.
- [x] T046 [US4] SC-005 check: the decision-point replay doesn't install a touch layout, so assert in the spec 107 headless author (or, if it can't reach touch output, a projection test over the four bases' scaffolded touch layouts) that every Copy keyboard with a cased alphabet passes `check-touch-caps-layer`.
- [x] T047 [US4] Gate and commit `feat(engine): touch caps layer sync and criterion 18.16` (spec 112 T041–T046), push.

**Checkpoint**: Caps Lock behaves the same on physical and touch keyboards for Copy; Open has the finding and the fix function (its UI is spec 111's).

---

## Phase 7: Polish & cross-cutting

- [x] T048 [P] Amend [spec.md](spec.md) in place, editing the existing text: Vocabulary "Case pair on a key" and Key Entities "Cased key set" per research R1 (planes qualify a key; the store lists keys); FR-006 gains R1 rule 2 (conflict keys excluded and reported); Assumptions bullet on reusing `stripCapsRules` replaced with the R6 finding; FR-004 defines the three modes per R10.
- [x] T049 [P] Update spec 111's tasks on branch `111-open-existing-keyboard` (`specs/111-open-existing-keyboard/tasks.md` T044/T045): the upgrade pair calls `upgradeToCasedKeys` and offers only when `compareCapsBehaviour` isn't `differs`; T045 reuses `packages/engine/src/caps/__fixtures__/upstream_basic_kbdus/`. Commit on that branch, or leave a PR comment if the branch is someone else's active work.
- [x] T050 Run `node utilities/spec-trace check` and acknowledge the intended drift from T048.
- [x] T051 Run the full quickstart ([quickstart.md](quickstart.md)) end to end, then `pnpm lint` and `pnpm build`; fix what fails.
- [x] T052 Open the PR against `main` with km-archivist (`feat(criteria): cased keys — criterion 7.28, Copy decision, Open fixer, touch caps`), reconciling linked issues with the `issue-closure` skill; the PR body lists the content-review items (7.28 description, 18.16 row, decision strings) and the spec 111 hand-off.

---

## Dependencies

```text
Setup (T001–T003) ──▶ Foundational (T004–T012) ──┬──▶ US1 ext (T013–T018)
                                                 ├──▶ US2 (T019–T032) ──▶ US4 step 2.8 wiring (T045)
                                                 ├──▶ US3 (T033–T040)          [UI via spec 111 Phase 8]
                                                 └──▶ US4 (T041–T044, T046–T047)
Polish (T048–T052) after the last story
```

- T013 (rebase) can run any time; it only waits on main being green.
- US2, US3 and US4 are independent of each other after Foundational, except T045 (needs step 2.8 from T026).
- T027 (scaffolder caps removal) must land in the same commit as T026: between them, Copy keyboards would get no store.
- T043 and T017 both edit `criteria.json` and the battery; run them in sequence.

## Parallel opportunities

- Setup: T002 and T003 together.
- Foundational: T007, T008 and T010 together once T006 is done.
- US2: T019 and T020 together; T024 alongside T025–T026.
- US3: T033, T035 and T038 together (different files).
- US4: T041 and T044 together.
- Across stories: after Phase 2, US1 extension, US3 and US4 (minus T045) can be worked by separate people.

## Implementation strategy

1. **MVP**: Phase 3's T013 alone ships Story 1 as already built; then finish Phases 1–3 for FR-002.
2. **Copy (US2)** next: the most authors see it, and it removes a silent decision (Art. X).
3. **Touch (US4)**: completes the Copy experience; the criterion also serves Open.
4. **Open fixer (US3)**: engine-only until spec 111 Phase 8; ship it so 111 can wire it.
5. Each phase is one commit, pushed when its gates are green; a red gate means the failing task stays unchecked and the diagnosis goes in the commit message.
