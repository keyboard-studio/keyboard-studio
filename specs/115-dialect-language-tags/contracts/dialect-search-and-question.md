# Contract: dialect search and the dialect question

**Research**: R4, R7, R8, R9, R10. **Types**: [data-model.md](../data-model.md).

## Glottolog dialect index (`@keyboard-studio/glottolog/dialects`)

New subpath export in `packages/glottolog/package.json`; loaded by the studio with a dynamic `import()` only.

```ts
export interface DialectHit {
  name: string;
  glottocode: string;
  parentIso: string;      // ISO 639-3
  countries: string[];    // own, else parent's
  tier: 1 | 3 | 4;        // exact, prefix, substring
}
export function searchDialects(query: string, limit?: number): readonly DialectHit[];
```

Folding as in `lookupByName`. A query shorter than 3 characters returns `[]`.

## Studio search composition (`resolveTypedLanguage.ts`)

`languageResultsFor(mod, text)` becomes async-tolerant:
1. Run engine `lookupByName(text)`.
2. If fewer than 5 results, or any result has a `match`, await the dialect index and run `searchDialects(text)`.
3. Map each dialect hit to its parent's `LanguageSummary` (via `getLanguageDefaults(parentIso)`), set `match`, and drop hits whose parent is already listed with a stronger tier.
4. Order by tier, then the existing alphabetical tie-break; cap at 50.

The headless path (spec 107) uses the same function.

**Result label** (`nameOptionLabel`, `QuestionField.tsx:327`): the existing label, plus a second line when `match` is set:

| relation | Line |
|---|---|
| `dialect` | `Gascon: a dialect of Occitan (oc) · FR, ES` |
| `variety` | `Valencian: a variety of Catalan (ca)` |
| `alias` | `also called Kirundi` |

Accessible name includes both lines (spec 056).

## Decisions added (`decisionTypes.ts`)

| DecisionId | Value | Written by | IR paths |
|---|---|---|---|
| `language-search-match` | `SearchMatch` subset or `null` | language pick (`identityResolution.onEntryResolved`) | `[]` |
| `language-dialect` | subtag string, `""` for none | `il_language_dialect` | `[]` |
| `language-dialect-source` | `registered-variant` \| `langtags` \| `from-name` \| `typed` \| `""` | `il_language_dialect` | `[]` |
| `language-glottocode` | glottocode or `""` | `il_language_dialect` | `[]` |

All persist via the decision snapshot. `deriveIdentityResult` reads them into `LanguageChoice`.

## Question module `il_language_dialect` (Article IX)

```ts
// studio/src/survey/questions/a/il_language_dialect.ts
provides: ["language-dialect"],
requires: ["language-code", "target-script", "language-region"],
optional: true,
outputs: [{ target: "package-descriptor", field: "bcp47" }],
lookupDefault: (ctx) => DialectProposal | null,   // data-model § DialectProposal
```

Registered in `flowModules.identity_lite`, `IDENTITY_QUESTIONS`, and the parity pins (`stepOrder.parity.test.ts`, `legacyStepIds.test.ts`, `orderParity.test.ts`, `manifest.specref.json`). Its position is whatever `orderDecisions` derives; no stored order.

**Rendering**:
- With a proposal: one line, `Tag: oc-gascon (registered variant for Gascon)`, with **Confirm**, **Edit** and **No dialect**.
- Without one: a list of `variantsFor(lang)` and `dialectTagsetsFor(lang)`, and a text box "Dialect name", which proposes a made-from-name subtag.
- Edit validates on each keystroke with `parseBcp47`. Confirm is disabled with the parser's reason shown.

## Region question (`il_language_region`, R9)

Routing:
- Routed automatically, as today, when langtags lists more than one region.
- For any other language, routed when the author uses "Specify a region…" on the identity screen. The link sets `ctx.ilRegionRequested`; existing walks are unchanged.

Options: the default region first (marked "default"), the other langtags regions, then "Other region…" (any ISO 3166-1 code). The default is pre-filled, and a region equal to the default is omitted from the tag.

## Open mode language list (`LanguageListPanel.tsx`, R10)

Each tag row and the add form show findings from `languageTagFindings(tags)`:

```ts
export function languageTagFindings(tags: readonly string[]): readonly TagFinding[];
```

A `hint` with `replacement` renders a "Use `<replacement>`" button that edits that row through the existing `onChange` and `setIdentity` path.

## Criteria rows (`packages/contracts/data/criteria.json`)

| Row | Band | Change |
|---|---|---|
| new: `12.8-bcp47-tag-well-formed` | yellow-survey | FR-019; severity error |
| `10.3-kps-tags-minimal` | yellow-survey | judged by `minimalTagOf`; also reports duplicate minimal forms (FR-020, FR-022) |
| new: `12.9-bcp47-variant-prefix` | yellow-survey | FR-021; severity warning |

Row ids are proposals for the content team (Article VI); final ids and wording are theirs. Every new row is wired through `implementedChecks.ts`, `gateCoverage.ts`, the review battery (`scripts/generate-review-battery.mjs`) and the criteria schema tests.
