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
- Expose it as a new subpath export, `@keyboard-studio/glottolog/dialects`, with the rows only.
- Search is a second EthnoLib `LanguageSearcher` built over those rows and the langtags dialect tagsets (R3). It plugs in through the chooser's `searchResultModifier`.
- The modifier gets no tier information from EthnoLib, so placement uses a query-and-names rule. Close dialect hits go before EthnoLib's fuzzy results ([contract § merge rule](contracts/dialect-search-and-question.md#merge-rule)).
- The studio loads the rows with a dynamic `import()` on the first query of 3 or more characters, or when the dialect question opens.

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

**Decision**: add `language-subtag-registry` at exactly `0.4.2` as a root devDependency. It is CC0-1.0, published 2025-12-09, and carries registry `File-Date` 2025-08-25. A new `scripts/codegen-registry.mjs` reads two files from it:
- `variant.json` → `packages/engine/src/langtags/generated/variants.ts`: 134 rows of subtag, descriptions and prefixes;
- `language.json` → `generated/registeredLanguages.ts`: about 8,200 rows of subtag, description, scope and macrolanguage, for the FR-028 code check.

It joins the prebuild chain after `codegen-langtags`.

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

## R7. Adopt SIL's shared language chooser (EthnoLib) — owner ruling 2026-11-09

**Decision**: the author-facing language search becomes EthnoLib's, as used by Bloom (`BloomDesktop/src/BloomBrowserUI/package.json`: `@ethnolib/language-chooser-react-mui` 0.4.4).

| Piece | Use | How |
|---|---|---|
| `@ethnolib/find-language` 0.4.4 (MIT) | **Adopt as a dependency**, exact pin | `asyncSearchForLanguage` and `LanguageSearcher` for search; `searchResultModifier` for dialect results; `splitTag` / `isValidBcp47Tag` only as UI hints, never for output |
| `useLanguageChooser` (hook) | **Vendor the TS source** into the studio (MIT, with attribution) | The published `@ethnolib/language-chooser-react-hook` 0.3.7 has no `.d.ts` (its `package.json` names one), and it inlines its own copy of find-language's data. Importing both packages would ship the data twice (about 1.5 MB compressed). The vendored source imports `@ethnolib/find-language`: one copy, with types. Its React use is plain hooks and works on React 18. |
| `LanguageChooser`, `LanguageCard`, `ScriptCard`, `CustomizeLanguageDialog` (MUI) | **Port the design**, not the code | The package needs React 17 and MUI 5; the studio is React 18 without MUI. They are rebuilt as studio components with the studio's styles, message ids (spec 046) and accessible names (spec 056), keeping EthnoLib's labels where they fit ("Search by name, code, or country", "Create Unlisted Language" becomes "My language isn't listed", "Customize"). |
| `createTag`, `createTagFromOrthography`, `getShortestSufficientLangtag` | **Not on the output path** (FR-035) | Measured: `createTag({languageCode:"oc", dialectCode:"Gascon"})` gives `oc-x-Gascon`, which is private use, mixed case, and ignores the registered `gascon` variant. `getShortestSufficientLangtag("ca-Latn-AD-valencia")` returns `undefined`. The emitted tag stays `minimalTag` (R2) with the FR-008 preference order. |

**What it gives us, measured on 0.4.4**:
- the tiers complete, whole-word, start-of-word, substring and fuzzy (fuse.js): "Bafutt" → Bafut, "Ewondoo" → Ewondo;
- search by country: "Cameroon" → 251 languages;
- search by code: `bft` → Balti;
- langtags `-x-` names: "Rabinal" → Achi.

**What it does not do (ours to add)**:
- Glottolog dialects: "Sursilvan" and "Lengadocian" return nothing (R4, via `searchResultModifier`).
- Full tags: `oc-gascon` returns nothing (R12).
- The "dialect of…" relation line (FR-002).
- The unmatched-dialect path (R12).

**Costs**:
- **Bundle**: the data is embedded in the module and not tree-shaken. Importing only `LanguageSearcher` or `createTag` still bundles about 770 KB compressed (esbuild, minified). It sits behind the same lazy boundary as the language step (FR-037); our engine langtags chunk is already lazy, and the two load together on that step.
- **Two snapshots**: EthnoLib's data is its own committed langtags copy (`find-language/language-data/languageData.json`, last updated 2026-07-29 in `fca1c7e`, "langtags.json API 1.4"), not pinned to our langtags commit. The FR-034 parity test checks every chooser code against our pinned langtags. Spot checks agree on defaults (ewo, bfd, aln, oc, ca, acr, sr).

