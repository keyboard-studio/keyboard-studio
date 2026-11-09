# Implementation Plan: Language tags that describe dialects and variants

**Spec**: [spec.md](spec.md) | **Branch**: `115-dialect-language-tags` | **Date**: 2026-11-09

**Input**: Feature specification from `specs/115-dialect-language-tags/spec.md`

## Summary

Make a dialect expressible end to end:
- one BCP 47 parser in contracts;
- a minimal-tag function in engine, driven by the pinned langtags;
- langtags dialect tagsets and a lazily loaded Glottolog dialect index in the language search;
- a new optional dialect question in the decision registry;
- region offered for every language;
- tag validation that matches Keyman's package compiler.

The existing tag readers that misread private use and extensions are moved onto the parser, which fixes them. Decisions are in [research.md](research.md) (R1-R11).

## Technical Context

**Language/Version**: TypeScript 5 (ES2022), Node ≥ 22.19 (build and tests); browsers for the studio.

**Primary Dependencies**: existing `@keyboard-studio/{contracts,engine,glottolog,studio,keyboard-lint}`; `@keymanapp/kmc-package` (already an engine dependency, test oracle only); new root devDependency `language-subtag-registry@0.4.2`, exact pin, codegen input only (R5). `Intl.Locale` (built in) for the parity cross-check only.

**Storage**: none new. Three new decisions plus a search-match decision persist in the existing decision snapshot (`draftPersistence.ts:855`); `glottocode` rides on `IdentityPatch`.

**Testing**: vitest per package (studio in jsdom); corpus tests against `../keyboards` (skip visibly when absent); Playwright CLI manual walk.

**Target Platform**: browser SPA (Vite) plus Node build scripts.

**Project Type**: pnpm monorepo (library packages plus a web app).

**Performance Goals**:
- Language-name search is no slower: the dialect index is not loaded for queries with ≥ 5 language hits.
- The first dialect search pays one lazy chunk of about 165 KB gzipped.

**Constraints**:
- deterministic output (langtags pinned by SHA, registry pinned by exact version);
- dependency direction (contracts is the root; lint and glottolog import only contracts);
- `/api` bundle safety (the parser is pure and loads no JSON);
- D3 (no new validating timer; tag findings run in the existing cycle).

**Scale/Scope**:
- data: 9,596 langtags tagsets (229 of them dialect tagsets), 13,392 searchable Glottolog dialects, 134 registered variants;
- corpus: 4,691 language IDs.

## Constitution Check

*Gate before Phase 0; re-checked after Phase 1 (below).*

| Principle | Assessment |
|---|---|
| Art. I (Pattern schema locked) | PASS: no `Pattern` or `Criterion` type change. `LanguageSummary` gains an optional field; criteria gain rows (data). |
| Art. II (IR is the spine) | PASS: no `.kmn` change; tags live in identity and the package descriptor. |
| Art. III (one working copy; decisions as live truth) | PASS: new values are decisions in the existing snapshot; `glottocode` on the working-copy identity patch. |
| Art. IV (validator layering) | PASS: well-formedness, minimality and variant-prefix checks are Layer C criteria rows in the existing studio criteria path; lint checks keep their rows. |
| Art. V (VirtualFS only) | PASS: no host writes; codegen runs at prebuild like langtags. |
| Art. VI (team split) | PASS: engine owns parser, search, question, codegen; content owns the criteria rows' ids and wording and the question's text (marked as proposals in contracts). |
| Art. VII (out of scope) | PASS: no `-u-`/`-t-` authoring (FR-027); no opaque-fragment editing. |
| Art. IX (registry) | PASS: `il_language_dialect` is declared in the registry with provides/requires; order derived; parity pins updated (R8). The registry declaration is a functional requirement here (FR-007). |
| Art. X (proposals) | PASS: the dialect subtag, region default and variant link are `default`-provenance proposals, confirmed by the author; language change re-proposes via `recalculate` (FR-010, FR-013). |
| Art. XI (done means integrated) | PASS if the manual walk (quickstart §5) passes on both paths; tasks will include it. |
| D3 single debounce | PASS: no timer added. Search loading is a lazy import, not a validation cycle. |
| `/api` bundle safety | PASS: `parseBcp47` is pure TS in contracts with no data import. |

No violations; no Complexity Tracking.

## Personal Data Check (Constitution Article XII, spec 100)

*Personal data: none — no new store, recipient, category, or telemetry.*

## Project Structure

### Documentation (this feature)

