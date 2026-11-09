# Tasks: Language tags that describe dialects and variants

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md), contracts: [bcp47-parser.md](contracts/bcp47-parser.md), [langtags-api.md](contracts/langtags-api.md), [dialect-search-and-question.md](contracts/dialect-search-and-question.md)

**Tests**: included. The spec's success criteria are measurements (SC-001 to SC-007), and the contracts give their behaviour as test tables, so each story writes its failing tests first.

**Format**: `- [ ] T### [P?] [US#?] Description — file(s)`. `[P]` = different files from the other open tasks in its wave and no dependency on them. Story phases follow the dependency order below, not strictly the spec's numbering: US3's minimal tag is needed by US2.

**Commit cadence**: one commit per phase, pushed to `115-dialect-language-tags` when its checkpoint is green (CLAUDE.md). Commit messages name the tasks (`spec 115 T001-T009`).

---

## Phase 1: Setup

- [ ] T001 Add `language-subtag-registry` at exactly `0.4.2` (no range) as a root devDependency and refresh the lockfile — package.json, pnpm-lock.yaml

---

## Phase 2: Foundational (blocks every story)

The parser, the shared types and the three generated data sources. Nothing here changes behaviour an author sees.

**Wave 1 — independent:**

- [ ] T002 [P] Write failing tests for `parseBcp47`, `formatBcp47`, `isWellFormedBcp47`, `scriptSubtagOf` and `regionSubtagOf`, one per row of the table in contracts/bcp47-parser.md. Replace the `scriptSubtagOf("lif-x-Deva") === "Deva"` assertion with `undefined`, and add `buu-x-koya`, `kqe-x-east` and `en-u-co-phon` → `undefined` (research R1) — packages/contracts/src/utils/bcp47.test.ts
- [ ] T003 [P] Add the types `Bcp47Parts`, `Bcp47ParseError`, `SearchMatch`, `DialectTagset` and `VariantEntry`, and the optional `match?: SearchMatch` on `LanguageSummary`, as specified in data-model.md. Additive only; no `Pattern` or `Criterion` change — packages/contracts/src/langtags.ts, packages/contracts/src/utils/bcp47.ts
- [ ] T004 [P] Write `scripts/codegen-variants.mjs`. It reads `language-subtag-registry/data/json/variant.json` and writes 134 rows `{subtag, descriptions, prefixes, deprecated}`, sorted by subtag, with a header naming the package version and `File-Date`. Add `codegen-variants` to the root scripts and to `prebuild`, after `codegen-langtags` — scripts/codegen-variants.mjs, package.json, packages/engine/src/langtags/generated/variants.ts
- [ ] T005 [P] Change `scripts/codegen-langtags.mjs`:
  - stop folding non-bare tagsets into `regionVariants` (:110-124);
  - emit `generated/dialects.ts`, one row per variant or `-x-` tagset (229) with the fields in data-model.md § DialectTagset;
  - add `windows` as a sixth column of the `tagsets.ts` rows (:323-333).

  Files: scripts/codegen-langtags.mjs, packages/engine/src/langtags/generated/{dialects,tagsets,index}.ts
- [ ] T006 [P] Change `scripts/codegen-glottolog.mjs`:
  - keep `Countries` on language and dialect records;
  - emit `src/generated/dialects.ts`, one row per dialect whose `Language_ID` parent has an ISO code (13,392), with `[name, folded, glottocode, parentIso, countries]`;
  - fold names as NFD, drop combining marks, lowercase;
  - take countries from the dialect, else from the parent.

  Files: scripts/codegen-glottolog.mjs, packages/glottolog/src/generated/dialects.ts, packages/glottolog/src/types.ts

**Wave 2 — after wave 1:**

- [ ] T007 Implement `parseBcp47`, `formatBcp47`, `isWellFormedBcp47` and `regionSubtagOf` (moved from keyboard-lint), and rewrite `scriptSubtagOf` on the parser, until T002 passes. Pure TS, with no JSON or data import (`/api` bundle safety) — packages/contracts/src/utils/bcp47.ts
- [ ] T008 [P] Extend the codegen determinism test to cover `tagsets.ts`, `dialects.ts` and `variants.ts`: sorted, stable, row counts 9596, 229 and 134 at the pinned inputs. It skips visibly when inputs are absent — packages/engine/src/langtags/codegen-determinism.test.ts
- [ ] T009 [P] Add the `./dialects` subpath export (types and import) and a `dialects.ts` entry that re-exports the generated rows. Do not import it from `src/index.ts`, so the main entry's bundle is unchanged — packages/glottolog/package.json, packages/glottolog/src/dialects.ts, packages/glottolog/tsconfig.json (if the entry needs listing)

