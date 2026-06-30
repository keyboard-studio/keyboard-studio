---

description: "Task list for SIL langtags defaults at the front of the survey"
---

# Tasks: SIL langtags defaults at the front of the survey

**Input**: Design documents from `specs/023-langtags-defaults/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/engine-langtags-api.md](contracts/engine-langtags-api.md),
[quickstart.md](quickstart.md)

**Tests**: Included — the contract (C1–C9) and codegen determinism are core acceptance and are cheap to
assert in vitest; studio question-module fixtures already exist and must be kept green.

**Organization**: By user story (US1 P1, US2 P2, US3 P2), after shared Setup + Foundational data layer.

**Branch**: `km/langtags-defaults`  ·  **Owning team**: Engine (Content reviews ISO-639 list labels)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish have no story label)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin the data source and prepare the vendoring location.

- [ ] T001 Create `scripts/langtags-version.json` pinning `source/langtags.json` @ commit `99b856bbe8a7dfc1ef7f05d6087dc7501843eb04`, with `urlTemplate`, `path`, `license:"MIT"`, the SIL copyright `notice`, and a `sha256` placeholder (shape per [data-model.md](data-model.md); mirror [scripts/kmcmplib-version.json](../../scripts/kmcmplib-version.json)).
- [ ] T002 Create `packages/engine/data/langtags/` with a `LICENSE`/`NOTICE` file carrying the upstream MIT text + `Copyright (c) 2019-2025 SIL International (http://www.sil.org)` (FR-010); add a `.gitignore`/manifest decision note (raw JSON vendored vs. fetched-to-cache).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The data foundation every user story depends on — fetch+pin+codegen + the engine lookup
API. **⚠️ No user story work begins until this phase is complete.**

- [ ] T003 Implement `scripts/fetch-langtags.mjs` — read `langtags-version.json`, download the pinned raw URL, SHA-256-verify (fail loudly on mismatch/placeholder, FR-012), write the vendored file + update a `SOURCES.json` manifest; reuse the `download()`/`createHash` pattern from [scripts/fetch-kmcmplib.mjs](../../scripts/fetch-kmcmplib.mjs).
- [ ] T004 Compute the real SHA-256 of the pinned file and write it into `scripts/langtags-version.json` (replaces the T001 placeholder).
- [ ] T005 Implement `scripts/codegen-langtags.mjs` — parse vendored `langtags.json`, derive the slim index per [research.md](research.md) D4 (bare-subtag tagsets → `full` script/region; dual-key 2-/3-letter; flat `languages[]`), emit deterministic TS into `packages/engine/src/langtags/generated/` with a provenance header citing commit+version; mirror [scripts/compile-recognizer-rules.mjs](../../scripts/compile-recognizer-rules.mjs).
- [ ] T006 Add `fetch-langtags` + `codegen-langtags` npm scripts and chain both into `prebuild` in root [package.json](../../package.json) (order: fetch → codegen, before existing steps).
- [ ] T007 [P] Add `LanguageDefaults`, `LanguageSummary`, and the `LangtagsProvenance` label type to `packages/contracts/src/langtags.ts` (additive; export from the contracts barrel). No Pattern/Criterion change.
- [ ] T008 Implement `packages/engine/src/langtags/index.ts` — `getLanguageDefaults` / `listLanguages` / `lookupByName` over the generated index, per [contracts/engine-langtags-api.md](contracts/engine-langtags-api.md).
- [ ] T009 Add the `"./langtags"` subpath export to [packages/engine/package.json](../../packages/engine/package.json) (mirror `"./placement"`) and ensure `tsc -b` emits `dist/langtags/`.
- [ ] T010 [P] Engine vitest `packages/engine/src/langtags/index.test.ts` — contract tests C1–C9 (`ha`→Latn/NG, `hi`→Deva/IN, `hau`==`ha`, case-insensitive, unknown→null, `lookupByName` by code/name/autonym, empty→[]).
- [ ] T011 [P] Codegen determinism test — running `codegen-langtags` twice yields byte-identical output (guards FR-012 / SC-006).

**Checkpoint**: `pnpm build` runs prebuild clean; `@keyboard-studio/engine/langtags` resolves and passes
its contract tests. Data foundation ready.

---

## Phase 3: User Story 1 - Find my language and get a default script (Priority: P1) 🎯 MVP

**Goal**: Searchable world-language list at the identity head; selecting a language pre-proposes the
default target script as an editable, langtags-labeled confirmation.

**Independent Test**: In the survey, search "Hausa"/"ha"/autonym → select → target-script question shows
"Latin" pre-proposed and editable, labeled "Suggested from langtags"; can be changed to romanization/IPA.

- [ ] T012 [P] [US1] Create `packages/studio/src/lib/langtagsDefaults.ts` — lazy `import()` of the engine slim index (separate chunk, FR-011/SC-005); helpers: `searchLanguages(query)`, `defaultsFor(code)`, and `scriptToTargetOption(defaultScript)` mapping ISO-15924 → `il_target_script` option value (`Latn`→`Latn`, …, unknown→`other`).
- [ ] T013 [US1] Resolve `@langtags_iso639` in [QuestionField.tsx](../../packages/studio/src/survey/QuestionField.tsx) — when `options_source === "@langtags_iso639"`, render the autocomplete from the lazy-loaded `languages[]` (search by code/name/autonym) instead of the "not loaded in this build" stub; keep a free-text escape (FR-009/US3).
- [ ] T014 [US1] Switch [il_language_code.ts](../../packages/studio/src/survey/questions/a/il_language_code.ts) from `text` to `autocomplete` with `options_source: "@langtags_iso639"`; update its fixtures; preserve `required:false` + free-text fallback.
- [ ] T015 [US1] Capture the selected language record in [IdentityLite.tsx](../../packages/studio/src/survey/IdentityLite.tsx) (via `onAnswerCommit`) and extend `getSeedValue` to seed `il_target_script` from `scriptToTargetOption(defaultsFor(code).defaultScript)`.
- [ ] T016 [US1] Add a `getSeedProvenance(questionId)` path through [SurveyRunner.tsx](../../packages/studio/src/survey/SurveyRunner.tsx) and render a small "Suggested from langtags — edit if needed" caption under seeded fields (FR-007); seed never overwrites a non-empty author edit (FR-008).
- [ ] T017 [US1] Preserve §8/§9 decoupling — seeding the script is a proposal only; verify romanization/IPA/other overrides still flow through `buildTargetBcp47`/`normalizeTargetScript` unchanged.
- [ ] T018 [P] [US1] Update/extend question-module fixtures + a SurveyRunner test asserting the seed + provenance caption render and that an author override wins.

**Checkpoint**: US1 demoable on its own — language search + default-script proposal, editable, labeled.

---

## Phase 4: User Story 2 - Autonym, English name, and region pre-filled (Priority: P2)

**Goal**: After language identification, autonym (`localname`), English name (`name`), and region
(`defaultRegion`/`regions`) arrive as editable, labeled confirmations.

**Independent Test**: Select a language with `localname`/`name`/region → all three pre-filled, labeled,
overridable; overrides stick.

- [ ] T019 [US2] Seed the English-name and autonym fields from `defaultsFor(code).englishName` / `.autonym` (identity-lite + Phase A `language_name_*`), as editable confirmations with the langtags caption (FR-005); author input precedence (FR-008). Conservative placement per [research.md](research.md) D6 (seed where the code is known).
- [ ] T020 [US2] Seed [region.ts](../../packages/studio/src/survey/questions/a/region.ts) from `defaultRegion` (+ `regions`) as an editable, free-text-overridable confirmation with the caption (FR-006); keep its `required` validation.
- [ ] T021 [P] [US2] Feed the same resolved `@langtags_iso639` options into [iso_code.ts](../../packages/studio/src/survey/questions/a/iso_code.ts) (Phase A) so the autocomplete is populated there too; update fixtures.
- [ ] T022 [P] [US2] Fixtures/tests for the autonym/English/region seeding + provenance captions and override-wins behavior.

**Checkpoint**: US1 + US2 both work — "identify once, the rest is proposed."

---

## Phase 5: User Story 3 - The long tail still works (Priority: P2)

**Goal**: Languages absent from langtags are never blocked — free text everywhere, no false proposals.

**Independent Test**: Enter a language not in langtags → every field accepts free text, no proposal is
forced, the step completes.

- [ ] T023 [US3] Verify/implement the free-text escape on the language autocomplete (FR-009) — a typed value not in the list is accepted and flows to the answer; if the widget lacks an escape, add one in [QuestionField.tsx](../../packages/studio/src/survey/QuestionField.tsx).
- [ ] T024 [US3] Ensure an unknown code yields `null` defaults → no seed, no caption, fields blank/free-text (FR-008/FR-009); guard `langtagsDefaults.ts` against null.
- [ ] T025 [P] [US3] Test: a not-in-langtags language completes the identity step with all-free-text and zero forced proposals (SC-003).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 [P] Studio build check — confirm the slim index emits as its own chunk and raw `langtags.json` is absent from `dist/` (FR-011/SC-005).
- [ ] T027 [P] Docs — note the langtags data source + regen step in [CLAUDE.md](../../CLAUDE.md) (prebuild/codegen inventory) and a short pointer in [README.md](../../README.md) if warranted; record the cross-link to [specs/002-defaults-engine](../002-defaults-engine/spec.md) (this feature supplies its data source).
- [ ] T028 [P] `utilities/spec-trace` acknowledge for the new feature spec corpus unit, if tracked.
- [ ] T029 Run [quickstart.md](quickstart.md) end-to-end; then `pnpm typecheck && pnpm lint && pnpm -r test` all green (incl. depcruise — studio→engine allowed, engine⊥studio).

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)**: none — start immediately.
- **Foundational (P2)**: after Setup — **BLOCKS all user stories** (no index → nothing to wire).
- **US1 (P3)** → after Foundational. **US2/US3 (P4/P5)** → after Foundational; US2/US3 build on US1's
  loader/seed plumbing (`langtagsDefaults.ts`, `getSeedProvenance`) so are most efficiently done after
  US1, though each is independently testable.
