# Tasks: Language tags that describe dialects and variants

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md), contracts: [bcp47-parser.md](contracts/bcp47-parser.md), [langtags-api.md](contracts/langtags-api.md), [dialect-search-and-question.md](contracts/dialect-search-and-question.md)

**Tests**: included. The spec's success criteria are measurements (SC-001 to SC-009), and the contracts give their behaviour as test tables, so each story writes its failing tests first.

**Format**: `- [ ] T### [P?] [US#?] Description — file(s)`. `[P]` = different files from the other open tasks in its wave and no dependency on them.

**Order**: story phases follow dependencies, not the spec's numbering:
- US1 (chooser) comes before US6 (its fallbacks extend the chooser);
- US3 (minimal tag) comes before US2 (the dialect question emits through it).

**Commit cadence**: one commit per phase, pushed to `115-dialect-language-tags` when its checkpoint is green (CLAUDE.md). Commit messages name the tasks (`spec 115 T001-T011`). T009 gets its own commit (shipped defect, research R13).

---

## Phase 1: Setup

- [ ] T001 Add root devDependency `language-subtag-registry` at exactly `0.4.2`, and studio dependency `@ethnolib/find-language` at exactly `0.4.4` (no ranges). Refresh the lockfile — package.json, packages/studio/package.json, pnpm-lock.yaml
- [ ] T002 Record licences the way the repo already does for pinned data (`packages/engine/data/langtags/LICENSE` and `SOURCES.json`; there is no repo-wide notice file):
  - the registry codegen output carries a CC0-1.0 source header;
  - the vendored hook (T020) carries EthnoLib's MIT notice in its file header, plus a `LICENSE` copy in `vendor/`;
  - both are listed in docs/packages.md (T063).

  Files: packages/studio/src/survey/languageChooser/vendor/LICENSE

---

## Phase 2: Foundational (blocks every story)

The parser, the shared types and the generated data. Nothing here changes what an author sees, except T009's bug fix.

**Wave 0 — first, own commit (shipped defect, research R13):**

- [ ] T009 Fix the shipped defect R13: key `defaultsIndex` on the language subtag, taking the shortest-`tag` tagset per language, so `zh`, `isv`, `con`, `aux`, `nul`, `ocm`, `prn`, `sgn`, `spx`, `tpo`, `txr`, `xaq`, `xcc`, `xce` and `xib` resolve. Add tests (`getLanguageDefaults("zh")`, `("isv")` defined; `("ewo")` unchanged). It runs before T006, which edits the same file, so the fix commit applies cleanly on `main`'s code and can be cherry-picked alone. **Own commit:** `fix(engine): langtags index drops languages with no bare tagset` — scripts/codegen-langtags.mjs, packages/engine/src/langtags/generated/index.ts, packages/engine/src/langtags/index.test.ts

**Wave 1 — independent (T006 after T009):**

- [ ] T003 [P] Write failing tests for `parseBcp47`, `formatBcp47`, `isWellFormedBcp47`, `scriptSubtagOf` and `regionSubtagOf`, one per row of the table in contracts/bcp47-parser.md. Replace the `scriptSubtagOf("lif-x-Deva") === "Deva"` assertion with `undefined`, and add `buu-x-koya`, `kqe-x-east` and `en-u-co-phon` → `undefined` (research R1) — packages/contracts/src/utils/bcp47.test.ts
- [ ] T004 [P] Add the types `Bcp47Parts`, `Bcp47ParseError`, `SearchMatch` (including `source: "typed"`), `DialectTagset`, `VariantEntry` and `RegisteredLanguage` (data-model.md). Additive only; no `Pattern` or `Criterion` change — packages/contracts/src/langtags.ts, packages/contracts/src/utils/bcp47.ts
- [ ] T005 [P] Write `scripts/codegen-registry.mjs`. It reads `language-subtag-registry/data/json/variant.json` and `language.json` and writes `variants.ts` (134 rows: `{subtag, descriptions, prefixes, deprecated}`) and `registeredLanguages.ts` (about 8,200 rows: `{subtag, description, scope?, macrolanguage?}`, including the `qaa..qtz` range). Both are sorted, with a header naming the package version and `File-Date`. Add it to the root scripts and to `prebuild`, after `codegen-langtags` — scripts/codegen-registry.mjs, package.json, packages/engine/src/langtags/generated/{variants,registeredLanguages}.ts
- [ ] T006 [P] Change `scripts/codegen-langtags.mjs` for dialects:
  - stop folding non-bare tagsets into `regionVariants` (:110-124);
  - emit `generated/dialects.ts`, one row per variant or `-x-` tagset (229), with the fields in data-model.md § DialectTagset;
  - add `windows` as a sixth column of the `tagsets.ts` rows (:323-333).

  Files: scripts/codegen-langtags.mjs, packages/engine/src/langtags/generated/{dialects,tagsets}.ts