**Checkpoint**: `pnpm build` green, and the contracts parser tests pass. `scriptSubtagOf` callers still compile (signature unchanged). Commit: `spec 115 T001-T009`.

---

## Phase 3: User Story 5 — Existing tags survive intact (P2)

**Goal**: no reader treats a subtag after `-x-`/`-u-` as script or region, and no output strips variants, extensions or private use (FR-024, FR-025).

**Independent test**: a fixture `.kps` listing `en-US-x-twain` and `fr-u-co-phonebk` reads script none for both; the LDML export, package and help docs keep both tags whole.

Runs straight after Phase 2. It is the smallest shippable slice, and it fixes shipped defects.

**Wave 1 — tests:**

- [ ] T010 [P] [US5] Write a failing round-trip test: a fixture `.kps` with `en-US-x-twain` and `fr-u-co-phonebk` goes through Open and comes out in `.kps`, help docs and LDML with both tags unchanged — packages/engine/src/ldml-export/lower/document.test.ts, packages/engine/src/start-browser/kps-parser.test.ts
- [ ] T011 [P] [US5] Write failing lint tests: `tagUsesRegion001("en-x-001")` is false; `regionSubtagOf("zh-yue-HK")` is `HK` — packages/keyboard-lint/src/checks/criteria/check-bcp47.test.ts

**Wave 2 — move every reader onto the parser (different files):**

- [ ] T012 [P] [US5] `extractScriptSubtag` becomes a re-export of `scriptSubtagOf` — packages/engine/src/start-browser/kps-parser.ts
- [ ] T013 [P] [US5] Make `minimalLocale` keep private use and extensions. Interim fix: split off the singleton tail, minimise the head, and re-append the tail. It is replaced by `minimalTagOf` in T028 — packages/engine/src/ldml-export/lower/document.ts
- [ ] T014 [P] [US5] `regionSubtagOf` and `tagUsesRegion001` use the contracts parser; delete the local copy — packages/keyboard-lint/src/checks/criteria/check-bcp47.ts, packages/keyboard-lint/src/checks/criteria/check-currency.ts
- [ ] T015 [P] [US5] Replace the mirror `regionSubtagOf` and the region reader in base layouts with the contracts parser — packages/studio/src/criteria/assembleLintContext.ts, packages/studio/src/components/rules/baseLayouts.ts
- [ ] T016 [P] [US5] Replace `BCP47_SHAPE`, `isScript`, `isRegion` and the `.slice(1).find(isScript)` scan with parser calls — packages/studio/src/criteria/languageTags.ts
- [ ] T017 [P] [US5] Replace the shape regex with `isWellFormedBcp47` — packages/studio/src/survey/questions/docLanguageTag.ts
- [ ] T018 [P] [US5] Use `scriptSubtagOf` from contracts in the facet-index utilities (their own test invocation, docs/tooling.md) — utilities/facet-index/build-index.ts, utilities/facet-index/declared-bcp47-tags-classifier.ts

**Checkpoint**: T010 and T011 pass. contracts, engine, keyboard-lint and studio vitest are green. A facet-index rebuild produces an unchanged index: the corpus has no `-x-` tags, so any difference is a bug. Commit: `spec 115 T010-T018`.

---

## Phase 4: User Story 1 — Find a language by a dialect name (P1)

**Goal**: dialect names find their parent language, and each result says why it matched (FR-001 to FR-006).

**Independent test**: "Sursilvan", "Maprik", "Rabinal", "Gascon" and "Valencian" each return their parent with a match line; language-name queries are unchanged.

**Wave 1 — tests:**

- [ ] T019 [P] [US1] Write failing `lookupByName` tests:
  - diacritic folding;
  - an exact-name tier ahead of prefix;
  - langtags dialect rows (`Rabinal` → `acr` with a `match`);
  - "Gheg" → `aln` ranked first.

  Add a snapshot test of the top result for 200 language-name queries sampled from `listLanguages()` with a fixed seed (SC-007).

  File: packages/engine/src/langtags/index.test.ts