- **Polish (P6)**: after the desired stories.

### Within stories
- T004 (real SHA-256) depends on T001+T003. T008 depends on T005+T007. T010/T011 depend on T008/T005.
- US1: T012 before T013–T018; T013 before T014; T015/T016 before T018.
- Models/types (T007) before services (T008) before UI wiring (T012+).

### Parallel opportunities
- [P] within Foundational: T007 (contracts) ∥ (after T008) T010/T011.
- [P] within US1: T012 ∥ early; T018 ∥ once seeds land.
- US2 T021/T022 and US3 T025 are [P] against each other once US1 plumbing exists.

---

## Implementation Strategy

### MVP (US1 only)
Setup → Foundational → US1 → **STOP & validate** (language search + default-script proposal). This alone
delivers the headline "especially at the beginning" value and resolves the `@langtags_iso639` stub.

### Incremental delivery
Foundation → US1 (MVP) → US2 (autonym/name/region) → US3 (long-tail safety net) → Polish. Each story
adds value without breaking the previous.

### Crew mapping (km-lead)
- Foundational data/scripts/engine: `km-output` + `km-programmer` (+ `km-keyman` for BCP47/script
  mapping review).
- Studio wiring: `km-frontend`.
- Types: `km-programmer` (contracts).
- Tests: `km-testing`; verification: `km-verification`.
- Docs + cross-links: `km-doc`; ISO-639 label review: `km-author`.
- PR + AC reconciliation: `km-archivist` (`refs #` the 002 feature, do not close it).

## Notes
- No Pattern/Criterion schema change; no second debounce; no host-disk writes (Constitution I/IV/V).
- Out of scope (defer to specs/002): copyright you/org, coexisting-keyboards/use-case, reorder,
  touch-naming, help skeleton, full `axisFills`, blank-default phase-exit gate.
