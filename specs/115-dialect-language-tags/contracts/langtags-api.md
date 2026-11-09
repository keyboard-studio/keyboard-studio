# Contract: engine langtags additions (`@keyboard-studio/engine/langtags`)

**Module**: `packages/engine/src/langtags/`. **Research**: R2, R3, R5, R7. **Types**: [data-model.md](../data-model.md).

```ts
// R2: minimal tag from pinned langtags
export interface TagChoice {
  language: string;          // any form; canonicalised
  script?: string;
  region?: string;
  variants?: string[];
  privateUse?: string[];
  extensions?: Bcp47Parts["extensions"]; // carried through untouched (FR-025)
}
export function minimalTag(choice: TagChoice): string;
export function minimalTagOf(tag: string): string | null; // null when not well-formed

// R3: langtags variant and -x- tagsets
export function dialectTagsetsFor(language: string): readonly DialectTagset[];

// R5: IANA variant registry
export function variantEntry(subtag: string): VariantEntry | undefined;
export function variantsFor(tag: string): readonly VariantEntry[];   // prefix-filtered
export function variantAllowed(tag: string, variant: string): boolean;

// R7: lookupByName gains folding, an exact-name tier and dialect rows
export function lookupByName(query: string): readonly LanguageSummary[]; // signature unchanged
```

## `minimalTag` (each line is a test)

| Choice | Result |
|---|---|
| ca + Latn + ES + `valencia` | `ca-valencia` |
| ca + Latn + AD + `valencia` | `ca-AD-valencia` (defaults from the valencia tagset, not bare `ca`) |
| acr + GT + `x-rabinal` (GT is the tagset default) | `acr-x-rabinal` |
| sr + Latn + RS | `sr-Latn` |
| fr + Latn + CA | `fr-CA` |
| bfd + Latn + CM | `bfd` |
| acr + `x-rabinal` | `acr-x-rabinal` |
| oc + FR + `gascon` (no langtags tagset) | `oc-gascon` (defaults from `oc`'s tagset) |
| ewo + Arab | `ewo-Arab` |
| en + US + `u-co-phonebk` | `en-u-co-phonebk` (extension kept, region dropped as default) |
| `cat` (3-letter form) + Latn | `ca` |

**Lookup key**: (canonical language, variants, private use) from `parseBcp47`; never `resolveLangtag`'s string match (research R2).

**Property test (SC-003)**: for every tagset in the pinned langtags, `minimalTag(parse(full))` equals the tagset's `tag`. This guards the lookup key. The fallback rows above test the rule itself.

**Replaces**: `isSuppressedScript` and the default-script logic in `studio/src/survey/targetBcp47.ts:43,89`, and `minimalLocale` in `ldml-export/lower/document.ts:49` (whose callers `document.ts:286` and `ldml-export/package.ts:58` call `minimalTagOf`).

## `lookupByName` changes

- Diacritic and case folding on the query and on every name (FR-005).
- New tier after exact code: an exact folded match on the English name or an alias (FR-003).
- langtags dialect rows (R3) are searched after language rows. A hit returns the parent language's `LanguageSummary` with `match` set.
- **Unchanged ordering** for queries whose results contain no `match` (FR-006); pinned by a snapshot test over 200 sampled names.
