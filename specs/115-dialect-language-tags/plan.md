# Implementation Plan: Language tags that describe dialects and variants

**Spec**: [spec.md](spec.md) | **Branch**: `115-dialect-language-tags` | **Date**: 2026-11-09

**Input**: Feature specification from `specs/115-dialect-language-tags/spec.md`

## Summary

Make a dialect expressible end to end:
- one BCP 47 parser in contracts;
- a minimal-tag function in engine, driven by the pinned langtags;
- SIL's shared language chooser (EthnoLib, as in Bloom) as the language search: its backend adopted, its hook vendored, its UI ported into the existing combobox;
- a lazily loaded Glottolog dialect index plugged into that search;
- a code-or-tag layer and "nothing matches" fallbacks, so no path leaves the code blank;
- a new optional dialect question in the decision registry;
- region available for every language;
- tag validation that matches Keyman's package compiler.

The existing tag readers that misread private use and extensions are moved onto the parser, which fixes them. Decisions are in [research.md](research.md) (R1-R11).

## Technical Context

**Language/Version**: TypeScript 5 (ES2022), Node ≥ 22.19 (build and tests); browsers for the studio.

**Primary Dependencies**:
- existing `@keyboard-studio/{contracts,engine,glottolog,studio,keyboard-lint}`;
- `@keymanapp/kmc-package` (already an engine dependency, test oracle only);
- **new** `@ethnolib/find-language@0.4.4` (MIT, exact pin), a studio runtime dependency, with transitive `fuse.js`, `iso-15924` and `iso-3166` (R7);
- **vendored** `useLanguageChooser` from EthnoLib `language-chooser-react-hook` 0.3.7 (MIT; typings missing upstream) (R7);
- **new** root devDependency `language-subtag-registry@0.4.2`, exact pin, codegen input only (R5, R12);
- `Intl.Locale` (built in) for the parity cross-check only.

**Storage**: none new. Three new decisions plus a search-match decision persist in the existing decision snapshot (`draftPersistence.ts:855`); `glottocode` rides on `IdentityPatch`.

**Testing**: vitest per package (studio in jsdom); corpus tests against `../keyboards` (skip visibly when absent); Playwright CLI manual walk.

**Target Platform**: browser SPA (Vite) plus Node build scripts.

**Project Type**: pnpm monorepo (library packages plus a web app).

**Performance Goals**:
- No change to the first page load: the chooser chunk (about 770 KB gzipped; EthnoLib embeds its data, and it is not tree-shakeable) loads with the language step (FR-037).
- The dialect index (about 165 KB gzipped) loads on the first query of 3 or more characters, or when the dialect question opens, never on first page load.
- Suggestions keep pace with typing: EthnoLib's `asyncSearchForLanguage` streams results.

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
| Art. IX (registry) | PASS: `il_language_dialect` is declared in the registry with provides/requires; order derived; parity pins updated (R8). The registry declaration is a functional requirement here (FR-007). The EthnoLib chooser is a renderer for existing decisions, with no surface of its own (FR-036, R7 mapping table). |
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
package.json                                   + devDependency language-subtag-registry@0.4.2; prebuild + codegen-registry
scripts/
  codegen-langtags.mjs                         key defaults on language subtag (R13); keep dialect tagsets + windows; emit generated/dialects.ts (R3)
  codegen-glottolog.mjs                        keep Countries; emit generated/dialects.ts (R4)
  codegen-registry.mjs (new)                   IANA variants + language subtags -> engine generated/{variants,registeredLanguages}.ts (R5, R12)
packages/contracts/src/
  utils/bcp47.ts (+ test)                      parseBcp47, formatBcp47, scriptSubtagOf, regionSubtagOf (R1)
  langtags.ts                                  SearchMatch on LanguageSummary; DialectTagset, VariantEntry types
packages/contracts/data/criteria.json          rows 12.8, 12.9; 10.3 text (R6)
packages/engine/src/langtags/
  minimalTag.ts (+ test, property test)        minimalTag, minimalTagOf (R2)
  dialects.ts, variants.ts, registry.ts (+ tests)  dialectTagsetsFor, variantsFor, variantAllowed, registeredLanguage
  index.ts                                     exports; lookupByName unchanged (R7)
  generated/{dialects,variants,registeredLanguages}.ts (new)  codegen output
  codegen-determinism.test.ts                  cover tagsets, dialects, variants
  kmcParity.corpus.test.ts (+ fixture)         FR-023 (R6)
packages/engine/src/ldml-export/lower/document.ts, ldml-export/package.ts   minimalLocale -> minimalTagOf
packages/engine/src/start-browser/kps-parser.ts                              extractScriptSubtag on the parser
packages/engine/src/{character-discovery,shared}/…                          scriptSubtagOf callers (behaviour check only)
packages/glottolog/
  package.json                                 ./dialects subpath
  src/dialects.ts (+ test), src/generated/dialects.ts (new)
packages/keyboard-lint/src/checks/criteria/check-bcp47.ts, check-currency.ts  use contracts parser
packages/studio/package.json                   + @ethnolib/find-language@0.4.4
packages/studio/src/
  survey/languageChooser/ (new)                LanguageChooser, LanguageCard, ScriptCard, CustomizePanel,
                                               UnlistedLanguagePanel; dialectSearch.ts; resolveTypedTag.ts;
                                               vendor/useLanguageChooser.ts (MIT notice); parity tests + fixtures
  survey/resolveTypedLanguage.ts               generalise to ILanguage; same rule for UI and headless (FR-038)
  survey/QuestionField.tsx                     language field renders the chooser inside the existing combobox
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

**Structure Decision**: no new package.
- The parser sits in contracts because of dependency direction (R1).
- The minimal-tag function and registry data go in engine, next to langtags (R2, R5).
- The Glottolog dialect index is a lazy subpath of glottolog, so engine gains no Glottolog dependency (R4).
- EthnoLib is a studio dependency only; engine, contracts and lint do not see it. That keeps the emitted tag on our pinned data (FR-035).
- The studio hosts the chooser and owns the question (R7, R8).

## Phases (one commit each, per the cadence rule)

The phase list is [tasks.md](tasks.md); in summary:

1. **Setup and foundational**: dependency pins; the parser; types; codegen for langtags (with the R13 fix as its own commit), Glottolog and the registry.
2. **US5 preservation**: every tag reader moved onto the parser. Ships alone.
3. **US1 chooser and dialect search**:
   - EthnoLib backend, vendored hook, ported UI inside the existing combobox, with FR-038 behaviours kept;
   - the Glottolog dialect modifier;
   - the parity fixtures FR-006 and FR-034.
4. **US6 nothing matches**: the code-or-tag layer, fallback rows, the unlisted panel, and `il_language_code` checked.
5. **US3 minimal tag**: `minimalTag`, and region on demand.
6. **US2 dialect question**.
7. **US4 validation and kmc parity**.
8. **Integration walk** (Article XI).

## Constitution Check (post-design)

Re-checked against the contracts.
- The only shared-type change is the optional `match` on `LanguageSummary` and new types in `contracts/src/langtags.ts`. These are additive, with no contracts major bump (§17).
- Criteria row ids are marked as proposals for the content team.
- No new timer.
- No stored order.

Still PASS on every row above.