**Mapping into decisions (Article IX, FR-036)**: the chooser is a renderer; the decisions and registry declarations are unchanged.

| Chooser state | Decision |
|---|---|
| `selectedLanguage.exonym` | `language-name` |
| `selectedLanguage.languageSubtag`, canonicalised | `language-code` |
| `selectedScript.code` | `target-script` |
| `customizableLanguageDetails.region.code` | `language-region` |
| `customizableLanguageDetails.dialect` | the dialect **name** → `proposeDialect` → `language-dialect` (FR-008) |
| the dialect-result match | `language-search-match` |

**Superseded**: the earlier plan to extend engine `lookupByName` into the author-facing search. `lookupByName` stays as is for its other callers (criteria, defaults, headless resolution).

**Upstream** (non-blocking, filed as issues on sillsdev/EthnoLib): missing hook typings; data not separable from code (prevents tree-shaking and lets a host supply pinned data); `createTag` not lowercasing private use or offering registered variants.

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

## R12. Nothing matches (User Story 6)

**Decision**: a thin layer in front of the chooser's search, plus two fallback rows at the end of every result list that has no hit above the fuzzy tier.

1. **Code or tag first (FR-028).**
   - If the text parses as a BCP 47 tag (`parseBcp47`, R1) and its language subtag is registered, propose its parts. The chooser's search alone returns nothing for `oc-gascon`.
   - The registered language subtags come from the same pinned `language-subtag-registry@0.4.2` (R5). T004's codegen also emits `language.json`: subtag, description, scope and macrolanguage, about 8,200 rows.
2. **"*text* is a dialect: find its language" (FR-030).**
   - Writes the pending dialect name to the `language-search-match` decision (`relation: "dialect"`, `source: "typed"`), clears the search box, and re-labels the box "Which language is *text* a dialect of?".
   - Picking a language keeps the pending name; `proposeDialect` uses it as its third preference.
3. **"My language isn't listed" (FR-031, FR-032).**
   - Mirrors EthnoLib's unlisted path (`UNLISTED_LANGUAGE`, `qaa`) and manual tag entry (`selectManuallyEnteredTagLanguage`), with our checks added:
     - the registry check on the code;
     - the made-from-name rule for `qaa-x-…`;
     - a link to SIL's ISO 639-3 request process.
   - Where EthnoLib's syntax check (`isValidBcp47Tag`) differs from ours, ours decides (`parseBcp47`).
4. **`il_language_code` loses free text (FR-033).** It becomes the confirmation of what the chooser produced; editing it runs the FR-028 check.

**Measured**: Glottolog cannot supply a code for unlisted languages. Only 16 of its 759 languages without an ISO code have a "closest ISO" code, and most of the 759 are extinct. So `qaa-x-` is the honest proposal.

## R13. Languages missing from the studio's langtags index (shipped defect)

`codegen-langtags.mjs:140` keeps only tagsets whose `tag` has no hyphen. Languages whose canonical langtags tag carries a region or script have no bare tagset, so they are dropped from `defaultsIndex` and from search. That is 15 languages at the pinned commit:
- `zh` (Chinese), `isv` (Interslavic), `con` (Cofán), `aux`, `nul`, `ocm`, `prn`, `sgn`, `spx`, `tpo`, `txr`, `xaq`, `xcc`, `xce`, `xib`.

**Decision**: key `defaultsIndex` on the language subtag, taking the tagset whose `tag` is shortest for each language. This is fixed in Phase 2 as its own commit: it is a shipped defect outside the feature, and the FR-034 parity test needs it, since EthnoLib has `zh`. CJK authoring stays out of scope (Article VII); the language being findable is not authoring.

## R11. Unknowns carried forward (not blocking)

- **keyman.com search**: does a search for `oc` find a keyboard listing only `oc-gascon`? Not verifiable from docs. Recorded; the owner ruled dialect tag only.
- **Windows registration of `-x-` tags**: keep langtags' `windows` field (R3); no behaviour change.
- **Glottolog alternate names**: deferred (R4); the fuzzy tier (R7) covers some spelling variants.
- **Keyman keyboards repository and `qaa-x-` tags**: unverified; row 10.4 flags, nothing blocks.
- **EthnoLib data refresh cadence**: manual upstream. The FR-034 fixture is re-reviewed on every `@ethnolib/find-language` bump.
