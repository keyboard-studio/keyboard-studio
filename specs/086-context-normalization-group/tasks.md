---

description: "Task list for spec 086 context normalization group"
---

# Tasks: Context normalization group

**Input**: Design documents from `specs/086-context-normalization-group/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. The plan's Testing section and [quickstart.md](quickstart.md) name the unit, corpus-gated parity, harness and Playwright checks that gate each phase.

**Organization**: One phase per user story. Each phase is committed and pushed to `086-context-normalization-group` when its gate goes green (CLAUDE.md, commit cadence). Commit messages name the tasks they close: `spec 086 TNNN-TNNN`.

**Path correction vs. plan.md**: the corpus harness has no `src/` folder. Its files sit flat in `utilities/nfd-tolerance-corpus/` (`cli.ts`, `analyze.ts`, `run.mjs`). Tasks below use the real paths.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US4 from [spec.md](spec.md)

---

## Phase 1: Setup

**Purpose**: Environment and the new module's skeleton.

- [x] T001 Check `../keyboards` is at the CI pin (`KEYBOARDS_CORPUS_SHA` in `.github/workflows/ci.yml`) and that `pnpm install && pnpm build` (prebuild included) succeeds; note the SHA for the parity and harness tasks
- [x] T002 Create `packages/engine/src/pattern-apply/normalization-step/index.ts` exporting only `NORMALIZATION_STEP_GENERATOR_VERSION = "1"` and `NORMALIZATION_GROUP = "generated_context_normalize"`, plus the store prefix constant `"generated_cn_"`, per [contracts/engine-normalization-step.md](contracts/engine-normalization-step.md)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: Shared types, the IR extension and the US layout table that every story depends on.

**CRITICAL**: No user story work starts until this phase is green.

- [x] T003 [P] Add the additive types `OutputRepertoire`, `NormalizationMap`, `NormalizationStep`, `NormalizationRefusalReason` (`"no-unicode-entry" | "opaque-entry" | "opaque-output-store" | "time-bound" | "no-alternates"`), `NormalizationStepResult` and `StoredNormalizationStep` to `packages/contracts/src/toleranceReport.ts`, next to `ContextVariant`, with fields exactly as in [data-model.md](data-model.md). No `Pattern` change
- [x] T004 [P] Add optional `storeSketch?: StoreItem[]` to `RawKmnFragment` in `packages/contracts/src/keyboard-ir.ts` (use the existing store-item type name). If `packages/contracts/src/schemas.ts` mirrors `RawKmnFragment`, update the zod mirror in the same commit so the drift guard holds
- [x] T005 [P] Create `packages/contracts/src/ir/usBaseLayout.ts` exporting `US_BASE_LAYOUT: ReadonlyMap<string, string>` keyed `"K_A"` / `"S+K_A"` for every unshifted and shifted printable US key (letters, digits, punctuation, `K_SPACE`); export it from `packages/contracts/src/index.ts`
- [x] T006 [P] Write `packages/contracts/src/ir/usBaseLayout.test.ts`: 47 printable keys each with an unshifted and a shifted entry, spot checks (`K_A`→`a`, `S+K_A`→`A`, `K_QUOTE`→`'`, `S+K_2`→`@`), no non-printables
- [x] T007 Replace the private `US_TRIGGER_CHAR` (`packages/contracts/src/ir/deadkeys.ts:327`) with lookups into `US_BASE_LAYOUT`; `packages/contracts/src/ir/deadkeys.test.ts` stays green unchanged (depends on T005)
- [x] T008 Extend the store-level opaque path in `packages/engine/src/codec/parse.ts` (around lines 997–1008) to fill `storeSketch` leniently: flatten `outs()`, keep SMP literals as char items, keep named deadkeys as deadkey items; leave it undefined when nothing resolves. Emit is unchanged (depends on T004)
- [x] T009 Add parser tests in `packages/engine/src/codec/` (next to the existing parse tests) for a `store(grv.all) outs(base) outs(grv)` store shaped like `sil_yoruba8`: the fragment is still opaque, `storeSketch` lists the flattened items, and `roundtrip.test.ts` stays byte-identical