```text
specs/115-dialect-language-tags/
├── spec.md
├── plan.md               # this file
├── research.md           # R1-R11
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── bcp47-parser.md
│   ├── langtags-api.md
│   └── dialect-search-and-question.md
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
package.json                                   + devDependency language-subtag-registry@0.4.2; prebuild + codegen-variants
scripts/
  codegen-langtags.mjs                         keep dialect tagsets + windows; emit generated/dialects.ts (R3)
  codegen-glottolog.mjs                        keep Countries; emit generated/dialects.ts (R4)
  codegen-variants.mjs (new)                   IANA variants -> engine generated/variants.ts (R5)
packages/contracts/src/
  utils/bcp47.ts (+ test)                      parseBcp47, formatBcp47, scriptSubtagOf, regionSubtagOf (R1)
  langtags.ts                                  SearchMatch on LanguageSummary; DialectTagset, VariantEntry types
packages/contracts/data/criteria.json          rows 12.8, 12.9; 10.3 text (R6)
packages/engine/src/langtags/
  minimalTag.ts (+ test, property test)        minimalTag, minimalTagOf (R2)
  dialects.ts, variants.ts (+ tests)           dialectTagsetsFor, variantsFor, variantAllowed
  index.ts                                     lookupByName: folding, exact tier, dialect rows (R7)
  generated/{dialects,variants}.ts (new)       codegen output
  codegen-determinism.test.ts                  cover tagsets, dialects, variants
  kmcParity.corpus.test.ts (+ fixture)         FR-023 (R6)
packages/engine/src/ldml-export/lower/document.ts, ldml-export/package.ts   minimalLocale -> minimalTagOf
packages/engine/src/start-browser/kps-parser.ts                              extractScriptSubtag on the parser
packages/engine/src/{character-discovery,shared}/…                          scriptSubtagOf callers (behaviour check only)
packages/glottolog/
  package.json                                 ./dialects subpath
  src/dialects.ts (+ test), src/generated/dialects.ts (new)
packages/keyboard-lint/src/checks/criteria/check-bcp47.ts, check-currency.ts  use contracts parser
packages/studio/src/
  survey/resolveTypedLanguage.ts               compose engine + glottolog search (R7)
  survey/QuestionField.tsx                     match line in result labels
  survey/identityResolution.ts                 record search match; drop region gate (R9)
  survey/IdentityLite.tsx, identityLiteResult.ts, targetBcp47.ts
  survey/questions/a/il_language_dialect.ts (new), il_language_region.ts, il_language_english.ts
  survey/questions/flowModules.ts
  decisions/decisionTypes.ts, identitySelectors.ts
  lib/identityLanguagePatch.ts, stores/identityPatch.ts                      glottocode
  survey/languageList/LanguageListPanel.tsx                                   per-tag findings + fix (R10)
  criteria/languageTags.ts, assembleLintContext.ts, implementedChecks.ts, test/gateCoverage.ts
  components/rules/baseLayouts.ts, survey/questions/docLanguageTag.ts         parser
  steps/{stepOrder.parity.test.ts,manifest.specref.json}, lib/legacyStepIds.test.ts, decisions/orderParity.test.ts
utilities/facet-index/{build-index,declared-bcp47-tags-classifier}.ts       parser
```

**Structure Decision**: no new package. The parser sits in contracts because of dependency direction (R1). The minimal-tag function and variant data go in engine next to langtags (R2, R5). The Glottolog dialect index is a lazy subpath of glottolog, so engine gains no Glottolog dependency (R4). The studio composes the search and owns the question (R7, R8).

## Phases (one commit each, per the cadence rule)

1. **Parser and fixes** (FR-024, FR-025; US5).
   - `parseBcp47` and `formatBcp47`; move every reader onto them; replace the `lif-x-Deva` assertion.
   - Fix `minimalLocale` to keep private use and extensions.
   - Independent of everything else; ships alone.
2. **Data** (FR-026; R3, R4, R5).
   - Codegen changes for langtags, Glottolog and variants; determinism tests; the registry pin; `./dialects` subpath.
3. **Minimal tag** (FR-014-FR-018; US3).
   - `minimalTag` with the SC-003 property test.
   - `buildTargetBcp47` and the LDML export go through it.
   - Region available on demand for every language through "Specify a region…"; existing walks unchanged (R9).
4. **Validation** (FR-019-FR-023; US4).
   - Rows 12.8 and 12.9; 10.3 judged by `minimalTagOf`.
   - Open mode list findings and fix.
   - kmc parity corpus test and fixture.
5. **Search** (FR-001-FR-006; US1).
   - `lookupByName` folding and tiers; glottolog `searchDialects`; studio composition and labels.
   - SC-001, SC-002 and SC-007 measurements.
6. **Dialect question** (FR-007-FR-013; US2).
   - Decisions, question module, proposal rules, re-proposal, parity pins, glottocode on identity.
7. **Integration walk** (Art. XI).
   - Quickstart §5 on Copy and Open; `pnpm lint`; full package test runs.

Phases 1 and 2 are independent of each other. Phase 3 needs 1 and 2, phase 4 needs 1 and 3, phase 5 needs 2, and phase 6 needs 3 and 5.

## Constitution Check (post-design)

Re-checked against the contracts.
- The only shared-type change is the optional `match` on `LanguageSummary` and new types in `contracts/src/langtags.ts`. These are additive, with no contracts major bump (§17).
- Criteria row ids are marked as proposals for the content team.
- No new timer.
- No stored order.

Still PASS on every row above.