- [ ] T007 [P] Change `scripts/codegen-glottolog.mjs`:
  - keep `Countries` on language and dialect records;
  - emit `src/generated/dialects.ts`, one row per dialect whose `Language_ID` parent has an ISO code (13,392): `{name, folded, glottocode, parentIso, countries}`;
  - fold names as NFD, drop combining marks, lowercase;
  - take countries from the dialect, else from the parent.

  Files: scripts/codegen-glottolog.mjs, packages/glottolog/src/generated/dialects.ts, packages/glottolog/src/types.ts

**Wave 2 — after wave 1:**

- [ ] T008 Implement `parseBcp47`, `formatBcp47`, `isWellFormedBcp47` and `regionSubtagOf` (moved from keyboard-lint), and rewrite `scriptSubtagOf` on the parser, until T003 passes. Pure TS, with no JSON or data import (`/api` bundle safety) — packages/contracts/src/utils/bcp47.ts
- [ ] T010 [P] Extend the codegen determinism test to cover `tagsets.ts`, `dialects.ts`, `variants.ts` and `registeredLanguages.ts`: sorted, stable, row counts at the pinned inputs. It skips visibly when inputs are absent — packages/engine/src/langtags/codegen-determinism.test.ts
- [ ] T011 [P] Add the `./dialects` subpath export (types and import) and a `dialects.ts` entry exporting `dialectRows`. Do not import it from `src/index.ts`, so the main entry's bundle is unchanged — packages/glottolog/package.json, packages/glottolog/src/dialects.ts

**Checkpoint**: `pnpm build` green; the contracts parser tests and T009's tests pass. Commits: the T009 fix first, then `spec 115 T001-T008, T010-T011`.

---

## Phase 3: User Story 5 — Existing tags survive intact (P2)

**Goal**: no reader treats a subtag after `-x-`/`-u-` as script or region, and no output strips variants, extensions or private use (FR-024, FR-025).

**Independent test**: a fixture `.kps` listing `en-US-x-twain` and `fr-u-co-phonebk` reads script none for both; the LDML export, package and help docs keep both tags whole.

**Wave 1 — tests:**

- [ ] T012 [P] [US5] Write a failing round-trip test: a fixture `.kps` with `en-US-x-twain` and `fr-u-co-phonebk` goes through Open and comes out in `.kps`, help docs and LDML with both tags unchanged — packages/engine/src/ldml-export/lower/document.test.ts, packages/engine/src/start-browser/kps-parser.test.ts
- [ ] T013 [P] [US5] Write failing lint tests: `tagUsesRegion001("en-x-001")` is false; `regionSubtagOf("zh-yue-HK")` is `HK` — packages/keyboard-lint/src/checks/criteria/check-bcp47.test.ts

**Wave 2 — move every reader onto the parser (different files):**

- [ ] T014 [P] [US5] `extractScriptSubtag` becomes a re-export of `scriptSubtagOf` — packages/engine/src/start-browser/kps-parser.ts
- [ ] T015 [P] [US5] Make `minimalLocale` keep private use and extensions. Interim fix: split off the singleton tail, minimise the head, and re-append the tail. It is replaced by `minimalTagOf` in T042 — packages/engine/src/ldml-export/lower/document.ts
- [ ] T016 [P] [US5] `regionSubtagOf` and `tagUsesRegion001` use the contracts parser; delete the local copy — packages/keyboard-lint/src/checks/criteria/check-bcp47.ts, packages/keyboard-lint/src/checks/criteria/check-currency.ts
- [ ] T017 [P] [US5] Replace the mirror `regionSubtagOf` and the base-layouts region reader with the contracts parser — packages/studio/src/criteria/assembleLintContext.ts, packages/studio/src/components/rules/baseLayouts.ts
- [ ] T018 [P] [US5] Replace `BCP47_SHAPE`, `isScript`, `isRegion` and the `.slice(1).find(isScript)` scan with parser calls; replace the shape regex with `isWellFormedBcp47` — packages/studio/src/criteria/languageTags.ts, packages/studio/src/survey/questions/docLanguageTag.ts
- [ ] T019 [P] [US5] Use `scriptSubtagOf` from contracts in the facet-index utilities (their own test invocation, docs/tooling.md) — utilities/facet-index/build-index.ts, utilities/facet-index/declared-bcp47-tags-classifier.ts

**Checkpoint**: T012 and T013 pass; contracts, engine, keyboard-lint and studio vitest green. A facet-index rebuild produces an unchanged index: the corpus has no `-x-` tags, so any difference is a bug. Commit: `spec 115 T012-T019`.

---

