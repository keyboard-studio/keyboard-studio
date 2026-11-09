# Contract: language chooser, dialect search and the dialect question

**Research**: R4, R7, R8, R9, R10, R12. **Types**: [data-model.md](../data-model.md).

## Dependencies

| Package | Version | Where | Use |
|---|---|---|---|
| `@ethnolib/find-language` | `0.4.4`, exact | `packages/studio` | search backend (R7) |
| `useLanguageChooser` | vendored from EthnoLib `language-chooser-react-hook` 0.3.7 | `packages/studio/src/survey/languageChooser/vendor/` | chooser state; MIT notice kept in the file header |

Both load only inside the language step's lazy chunk (FR-037).

## Glottolog dialect rows (`@keyboard-studio/glottolog/dialects`)

New subpath export in `packages/glottolog/package.json`; loaded by the studio with a dynamic `import()` only.

```ts
export interface GlottologDialectRow {
  name: string; folded: string; glottocode: string; parentIso: string; countries: string[];
}
export const dialectRows: readonly GlottologDialectRow[];
```

## Studio: dialect searcher and result modifier

```ts
// packages/studio/src/survey/languageChooser/dialectSearch.ts
export function makeDialectSearcher(rows: readonly GlottologDialectRow[]): LanguageSearcher; // EthnoLib class
export function dialectResultModifier(
  searcher: LanguageSearcher | null,
  parentFor: (iso: string) => ILanguage | undefined,  // find-language getLanguageBySubtag + macrolanguage mapping
): (results: ILanguage[], searchString: string) => ILanguage[];
```

The modifier:
1. Starts from EthnoLib's `defaultSearchResultModifier`.
2. Appends the dialect hits ranked by the same tiers. Each hit becomes its parent's `ILanguage` with `match: SearchMatch` attached, using `ILanguage`'s open index signature.
3. Drops a dialect hit whose parent is already listed at a stronger tier.
4. Adds a fallback row for an unresolvable parent: Glottolog's language name and the ISO code.

## Studio: code-or-tag layer and fallback rows (R12)

```ts
// packages/studio/src/survey/languageChooser/resolveTypedTag.ts
export function resolveTypedTag(text: string): TypedTagProposal | null;
// → { language, script?, region?, dialectSubtag?, registeredName?, warning? } when text parses (parseBcp47)
//   and its language subtag is registered (engine registeredLanguage) or private use.

export type FallbackRow =
  | { kind: "is-dialect"; text: string }      // FR-030
  | { kind: "unlisted"; text: string };       // FR-031/032
```

Displayed list:
1. The typed-tag proposal, if any, first.
2. Chooser results, with dialect hits appended.
3. The two fallback rows, whenever nothing ranks above the fuzzy tier (FR-029). They are also always reachable through a "Can't find it?" link.

## Behaviour kept from today's field (FR-038)

| Today | After |
|---|---|
| `LangtagsComboboxField` dropdown, up to 50 rows | Same combobox. Rows come from `useLanguageChooser().languageResults` (streamed by `asyncSearchForLanguage`), and each row renders `LanguageCard` content. |
| `resolveTypedLanguage` (unique primary name, else unique alias) | Kept; generalised from `LanguageSummary` to `ILanguage` (`exonym`, `names`). Same rule in the UI and the headless author. |
| `onEntryResolved` → `seedFromEntry` (code, script, autonym as `default` provenance) | Unchanged entry point. The chooser maps the `ILanguage` to the existing `LanguageDefaults` with `getLanguageDefaults(languageSubtag)`, after macrolanguage mapping. |
| `onSelectAdvance` | Unchanged. |

## Chooser UI (ported; no MUI)

`packages/studio/src/survey/languageChooser/`: `LanguageChooser.tsx`, `LanguageCard.tsx`, `ScriptCard.tsx`, `CustomizePanel.tsx`, `UnlistedLanguagePanel.tsx`.

**Cards**: name, autonym, alternate names, regions, code. When `match` is set, a second line:

| relation | Line |
|---|---|
| `dialect` | `Gascon: a dialect of Occitan (oc) · ES, FR` |
| `variety` | `Valencian: a variety of Catalan (ca)` |
| `alias` | `also called Kirundi` |

**Labels** (message ids, spec 046):
- "Search by name, code, or country"
- "Can't find it?"
- "*text* is a dialect: find its language"
- "Which language is *text* a dialect of?"
- "My language isn't listed"
- "I know its code"
- "Customize"

