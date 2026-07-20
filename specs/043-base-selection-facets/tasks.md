---
description: "Task list for Base-Selection & Strategy Facet Classifiers"
---

# Tasks: Base-Selection & Strategy Facet Classifiers

**Input**: Design documents from `/specs/043-base-selection-facets/`

**Prerequisites**: [plan.md](plan.md) (required), [spec.md](spec.md) (user stories), [research.md](research.md), [data-model.md](data-model.md), [contracts/facets.md](contracts/facets.md)

**Tests**: INCLUDED. The repo convention is a `.test.ts` beside every classifier (plan.md Project Structure lists `+ .test.ts` for each), and FR-041 requires the facet-index test suite to pass after each facet lands.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Every task names an exact file path

## Path conventions

All work rides the standalone `utilities/facet-index/` tool (not a `packages/*` target — FR-043). Classifiers are flat sibling modules registered in `DEFAULT_CLASSIFIERS` in `build-index.ts`; facet definitions are `content/keyboard-facets/*.yaml`; session mirrors are `content/facets/<family>/*.yaml`; pinned data lands under `utilities/facet-index/data/` with a `SOURCES.json` pin.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the tool shape and shared reads the 13 classifiers build on. No new build target.

- [x] T001 Confirm the `utilities/facet-index/` layout and the `{ classify, fallback }` archetype + `DEFAULT_CLASSIFIERS` registry against an existing pair (read `utilities/facet-index/strategy-fingerprint-classifier.ts`, `target-mix-classifier.ts`, and `build-index.ts`) so all 13 new classifiers follow the spec-037 shape; record any deviation before writing new modules.
- [x] T002 [P] Verify `buildProducedSet` (from `@keyboard-studio/contracts`) and `utilities/facet-index/base-layout.ts` expose the produced-character set + spec-040 base-layout fall-through set needed by `added-char-count`/`combining-mark-repertoire`/`orthography-coverage-ratio`/`directionality`/`declared-bcp47-tags`; note the exact import surface in a scratch comment (no code change).
- [x] T003 [P] Verify `utilities/facet-index/cause-predicates.ts` and `measurement.ts` expose the exception cause-tag library (`principled-split`/`capacity-forced`/`gap-omission`) and the `Categorization` builder the new classifiers reuse (FR-001/FR-002/FR-005).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared `.kps`/`LICENSE.md` reader used by five `source.*`/`env.*` classifiers. MUST land before the file-tree facets in US1/US3.

**⚠️ CRITICAL**: The `.kps` reader blocks `platform-coverage`, `font-dependency`, `license-fork-eligibility`, `declared-bcp47-tags`, and `package-completeness`.

- [x] T004 Add a shared `.kps` reader at `utilities/facet-index/kps-reader.ts` exposing `<Files>` extensions, `<Languages>` tags, `<Font>`/`.ttf`/`.otf` presence, `<LicenseFile>` presence, and package-file presence (OSK `.kvks`, `welcome.htm`, `.model.ts`, icon) — reading only in-repo file contents, returning fallback-safe empties for a missing/malformed `.kps` (Edge Cases; FR-004). Skip if an equivalent reader already exists (T001 finding) and reuse it instead.
- [x] T005 [P] Add a `.test.ts` for `utilities/facet-index/kps-reader.ts` covering the corpus `.kps` dialect (verified against `bambara.kps` — no `<Targets>` element) and the missing/malformed-`.kps` fallback path.

**Checkpoint**: Shared corpus reads available — user-story facets can now be built.

---

## Phase 3: User Story 1 - Strategy-selector facets (Priority: P1) 🎯 MVP

**Goal**: Surface, per base, the four §7.2-selector signals the index lacks today — the base's own dominant strategy, its distance from stock (axis A1), where it runs, and whether it depends on a bundled font.