- [ ] T020 [P] [US1] Write failing `searchDialects` tests: exact, prefix and substring tiers; queries shorter than 3 characters return `[]`; countries fall back to the parent's; "Gascon" → `oci`, `gasc1240`, `[ES, FR]` — packages/glottolog/src/dialects.test.ts
- [ ] T021 [P] [US1] Write failing composition tests for `languageResultsFor`:
  - the merged ranking tiers (FR-003);
  - macrolanguage parents mapped (`cmn` → `zh`, `arb` → `ar`);
  - an unresolvable parent as a fallback row;
  - multi-parent prefix hits listed with countries (FR-004);
  - the dialect index not loaded when there are 5 or more language hits.

  Add the SC-001 measurement (at least 95% of the 13,392 dialects have their parent in the top 5) and the SC-002 measurement (229/229 langtags dialect tagsets reachable), printed and asserted.

  File: packages/studio/src/survey/resolveTypedLanguage.test.ts

**Wave 2 — implementation:**

- [ ] T022 [P] [US1] In `lookupByName`: fold the query and names; add an exact-name tier after exact code; search `generated/dialects.ts` names after language rows, returning the parent's summary with `match` (relation `variety` for variant tagsets, `dialect` for `-x-`, `alias` for alternate names). Ordering for queries without a match is unchanged — packages/engine/src/langtags/index.ts, packages/engine/src/langtags/dialects.ts
- [ ] T023 [P] [US1] Implement `searchDialects(query, limit)` over the generated rows — packages/glottolog/src/dialects.ts

**Wave 3 — after wave 2:**

- [ ] T024 [US1] Make `languageResultsFor` compose engine and glottolog search per contracts/dialect-search-and-question.md § Studio search composition:
  - load `@keyboard-studio/glottolog/dialects` lazily, with a dynamic `import()`;
  - map parents through macrolanguage canonicalisation;
  - add fallback rows;
  - de-duplicate by stronger tier;
  - cap at 50.

  The headless path uses the same function.

  Files: packages/studio/src/survey/resolveTypedLanguage.ts, packages/studio/src/lib/langtagsDefaults.ts
- [ ] T025 [US1] Render the match line in result labels (`Gascon: a dialect of Occitan (oc) · ES, FR`; `Valencian: a variety of Catalan (ca)`; `also called …`). The accessible name carries both lines (spec 056); new strings get message ids (spec 046) — packages/studio/src/survey/QuestionField.tsx, packages/studio/src/locales/ (message catalog per packages/studio/CLAUDE.md)

**Checkpoint**: T019 to T021 pass; SC-001, SC-002 and SC-007 are printed. Check the bundle: the glottolog dialect chunk is separate and absent from the initial load (`pnpm --filter @keyboard-studio/studio build`, then inspect the chunk list). Commit: `spec 115 T019-T025`.

---

## Phase 5: User Story 3 — The emitted tag names only what is not a default (P1)

**Goal**: every emitted tag is minimal against the pinned langtags, and any language can carry a region (FR-014 to FR-018).

**Independent test**: the table in spec US3 (`ca-valencia`, `sr-Latn`, `fr-CA`, `bfd`, `acr-x-rabinal`).

**Wave 1 — tests:**

- [ ] T026 [P] [US3] Write failing `minimalTag` and `minimalTagOf` tests: every row of the table in contracts/langtags-api.md (including `ca + Latn + AD + valencia` → `ca-AD-valencia` and `oc + FR + gascon` → `oc-gascon`), plus the SC-003 property test over all 9,596 tagsets — packages/engine/src/langtags/minimalTag.test.ts
- [ ] T027 [P] [US3] Write failing studio tests:
  - `buildTargetBcp47` delegates to `minimalTag`, with a region equal to the default omitted;
  - "Specify a region…" routes `il_language_region` for a single-region language;
  - existing walks route no new screen (research R9).

  Files: packages/studio/src/survey/targetBcp47.test.ts, packages/studio/src/survey/identityResolution.test.ts

**Wave 2 — implementation:**