Accessible names include the match line (spec 056).

**Mapping to decisions** (research R7 table): written through the existing identity decision path (`identityResolution.onEntryResolved` and the answer commit), never directly to IR. The emitted tag is always `minimalTag` (FR-035).

## Decisions added (`decisionTypes.ts`)

| DecisionId | Value | Written by | IR paths |
|---|---|---|---|
| `language-search-match` | `SearchMatch` subset or `null` (includes the pending typed dialect name) | chooser pick, or "is a dialect" | `[]` |
| `language-dialect` | subtag string, `""` for none | `il_language_dialect` | `[]` |
| `language-dialect-source` | `registered-variant` \| `langtags` \| `from-name` \| `typed` \| `""` | `il_language_dialect` | `[]` |
| `language-glottocode` | glottocode or `""` | `il_language_dialect` | `[]` |

All persist via the decision snapshot. `deriveIdentityResult` reads them into `LanguageChoice`.

## Question modules (Article IX)

- **`il_language_english`**: unchanged declaration; its renderer becomes `LanguageChooser`.
- **`il_language_code`**: loses free text. Its value comes from the chooser, a typed tag, or the unlisted panel, each checked by FR-028/031. It renders as a confirmation with **Change**.
- **`il_language_dialect`** (new):

```ts
provides: ["language-dialect"],
requires: ["language-code", "target-script", "language-region"],
optional: true,
outputs: [{ target: "package-descriptor", field: "bcp47" }],
lookupDefault: (ctx) => DialectProposal | null,   // data-model § DialectProposal
```

It is registered in `flowModules.identity_lite`, `IDENTITY_QUESTIONS`, and the parity pins. Its position is whatever `orderDecisions` derives.

**Dialect question rendering**:
- With a proposal: one line, `Tag: oc-gascon (registered variant for Gascon)`, with **Confirm**, **Edit** and **No dialect**.
- Without one: `variantsFor(lang)` and `dialectTagsetsFor(lang)`, plus a "Dialect name" box.
- Edit validates on each keystroke with `parseBcp47`.

## Region (`il_language_region`, R9)

Routing:
- Routed automatically, as today, when langtags lists more than one region.
- For any other language, routed when the author uses "Specify a region…" (the chooser's **Customize**). That sets `ctx.ilRegionRequested`; existing walks are unchanged.

Options: the default region first (marked "default"), the other langtags regions, then "Other region…" (any ISO 3166-1 code). A region equal to the default is omitted from the tag.

## Open mode language list (`LanguageListPanel.tsx`, R10)

Each tag row and the add form show findings from `languageTagFindings(tags)`:

```ts
export function languageTagFindings(tags: readonly string[]): readonly TagFinding[];
```

A `hint` with `replacement` renders a "Use `<replacement>`" button that edits that row through the existing `onChange` and `setIdentity` path. The add form also offers the chooser.

## Criteria rows (`packages/contracts/data/criteria.json`)

| Row | Band | Change |
|---|---|---|
| new: `12.8-bcp47-tag-well-formed` | yellow-survey | FR-019; severity error |
| `10.3-kps-tags-minimal` | yellow-survey | judged by `minimalTagOf`; also duplicate minimal forms (FR-020, FR-022) |
| new: `12.9-bcp47-variant-prefix` | yellow-survey | FR-021; severity warning |
| `10.4-kps-unusual-tag-flagged` | yellow-survey | now also flags `qaa`–`qtz` private-use language codes (FR-032) |

Row ids are proposals for the content team (Article VI); final ids and wording are theirs. Every new row is wired through `implementedChecks.ts`, `gateCoverage.ts`, the review battery (`scripts/generate-review-battery.mjs`) and the criteria schema tests.

## Parity fixtures

| Test | Checks | Fixture |
|---|---|---|
| `packages/engine/src/langtags/kmcParity.corpus.test.ts` | studio vs kmc-package verdicts over the corpus (FR-023) | `kmcParity.fixture.json` |
| `packages/studio/src/survey/languageChooser/ethnolibParity.test.ts` | every EthnoLib language code resolves in pinned langtags with the same default script (FR-034) | `ethnolibParity.fixture.json` |
| `packages/studio/src/survey/languageChooser/searchParity.test.ts` | top-result code for 200 sampled names vs today's `lookupByName` (FR-006, SC-007) | `searchParity.fixture.json` |