**Checkpoint**: `pnpm --filter @keyboard-studio/contracts test`, `pnpm --filter @keyboard-studio/engine test`, `pnpm typecheck` green. Commit `feat(contracts): normalization-step types, storeSketch, US base layout (spec 086 T001-T009)`.

---

## Phase 3: User Story 1 - Pasted composed and decomposed text behaves like typed text (P1) MVP

**Goal**: A pure, simulation-free generator that adds one context-only group in front of the entry group and never edits existing rules.

**Independent Test**: `sil_yoruba8` with the step: pasted `e` + U+0323 then the acute key gives `ẹ́`; every one- and two-key sequence from empty text is byte-identical to the unmodified keyboard (quickstart §1–§2).

### Tests for User Story 1

- [x] T010 [P] [US1] Write `packages/contracts/src/ir/outputRepertoire.test.ts` on small hand-built IRs: `char`, `index(store,n)` and `outs(store)` expansion; `context`/`context(n)` echo; opaque rule `producedOutput` with `if()` unioned over option states; touch `U_XXXX[_YYYY]` ids; base-layout fallback only for keys with no default-layer rule; postfix closure (`any(dot) + any(key) > index(dot,1) index(ac,2)` yields letter+dot+acute); stack depth capped at 3; an opaque store without a sketch lands in `unresolved`; shuffled rule order gives identical output
- [x] T011 [P] [US1] Write `packages/engine/src/pattern-apply/normalization-step/maps.test.ts`: mixed output forms (`á` precomposed, `e`+U+0329+U+0301 kept non-NFC) target the produced form (FR-002); a cluster the keyboard cannot produce gets no map (FR-003); two mark orders with one NFC form map to the code-point-first one with `ambiguous` set (FR-004); an alternate that is itself produced is dropped (FR-005); `NFC(from) === NFC(to)` for every map
- [x] T012 [P] [US1] Write `packages/engine/src/pattern-apply/normalization-step/pack.test.ts`: each of the five shapes P0, T, H, P, P2 is emitted for a map set that needs it; a pass-through shape is rejected when it could match a repertoire cluster or disagrees with a covered map; no emitted rule contains `if()` or `[K_BKSP]`; greedy cover never needs more rules than one literal rule per map
- [x] T013 [P] [US1] Write `packages/engine/src/pattern-apply/normalization-step/insert.test.ts`: G3 (`remove(apply(ir))` emits byte-identical), G4 (applying twice yields one group), G5 (only one appended non-keys group, `generated_cn_*` stores and `entryPoints.main` change), entry taken from `entryPoints.main` and not `entryGroupOf`, the group ends `match > use(X)` / `nomatch > use(X)`, `removeNormalizationStep` is a no-op on an IR without a step
- [x] T014 [P] [US1] Write `packages/engine/src/pattern-apply/normalization-step/index.test.ts`: G1 (spy on the compiler and simulator entry points; neither is called), G2 (two calls emit byte-identical source), G6 refusals leave the IR untouched for a non-Unicode `begin` (`no-unicode-entry`), an opaque entry group (`opaque-entry`), an unresolvable output store (`opaque-output-store`) and a keyboard with no NFC/NFD-differing cluster (`no-alternates`); G7 (`budgetMs: 0` returns `time-bound`); `examples` holds at most 5 entries in a stable order

### Implementation for User Story 1