- [ ] T028 [US3] Implement `minimalTag(choice)` and `minimalTagOf(tag)`.
  - Key the lookup on (canonical language, variants, private use) from `parseBcp47`. Use the dialect tagset, else the bare tagset; never `resolveLangtag`'s string fallback (research R2).
  - Return the tagset `tag` on an exact match. Otherwise omit script and region where each equals that tagset's default.
  - Carry extensions through untouched.
  - Export both from the langtags barrel.
  - Replace `minimalLocale` with `minimalTagOf` at `document.ts:286` and `ldml-export/package.ts:58`.

  Files: packages/engine/src/langtags/minimalTag.ts, packages/engine/src/langtags/index.ts, packages/engine/src/ldml-export/lower/document.ts, packages/engine/src/ldml-export/package.ts
- [ ] T029 [US3] Make `buildTargetBcp47` call `minimalTag`, with a new optional `dialectSubtag` parameter (empty until US2). Delete the private `isSuppressedScript`, and keep `fonipa` and `romanization-Latn` as inputs mapped to parts — packages/studio/src/survey/targetBcp47.ts
- [ ] T030 [US3] Region on demand (research R9):
  - Add a "Specify a region…" link on the identity screen. It sets the routing input `ctx.ilRegionRequested`.
  - `il_language_region` routes when `hasRegionVariants` or `ilRegionRequested`.
  - Options: the default region first (marked), the other langtags regions, then "Other region…" (any ISO 3166-1 code).
  - New help text.
  - A region with no regional variant skips the autonym and script narrowing in `onAnswerCommit`.

  Files: packages/studio/src/survey/identityResolution.ts, packages/studio/src/survey/IdentityLite.tsx, packages/studio/src/survey/questions/a/il_language_region.ts, packages/studio/src/survey/questions/a/il_language_english.ts

**Checkpoint**:
- T026 and T027 pass.
- The golden-walk e2e passes unchanged; existing walks gain no screen.
- `.kps`, help docs and LDML carry the same tag for the same choice (FR-018), asserted in the T027 tests via `deriveIdentityResult`.

Commit: `spec 115 T026-T030`.

---

## Phase 6: User Story 2 — The keyboard records the dialect in its tag (P1)

**Goal**: picking a dialect, or typing one, yields a confirmed dialect subtag in the tag, with the glottocode saved (FR-007 to FR-013, FR-018).

**Independent test**: Gascon → `oc-gascon` (registered variant); Rabinal → `acr-x-rabinal` (langtags); Aranese → `oc-x-aranese` (from the name); the `.kps` lists exactly one `<Language>`.

**Wave 1 — tests and data helpers:**

- [ ] T031 [P] [US2] Write failing tests for `variantEntry`, `variantsFor(tag)`, `variantAllowed(tag, variant)` and `dialectTagsetsFor(language)`: `gascon` allowed after `oc` and not after `en`; `1994` allowed only after `sl-rozaj…`; `biske` only after `sl-rozaj` — packages/engine/src/langtags/variants.test.ts, packages/engine/src/langtags/dialects.test.ts
- [ ] T032 [P] [US2] Write failing proposal tests (data-model.md § DialectProposal):
  - the preference order registered variant → langtags → made from the name;
  - the variant linked by folded description plus allowed prefix;
  - the made-from-name rule (NFD, ASCII, at most 8 characters, `x-dialect` when empty, a disambiguating digit on collision);
  - an ill-formed edit blocked with the parser's reason.

  File: packages/studio/src/survey/dialectProposal.test.ts
- [ ] T033 [P] [US2] Write failing decision tests:
  - the new DecisionIds persist through the draft snapshot and resume;
  - `deriveIdentityResult` composes `oc-gascon`;
  - changing `language-code` re-proposes `language-dialect` via `recalculate` (`asked` → `offered` + `reproposed`; FR-013);
  - a confirmed dialect yields one package language, not a second bare-parent entry (FR-018).

  File: packages/studio/src/decisions/identitySelectors.test.ts

**Wave 2 — implementation:**

- [ ] T034 [P] [US2] Implement `variantEntry`, `variantsFor` and `variantAllowed` (prefix rule in data-model.md § VariantEntry), plus `dialectTagsetsFor`; export them from the langtags barrel — packages/engine/src/langtags/variants.ts, packages/engine/src/langtags/dialects.ts, packages/engine/src/langtags/index.ts
- [ ] T035 [P] [US2] Add the DecisionIds `language-search-match`, `language-dialect`, `language-dialect-source` and `language-glottocode` (IR paths `[]`). Read them in `deriveIdentityResult` into `LanguageChoice`, and add an `IDENTITY_QUESTIONS` row — packages/studio/src/decisions/decisionTypes.ts, packages/studio/src/decisions/identitySelectors.ts, packages/studio/src/survey/identityLiteResult.ts
- [ ] T036 [P] [US2] Add `glottocode?` to the identity patch, filled from the decision — packages/studio/src/stores/identityPatch.ts, packages/studio/src/lib/identityLanguagePatch.ts

