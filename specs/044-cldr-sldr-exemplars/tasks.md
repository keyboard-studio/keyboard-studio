# Tasks: CLDR/SLDR exemplars

**Input**: Design documents from `/specs/044-cldr-sldr-exemplars/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: INCLUDED. Both contracts carry explicit, numbered test obligations (T1–T12 in [contracts/exemplar-sourcing.md](contracts/exemplar-sourcing.md#test-obligations), P1–P9 in [contracts/phase-b-prefill.md](contracts/phase-b-prefill.md#test-obligations)). Each is mapped to a task below.

**Organization**: Tasks are grouped by user story. **Phase order deviates from spec priority order** — US3 (P3, the offline index) ships before US1/US2 because the index *is* the delivery mechanism for them; see [plan.md Complexity Tracking](plan.md#complexity-tracking).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, PREFILL)
- Include exact file paths in descriptions

## Path Conventions

Monorepo (`pnpm -r`). Engine library `packages/engine/src/`, studio SPA `packages/studio/src/`, E2E `packages/studio/e2e/`, prebuild codegen `scripts/`. Existing prebuild scripts are **plain-node `.mjs`** (`fetch-langtags.mjs`, `codegen-langtags.mjs`) — this feature follows that precedent rather than plan.md's illustrative `.ts` filenames.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin the two sources and make room for their build artifacts. No behaviour change.

- [x] T001 Add `cldr-misc-full@48.2.0` as a build-time devDependency of `@keyboard-studio/engine` in `packages/engine/package.json`, then `pnpm install` so the lockfile records its integrity hash (this lockfile entry *is* the CLDR integrity pin per FR-012)
- [x] T002 [P] Create `scripts/cldr-version.json` recording `{ "package": "cldr-misc-full", "version": "48.2.0", "license": "Unicode-3.0", "notice": "..." }`, matching the shape of `scripts/langtags-version.json`
- [x] T003 [P] Create `scripts/sldr-version.json` recording `{ "repo": "silnrsi/sldr", "commit": "<40-hex sha>", "sha256": "<hex>", "license": "...", "notice": "..." }` — resolve the pinned commit and tarball SHA-256 from `codeload.github.com/silnrsi/sldr/tar.gz/<commit>` and record the measured values
- [x] T004 [P] Add a directory-local `.gitignore` at `packages/engine/data/sldr/.gitignore` ignoring the raw SLDR extract while keeping `SOURCES.json` and `LICENSE` committed, following the `packages/engine/data/langtags/.gitignore` precedent
- [x] T005 [P] Record the SLDR license + attribution as committed `packages/engine/data/sldr/LICENSE` and `packages/engine/data/sldr/SOURCES.json` (`{ commit, sha256, url, notice, bytes, recordCount }`), exactly mirroring the committed `packages/engine/data/langtags/LICENSE` + `SOURCES.json` precedent — the raw extract stays gitignored, these two files do not

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Fix the two verified defects on the *current* data path and land the shared types. Per [plan.md](plan.md#phase-1--design--contracts) sequencing item 1, SLDR ingestion built on a parser that injects `u`,`2`,`0`,`C` into alphabets would ship garbage.

**CRITICAL**: No user story work can begin until this phase is complete. T006–T010 are a standalone-shippable correctness fix (research R0/R9) and should be committed as their own increment.

- [x] T006 [P] Write failing tests for the R0 tier-key defect in `packages/engine/src/character-discovery/cldr.test.ts`: `fr` and `ewo` must yield non-empty `auxiliary`, `punctuation`, and `numbers` tiers (obligation **T1**)
- [x] T007 [P] Write failing tests for the R9 parser defects in `packages/engine/src/character-discovery/cldr.test.ts`: `[a ‌ b]` must yield `a`, U+200C, `b` (never `u`,`2`,`0`,`C`); `[\x{1E9E}]` and `\\` must decode; `[[a-z]-[aeiou]]` must throw rather than emit `[`, `]`, `a`…`z` (obligation **T2**)
- [x] T008 Fix the tier-key lookup in `packages/engine/src/character-discovery/cldr.ts` — read CLDR's actual keys `auxiliary` / `punctuation` / `numbers` instead of the non-existent `exemplarCharacters-type-*` forms (R0, FR-005/006/007); T006 goes green
- [x] T009 Fix `parseUnicodeSet` in `packages/engine/src/character-discovery/cldr.ts` — decode `\uXXXX`, `\x{...}`, and `\\`; fail loudly on unsupported set operations (difference/intersection) per the [parser-fixes table](contracts/exemplar-sourcing.md#parser-fixes-required-research-r9--verified-defects); T007 goes green
- [x] T010 [P] Add an NFC assertion helper + test in `packages/engine/src/character-discovery/cldr.test.ts` proving every parsed character is NFC-normalized (obligation **T10**, FR-009)
- [x] T011 Extract `cldrLocaleCandidates` into the shared, exported `exemplarLocaleCandidates(tag)` in `packages/engine/src/character-discovery/cldr.ts` (R10) with tests for `ewo-Latn → ["ewo-Latn","ewo"]` and `sr-Latn` resolving at the first candidate (obligation **T3**)
- [x] T012 [P] Add the new engine types — `ExemplarTier`, `ExemplarSource`, `ExemplarConfidence` (ranked), `SourcedCharacter`, `SourcedInventory` — in `packages/engine/src/character-discovery/exemplarTypes.ts` per [data-model.md](data-model.md)
- [x] T013 [P] Record the `parseUnicodeSet` retirement path for kbgen's duplicate copy in `utilities/kbgen/INTEGRATION.md` (R9 follow-up; kbgen itself is not changed here)

**Checkpoint**: The current CLDR path is correct on all four tiers and no longer corrupts escapes. Foundation ready.

---

## Phase 3: User Story 3 - Offline, deterministic, version-pinned exemplar data (Priority: P3) 🎯 built first

**Goal**: A committed, pinned, byte-reproducible offline index over CLDR + SLDR, generated at prebuild, with zero network at authoring time.

**Independent Test**: With no network access, run the Characters step for a covered language and confirm exemplars resolve; regenerate the index twice and confirm byte-identical output.

**Why first**: the index is the substrate US1/US2 deliver through — building a live SLDR fetch and then re-plumbing it offline would be throwaway work ([plan.md](plan.md#complexity-tracking)).

### Tests for User Story 3

- [x] T014 [P] [US3] Write the determinism test in `scripts/codegen-exemplars.test.mjs` (or an engine-side equivalent) asserting two consecutive generations produce byte-identical output (obligation **T8**, FR-013/SC-005)
- [x] T015 [P] [US3] Write fail-loud tests for `fetch-sldr` in `scripts/fetch-sldr.test.mjs`: checksum mismatch, zero-length/placeholder file, and an HTML error page masquerading as a tarball each exit non-zero with `[ERROR]` (obligation **T9**, FR-012)
- [x] T016 [P] [US3] Write the offline test in `packages/engine/src/character-discovery/exemplarSource.test.ts` — stub `fetch` to throw and assert a full sourcing run still succeeds for a covered tag (obligation **T11**, FR-011/SC-004)

### Implementation for User Story 3

- [x] T017 [US3] Implement `scripts/fetch-sldr.mjs` — download the single pinned tarball from `codeload.github.com/silnrsi/sldr/tar.gz/<commit>`, verify SHA-256 against `scripts/sldr-version.json`, extract to the gitignored `packages/engine/data/sldr/`, fail loudly on any mismatch/placeholder/HTML body; `[OK]`/`[WARN]`/`[ERROR]` console output only (T015 goes green)
- [x] T018 [US3] Implement the SLDR LDML reader inside `scripts/codegen-exemplars.mjs` per the [normative reader rules](contracts/exemplar-sourcing.md#sldr-reader-rules-normative--research-r6): read `<exemplarCharacters>` under `<characters>` only; **skip elements carrying `alt`**; on duplicate `type` pick the highest `draft` rank with document-order tie-break; absent `type` ⇒ `main`; ignore `index`; fall back to file-level `sil:identity/@draft`. Prefer a ~50-line regex/stream extraction over adding an XML parser dependency (plan.md deferred decision — resolve here)
- [x] T019 [US3] Implement the CLDR reader inside `scripts/codegen-exemplars.mjs` — read `node_modules/cldr-misc-full/main/*/characters.json`, extracting `exemplarCharacters`/`auxiliary`/`punctuation`/`numbers` as **raw unparsed strings**
- [x] T020 [US3] Implement index emission in `scripts/codegen-exemplars.mjs` per the [index format](contracts/exemplar-sourcing.md#index-format) — `{ version: { cldr, sldrCommit, generated }, locales }`, `generated` derived from the pins (**never** a wall clock), explicitly sorted keys, two-space indent, trailing newline, both `c` and `s` sides retained, locales with no usable `main` in either source omitted; fail loudly on any exemplar set that cannot be parsed (T014 goes green)
- [x] T021 [US3] Write the index to `packages/engine/src/character-discovery/generated/exemplars.generated.json` and verify it is **< 2 MB**; if it exceeds the budget, gitignore + regenerate at prebuild exactly like `charnames.generated.json` and record the choice in the contract
- [x] T022 [US3] Wire `fetch-sldr` and `codegen-exemplars` into the root `package.json` `scripts` block and append both to the `prebuild` chain next to `fetch-langtags`/`codegen-langtags`
- [x] T023 [US3] Implement `packages/engine/src/character-discovery/exemplarIndex.ts` — lazy-chunked loader for the committed index (mirroring the `charnames.generated.json` lazy-import treatment so it never enters the studio startup bundle) plus an O(1) `lookup(localeId)`
- [x] T024 [US3] Add the idempotent async warm-up `loadExemplarSource(): Promise<void>` and the synchronous `sourceExemplars` seam in `packages/engine/src/character-discovery/exemplarSource.ts` per the [public API](contracts/exemplar-sourcing.md#public-api) (T016 goes green)
- [x] T025 [P] [US3] Add `scripts/check-exemplar-staleness.mjs` — compares `scripts/cldr-version.json` and `scripts/sldr-version.json` against the upstream npm registry / GitHub refs and **reports, never auto-applies**; register it in the root `package.json` `scripts` block **outside** the `prebuild` chain so a stale pin can never change the index under a review

**Checkpoint**: The offline index exists, regenerates byte-identically, and is queryable with no network. US1 and US2 can now proceed.

---

## Phase 4: User Story 1 - Exemplars for a language CLDR does not cover (Priority: P1)

**Goal**: A language SLDR covers and CLDR does not gets its actual character set instead of the whole-script fallback, with deterministic precedence and per-character source attribution.

**Independent Test**: Pick a language present in SLDR but absent from CLDR, run the Characters survey step, and confirm the seeded inventory reflects that language's exemplar set rather than the full Unicode block.

### Tests for User Story 1

- [x] T026 [P] [US1] Test precedence in `packages/engine/src/character-discovery/exemplarSource.test.ts` — an SLDR-only tag (e.g. `ebk`) yields a non-null seed with `source: "sldr"`; a both-sources tag (one of the 313 overlaps) yields `source: "cldr"` (obligation **T4**, FR-002/003, SC-001)
- [x] T027 [P] [US1] Test attribution in `packages/engine/src/character-discovery/exemplarSource.test.ts` — every returned `SourcedCharacter` carries both `source` and `confidence` (obligation **T5**, FR-004, SC-007)
- [x] T028 [P] [US1] Test the confidence gate in `packages/engine/src/character-discovery/exemplarSource.test.ts` — `und`, `Latn`, `zh`, `ms` return `null` for both sources; `qaa`–`qtz` is gated for CLDR but **allowed** when SLDR-backed (obligation **T6**, FR-008, research R7)
- [x] T029 [P] [US1] Test the fall-through in `packages/engine/src/character-discovery/exemplarSource.test.ts` — a tag covered by neither source returns `null` and does not throw (obligation **T7**, FR-010)
- [x] T030 [P] [US1] Capture the pre-feature CLDR-only seed corpus from `main` into a committed fixture at `packages/engine/src/character-discovery/__fixtures__/cldr-baseline.json`, and write the regression-floor test in `packages/engine/src/character-discovery/exemplarSource.regression.test.ts` asserting no locale in that baseline loses its seed (obligation **T12**, SC-006)

### Implementation for User Story 1

- [x] T031 [US1] Implement `isGatedTag(tag, source)` in `packages/engine/src/character-discovery/exemplarSource.ts` — the per-source confidence gate, with the SLDR `qaa`–`qtz` carve-out that keeps private-use-tagged minority-language data (spec Edge Cases; T028 goes green)
- [x] T032 [US1] Implement `sourceExemplars(bcp47)` in `packages/engine/src/character-discovery/exemplarSource.ts` following the [normative resolution order](contracts/exemplar-sourcing.md#resolution-order-normative): candidates → first present wins → gate → precedence (CLDR side if present, else SLDR) → tier extraction via the canonical `parseUnicodeSet` → NFC. Precedence is applied at **lookup** time, not bake time. Uppercase counterparts are **not** synthesized here (T026/T027/T029 go green)
- [x] T033 [US1] Implement highest-tier deduplication and `digraphs` extraction in `exemplarSource.ts` — a character present in several tiers of the winning source is recorded once at `main` > `auxiliary` > `punctuation` > `numbers`; `{..}` clusters are preserved into `SourcedInventory.digraphs`
- [x] T034 [US1] Handle the SLDR orthography-subtag case deterministically in `exemplarSource.ts` — two same-tagged SLDR entries may be *different orthographies*, not conflicting data; pick deterministically by draft rank then document order and keep the chosen orthography's provenance observable (spec Edge Cases — must not be collapsed into source disagreement)
- [x] T035 [US1] Rewire `packages/engine/src/character-discovery/characterMap.ts` to consume `sourceExemplars` as its sourcing path (FR-015), preserving the `opts.loader` injection hook so existing tests need no rewrite
- [x] T036 [US1] Rewire `packages/engine/src/character-discovery/suggestMissing.ts` to consume the same `sourceExemplars` path — no second copy of exemplar logic (FR-015)
- [x] T037 [US1] Keep `createFetchCldrLoader` / `createFetchCldrFullLoader` / `CldrFullLoader` / `loadExemplars` / `loadExemplarsFromFull` exported with unchanged signatures in `packages/engine/src/character-discovery/cldr.ts` — they become the live-refresh path, not the authoring path ([compatibility clause](contracts/exemplar-sourcing.md#compatibility-with-todays-exports))
- [x] T038 [US1] Swap the studio's live CLDR loader for index-backed sourcing in `packages/studio/src/lib/services.ts`, awaiting `loadExemplarSource()` off the startup critical path

**Checkpoint**: SLDR-covered languages seed from their real alphabet; every character is attributed. US1 is independently demoable.

---

## Phase 5: User Story 2 - Fuller exemplar coverage: punctuation and numerals (Priority: P2)

**Goal**: Language-specific punctuation and numerals reach the seeded inventory, categorized distinctly from the core alphabet.

**Independent Test**: For a language whose exemplar data defines punctuation and/or numbers sets, run the Characters step and confirm those characters appear in the seed, categorized distinctly.

**Note**: the data half of this story is mostly delivered by T008 (the R0 tier-key fix). The remaining work is the 047 section wiring.

### Tests for User Story 2

- [x] T039 [P] [US2] Test in `packages/engine/src/character-discovery/characterMap.test.ts` that a locale with all four tiers produces four populated, distinctly-categorized groups rather than two (FR-005/006, SC-002)
- [x] T040 [P] [US2] Test in `packages/engine/src/character-discovery/characterMap.test.ts` that a locale defining no punctuation/numbers set produces the letter tiers only — **no empty or placeholder categories** (US2 acceptance scenario 3)

### Implementation for User Story 2

- [x] T041 [US2] Extend `packages/engine/src/character-discovery/characterMap.ts` to emit all four tiers instead of two, preserving each character's tier category through to the picker (T039/T040 go green)
- [x] T042 [US2] Wire the `auxiliary` / `punctuation` / `numbers` tiers into their existing 047 breakdown sections in `packages/studio/src/survey/PhaseB.tsx`, rendered **unticked** (obligation **P6**)
- [x] T043 [US2] Verify the script-mismatch cross-check still surfaces (rather than drops) out-of-script exemplar characters now that three more tiers flow through it — assert in `packages/engine/src/character-discovery/suggestMissing.test.ts` and check the consumers `packages/studio/src/survey/questions/b/q_sa2_base_script_mismatch.ts` and `packages/studio/src/survey/Prefill.tsx` still fire on the new tiers (spec Edge Cases)

**Checkpoint**: US1 and US2 both work independently. The engine side of the feature is complete.

---

## Phase 6: Phase B propose-then-confirm prefill (FR-016 / FR-016a–c / FR-017)

**Goal**: For a language with a sourced inventory, the exemplar set is the **first and default** discovery method with its detail inline; accepting fills the alphabet in one action; declining is first-class and sticky.

**Independent Test**: For `ewo-Latn`, reach the discovery page, press Continue then Done — the alphabet is recorded with 0 characters typed (SC-010). Choose option 2 instead and the alphabet contains only what the author typed (SC-009).

> **GATE — Content sign-off required before T046 (Article VI split).** The offer's wording and what the accept covers (Engine's proposed default: `main` only, with `auxiliary`/`punctuation`/`numbers` offered separately in their 047 sections) are **Content-owned** per the §12/§13 team split. Do not implement the copy or the tier scope without that sign-off; the store and plumbing tasks below are Engine-owned and unblocked.

### Tests for the prefill

- [x] T044 [P] [PREFILL] Write store tests in `packages/studio/src/stores/phaseBDraftStore.test.ts` — `seedFromProposal` is idempotent; a removed proposed character enters `rejected` and is never re-proposed; an author-entered character that is also proposed is attributed `"author"` and survives a re-seed; removing an authored character does **not** add it to `rejected` (obligations **P3**, **P4**)
- [x] T045 [P] [PREFILL] Write a store regression test in `packages/studio/src/stores/phaseBDraftStore.test.ts` asserting every existing 047 invariant still holds after seeding — `chars` stays the complete inventory and each captured non-mark/non-PUA character lands in exactly one category array (obligation **P7**)

### Implementation for the prefill

- [x] T046 [PREFILL] Extend `packages/studio/src/stores/phaseBDraftStore.ts` additively with `provenance: Record<string, ExemplarSource | "author">`, `rejected: string[]`, and `seedFromProposal(inv: SourcedInventory): void` per [data-model.md](data-model.md#phasebdraftstate-additions-studio-store-additive) — seeds from the `main` tier plus 047's existing `caseCounterpart` derivation, skips anything in `rejected`, never clobbers an author-added pick (T044/T045 go green)
- [x] T047 [PREFILL] Add a per-working-copy "exemplar method declined" flag to `packages/studio/src/stores/phaseBDraftStore.ts` so a decline is remembered and never re-asserted on Phase B re-entry (FR-016a)
- [x] T048 [PREFILL] Add the exemplar option to the discovery method list (`IntroChooser`) in `packages/studio/src/survey/CharactersStep.tsx` — **first and pre-selected** when the inventory is non-null, with source, confidence, character count and a `main`-set preview rendered **inline on the option**; **absent entirely** (not disabled, not empty) when the inventory is `null`, with the list reverting to today's two options and `build-list` default (obligation **P2**)
- [x] T049 [PREFILL] Wire Continue in `packages/studio/src/survey/CharactersStep.tsx` — option 1 calls `seedFromProposal(inventory)` exactly once and lands on a prefilled page 2; option 2 is the decline and lands on an empty page 2, recording the decline from T047. `resetPhaseBDraft()` stays as-is; **the draft is never seeded on transition** (obligations **P1**, **P1a**)
- [x] T050 [PREFILL] Implement the FR-016c heading swap in `packages/studio/src/survey/PhaseB.tsx` — "Add your whole alphabet" while the draft is empty, "Confirm your alphabet" once anything has been proposed into it; the confirm action itself is unchanged and a filled draft is **not** a completed step (obligation **P1c**)
- [x] T051 [PREFILL] Keep all three fill affordances present on page 2 regardless of the page-1 choice in `packages/studio/src/survey/PhaseB.tsx` — character box + Add, the paste/upload placeholder (surface owned by [specs/050-text-sample-prefill/](../050-text-sample-prefill/spec.md), **not built here**), and a collapsed "exemplars available — show" apply affordance when the author declined (obligation **P1b**, FR-016b)
- [x] T052 [PREFILL] Render the proposed-vs-authored affordance in `packages/studio/src/survey/PhaseB.tsx` — proposed chips visually distinct from authored ones, each stating source and confidence ("from CLDR" / "from SLDR (machine-generated — please check)"); confidence drives wording only and **never filters** (obligation **P5**, FR-017)
- [x] T053 [PREFILL] Make proposal sources **union** rather than override in `seedFromProposal` in `packages/studio/src/stores/phaseBDraftStore.ts` — widen `provenance` to accept a future `"text"` origin and merge per character rather than replacing the proposed set, so a second proposal source composes with exemplars and each character keeps its own attribution; 044 must not assume exemplars are the sole proposal source and **must not** build the text-sample surface (spec Assumptions, [specs/050-text-sample-prefill/](../050-text-sample-prefill/spec.md))
- [x] T054 [P] [PREFILL] Add the accept E2E walk in `packages/studio/e2e/exemplar-prefill.spec.ts` — fresh visitor (`seedReturningVisitor(page)` first) → Phase B → Continue on the default option → Done; two actions, alphabet recorded, 0 characters typed (obligation **P8**, SC-008/SC-010)
- [x] T055 [P] [PREFILL] Add the decline E2E walk in `packages/studio/e2e/exemplar-prefill.spec.ts` — fresh visitor → Phase B → option 2 → author types their own alphabet → Done records only what they typed, and re-entry does not re-assert the set (obligation **P9**, SC-009)

**Checkpoint**: A covered language is two clicks from a recorded alphabet; declining is friction-free and remembered.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T056 [P] Measure SC-003 from the generated index and record the result in `specs/044-cldr-sldr-exemplars/quickstart.md` (new §6 "Measured outcomes") — distinct languages producing a non-fallback seed versus the ~323-language CLDR-only baseline in [research.md](research.md) R4, with the increase attributed to SLDR coverage
- [x] T057 [P] Update `CLAUDE.md` — add `fetch-sldr` and `codegen-exemplars` to the `prebuild` bullet list and note the `exemplars.generated.json` artifact alongside the langtags/charnames entries
- [x] T058 [P] Update `docs/architecture.md` where the character-discovery sourcing path is described, reflecting the single offline sourcing path (FR-015)
- [x] T059 [P] File the follow-ups from [plan.md](plan.md#follow-ups-explicitly-not-in-this-plan) as GitHub issues via `gh issue create` — opt-in live refresh, kbgen `parseUnicodeSet` retirement, CLDR/SLDR union as an author action, the `index` tier — and link them from the plan's Follow-ups section
- [x] T060 Run the full [quickstart.md](quickstart.md) validation — §2 determinism + fail-loud + offline, §3 sourcing/precedence table, §4 the prefill walk
- [x] T061 Run the full gate: `pnpm typecheck && pnpm -r test && pnpm lint` (lint includes the antipattern checker — no `expect(true).toBe(true)` tautologies, no hardcoded survey question-order snapshots)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Phase 1 for T012+ only; T006–T011 need nothing. **BLOCKS all user stories**
- **US3 (Phase 3)**: depends on Phase 1 (pins) + Phase 2 (parser + candidates). **BLOCKS US1 and US2** — the index is their substrate
- **US1 (Phase 4)**: depends on Phase 3
- **US2 (Phase 5)**: depends on Phase 2 (T008 does most of the data work) and Phase 3; independently testable from US1
- **Prefill (Phase 6)**: depends on US1 (needs a real `SourcedInventory`). T046/T047 are unblocked; **T048–T052 are gated on Content sign-off**
- **Polish (Phase 7)**: depends on all desired stories

### Within Each Story

- Tests are written first and MUST fail before the implementation task that names them
- Types (T012) before services; services (T024/T032) before consumers (T035/T036/T038); engine before studio

### Parallel Opportunities

- **Phase 1**: T002, T003, T004, T005 all parallel (T001 first — the others reference the pinned version)
- **Phase 2**: T006, T007, T010, T012, T013 parallel; T008 after T006; T009 after T007
- **Phase 3**: T014, T015, T016 parallel; T017/T018/T019 parallel (different readers); T020 joins them; T025 parallel with everything
- **Phase 4**: T026–T030 all parallel (same file, distinct cases — write together, run together); T035, T036, T037, T038 parallel after T032
- **Phase 5**: T039, T040 parallel
- **Phase 6**: T044, T045 parallel; T054, T055 parallel after T049
- **Phase 7**: T056–T059 all parallel

## Parallel Example: User Story 1 tests

```bash
# Launch all US1 sourcing tests together, then implement against them:
Task: "T026 precedence — SLDR-only vs both-sources, in exemplarSource.test.ts"
Task: "T027 attribution — every character carries source + confidence"
Task: "T028 confidence gate — und/Latn/zh/ms null; qaa-qtz per-source"
Task: "T029 fall-through — uncovered tag returns null, no throw"
Task: "T030 regression floor — no locale loses its pre-feature seed"
```

---

## Implementation Strategy

### Ship the correctness fix standalone first

T006–T010 (the R0 tier-key defect + R9 parser defects) are live bugs on today's data path: three of four tiers have always been empty, and `\uXXXX` escapes inject stray ASCII into alphabets. Per [plan.md](plan.md#summary) they should be committed and shipped on their own, ahead of everything else.

### Then MVP

1. Phase 1: Setup
2. Phase 2: Foundational (CRITICAL — blocks all stories)
3. Phase 3: US3 — the offline index (built ahead of its P3 priority; it is the delivery mechanism)
4. Phase 4: US1 — **STOP and VALIDATE**: an SLDR-only language seeds its real alphabet. This is the feature's core value and is demoable here.

### Incremental Delivery

1. Setup + Foundational → correctness fix shippable
2. + US3 → offline, deterministic, pinned index (SC-004/005)
3. + US1 → SLDR coverage + attribution (SC-001/003/006/007) — **MVP**
4. + US2 → punctuation and numerals in their own sections (SC-002)
5. + Prefill → two-click alphabet for covered languages (SC-008/009/010)

### Notes

- [P] = different files, no dependencies
- Console output in all new scripts uses `[OK]` / `[WARN]` / `[ERROR]`, never emoji (Article VIII)
- Do not cite GitHub issue numbers in shipped code or comments — cross-link via commit messages and PR bodies
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
