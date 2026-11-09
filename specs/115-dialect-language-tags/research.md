# Research: Language tags that describe dialects and variants

**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Each section records a decision, why, and what was rejected. Line references are to `main` at `4d6b490d`.

## R1. One BCP 47 parser, in `@keyboard-studio/contracts`

**Decision**: add `parseBcp47(tag)` and `formatBcp47(parts)` to `packages/contracts/src/utils/bcp47.ts`, built on the RFC 5646 grammar: language (with optional extlang), script, region, variants, extensions, private use, plus the irregular grandfathered tags. Every existing tag reader is rewritten on it:

| Reader | Where | Today's defect |
|---|---|---|
| `scriptSubtagOf` | `contracts/src/utils/bcp47.ts:27` | scans past `-x-`/`-u-` |
| `extractScriptSubtag` | `engine/src/start-browser/kps-parser.ts:74` | same |
| `regionSubtagOf` | `keyboard-lint/src/checks/criteria/check-bcp47.ts:104` | fails on extlang |
| `tagUsesRegion001` | `check-bcp47.ts:98` | scans every subtag, so `-x-001` trips it |
| mirror of `regionSubtagOf` | `studio/src/criteria/assembleLintContext.ts:96` | copy |
| region reader | `studio/src/components/rules/baseLayouts.ts:322` | no stop rule |
| `isScript`/`isRegion`/`BCP47_SHAPE` | `studio/src/criteria/languageTags.ts:11,98-99,161` | scan past singletons |
| `docLanguageTag` regex | `studio/src/survey/questions/docLanguageTag.ts:11` | any order passes, `x` rejected |

**Rationale**: the dependency rules decide placement. `.dependency-cruiser.cjs` makes contracts the root (`contracts-is-the-dependency-root`), and keyboard-lint and glottolog may import only contracts. Contracts already ships runtime code in this file (`scriptSubtagOf`, `resolveEffectiveScript`). A parser is pure syntax and needs no data.

**The `lif-x-Deva` test is wrong, not a requirement.** `bcp47.test.ts:32` asserts `scriptSubtagOf("lif-x-Deva") === "Deva"`. It was written in `08095b89` to exercise a loop index, not to support any keyboard. No `.kps` in the corpus uses `-x-`. And the pinned langtags has `-x-` tags whose private subtag is four letters: `buu-x-koya`, `ctu-x-tila`, `kfy-x-pash`, `kqe-x-east`, `kqe-x-west`. Today these read as scripts "Koya", "Tila", "Pash", "East", "West". The test is replaced by one asserting `undefined`.

**Alternatives rejected**:
- *`Intl.Locale` as the parser.* It canonicalises as it parses (`hy-arevmda` becomes `hyw`; variants are reordered), which is right for validation but wrong for reading what a file actually says. Node 22 also has no `.variants` accessor. It is used for the validity check (R5), not for reading.
- *`bcp-47` (npm).* Adequate, but a dependency for ~80 lines of grammar in the root package, which the `/api` bundle-safety rule makes us careful with.

## R2. Minimal tag from pinned langtags, not from `Intl.Locale.minimize()`

**Decision**: a new engine function `minimalTag(parts)` in `packages/engine/src/langtags/`. It matches on **parsed parts**, not on tag strings:
1. **Key**: (canonical language, variants, private use), taken from `parseBcp47`. Find the tagset with that key: the dialect tagset if there is one, else the language's bare tagset.
2. **Exact match**: if the choice's script and region equal that tagset's defaults, return its `tag` field.
3. **Otherwise**: omit script and region each where it equals *that tagset's* default, and format in canonical order (R1).

`resolveLangtag` (`tagsets.ts:77`) is not the lookup path. It matches whole strings and otherwise splits off a *trailing* region. For `ca-Latn-AD-valencia` the trailing subtag is the variant, so it returns null, and the defaults would wrongly come from bare `ca`. The row `ca + Latn + AD + valencia → ca-AD-valencia` in [langtags-api.md](contracts/langtags-api.md) is the test that tells the two designs apart.