**Wave 3 — after wave 2:**

- [ ] T037 [US2] Implement `proposeDialect(choice, searchMatch)` per T032, using T034's helpers and `parseBcp47` — packages/studio/src/survey/dialectProposal.ts
- [ ] T038 [US2] Record the chosen search match as the `language-search-match` decision on pick, instead of keeping it only in closure state. Clear it when the author picks a language without a match — packages/studio/src/survey/identityResolution.ts, packages/studio/src/survey/QuestionField.tsx
- [ ] T039 [US2] Create the question module `il_language_dialect` (contracts/dialect-search-and-question.md § Question module).
  - Declaration: `provides: ["language-dialect"]`; `requires: ["language-code", "target-script", "language-region"]`; optional; `outputs` bcp47; `lookupDefault` → `proposeDialect`.
  - Add it to `flowModules.identity_lite` and to `SEEDED_QUESTIONS`.
  - Place its `next` routing edges; order comes only from `orderDecisions` (Article IX).

  Files: packages/studio/src/survey/questions/a/il_language_dialect.ts, packages/studio/src/survey/questions/flowModules.ts, packages/studio/src/survey/identityResolution.ts
- [ ] T040 [US2] Render the dialect question.
  - With a proposal: one line with **Confirm**, **Edit** and **No dialect**.
  - Without one: a list of `variantsFor` and `dialectTagsetsFor`, plus a "Dialect name" text box.
  - Edit validates on each keystroke.
  - Message ids and accessible names (specs 046, 056).
  - Pass `dialectSubtag` into `buildTargetBcp47` from both producers (`IdentityLite.tsx:53`, `identitySelectors.ts:87`).

  Files: packages/studio/src/survey/IdentityLite.tsx, packages/studio/src/survey/questions/a/il_language_dialect.ts, packages/studio/src/locales/
- [ ] T041 [US2] Update the step and order parity pins for the new question — packages/studio/src/steps/stepOrder.parity.test.ts, packages/studio/src/lib/legacyStepIds.test.ts, packages/studio/src/decisions/orderParity.test.ts, packages/studio/src/steps/manifest.specref.json

**Checkpoint**: T031 to T033 pass; studio vitest green; parity pins updated in this commit. Commit: `spec 115 T031-T041`.

---

## Phase 7: User Story 4 — Tags are checked the way Keyman checks them (P2)

**Goal**: well-formedness error, minimality hint with fix, variant-prefix warning and duplicate hint, on both paths, at parity with kmc-package (FR-019 to FR-023).

**Independent test**: in Open mode, `sq-AL-gheg` gives an error, `sr-Latn-RS` a hint with "Use `sr-Latn`", and `oc-gascon` passes.

**Wave 1 — tests and rows:**

- [ ] T042 [P] [US4] Add criteria rows `12.8-bcp47-tag-well-formed` (FR-019) and `12.9-bcp47-variant-prefix` (FR-021), both yellow-survey. Update the `10.3-kps-tags-minimal` text to cover variants and duplicates (FR-020, FR-022). Mark ids and wording for content-team review (Article VI) — packages/contracts/data/criteria.json, packages/contracts/data/criteria-summary.md
- [ ] T043 [P] [US4] Write failing `languageTagFindings` tests: error, hint with replacement, warning, and duplicate minimal forms — packages/studio/src/criteria/languageTags.test.ts
- [ ] T044 [P] [US4] Write the kmc parity corpus test.
  - For every `.kps` `<Language ID>` in `../keyboards`, compare `PackageValidation.checkForDuplicatedOrNonMinimalLanguages` (from `@keymanapp/kmc-package`) with the studio's `isWellFormedBcp47` and `minimalTagOf` verdicts.
  - Disagreements must equal the fixture list, each with a reason.
  - The test skips visibly without the corpus (FR-023, SC-004).

  Files: packages/engine/src/langtags/kmcParity.corpus.test.ts, packages/engine/src/langtags/kmcParity.fixture.json