## Phase 4: User Story 1 — Find a language by a dialect name, in the shared chooser (P1)

**Goal**: EthnoLib's search drives the language field. Dialect names find their parent, with a "why it matched" line, and today's autosuggest, auto-resolve and auto-fill behaviour is kept (FR-001 to FR-006, FR-034 to FR-038).

**Independent test**: "Sursilvan", "Maprik", "Rabinal", "Gascon" and "Valencian" each return their parent with a match line; "Cameroon" lists languages of Cameroon; "Bafutt" finds Bafut; typing "Ewondo" and tabbing away resolves it and proposes `ewo`, script and autonym.

**Wave 1 — vendoring and tests:**

- [ ] T020 [P] [US1] Vendor `useLanguageChooser.ts` from EthnoLib `components/language-chooser/react/common/language-chooser-react-hook` (the source matching 0.3.7). Keep the MIT header and the source URL and commit, and import from `@ethnolib/find-language`. Add a typecheck-only test that the return keys match the contract (`languageResults`, `onSearchStringChange`, `selectLanguage`, `selectUnlistedLanguage`, `selectManuallyEnteredTagLanguage`, `selectScript`, `saveLanguageDetails`, `readyToSubmit`, `resetTo`) — packages/studio/src/survey/languageChooser/vendor/useLanguageChooser.ts, packages/studio/src/survey/languageChooser/vendor/useLanguageChooser.test.ts
- [ ] T021 [P] [US1] Write failing tests for `makeDialectSearcher` and `dialectResultModifier` (contract § merge rule):
  - "Gascon" → Occitan with `match` `{relation: "dialect", glottocode: "gasc1240", countries: ["ES","FR"]}`;
  - "Sursilvan" → Romansh;
  - **langtags dialect names (C2):** "Rabinal" → Achi with `match` `{relation: "dialect", source: "langtags", dialectTag: "acr-x-rabinal"}`; "Valencian" → Catalan with `{relation: "variety", dialectTag: "ca-valencia"}`;
  - **merge rule (C1):**
    - a dialect hit whose name matches the query fully or by prefix is placed before every chooser result whose names do not contain the query (Bloom's fuzzy matches);
    - for "Rabinal" (6 chooser results, 5 of them fuzzy), Achi is first;
    - for "Gascon", Occitan appears once, with the match line;
  - a name that is a language with its own ISO code ranks above a dialect of the same name ("Gheg" → `aln` first, FR-003);
  - a parent already listed is not duplicated; its existing row gains the `match`;
  - macrolanguage parents mapped (`cmn` → `zh`, `arb` → `ar`);
  - an unresolvable parent becomes a fallback row;
  - **multi-parent (U2):** a prefix query matching dialects of two different parents lists both, each with its countries (FR-004).

  File: packages/studio/src/survey/languageChooser/dialectSearch.test.ts
- [ ] T022 [P] [US1] Write the failing behaviour-kept tests (FR-038):
  - suggestions update as the author types;
  - `resolveTypedLanguage` over `ILanguage` resolves a unique exonym, else a unique alias, and is null when ambiguous (the existing cases ported);
  - picking or resolving calls `onEntryResolved` with the matching `LanguageDefaults`, and the code, script and autonym seeds are recorded with `default` provenance;
  - `onSelectAdvance` fires;
  - the headless author resolves "Ewondo" identically;
  - **accents (U1, FR-005):** "Arbereshe" and "Arbëreshë" both find `aae`; "catala" finds `ca`; "Gascón" finds Occitan via the dialect searcher.

  Files: packages/studio/src/survey/resolveTypedLanguage.test.ts, packages/studio/src/survey/languageChooser/LanguageChooser.test.tsx
- [ ] T023 [P] [US1] Write the measurement tests:
  - SC-001: at least 95% of the 13,392 Glottolog dialects have their parent in the top 5;
  - SC-002: 229/229 langtags dialect tagsets reachable;
  - SC-007 / FR-006: the top-result code for 200 seeded language-name samples vs today's `lookupByName`, with exceptions in `searchParity.fixture.json`;
  - FR-034 / SC-009: every EthnoLib code resolves in pinned langtags with the same default script, with exceptions in `ethnolibParity.fixture.json`.

  Print and assert each.

  Files: packages/studio/src/survey/languageChooser/searchParity.test.ts, packages/studio/src/survey/languageChooser/ethnolibParity.test.ts

**Wave 2 — implementation:**

- [ ] T024 [P] [US1] Implement:
  - `makeDialectSearcher(glottologRows, langtagsDialects)`: an EthnoLib `LanguageSearcher` over both Glottolog dialect rows and the langtags variant and `-x-` tagsets (`dialectTagsetsFor` data, carrying `dialectTag`);
  - `dialectResultModifier(searcher, parentFor)`, applying the contract's merge rule. The rule uses only the query and each result's names, because the modifier receives no tier information.

  Files: packages/studio/src/survey/languageChooser/dialectSearch.ts
- [ ] T025 [P] [US1] Generalise `resolveTypedLanguage` to `ILanguage` (`exonym`, `names`); keep the rule. Update `languageResultsFor` for the headless path to call EthnoLib's search with the dialect modifier — packages/studio/src/survey/resolveTypedLanguage.ts
- [ ] T026 [P] [US1] Port the chooser UI with no MUI: `LanguageChooser` (the existing combobox, fed by `languageResults`, capped at 50) and `LanguageCard` as row content (name, autonym, alternate names, regions, code, and the match line per the contract's table); `ScriptCard`; and `CustomizePanel` (its "Specify a region…" field and its dialect name field). Use studio styles, message ids (spec 046) and accessible names that include the match line (spec 056). **The labels and match-line wording are survey text owned by the content team (Article VI): mark them for content review** — packages/studio/src/survey/languageChooser/{LanguageChooser,LanguageCard,ScriptCard,CustomizePanel}.tsx, packages/studio/src/locales/

**Wave 3 — wiring:**

- [ ] T027 [US1] Map chooser state to decisions (research R7 table) through `identityResolution.onEntryResolved` and the answer commit, never directly to IR.
  - **Create the `language-search-match` DecisionId here** (IR paths `[]`), with its persistence test; T035 and T048 use it.
  - Lazy-load the glottolog `./dialects` chunk on the first query of 3 or more characters (contract § merge rule).

  Files: packages/studio/src/decisions/decisionTypes.ts, packages/studio/src/survey/identityResolution.ts, packages/studio/src/survey/languageChooser/LanguageChooser.tsx
- [ ] T028 [US1] Render `il_language_english` with `LanguageChooser` in place of `LangtagsComboboxField`'s name mode. Keep `LangtagsComboboxField` for other callers, and drop name mode if it becomes unused. Put the chooser behind a dynamic `import()` so it and EthnoLib's data load with the language step (FR-037). Add a build test that the entry chunk does not contain `@ethnolib/find-language` (G2) — packages/studio/src/survey/QuestionField.tsx, packages/studio/src/survey/IdentityLite.tsx, packages/studio/src/survey/languageChooser/lazyBoundary.test.ts
- [ ] T029 [US1] Populate `searchParity.fixture.json` and `ethnolibParity.fixture.json` from a first run, each exception with a reason; then T023 must pass with no unlisted exceptions — packages/studio/src/survey/languageChooser/*.fixture.json

**Checkpoint**:
- T021 to T023 pass; SC-001, SC-002, SC-007 and SC-009 are printed.
- Bundle check (`pnpm --filter @keyboard-studio/studio build`, then the chunk list):
  - the EthnoLib chunk loads with the language step, not on first page load;
  - the glottolog dialect chunk is separate;
  - there is one copy of EthnoLib's data.
- The golden-walk e2e passes.

Commit: `spec 115 T020-T029`.

---

## Phase 5: User Story 6 — Nothing matches, and the author still ends with a tag (P1)

**Goal**: codes and tags resolve; unmatched text offers "is a dialect" and "isn't listed"; the language code is never blank or unchecked (FR-028 to FR-033).

**Independent test**: `bft` → Balti proposed; `oc-gascon` → Occitan + Gascon; a made-up dialect via "is a dialect" → `oc-x-…`; "isn't listed" with no code → `qaa-x-…`; code `zzz` → warning.

**Wave 1 — tests:**

- [ ] T030 [P] [US6] Write failing `registeredLanguage` tests (contracts/langtags-api.md table) — packages/engine/src/langtags/registry.test.ts
- [ ] T031 [P] [US6] Write failing `resolveTypedTag` tests:
  - `bft` → Balti;
  - `oc-gascon` → oc + `gascon`;
  - `fr-CA` → fr + CA;
  - `sr-Latn-RS` → sr + Latn + RS;
  - `zzz` → a proposal with a warning;
  - `qaa` → a private-use proposal;
  - `sq-AL-gheg` → null with the parser's reason;
  - `fr-u-co-phonebk` → fr, with the extension not carried and a note. Together with the absence of any extension input, this is FR-027's coverage (G3).

  File: packages/studio/src/survey/languageChooser/resolveTypedTag.test.ts
- [ ] T032 [P] [US6] Write failing UI tests:
  - the two fallback rows appear when no result is *close* (contract § merge rule; e.g. "Ewondoo" shows them below the fuzzy Ewondo row), and always via "Can't find it?";
  - "is a dialect" keeps the text in `language-search-match` (`source: "typed"`) and re-labels the search;
  - the unlisted panel: name pre-filled; code checks per FR-031; no code → `qaa-x-` from the name (FR-011 rule), with the explanation and request link;
  - `il_language_code` rejects unchecked free text (FR-033);
  - **SC-008 action counts (G4):** each of the eight inputs reaches a confirmed code within four actions, counted in the test.

  File: packages/studio/src/survey/languageChooser/fallbacks.test.tsx

**Wave 2 — implementation:**

- [ ] T033 [P] [US6] Implement `registeredLanguage(subtag)` over `generated/registeredLanguages.ts`; export it from the langtags barrel — packages/engine/src/langtags/registry.ts, packages/engine/src/langtags/index.ts
- [ ] T034 [P] [US6] Implement `resolveTypedTag(text)` (parser plus `registeredLanguage`); show its proposal first in the list — packages/studio/src/survey/languageChooser/resolveTypedTag.ts
- [ ] T035 [US6] Add the fallback rows and the "Can't find it?" link. Implement "is a dialect" (writes the `language-search-match` decision with the pending name, re-labels the search) and `UnlistedLanguagePanel`, mirroring EthnoLib's unlisted and manual-tag paths but checking with `parseBcp47` and `registeredLanguage`. Messages per spec 046. **The fallback rows, unlisted-panel text and the ISO 639-3 explanation are survey text owned by the content team (Article VI): mark them for content review** — packages/studio/src/survey/languageChooser/{LanguageChooser,UnlistedLanguagePanel}.tsx, packages/studio/src/locales/
- [ ] T036 [US6] Turn `il_language_code` into a confirmation of the chooser's result. **Change** reopens the chooser or the typed-code check; there is no unchecked free text. Update its fixtures (the `bft` free-text fixture becomes a checked entry) — packages/studio/src/survey/questions/a/il_language_code.ts
- [ ] T037 [US6] Extend row 10.4's check to flag `qaa`–`qtz` private-use language codes (FR-032); mark the wording for content review — packages/studio/src/criteria/languageTags.ts, packages/contracts/data/criteria.json

**Checkpoint**: T030 to T032 pass; SC-008's eight inputs each end in a confirmed, non-blank code (asserted in T032). Commit: `spec 115 T030-T037`.

---

## Phase 6: User Story 3 — The emitted tag names only what is not a default (P1)

**Goal**: every emitted tag is minimal against the pinned langtags, and any language can carry a region (FR-014 to FR-018).

**Independent test**: the table in spec US3 (`ca-valencia`, `sr-Latn`, `fr-CA`, `bfd`, `acr-x-rabinal`).

**Wave 1 — tests:**

- [ ] T038 [P] [US3] Write failing `minimalTag` and `minimalTagOf` tests: every row of the table in contracts/langtags-api.md (including `ca + Latn + AD + valencia` → `ca-AD-valencia` and `oc + FR + gascon` → `oc-gascon`), plus the SC-003 property test over all 9,596 tagsets — packages/engine/src/langtags/minimalTag.test.ts
- [ ] T039 [P] [US3] Write failing studio tests:
  - `buildTargetBcp47` delegates to `minimalTag`, with a region equal to the default omitted;
  - the "Specify a region…" field in the chooser's **Customize** panel routes `il_language_region` for a single-region language;
  - existing walks route no new screen (research R9).

  Files: packages/studio/src/survey/targetBcp47.test.ts, packages/studio/src/survey/identityResolution.test.ts

**Wave 2 — implementation:**

- [ ] T040 [US3] Implement `minimalTag(choice)` and `minimalTagOf(tag)`.
  - Key the lookup on (canonical language, variants, private use) from `parseBcp47`. Use the dialect tagset, else the bare tagset; never `resolveLangtag`'s string fallback (research R2).
  - Return the tagset `tag` on an exact match. Otherwise omit script and region where each equals that tagset's default.
  - Carry extensions through.
  - Export both from the langtags barrel.

  Files: packages/engine/src/langtags/minimalTag.ts, packages/engine/src/langtags/index.ts
- [ ] T041 [US3] Make `buildTargetBcp47` call `minimalTag`, with a new optional `dialectSubtag` parameter (empty until US2). Delete the private `isSuppressedScript`, and keep `fonipa` and `romanization-Latn` as inputs mapped to parts. Add a dependency-cruiser rule (G1, FR-035): only `survey/languageChooser/` may import from `@ethnolib/find-language`, so EthnoLib's tag builders can never reach the output path — packages/studio/src/survey/targetBcp47.ts, .dependency-cruiser.cjs
- [ ] T042 [US3] Replace `minimalLocale` with `minimalTagOf` at `document.ts:286` and `ldml-export/package.ts:58`; delete T015's interim code — packages/engine/src/ldml-export/lower/document.ts, packages/engine/src/ldml-export/package.ts
- [ ] T043 [US3] Region on demand (research R9):
  - The "Specify a region…" field in the chooser's **Customize** panel sets the routing input `ctx.ilRegionRequested`.
  - **The region help text and option labels are survey text owned by the content team (Article VI): mark them for content review.**
  - `il_language_region` routes when `hasRegionVariants` or `ilRegionRequested`.
  - Options: the default region first (marked), the other langtags regions, then "Other region…" (any ISO 3166-1 code).
  - New help text.
  - A region with no regional variant skips the autonym and script narrowing in `onAnswerCommit`.

  Files: packages/studio/src/survey/identityResolution.ts, packages/studio/src/survey/languageChooser/CustomizePanel.tsx, packages/studio/src/survey/questions/a/il_language_region.ts, packages/studio/src/survey/questions/a/il_language_english.ts

**Checkpoint**:
- T038 and T039 pass.
- The golden-walk e2e passes unchanged.
- `.kps`, help docs and LDML carry the same tag for the same choice (FR-018), asserted via `deriveIdentityResult`.

Commit: `spec 115 T038-T043`.

---

## Phase 7: User Story 2 — The keyboard records the dialect in its tag (P1)

**Goal**: picking or typing a dialect yields a confirmed dialect subtag in the tag, with the glottocode saved (FR-007 to FR-013, FR-018).

**Independent test**: Gascon → `oc-gascon` (registered variant); Rabinal → `acr-x-rabinal` (langtags); Yabekolo → `ewo-x-yabekolo` (from the name); Aranese → `oc-aranes` (registered variant, linked by description); the `.kps` lists exactly one `<Language>`.

**Wave 1 — tests:**

- [ ] T044 [P] [US2] Write failing tests for `variantEntry`, `variantsFor(tag)`, `variantAllowed(tag, variant)` and `dialectTagsetsFor(language)`: `gascon` allowed after `oc` and not after `en`; `1994` only after `sl-rozaj…`; `biske` only after `sl-rozaj` — packages/engine/src/langtags/variants.test.ts, packages/engine/src/langtags/dialects.test.ts
- [ ] T045 [P] [US2] Write failing proposal tests (data-model.md § DialectProposal):
  - the preference order registered variant → langtags → made from the name;
  - a `typed` pending name from US6;
  - the variant linked by folded description plus allowed prefix;
  - the made-from-name rule (NFD, ASCII, at most 8 characters, `x-dialect` when empty, a disambiguating digit on collision);
  - an ill-formed edit blocked with the parser's reason.

  File: packages/studio/src/survey/dialectProposal.test.ts
- [ ] T046 [P] [US2] Write failing decision tests:
  - the new DecisionIds persist through the draft snapshot and resume;
  - `deriveIdentityResult` composes `oc-gascon`;
  - changing `language-code` re-proposes `language-dialect` via `recalculate` (FR-013);
  - one package language, with no second bare-parent entry (FR-018).

  File: packages/studio/src/decisions/identitySelectors.test.ts

**Wave 2 — implementation:**

- [ ] T047 [P] [US2] Implement `variantEntry`, `variantsFor`, `variantAllowed` (prefix rule in data-model.md) and `dialectTagsetsFor`; export them from the langtags barrel — packages/engine/src/langtags/variants.ts, packages/engine/src/langtags/dialects.ts, packages/engine/src/langtags/index.ts
- [ ] T048 [P] [US2] Add the DecisionIds `language-dialect`, `language-dialect-source` and `language-glottocode` (IR paths `[]`). `language-search-match` already exists (T027). Read all four in `deriveIdentityResult` into `LanguageChoice`, and add an `IDENTITY_QUESTIONS` row — packages/studio/src/decisions/decisionTypes.ts, packages/studio/src/decisions/identitySelectors.ts, packages/studio/src/survey/identityLiteResult.ts
- [ ] T049 [P] [US2] Add `glottocode?` to the identity patch, filled from the decision — packages/studio/src/stores/identityPatch.ts, packages/studio/src/lib/identityLanguagePatch.ts

**Wave 3 — after wave 2:**

- [ ] T050 [US2] Implement `proposeDialect(choice, searchMatch)` per T045 — packages/studio/src/survey/dialectProposal.ts
- [ ] T051 [US2] Create the question module `il_language_dialect` (contracts § Question modules).
  - Declaration: `provides: ["language-dialect"]`; `requires: ["language-code", "target-script", "language-region"]`; optional; `outputs` bcp47; `lookupDefault` → `proposeDialect`.
  - Add it to `flowModules.identity_lite` and to `SEEDED_QUESTIONS`.
  - Order comes only from `orderDecisions` (Article IX). Routing is separate and stored in `next`, gated the same way region is (research R8, R9):
    - `il_target_script.next` is `il_language_dialect` only when one of these holds:
      - the search match carries a dialect (Glottolog, langtags, or a typed pending name);
      - the author used the dialect field in the chooser's **Customize** panel (`ctx.ilDialectRequested`);
    - The gate does **not** fire merely because the language has registered variants. French, English and German all do (`fr`: `1694acad`, `gallo`), so that would add the question to most walks. For a directly picked language, the variants are offered in **Customize**.
    - otherwise `il_target_script` stays the step's last question, and the dialect decision stays `""` (no dialect, a confirmed default).
  - Implement the gate in `identityResolution.nextOverride`, beside the region gate.
  - T053 covers both endings: the resume test and the parity pins, with and without the dialect question.

  Files: packages/studio/src/survey/questions/a/il_language_dialect.ts, packages/studio/src/survey/questions/a/il_target_script.ts, packages/studio/src/survey/questions/flowModules.ts, packages/studio/src/survey/identityResolution.ts
- [ ] T052 [US2] Render the dialect question.
  - With a proposal: one line with **Confirm**, **Edit** and **No dialect**.
  - Without one: a list of `variantsFor` and `dialectTagsetsFor`, plus a "Dialect name" box.
  - The chooser's **Customize** dialect field feeds the same proposal.
  - Edit validates on each keystroke.
  - Message ids and accessible names (specs 046, 056).
  - **The question's prompt, help text and proposal wording are survey text owned by the content team (Article VI): mark them for content review.**
  - Pass `dialectSubtag` into `buildTargetBcp47` from both producers (`IdentityLite.tsx:53`, `identitySelectors.ts:87`).

  Files: packages/studio/src/survey/IdentityLite.tsx, packages/studio/src/survey/questions/a/il_language_dialect.ts, packages/studio/src/survey/languageChooser/CustomizePanel.tsx, packages/studio/src/locales/
- [ ] T053 [US2] Update the step and order parity pins, and the resume test, for the new question.
  - **Without a dialect gate** (e.g. Ewondo picked by name): `il_target_script` is still the last question, and the existing resume behaviour is unchanged.
  - **With the gate** (e.g. Gascon): `il_language_dialect` is last, and a draft resumed after `il_target_script` lands on it.
  - A draft saved before this change resumes as today.
  - Confirm the golden-walk e2e (Copy from `basic_kbdfr`) and the headless walks gain no question. French has registered variants, but the gate ignores them (T051).

  Files: packages/studio/src/steps/stepOrder.parity.test.ts, packages/studio/src/lib/legacyStepIds.test.ts, packages/studio/src/decisions/orderParity.test.ts, packages/studio/src/steps/manifest.specref.json, packages/studio/src/survey/IdentityLite.resume.test.tsx

**Checkpoint**: T044 to T046 pass; studio vitest green; parity pins updated in this commit. Commit: `spec 115 T044-T053`.

---

## Phase 8: User Story 4 — Tags are checked the way Keyman checks them (P2)

**Goal**: well-formedness error, minimality hint with fix, variant-prefix warning and duplicate hint, on both paths, at parity with kmc-package (FR-019 to FR-023).

**Independent test**: in Open mode, `sq-AL-gheg` gives an error, `sr-Latn-RS` a hint with "Use `sr-Latn`", and `oc-gascon` passes.

**Wave 1 — tests and rows:**

- [ ] T054 [P] [US4] Add criteria rows `12.8-bcp47-tag-well-formed` (FR-019) and `12.9-bcp47-variant-prefix` (FR-021), both yellow-survey. Update the `10.3-kps-tags-minimal` text to cover variants and duplicates (FR-020, FR-022). Mark ids and wording for content-team review (Article VI) — packages/contracts/data/criteria.json, packages/contracts/data/criteria-summary.md
- [ ] T055 [P] [US4] Write failing `languageTagFindings` tests: error, hint with replacement, warning, and duplicate minimal forms — packages/studio/src/criteria/languageTags.test.ts
- [ ] T056 [P] [US4] Write the kmc parity corpus test.
  - For every `.kps` `<Language ID>` in `../keyboards`, compare `PackageValidation.checkForDuplicatedOrNonMinimalLanguages` (`@keymanapp/kmc-package`) with `isWellFormedBcp47` and `minimalTagOf`.
  - Disagreements must equal the fixture list, each with a reason.
  - The test skips visibly without the corpus (FR-023, SC-004).

  Files: packages/engine/src/langtags/kmcParity.corpus.test.ts, packages/engine/src/langtags/kmcParity.fixture.json

**Wave 2 — implementation:**

- [ ] T057 [US4] Implement `languageTagFindings(tags)`. Judge row 10.3 with `minimalTagOf` instead of `shorterEquivalents`, and add the well-formed and variant-prefix findings. Wire them into `languageTagVerdicts` for the identity tag — packages/studio/src/criteria/languageTags.ts
- [ ] T058 [US4] Register the new rows in implemented checks, gate coverage and the review battery (`node scripts/generate-review-battery.mjs`), and keep the criteria schema tests green — packages/studio/src/criteria/implementedChecks.ts, packages/studio/src/test/gateCoverage.ts, packages/studio/src/review/battery.generated.json
- [ ] T059 [US4] Show per-tag findings in the Open mode language list: inline on each row and on the add form. A hint's "Use `<replacement>`" button edits through the existing `onChange` and `setIdentity` path. The add form also offers the chooser (US1) and the typed-tag check (US6) — packages/studio/src/survey/languageList/LanguageListPanel.tsx
- [ ] T060 [US4] Populate the kmc parity fixture from a first run of T056, writing a reason for each disagreement (CLDR vs langtags default). Fail on anything unexplained — packages/engine/src/langtags/kmcParity.fixture.json

**Checkpoint**: T055 and T056 pass; `pnpm lint` green (criteria, facet and battery drift). Commit: `spec 115 T054-T060`.

---

## Phase 9: Polish and integration (Article XI)

- [ ] T061 Script the quickstart §5 manual walk with the Playwright CLI against `pnpm dev`, covering both the Copy and Open paths:
  - the autosuggest-kept checks;
  - Gascon, Rabinal, Aranese and Yabekolo;
  - region on demand;
  - dialect re-proposal;
  - the US6 inputs;
  - the Open-list hint and error.

  Record the result in the commit message. File: specs/115-dialect-language-tags/walk/
- [ ] T062 Run the full gates: `pnpm build`; vitest for contracts, engine, glottolog, keyboard-lint and studio; the facet-index and `/api` suites per docs/tooling.md; desktop e2e including the golden walk; `pnpm lint`. Record the counts in the commit message — (no file)
- [ ] T063 [P] Update docs:
  - the identity rows in the workflow-model question inventory (chooser, `language-dialect`, region on demand, no free-text code);
  - the criteria doc for rows 12.8, 12.9 and 10.4;
  - the package inventory: EthnoLib dependency and the vendored hook.

  Files: docs/workflow-model.md, docs/criteria.md, docs/packages.md
- [ ] T064 [P] File upstream issues on sillsdev/EthnoLib, as research R7 lists:
  - the hook package is published without its `.d.ts`;
  - data embedded in code (not tree-shakeable, no way to supply pinned data);
  - `createTag` neither lowercases private use nor offers registered variants.

  Link them in the PR body — (GitHub issues; no repo file)

---

## Dependencies

```text
Setup (T001-T002)
  └─ Foundational (T003-T011; T009 own commit)
       ├─ US5 Preservation (T012-T019)            ── independent; ship first
       ├─ US1 Chooser + dialect search (T020-T029) ── needs T007, T011, T001
       │     └─ US6 Nothing matches (T030-T037)    ── needs US1 (chooser), T005, T008
       ├─ US3 Minimal tag (T038-T043)              ── needs T006, T008; T043 needs T026
       │     └─ US2 Dialect (T044-T053)            ── needs US1, US3, US6 (typed name), T005
       └─ US4 Validation (T054-T060)               ── needs T008, T040, T047; T059 needs US1, US6
Polish (T061-T064)                                 ── needs all
```

- US5, US1 and US3 (except T043) can run in parallel after Phase 2.
- US4's row and test tasks (T054-T056) can start any time after Phase 2.

## Parallel examples

- **Phase 2, wave 1:** T003, T004, T005, T006 and T007 together.
- **US5, wave 2:** T014 to T019 together (six files across four packages).
- **US1, wave 1:** T020, T021, T022 and T023 together; then wave 2: T024, T025 and T026 together.
- **US6, wave 1:** T030, T031 and T032 together; then wave 2: T033 and T034 together.
- **US2, wave 2:** T047, T048 and T049 together.
- **US4, wave 1:** T054, T055 and T056 together.

## Implementation strategy

1. **MVP = Phase 2 + US5.** It fixes shipped defects with no visible change, plus the separate T009 fix (`zh`, `isv` and 13 others missing from the index). It can be merged on its own.
2. **Increment 2 = US1 + US6.** The shared chooser with dialect search and the no-dead-end fallbacks; today's autosuggest kept. This is the biggest author-visible change; walk it before going further.
3. **Increment 3 = US3 + US2.** Minimal tags, region on demand, and the dialect subtag. Not done until T061's walk passes (Article XI).
4. **Increment 4 = US4.** Keyman-parity validation, including Open mode's list.