- [x] T015 [US1] Implement `buildOutputRepertoire(ir)` in `packages/contracts/src/ir/outputRepertoire.ts` per [research R1](research.md#r1-where-the-steps-input-comes-from-a-static-output-repertoire): atoms from rule outputs, opaque `producedOutput`, `storeSketch` for opaque stores, touch keys (`decodeUnicodeKeyId`) and `US_BASE_LAYOUT` fallback; cluster closure up to the stack depth; sorted `marks`/`bases`; `unresolved` list. Pure and browser-safe (no engine import). Export from `packages/contracts/src/index.ts`. Do not modify `producedSet.ts` (its semantics are frozen)
- [x] T016 [US1] Implement `buildNormalizationMaps(repertoire)` in `packages/engine/src/pattern-apply/normalization-step/maps.ts` per [research R3](research.md#r3-target-form-ambiguity-conflicts)
- [x] T017 [US1] Implement the packer in `packages/engine/src/pattern-apply/normalization-step/pack.ts` per [research R5](research.md#r5-rule-packing): greedy safe set cover over shapes P0, T, H, P, P2 emitting `IRRule`s over generated stores named `generated_cn_*`; pass sets learned from the maps; deterministic store and rule order. The spike's `normgen.test.ts` lives outside the repo (handoff folder `yoruba8-context-tolerance/normgen/`); port it if available, otherwise build from the R5 table
- [x] T018 [US1] Implement insert/remove in `packages/engine/src/pattern-apply/normalization-step/insert.ts` per [research R6](research.md#r6-inserting-and-removing-the-step): resolve the entry from `entryPoints.main` (fallback: first non-readonly group, mirroring `emit.ts:709-714`); append the non-keys group; redirect `entryPoints.main`; removal reads the original entry from `nomatch > use(X)`; apply always removes an existing step first
- [x] T019 [US1] Complete `packages/engine/src/pattern-apply/normalization-step/index.ts`: `proposeNormalizationStep(ir, { budgetMs = 5000 })` (refusal checks before work, repertoire → maps → pack, budget checked between stages, deterministic choice of up to 5 `examples` as `{ pasted, result }`), `applyNormalizationStep`, `removeNormalizationStep` (depends on T015–T018)
- [x] T020 [US1] Re-export the new API and types from `packages/engine/src/context-tolerance/index.ts` (the browser subpath); confirm `pnpm lint` (depcruise) shows no import of the vendored KeymanWeb engine or `kmc-kmn` from `normalization-step/`
- [x] T021 [US1] Write `packages/engine/src/pattern-apply/normalization-step/parity.corpus.test.ts` for the seven spike keyboards (`el_dinka`, `fv_northern_tutchone`, `fv_tlingit`, `sil_yoruba8`, `el_pan_sahelian`, `sil_cameroon_qwerty`, `sil_tchad`): compile baseline and stepped builds, assert 0 of 35,532 two-key sequences differ (SC-001), 100% of pasted-alternate probes match the produced form or an `ambiguous` sibling, including backspace deleting the whole letter (SC-002, US1 scenario 3), rule count within the SC-003 bound, equal compile diagnostics (SC-004: `sil_yoruba8` 9 and 9). Skip with `[WARN]` when `../keyboards` is absent. Reuse the existing corpus-gated test helpers and simulator wrapper rather than adding new ones
- [x] T022 [US1] Gate: run quickstart §1 and §2, `pnpm typecheck`, `pnpm lint`. If any SC-003 bound is exceeded, apply the R10 mitigation (tighten the closure with context reachability) before relaxing anything, and record the per-keyboard counts in [research.md](research.md) under R10. Commit `feat(engine): context normalization step generator (spec 086 T010-T022)` and push with `git push -u origin 086-context-normalization-group`

**Checkpoint**: US1 is shippable on its own: a generated keyboard with the step behaves correctly with no studio UI.

---

## Phase 4: User Story 2 - Computed once per keyboard and reused (P1)

**Goal**: A cache keyed by source content and generator version, in memory and in the working-copy snapshot.

**Independent Test**: Two requests for the same source return byte-identical results and the second runs no generator; changing one rule or the generator version regenerates (quickstart §1, §4 step 4).

### Tests for User Story 2

- [ ] T023 [P] [US2] Add cache-key cases to `packages/engine/src/pattern-apply/normalization-step/index.test.ts`: same IR gives the same key; an IR with a step applied gives the same key as without (the step is stripped before hashing); a one-rule change changes the key; a mocked version change changes the key
- [ ] T024 [P] [US2] Write `packages/studio/src/lib/normalizationStepCache.test.ts`: a hit (memory or snapshot) returns the stored result with `proposeNormalizationStep` spied and not called; a stale `cacheKey` in the snapshot is ignored and replaced; a hit resolves in under 1 s (SC-005)

### Implementation for User Story 2

- [ ] T025 [US2] Implement `normalizationStepCacheKey(ir)` in `packages/engine/src/pattern-apply/normalization-step/index.ts`: `computeSha256Hex(emit(removeNormalizationStep(ir))) + "|" + NORMALIZATION_STEP_GENERATOR_VERSION` (`packages/engine/src/codec/hash.ts`)
- [ ] T026 [US2] Add the optional `contextNormalizationStep?: { cacheKey: string; result: NormalizationStepResult }` field to the snapshot types in `packages/studio/src/lib/draftTypes.ts` and read/write it in `packages/studio/src/lib/persistWorkingCopy.ts` next to `contextToleranceOverlay`; no `DRAFT_VERSION` bump. Add a save/load round-trip case to the existing persist tests
- [ ] T027 [US2] Create `packages/studio/src/lib/normalizationStepCache.ts`: `getOrProposeNormalizationStep(ir, snapshot)` checks an in-memory `Map<cacheKey, result>`, then the snapshot field, then calls the generator and stores the result in both; logs a cache-hit line for the quickstart §4 check. (The plan put the Map inside `contextToleranceAnalysis.ts`; a separate module keeps it unit-testable. Same behaviour.)
- [ ] T028 [US2] Write `packages/engine/src/pattern-apply/normalization-step/generation-time.corpus.test.ts`, opt-in via `KS_CORPUS_PERF=1`: run `proposeNormalizationStep` over every corpus keyboard that parses and assert the 95th percentile is under 5 s (SC-005); print `[WARN]` with the slowest ten. Not part of the default suite
- [ ] T029 [US2] Gate: engine and studio tests, `pnpm typecheck`, `pnpm lint`. Commit `feat(engine): cache normalization steps by source hash and generator version (spec 086 T023-T029)` and push

---

## Phase 5: User Story 3 - Accept or decline through the existing tolerance surface (P2)

**Goal**: The spec 078 station proposes the step by default, with the rule count, examples and one confirm; the 062 generator is the fallback.

**Independent Test**: Import `sil_yoruba8`; the station shows "Adds 9 rules. None of your rules change." with examples; accept adds the step; decline leaves the export byte-identical (quickstart §4–§5).

### Tests for User Story 3

- [ ] T030 [P] [US3] Add `kind: "normalization-step"` cases to the existing `packages/engine/src/pattern-apply/context-tolerance-overlay` tests: replay appends the group and sets `entryPoints.main`; removal restores the original entry and deletes the group and its stores; replay on a projection that already holds the step does not stack
- [ ] T031 [P] [US3] Add cases to `packages/studio/src/lib/projectWorkingCopyVfs.contextTolerance.test.ts`: an accepted step batch appears in the projected `.kmn` as `begin Unicode > use(generated_context_normalize)` with the original rules unchanged
- [ ] T032 [P] [US3] Write `packages/studio/src/lib/contextToleranceAnalysis.test.ts` cases (extend the existing file if present): gap findings plus a `step` result propose the step; a non-`no-alternates` refusal falls back to `proposeContextVariants` and carries the reason; `no-alternates` proposes nothing; an injected verification lookup reporting `regressed` forces the fallback
- [ ] T033 [P] [US3] Write `packages/studio/src/survey/marks/NormalizationExamples.test.tsx`: renders a semantic `<ul>` of at most 5 rows; each glyph's accessible name comes from its code-point names

### Implementation for User Story 3

- [ ] T034 [US3] Add the `{ kind: "normalization-step"; groupName; originalEntry; stores; rules }` batch to `packages/engine/src/pattern-apply/context-tolerance-overlay.ts`; implement replay and removal through `applyNormalizationStep` / `removeNormalizationStep`. Confirm `packages/studio/src/lib/projectWorkingCopyVfs.ts` (around lines 841–851) replays it with no further change, or extend it there
- [ ] T035 [US3] Wire `packages/studio/src/lib/contextToleranceAnalysis.ts` per [contracts/studio-normalization-proposal.md](contracts/studio-normalization-proposal.md): keep `removeContextToleranceOverlay` → `computeContextTolerance`; on gap findings call `getOrProposeNormalizationStep`; fall back to `proposeContextVariants` on refusal (FR-019); accept an optional `verificationLookup(keyboardId, sourceHash)` that defaults to "unknown" (wired to the committed record in T046)
- [ ] T036 [US3] Add the single-site apply in `packages/studio/src/lib/contextToleranceApply.ts` (and `packages/studio/src/hooks/useContextToleranceApply.ts` if it gates sites): one affected site `siteId = "normalization-step"`, emitted through `FacetTransformPanel` so acceptance is all-or-nothing, writing the overlay batch
- [ ] T037 [US3] Update `packages/studio/src/decisions/contextToleranceProposal.ts`: for a step, `acceptedSiteIds` is `["normalization-step"]` or `[]` and the decision is `accept` or `decline`, never `partial`; question ids stay `marks.context_tolerance` and `marks.context_tolerance.sites`
- [ ] T038 [P] [US3] Create `packages/studio/src/survey/marks/NormalizationExamples.tsx`: up to 5 `pasted → result` rows, names from the naming helper in `packages/studio/src/lint/ContextToleranceNotice.tsx` (extract it to a shared export if it is private)
- [ ] T039 [US3] Add the step branch to `packages/studio/src/survey/marks/ContextToleranceStation.tsx`: ICU-pluralised intro "Adds {N} rules. None of your rules change.", `NormalizationExamples`, the FR-018 disclosure line, a native `<button>` "Add this step" and "Leave my keyboard as it is", no per-site ticks; the fallback branch renders as in 078 plus one line naming the refusal reason. No new live region
- [ ] T040 [US3] Add message ids `marks.context_tolerance.step.intro`, `.examples.heading`, `.disclosure.rewrite`, `.action.accept`, `.fallback.reason.<reason>` (one per refusal reason) to `packages/studio/src/locales/en/messages.json` and `packages/studio/src/locales/fr/messages.json` through the lingui extract flow in [specs/046-i18n-localization/contracts/catalog-format.md](../046-i18n-localization/contracts/catalog-format.md); `pnpm lint` (both i18n tiers) green
- [ ] T041 [US3] Add station tests next to `ContextToleranceStation.tsx`: step intro with the rule count, examples, accept records the decision and writes the batch, decline leaves the source unchanged (US3 scenarios 1–3), fallback shows the reason (scenario 4)
- [ ] T042 [US3] Walk quickstart §4 and §5 with the Playwright CLI against `pnpm dev`: import `sil_yoruba8`, check intro and the `e`+U+0323 then `]` → `ẹ́` example row, accept and export (the `.kmn` begins with `begin Unicode > use(generated_context_normalize)`, original rules unchanged by diff), reload (cache-hit log, no regeneration), decline (export byte-identical), and the opaque-output-store fallback fixture. Record the evidence in the commit message
- [ ] T043 [US3] Gate: studio and engine tests, `pnpm typecheck`, `pnpm lint`. Commit `feat(studio): propose the normalization step on the context-tolerance station (spec 086 T030-T043)` and push

---

## Phase 6: User Story 4 - The corpus harness verifies each step once (P2)

**Goal**: A `normalization-step` harness mode that simulates each step once per keyboard version and writes a committed, freshness-checked record.

**Independent Test**: The harness on the seven spike keyboards reports typed output identical and 100% pasted probes; a rerun without source changes reuses the records; `--check` passes, and fails after touching a `.kmn` (quickstart §3).

### Tests for User Story 4

- [ ] T044 [P] [US4] Write `utilities/nfd-tolerance-corpus/normalization-step.test.ts` over `__fixtures__`: record format `context-normalization-verification/1` with sorted keys; `generatedAt` ignored by the freshness comparison; a changed `sourceHash` or generator version marks a record stale; `--incremental` carries fresh records forward byte-for-byte; any typed difference yields `regressed`; a refusal records `refused` without compiling

### Implementation for User Story 4

- [ ] T045 [US4] Measure per-keyboard cost first (R8): time the typed and pasted checks on the seven spike keyboards and on 20 random corpus keyboards; record the numbers and the projected full-corpus time at `--jobs 8` in [research.md](research.md) under R8
- [ ] T046 [US4] In `utilities/nfd-tolerance-corpus/analyze.ts`, add an opt-in that treats a build which emits KeymanWeb JS despite compile errors as simulable (today `simulable()` requires `success`, around lines 185–187), capturing the diagnostic count; the default 062 mode's behaviour is unchanged
- [ ] T047 [US4] Create `utilities/nfd-tolerance-corpus/normalization-step.ts` implementing the per-keyboard procedure in [contracts/harness-verification-record.md](contracts/harness-verification-record.md): propose via the engine by relative path, compile both builds, typed check (every single key over 47 keys × 4 modifier states, plus pairs whose second key some rule binds), pasted check per cluster alternate with acting keys plus backspace and one control key, diagnostic counts; the record writer and freshness check (`sourceHash` over the `.kmn` plus touch layout, `generatorVersion`, `corpusCommit`)
- [ ] T048 [US4] Extend `utilities/nfd-tolerance-corpus/cli.ts` (and `run.mjs` if it parses flags) with `--mode normalization-step`, `--jobs N` (worker processes), `--incremental`, `--check`, `--record <path>`; keep `--keyboard`, `--limit`, `--fail-on-regressed`; the default mode stays the 062 harness unchanged. Console output uses `[OK]`/`[WARN]`/`[ERROR]`
- [ ] T049 [US4] Run quickstart §3 on `sil_yoruba8`, then the seven spike keyboards: all `verified`, `typed.differ = 0`, 100% pasted, diagnostics equal
- [ ] T050 [US4] Produce the first full record `docs/context-normalization-verification.json` with `--jobs 8`. If it exceeds 2 hours, scope the record to keyboards with a [docs/keyboard-index.md](../../docs/keyboard-index.md) entry plus those with alternates, and record that decision in [research.md](research.md) under R8. Any `regressed` keyboard is listed in the commit message
- [ ] T051 [US4] Wire the studio's `verificationLookup` (T035) to the committed record so a `regressed` keyboard never gets the step. If importing `docs/` JSON from the studio crosses the build boundary, generate a slim regressed-id list during prebuild instead and add it to the codegen list in [docs/tooling.md](../../docs/tooling.md#prebuild)
- [ ] T052 [US4] Add `node utilities/nfd-tolerance-corpus/run.mjs --mode normalization-step --check` to the `build` job in `.github/workflows/ci.yml` after the existing corpus gate
- [ ] T053 [US4] In a separate `chore(tools)` commit, remove the duplicate `Test (nfd-tolerance-corpus ...)` step in `.github/workflows/ci.yml` (around line 226, duplicating line 208)
- [ ] T054 [US4] Gate: `pnpm run test:nfd-tolerance-corpus`, the `--check` step locally, `pnpm lint`. Commit `feat(tools): normalization-step harness mode and verification record (spec 086 T044-T052, T054)` and push

---

## Phase 7: Polish and cross-cutting

- [ ] T055 [P] Make sure all seven spike keyboards and the `vietnamese_telex` keyboard have rows in [docs/keyboard-index.md](../../docs/keyboard-index.md) (mandatory phonebook rule); add any missing row from the keyboard's `.kps`
- [ ] T056 [P] Document the harness mode and flags in `utilities/nfd-tolerance-corpus/README.md` and [docs/tooling.md](../../docs/tooling.md#standalone-utilities); add the normalization step to the context-tolerance paragraph of [docs/architecture.md](../../docs/architecture.md) and the engine entry in [docs/packages.md](../../docs/packages.md)
- [ ] T057 [P] Record the two follow-ups in [spec.md](spec.md) Open questions: desktop-engine verification as a release gate before this replaces 062 by default, and replacing the 078 simulated diagnostic with a static check (R7)
- [ ] T058 Run `pnpm typecheck`, `pnpm -r test`, `pnpm lint` from the repo root; all green
- [ ] T059 Run `/speckit-analyze` over spec.md, plan.md and tasks.md and resolve any finding before `/speckit-implement` closes

---

## Dependencies and execution order

### Phase dependencies

- **Setup (Phase 1)**: none.
- **Foundational (Phase 2)**: after Setup. Blocks every story.
- **US1 (Phase 3)**: after Foundational. The MVP.
- **US2 (Phase 4)**: needs US1's `removeNormalizationStep` and `proposeNormalizationStep` (T018, T019).
- **US3 (Phase 5)**: needs US1 (generator) and US2 (`getOrProposeNormalizationStep`, snapshot field).
- **US4 (Phase 6)**: needs US1 only, so it can run in parallel with US2/US3. T051 needs T035 (US3).
- **Polish (Phase 7)**: after the stories it documents.

### Within each story

- Tests first; they fail before implementation.
- US1: T015 (repertoire) → T016 (maps) → T017 (pack) → T018 (insert) → T019 (index) → T020 → T021.
- US3: T034 (overlay) → T035 (analysis) → T036/T037 → T039 (station, needs T038) → T040 → T041 → T042.
- US4: T045 (measure) → T046 → T047 → T048 → T049 → T050 → T051/T052.

### Parallel opportunities

- Phase 2: T003, T004, T005, T006 together; then T007 and T008.
- US1 tests T010–T014 together (five different files).
- US2 tests T023 and T024 together.
- US3 tests T030–T033 together; T038 alongside T034–T037.
- US4 can start once US1 lands, alongside US2/US3, by a second developer.
- Polish T055–T057 together.

## Parallel example: User Story 1

```text
Task: "T010 outputRepertoire.test.ts in packages/contracts/src/ir/"
Task: "T011 maps.test.ts in packages/engine/src/pattern-apply/normalization-step/"
Task: "T012 pack.test.ts in packages/engine/src/pattern-apply/normalization-step/"
Task: "T013 insert.test.ts in packages/engine/src/pattern-apply/normalization-step/"
Task: "T014 index.test.ts in packages/engine/src/pattern-apply/normalization-step/"
```

## Implementation strategy

### MVP (User Story 1)

1. Phase 1 and Phase 2.
2. Phase 3 (US1). Stop and validate with quickstart §1–§2 on the seven keyboards.
3. A keyboard with a generated step is shippable even before the studio offers it.

### Incremental delivery

1. Setup + Foundational → commit.
2. US1 → parity gate → commit and push (MVP).
3. US2 → cache gate → commit and push.
4. US3 → Playwright walk → commit and push.
5. US4 → first record and CI `--check` → commit and push (the duplicate-step cleanup as its own commit).
6. Polish → `/speckit-analyze` → PR via km-archivist (never merged unasked).

Per the constitution each phase runs in its own conversation; `tasks.md` checkboxes land with or after the work they describe.