**Test weight**: the SC-003 property test (every tagset's `full` minimises to its `tag`) is nearly tautological once step 2 returns `tag` directly; it guards the lookup key. The real tests of the rule are the fallback rows: non-default region with a dialect (`ca-AD-valencia`), a registered variant with no langtags tagset (`oc-gascon`), and a non-default script.

`buildTargetBcp47` (`studio/src/survey/targetBcp47.ts:89`) becomes a thin caller of it. The private `isSuppressedScript` (:43) and the LDML export's `minimalLocale` (`engine/src/ldml-export/lower/document.ts:49`) are replaced by it, which also fixes `minimalLocale` stripping everything after `-x-`/`-u-`.

**Rationale**: the user ruled that the tag names only what is not a default, and the spec's SC-003 asserts that for every langtags tagset the result equals the tagset's `tag`. Langtags is pinned by SHA (`scripts/langtags-version.json`), so the output is the same in every browser. `Intl.Locale.minimize()` uses the runtime's ICU likely-subtags, which differ between browser versions.

**Checked**: `Intl` and langtags agree on the spec's examples (`ca-ES-valencia` → `ca-valencia`, `sr-Latn-RS` → `sr-Latn`, `bfd-Latn-CM` → `bfd`, `oc-FR-gascon` → `oc-gascon`).

**Alternative rejected**: *`Intl.Locale.minimize()` as the source.* It is non-deterministic across runtimes and CLDR has no data for most minority languages; it returns `qaa-x-foo` unchanged and is silent on defaults langtags knows. It is kept as the cross-check in the parity fixture (R6).

## R3. Langtags codegen keeps variant and `-x-` tagsets

**Decision**: change `scripts/codegen-langtags.mjs`.
- Stop folding non-bare tagsets into the bare entry's `regionVariants` (:110-124 dedupes by region across all tagsets, so `-x-` tagsets carrying a region are swallowed).
- Emit a new generated module `generated/dialects.ts`: one row per variant or `-x-` tagset (229 at the pinned commit), with `tag`, `full`, parent language, dialect subtag, names, localnames, `variants`, `windows`.
- Keep `windows` on the existing tagset rows (`generated/tagsets.ts`, :323-333) as a sixth column.
- Extend `codegen-determinism.test.ts` to cover `tagsets.ts` and `dialects.ts`.

**Rationale**: `generated/tagsets.ts` already carries these rows but without names, so they can be resolved but not searched. A separate module keeps `index.ts` (2.96 MB, eager inside the lazily loaded `@keyboard-studio/engine/langtags` chunk) unchanged in shape.

**Alternative rejected**: *add the dialect rows to `defaultsIndex`.* That would change `LanguageDefaults` consumers that assume one row per language code.

## R4. Glottolog dialect name index as a lazy subpath of `@keyboard-studio/glottolog`

**Decision**:
- `scripts/codegen-glottolog.mjs` keeps `Countries` for languages and dialects, and emits a separate module, `generated/dialects.ts`. Each row is `[name, foldedName, glottocode, parentIso639_3, parentCountries]`. Only dialects whose `Language_ID` parent has an ISO code are kept: 13,392 rows, about 470 KB raw or 165 KB gzipped.
- Expose it as a new subpath export, `@keyboard-studio/glottolog/dialects`, with `searchDialects(query)`.
- The studio loads it with a dynamic `import()` when the language search returns fewer than five language-name hits, or when the dialect question opens.

**Measured at the pinned commit**:
- Every dialect's `Language_ID` points to a `language`-level languoid, so there is no nested-dialect walk.
- Only 461 of the 13,392 dialects carry their own `Countries`, so result rows show the parent's countries.
- No folded dialect name belongs to two different parents. FR-004's multi-parent listing arises from prefix matches (e.g. "Tigr…"), not exact ones.
- Every parent language has `Countries` (and 8,520 of 8,618 languages do), so FR-004 always has data.
- 123 dialects (0.9%) have a parent ISO code that is not a key in langtags' `defaultsIndex`. They come from 17 codes. Some are macrolanguage members that langtags files under the macrolanguage (`cmn` → `zh`, `arb` → `ar`). The studio maps these through the existing macrolanguage canonicalisation (`canonicalLanguageSubtag`, `macrolanguageMembers`) before `getLanguageDefaults`. Any code still unresolved is shown as a fallback row: Glottolog's language name and the ISO code, with no langtags summary. Picking it writes the ISO code as the language. Either way, SC-001's 95% is reachable.

**Why a glottolog subpath rather than engine**: engine does not depend on glottolog, and adding that edge for a search index is not worth it. The studio already depends on both, so it composes the two searches (R7). `genealogyTier.ts` imports glottolog's main entry statically; the new subpath is separate so that path's bundle does not grow.

**Alternatives rejected**:
- *Put dialect names into langtags codegen.* That mixes two pinned sources in one generated file and makes the engine's language chunk 470 KB bigger for every author.
- *Fetch Glottolog's `names.csv` for alternate names.* Deferred (spec Assumptions). It is a new pinned file and a large one; the primary-name index answers the spec's SC-001 target.

## R5. IANA variant registry from an exact-pinned npm package

**Decision**: add `language-subtag-registry` at exactly `0.4.2` as a root devDependency. It is CC0-1.0, published 2025-12-09, and carries registry `File-Date` 2025-08-25. A new `scripts/codegen-variants.mjs` reads its `variant.json` and writes `packages/engine/src/langtags/generated/variants.ts`: 134 rows of subtag, descriptions and prefixes. It joins the prebuild chain after `codegen-langtags`.

**Rationale**:
- The registry URL (`iana.org/assignments/language-subtag-registry`) has no version, so a SHA pin there breaks every time IANA republishes.
- An exact npm version plus `pnpm-lock.yaml` is the same guarantee langtags gets from its commit pin.
- CC0 places no conditions on redistribution of the generated table.

**Checked against 0.4.2**: `gascon` → `oc`, `valencia` → `ca`, `lengadoc` → `oc`, `rozaj` → `sl`, `biske` → `sl-rozaj`, `1994` → `sl-rozaj` (and its four sub-chains).

**Alternatives rejected**:
- *A fetch script modelled on `fetch-glottolog.mjs`.* The mutable URL defeats the checksum.
- *The `language-tags` package.* It wrongly rejects the registered chain `sl-rozaj-biske` as a duplicate variant, and rejects the private-use language range `qaa..qtz`.

## R6. Validation: `Intl.Locale` for well-formedness, langtags for minimality, kmc as the oracle

**Decision**:
- **Well-formed (FR-019)**: `parseBcp47` (R1) decides. A new criteria row says "every language tag is well-formed BCP 47" (no row covers it; 12.7 covers "resolves in langtags").
- **Minimal (FR-020)**: extend row 10.3 (`10.3-kps-tags-minimal`, `studio/src/criteria/languageTags.ts:256`) to compare against `minimalTag` (R2) instead of `shorterEquivalents` (:102). The latter only knows script and region.
- **Variant prefix (FR-021)**: new check against the variant table (R5).
- **Duplicate minimal form (FR-022)**: reported under 10.3, as Keyman's `HINT_PackageShouldNotRepeatLanguages` does.
- **Parity (FR-023)**: a new engine test calls `PackageValidation.checkForDuplicatedOrNonMinimalLanguages` from `@keymanapp/kmc-package` directly. engine already depends on it, lazily, at `output/kmp.ts:131`. The test runs it over every `.kps` language ID in `../keyboards` and compares verdicts with the studio's. Disagreements live in a checked-in fixture, each with a reason; the test fails on any disagreement not in the fixture.

**Rationale**: kmc uses `new Intl.Locale(id).minimize()`, so its minimality verdicts follow CLDR. Where CLDR and langtags differ, the studio follows langtags (R2) and lists the difference, as the spec's FR-023 requires. The test skips visibly when `../keyboards` is absent, like the other corpus tests.

## R7. Search composition in the studio

**Decision**: `languageResultsFor` (`studio/src/survey/resolveTypedLanguage.ts:56`) merges three sources into one ranked list:
1. engine `lookupByName`, which gains diacritic folding, an exact-name tier, and langtags dialect rows (R3);
2. glottolog `searchDialects` (R4), loaded lazily;
3. the existing `listLanguages` for an empty query.

The result type `LanguageSummary` (`contracts/src/langtags.ts:91`) gains optional `match?: { name, relation, source, glottocode?, dialectTag?, countries? }`.

Rank tiers (FR-003):
1. exact code;
2. exact name, language before dialect;
3. language or langtags-name prefix;
4. dialect prefix;
5. substring.

`nameOptionLabel` (`QuestionField.tsx:327`) renders `match` as the "why it matched" line. The 50-option cap (:342) is unchanged.

**Rationale**: FR-006 requires language-name results to be unchanged when no dialect matches, which falls out of appending dialect tiers below the existing ones.

## R8. The dialect question in the decision registry

**Decision**: new question module `studio/src/survey/questions/a/il_language_dialect.ts`, modelled on `il_language_region` (optional, `outputs` bcp47) and `il_target_script` (`lookupDefault`).
- **provides**: `language-dialect`.
- **requires**: `language-code`, `target-script`, `language-region`.
- **Membership**: `flowModules.identity_lite` (`flowModules.ts:143`).
- **DecisionIds**: `language-dialect` (the subtag), `language-dialect-source`, `language-glottocode`. They are added to `decisionTypes.ts:11` and `decisionIRPaths` (:287, `[]`).
- **Selector**: an `IDENTITY_QUESTIONS` row (`identitySelectors.ts:168`).
- **Persistence**: the decision snapshot, so drafts persist it automatically (`draftPersistence.ts:855`).

The chosen search match is recorded as a decision too. Today it lives only in closure state (`identityResolution.ts:52`), which a resumed draft loses. FR-013's re-proposal comes from the existing `recalculate` and downstream closure, because the question `requires` `language-code`.

**Rationale**: Article IX: the question exists only through the registry, and its position comes from `orderDecisions` over provides/requires. The stored `next` edges are routing, not order; the parity pins (`stepOrder.parity.test.ts:159`, `legacyStepIds.test.ts:98`, `orderParity.test.ts`, `manifest.specref.json`) are updated in the same change.

## R9. Region for any language (FR-017)

**Decision**: the region becomes **available on demand**, not shown to everyone. FR-017 says "available", and US3 scenario 2 says "when the author wants a region".
- **Ambiguous languages** (`hasRegionVariants`, about 2.6% of languages): the region question is routed as today; `identityResolution.nextOverride` (:242) is unchanged.
- **All other languages**: the identity screen shows a "Specify a region…" link under the language confirmation. It opens the same `il_language_region` question.
  - The question is still routed only through the registry; the link sets the routing input `ctx.ilRegionRequested`.
  - The default region is pre-filled.
  - Nothing is written unless the author picks a region.
- **Region options**: the language's langtags `regions` with `defaultRegion` first and marked "default", then "Other region…" for any ISO 3166-1 code.
- `minimalTag` drops a region equal to the default (R2).
- Help text changes from "used in more than one place" to "where the keyboard is for, if it matters".

**Rationale**: always routing the question would add a screen for about 97% of authors. That would also change the golden-walk e2e, the step parity pins and the headless walks, and the spec does not call for it. The on-demand link adds no screen to any existing walk.

**Alternative rejected**: always route the region question with the default pre-selected. It is one extra confirmation per author for a choice almost nobody needs.

## R10. Open mode language list (FR-019/020)

**Decision**: `LanguageListPanel.tsx` gains per-tag findings from the same validators (R6). They render inline on each `<li>` (:105) and on the add form (:140). A non-minimal tag's hint carries an "Use `sr-Latn`" action that calls the same `onChange` and `setIdentity` path as an edit.

The `.kmn`-only upgrade-pair mechanism (`upgradePairs.ts:65`) is not reused. It targets file text, and a tag lives in identity.

## R11. Unknowns carried forward (not blocking)

- **keyman.com search**: does a search for `oc` find a keyboard listing only `oc-gascon`? Not verifiable from docs. Recorded; the owner ruled dialect tag only.
- **Windows registration of `-x-` tags**: keep langtags' `windows` field (R3); no behaviour change.
- **Glottolog alternate names**: deferred (R4).