**Independent Test**: Rebuild with `--classified-only`; confirm `lineage.primary-strategy`, `lineage.added-char-count`, `source.platform-coverage`, `source.font-dependency` appear per corpus keyboard with a dominant value, provenance tier, and (consistency < 1) exception sites — against `fx_latin`/`fx_arabic` fixtures and the `docs/keyboard-index.md` corpus, without touching P2/P3 facets.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [x] T006 [P] [US1] `primary-strategy` classifier test in `utilities/facet-index/primary-strategy-classifier.test.ts` — mode of the per-keyboard strategy vector, honest `mixed` on a tie (FR-010; AS #1, Edge Case "Ambiguous strategy mode").
- [x] T007 [P] [US1] `added-char-count` classifier test in `utilities/facet-index/added-char-count-classifier.test.ts` — count = `|produced-set \ kbdus-base-layout-set|` banded to axis A1 (FR-011; AS #2).
- [x] T008 [P] [US1] `platform-coverage` classifier test in `utilities/facet-index/platform-coverage-classifier.test.ts` — `.kmx`→desktop, `.js`→web, `.keyman-touch-layout`→touch; no `<Targets>`, no OS labels (FR-012; AS #3).
- [x] T009 [P] [US1] `font-dependency` classifier test in `utilities/facet-index/font-dependency-classifier.test.ts` — `system-font-reliant` iff bundled `.ttf`/`.otf` **and** `.kmn` `<Font>` store; else `self-contained` (FR-013; AS #4).

### Implementation for User Story 1

- [x] T010 [P] [US1] Implement `utilities/facet-index/primary-strategy-classifier.ts` as a `{ classify, fallback }` pair — mode of the recognizer per-keyboard strategy tally, `mixed` on a tie with the tied set recorded in exception data; distinct from `lineage.strategy-fingerprint` (FR-010).
- [x] T011 [P] [US1] Implement `utilities/facet-index/added-char-count-classifier.ts` — diff produced-set (incl. spec-040 fall-through) against `utilities/facet-index/data/base-layouts.json`; emit axis-A1 band as `value`, raw count via `evidenceSize`/`notes` (FR-011).
- [x] T012 [P] [US1] Implement `utilities/facet-index/platform-coverage-classifier.ts` — modality set from `kps-reader` `<Files>` extensions; fallback tier on missing `.kps` (FR-012, T004).
- [x] T013 [P] [US1] Implement `utilities/facet-index/font-dependency-classifier.ts` — combine `kps-reader` font-file presence with `.kmn` IR `<Font>` store reference (FR-013, T004).
- [x] T014 [P] [US1] Author `content/keyboard-facets/primary-strategy.yaml` — `valueType: enum`, values `S-01`..`S-13` + `mixed`, real `derivation.classifierId: primary-strategy`, `feedsSessionFacets: [lineage.primary-strategy]`, fallback chain, `schemaVersion: 1` (FR-040).
- [x] T015 [P] [US1] Author `content/keyboard-facets/added-char-count.yaml` — scalar + axis-A1 band domain, real classifierId, `feedsSessionFacets: [lineage.added-char-count]`.
- [x] T016 [P] [US1] Author `content/keyboard-facets/platform-coverage.yaml` — `valueType: set`, values `{desktop, web, touch}`, real classifierId, `feedsSessionFacets: [source.platform-coverage]`.
- [x] T017 [P] [US1] Author `content/keyboard-facets/font-dependency.yaml` — `valueType: enum`, values `{self-contained, system-font-reliant}`, real classifierId, `feedsSessionFacets: [source.font-dependency]`.
- [x] T018 [P] [US1] Author session mirror `content/facets/lineage/primary-strategy.yaml` following `content/facets/source/fallback-posture.yaml` shape (family, valueType, values, derivations, consumers, `status: candidate`, transform/policy/invertibility/implications) (FR-006).
- [x] T019 [P] [US1] Author session mirror `content/facets/lineage/added-char-count.yaml` (same shape).
- [x] T020 [P] [US1] Author session mirror `content/facets/source/platform-coverage.yaml` (same shape).
- [x] T021 [P] [US1] Author session mirror `content/facets/source/font-dependency.yaml` (same shape).
- [x] T022 [US1] Register the four US1 pairs in `DEFAULT_CLASSIFIERS` in `utilities/facet-index/build-index.ts`, keyed by facet id (depends on T010–T013).
- [x] T023 [US1] Rebuild the artifact with `--classified-only` and run `pnpm --filter facet-index test` (or the tool's vitest), `pnpm run facet-lint`, `pnpm run facet-index-lint`; regenerate `docs/keyboard-facet-index.json` (+ `.md`) as build artifacts (FR-040/FR-041; AS #5).

**Checkpoint**: US1 is the MVP — the four selector facets appear per base; SC-006 (rank by primary-strategy match + A1 distance) is satisfiable from index facets alone.

---

## Phase 4: User Story 2 - Writing-system matching facets (Priority: P2)

**Goal**: Surface how close a base's writing-system capability is to a target orthography — diacritic mechanism (A4), inputtable combining marks, spare-key budget (A7), and orthography coverage ratio.

**Independent Test**: Rebuild; confirm the four facets appear with correct values on family-appropriate fixtures, `combining-mark-repertoire` = `not-applicable` on abugida/abjad and `orthography-coverage-ratio` = `not-derivable` where no CLDR exemplar set — without the P1 facets.

### Setup for User Story 2

- [ ] T024 [US2] Add the pinned CLDR `exemplarCharacters` snapshot at `utilities/facet-index/data/cldr-exemplars.json` (BCP47/CLDR locale → exemplar char set) and record its version + sha256 in `utilities/facet-index/data/SOURCES.json` (Decision from research.md; FR-023, FR-004).

### Tests for User Story 2 ⚠️ (write first, ensure they fail)

- [ ] T025 [P] [US2] `diacritic-mechanism` classifier test in `utilities/facet-index/diacritic-mechanism-classifier.test.ts` — multiple independent combining-mark stores → `stacking-combining`; overwriting/cycling deadkey store → `replacing-cycling` (FR-020; AS #1).
- [ ] T026 [P] [US2] `combining-mark-repertoire` classifier test in `utilities/facet-index/combining-mark-repertoire-classifier.test.ts` — records the combining-mark set on alphabetic bases; `not-applicable` on abugida/abjad, gated by script-family (FR-021; AS #2).
- [ ] T027 [P] [US2] `spare-key-budget` classifier test in `utilities/facet-index/spare-key-budget-classifier.test.ts` — `{many, ralt-only, fully-booked}` counting unbound key+modifier slots after excluding reserved combos (FR-022; AS #3).
- [ ] T028 [P] [US2] `orthography-coverage-ratio` classifier test in `utilities/facet-index/orthography-coverage-ratio-classifier.test.ts` — 0.0–1.0 ratio + missing-char set vs the pinned CLDR set; `not-derivable` on no exemplar set (distinct from 0.0) (FR-023; AS #4, Edge Cases).

### Implementation for User Story 2

- [ ] T029 [P] [US2] Implement `utilities/facet-index/diacritic-mechanism-classifier.ts` — classify IR deadkey/store rewrite-rule shape into `{stacking-combining, replacing-cycling, multi-family, none}` (axis A4), following the spec-037 rule-structure classifier pattern (FR-020).
- [ ] T030 [P] [US2] Implement `utilities/facet-index/combining-mark-repertoire-classifier.ts` — derive the inputtable combining-mark set from the produced-set; apply the script-family applicability guard (inline ISO 15924 derivation per plan sequencing note, superseded by the registered `script-family` facet in US3), emitting `not-applicable` for abugida/abjad (FR-021).
- [ ] T031 [P] [US2] Implement `utilities/facet-index/spare-key-budget-classifier.ts` — count unbound key+modifier-plane slots in the base IR, excluding reserved system combos (axis A7) (FR-022).
- [ ] T032 [P] [US2] Implement `utilities/facet-index/orthography-coverage-ratio-classifier.ts` — compare produced-set against `data/cldr-exemplars.json` for the declared BCP47 tag; emit ratio + missing-char set (exception data), `not-derivable` when no key exists (FR-023, T024).
- [ ] T033 [P] [US2] Author `content/keyboard-facets/diacritic-mechanism.yaml` — enum `{stacking-combining, replacing-cycling, multi-family, none}`, real classifierId, `feedsSessionFacets: [construction.diacritic-mechanism]`.
- [ ] T034 [P] [US2] Author `content/keyboard-facets/combining-mark-repertoire.yaml` — set valueType + `not-applicable` sentinel, real classifierId, **no** `feedsSessionFacets` (keyboard.*-only, FR-006).
- [ ] T035 [P] [US2] Author `content/keyboard-facets/spare-key-budget.yaml` — enum `{many, ralt-only, fully-booked}`, real classifierId, `feedsSessionFacets: [construction.spare-key-budget]`.
- [ ] T036 [P] [US2] Author `content/keyboard-facets/orthography-coverage-ratio.yaml` — scalar `0.0`–`1.0` + `not-derivable` sentinel, real classifierId, **no** `feedsSessionFacets` (keyboard.*-only).
- [ ] T037 [P] [US2] Author session mirror `content/facets/construction/diacritic-mechanism.yaml` (construction/source-family mirror per spec-041 convention; create the `construction/` dir if absent).
- [ ] T038 [P] [US2] Author session mirror `content/facets/construction/spare-key-budget.yaml` (same shape).
- [ ] T039 [US2] Register the four US2 pairs in `DEFAULT_CLASSIFIERS` in `utilities/facet-index/build-index.ts` (depends on T029–T032).
- [ ] T040 [US2] Rebuild with `--classified-only`, run the facet-index test suite + `pnpm run facet-lint` + `pnpm run facet-index-lint`, and regenerate `docs/keyboard-facet-index.json` (+ `.md`) (FR-040/FR-041; AS #5, SC-004).

**Checkpoint**: US1 + US2 both independently functional; writing-system matching facets present with honest `not-applicable`/`not-derivable` sentinels.

---

## Phase 5: User Story 3 - Eligibility & enricher facets (Priority: P3)

**Goal**: Add the fork-eligibility hard gate plus four cheap enrichers — directionality, script-family (the durable US2 guard), declared BCP47 tags with claim-vs-actual cross-check, and package completeness.

**Independent Test**: Rebuild; confirm the five facets appear per base — permissive license → `permissive`, RTL base → `rtl`, abugida → `abugida`, and a `.kps` claiming more languages than its rules produce is flagged by the claim-vs-actual cross-check.

### Setup for User Story 3

- [ ] T041 [P] [US3] Add the known-license signature table at `utilities/facet-index/data/known-licenses.json` (`LICENSE.md` header signature → `{permissive, copyleft, proprietary-restricted}`); record it in `SOURCES.json` if treated as a pinned dataset (FR-030).
- [ ] T042 [P] [US3] Add the ISO 15924 → script-family lookup at `utilities/facet-index/data/iso15924-script-family.json` (`{alphabet, abugida, abjad, syllabary, logographic}`) (FR-032).

### Tests for User Story 3 ⚠️ (write first, ensure they fail)

- [ ] T043 [P] [US3] `license-fork-eligibility` classifier test in `utilities/facet-index/license-fork-eligibility-classifier.test.ts` — known permissive header → `permissive`; missing/off-template → `unspecified`, never inferred (FR-030; AS #1, Edge Cases).
- [ ] T044 [P] [US3] `directionality` classifier test in `utilities/facet-index/directionality-classifier.test.ts` — RTL produced script → `rtl`; both directions → `bidi-aware` (FR-031; AS #2).
- [ ] T045 [P] [US3] `script-family` classifier test in `utilities/facet-index/script-family-classifier.test.ts` — ISO 15924 → family via lookup, and the value correctly guards `combining-mark-repertoire` (FR-032; AS #3).
- [ ] T046 [P] [US3] `declared-bcp47-tags` classifier test in `utilities/facet-index/declared-bcp47-tags-classifier.test.ts` — surfaces `.kps` `<Languages>` claims and flags claim-vs-actual mismatch as an exception (FR-033; AS #4).
- [ ] T047 [P] [US3] `package-completeness` classifier test in `utilities/facet-index/package-completeness-classifier.test.ts` — absorbs OSK `.kvks`, `welcome.htm`, `.model.ts`, icon presence into one checklist facet (FR-034; AS #5).

### Implementation for User Story 3

- [ ] T048 [P] [US3] Implement `utilities/facet-index/license-fork-eligibility-classifier.ts` — match `LICENSE.md` header against `data/known-licenses.json` + `.kps` `<LicenseFile>` presence (via `kps-reader`); `unspecified` on no match (FR-030, T004, T041).
- [ ] T049 [P] [US3] Implement `utilities/facet-index/directionality-classifier.ts` — from produced script set + RTL layout metadata; `bidi-aware` when both directions produced (FR-031).
- [ ] T050 [P] [US3] Implement `utilities/facet-index/script-family-classifier.ts` — ISO 15924 code → family via `data/iso15924-script-family.json`; export the guard so `combining-mark-repertoire` consumes the registered facet (FR-032, T042).
- [ ] T051 [P] [US3] Implement `utilities/facet-index/declared-bcp47-tags-classifier.ts` — read `.kps` `<Languages>` (via `kps-reader`) and cross-check claimed tags against produced characters, flagging mismatches as exceptions (FR-033, T004).
- [ ] T052 [P] [US3] Implement `utilities/facet-index/package-completeness-classifier.ts` — checklist over OSK `.kvks`, `welcome.htm`, `.model.ts`, icon presence (via `kps-reader`) (FR-034, T004).
- [ ] T053 [P] [US3] Author `content/keyboard-facets/license-fork-eligibility.yaml` — enum `{permissive, copyleft, proprietary-restricted, unspecified}`, real classifierId, `feedsSessionFacets: [env.license-fork-eligibility]`.
- [ ] T054 [P] [US3] Author `content/keyboard-facets/directionality.yaml` — enum `{ltr, rtl, bidi-aware}`, real classifierId, **no** `feedsSessionFacets` (keyboard.*-only).
- [ ] T055 [P] [US3] Author `content/keyboard-facets/script-family.yaml` — enum `{alphabet, abugida, abjad, syllabary, logographic}`, real classifierId, **no** `feedsSessionFacets` (keyboard.*-only).
- [ ] T056 [P] [US3] Author `content/keyboard-facets/declared-bcp47-tags.yaml` — set valueType, real classifierId, `feedsSessionFacets: [source.declared-bcp47-tags]`.
- [ ] T057 [P] [US3] Author `content/keyboard-facets/package-completeness.yaml` — set/checklist `{osk, help, predictive, icon}`, real classifierId, `feedsSessionFacets: [source.package-completeness]`.
- [ ] T058 [P] [US3] Author session mirror `content/facets/env/license-fork-eligibility.yaml` (fallback-posture shape).
- [ ] T059 [P] [US3] Author session mirror `content/facets/source/declared-bcp47-tags.yaml` (same shape).
- [ ] T060 [P] [US3] Author session mirror `content/facets/source/package-completeness.yaml` (same shape).
- [ ] T061 [US3] Register the five US3 pairs in `DEFAULT_CLASSIFIERS` in `utilities/facet-index/build-index.ts`; re-point `combining-mark-repertoire`'s guard at the now-registered `script-family` facet (depends on T048–T052, T030).
- [ ] T062 [US3] Rebuild with `--classified-only`, run the facet-index test suite + `pnpm run facet-lint` + `pnpm run facet-index-lint`, and regenerate `docs/keyboard-facet-index.json` (+ `.md`) (FR-040/FR-041; AS #5).

**Checkpoint**: All 13 facets present; SC-001 (13 new facets, zero `planned`) and SC-004 (sentinels hold) satisfiable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T063 Verify determinism (SC-003): rebuild `docs/keyboard-facet-index.json` twice against the same corpus commit and confirm byte-identical output; confirm no classifier reads git history or the network (FR-004).
- [ ] T064 [P] Confirm every emitted value carries provenance tier + consistency + (consistency < 1) exception sites with cause tags across the corpus (SC-002); spot-check the `--classified-only` index for the P1/P2/P3 facets.
- [ ] T065 [P] Confirm the default (non-`--classified-only`) build still fails loud on a `planned` def with no classifier (Edge Case) after all 13 defs carry real classifierIds.
- [ ] T066 [P] Update `docs/keyboard-facet-index.md` prose companion and the facet-index README/CLAUDE.md architecture line if the facet count is quoted (16 → 29 keyboard-facets); keep the phonebook current if any new keyboard is referenced by fixtures.
- [ ] T067 Full gate: `pnpm typecheck`, `pnpm -r test`, `pnpm lint` (which runs `facet-lint` + `facet-index-lint`) all green (FR-041; SC-003).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: No dependencies — inspection only.
- **Foundational (Phase 2)**: Depends on Setup. The `kps-reader` (T004) BLOCKS `platform-coverage`, `font-dependency`, `license-fork-eligibility`, `declared-bcp47-tags`, `package-completeness`.
- **US1 (Phase 3)**: Depends on Foundational. MVP — shippable alone.
- **US2 (Phase 4)**: Depends on Foundational. Independently testable; `combining-mark-repertoire` derives script-family inline until US3 registers the durable guard.
- **US3 (Phase 5)**: Depends on Foundational. `script-family` (T050/T061) is the durable guard `combining-mark-repertoire` re-points at (T061).
- **Polish (Phase 6)**: Depends on all desired stories being complete.

### Cross-story sequencing note (from plan.md)

`script-family` (P3, FR-032) is the guard for `combining-mark-repertoire` (P2, FR-021). Per plan, the P2 classifier derives script-family **inline** so US2 does not block on US3; the registered `script-family` facet is the durable guard, wired in at T061. Each user story remains independently testable.

### Within each user story

- Tests (T006–T009 / T025–T028 / T043–T047) written first and failing before implementation.
- Classifier modules → facet-def YAML → session mirrors can all proceed in parallel ([P]); registration (T022/T039/T061) depends on the classifier modules; index regen (T023/T040/T062) depends on registration + defs.

### Parallel opportunities

- Phase 1 T002/T003 in parallel; Phase 2 T005 parallel to nothing blocking.
- Within a story, every [P] test, [P] classifier, [P] YAML def, and [P] session mirror touches a distinct file → all parallelizable. Registration and index-regen are the serial joins.
- With staffing, US1/US2/US3 classifier+YAML work can proceed concurrently once Foundational is done (the only cross-story join is T061 re-pointing the guard).

---

## Parallel Example: User Story 1

```bash
# Tests first (distinct files):
Task: "primary-strategy test in utilities/facet-index/primary-strategy-classifier.test.ts"
Task: "added-char-count test in utilities/facet-index/added-char-count-classifier.test.ts"
Task: "platform-coverage test in utilities/facet-index/platform-coverage-classifier.test.ts"
Task: "font-dependency test in utilities/facet-index/font-dependency-classifier.test.ts"

# Then classifiers + YAML defs + mirrors (distinct files) in parallel:
Task: "Implement primary-strategy-classifier.ts"
Task: "Implement added-char-count-classifier.ts"
Task: "Author content/keyboard-facets/primary-strategy.yaml"
Task: "Author content/facets/lineage/primary-strategy.yaml"
# ... then join: register in DEFAULT_CLASSIFIERS (T022), rebuild + lint (T023)
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (`kps-reader`).
2. Phase 3 US1: the four selector facets (`primary-strategy`, `added-char-count`, `platform-coverage`, `font-dependency`).
3. **STOP and VALIDATE**: rebuild `--classified-only`, run the facet-index tests + both lints; confirm SC-006 rankability. This is the shippable increment for this conversation (constitution one-conversation-per-phase).

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. US1 → validate → ship (MVP).
3. US2 → validate → ship (adds CLDR pin + matching facets).
4. US3 → validate → ship (adds eligibility gate + enrichers + durable script-family guard).

Each story adds value without breaking the previous; all 13 facets carry real `classifierId`s and honest sentinels by the end.

---

## Notes

- [P] = distinct files, no dependency on an incomplete task.
- Measurement only (FR-042 / NG-002): no value-transition/rewrite logic — that is spec 039.
- No new TS types (data-model.md); classifiers emit the existing `Categorization` shape.
- `docs/keyboard-facet-index.json` (+ `.md`) are build artifacts — regenerate with `--classified-only`, never hand-edit.
- Determinism is a hard gate: in-repo file contents only; no git history, no network (FR-004 / SC-003).