**Wave 2 — implementation:**

- [ ] T045 [US4] Implement `languageTagFindings(tags)`. Judge row 10.3 with `minimalTagOf` instead of `shorterEquivalents`, and add the well-formed and variant-prefix findings. Wire them into `languageTagVerdicts` for the identity tag — packages/studio/src/criteria/languageTags.ts
- [ ] T046 [US4] Register the new rows in implemented checks, gate coverage and the review battery (`node scripts/generate-review-battery.mjs`), and keep the criteria schema tests green — packages/studio/src/criteria/implementedChecks.ts, packages/studio/src/test/gateCoverage.ts, packages/studio/src/review/battery.generated.json
- [ ] T047 [US4] Show per-tag findings in the Open mode language list: inline on each row and on the add form. A hint's "Use `<replacement>`" button edits through the existing `onChange` and `setIdentity` path — packages/studio/src/survey/languageList/LanguageListPanel.tsx
- [ ] T048 [US4] Populate the parity fixture from a first run of T044, writing a reason for each disagreement (CLDR vs langtags default). Fail on anything unexplained — packages/engine/src/langtags/kmcParity.fixture.json

**Checkpoint**: T043 and T044 pass; `pnpm lint` green (criteria, facet and battery drift). Commit: `spec 115 T042-T048`.

---

## Phase 8: Polish and integration (Article XI)

- [ ] T049 Script the quickstart §5 manual walk with the Playwright CLI against `pnpm dev`, covering both the Copy and Open paths:
  - Gascon → `oc-gascon`;
  - Rabinal → `acr-x-rabinal`;
  - Aranese with an ill-formed edit blocked;
  - French → "Specify a region…" → Canada gives `fr-CA`, France gives `fr`;
  - a language change re-proposes the dialect;
  - Open `sr-Latn-RS` hint and `sq-AL-gheg` error.

  Record the result in the commit message. File: specs/115-dialect-language-tags/walk/
- [ ] T050 Run the full gates: `pnpm build`; vitest for contracts, engine, glottolog, keyboard-lint and studio; the facet-index and `/api` suites per docs/tooling.md; desktop e2e including the golden walk; `pnpm lint`. Record the counts in the commit message — (no file)
- [ ] T051 [P] Update docs:
  - the identity row in the workflow-model question inventory (`language-dialect`, region on demand);
  - the criteria doc for rows 12.8 and 12.9;
  - a keyboard-index row if any keyboard is newly cited.

  Files: docs/workflow-model.md, docs/criteria.md, docs/keyboard-index.md

---

## Dependencies

```text
Setup (T001)
  └─ Foundational (T002-T009)
       ├─ US5 Preservation (T010-T018)      ── independent; ship first
       ├─ US1 Search (T019-T025)            ── needs T005, T006, T009
       ├─ US3 Minimal tag (T026-T030)       ── needs T005, T007
       │     └─ US2 Dialect (T031-T041)     ── needs US1 (match) + US3 (minimalTag) + T004
       └─ US4 Validation (T042-T048)        ── needs T007, T028 (minimalTagOf), T034 (variantAllowed)
Polish (T049-T051)                          ── needs all
```

- US5 and US1 can run in parallel after Phase 2.
- US3 can run in parallel with US1.
- US4 can start its row and test tasks (T042-T044) any time after Phase 2. Its implementation waits for T028 and T034.

## Parallel examples

- **Phase 2, wave 1:** T002, T003, T004, T005 and T006 together (five different files).
- **US5, wave 2:** T012 to T018 together (seven files across four packages).
- **US1, wave 1:** T019, T020 and T021 together; then wave 2: T022 and T023 together.
- **US2, wave 2:** T034, T035 and T036 together.
- **US4, wave 1:** T042, T043 and T044 together.

## Implementation strategy

1. **MVP = Phase 2 + US5.** It fixes shipped defects (`buu-x-koya` read as script "Koya"; LDML stripping `-x-`) with no author-visible change. It can be merged on its own.
2. **Increment 2 = US1 + US3.** Authors find dialect names and get minimal tags with an optional region. Useful before the dialect subtag exists.
3. **Increment 3 = US2.** The dialect subtag is the feature's headline. It is not done until T049's walk passes (Article XI).
4. **Increment 4 = US4.** Keyman-parity validation, including Open mode's free-text list.
