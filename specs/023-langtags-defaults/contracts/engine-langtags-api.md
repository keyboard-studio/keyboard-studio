# Contract: `@keyboard-studio/engine/langtags`

New engine subpath export (mirrors `@keyboard-studio/engine/placement`). Pure, synchronous lookups
over the checked-in slim index. No I/O, no network, no host-disk access.

## Exports

```ts
import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

/**
 * Look up the default orthography for a language subtag (2- or 3-letter,
 * case-insensitive). Returns null when the subtag is not in the dataset.
 */
export function getLanguageDefaults(subtag: string): LanguageDefaults | null;

/** All languages in the dataset, as lightweight summaries (for the picker list). */
export function listLanguages(): readonly LanguageSummary[];

/**
 * Search languages by code, English name, or autonym (case-insensitive).
 * Ordering: exact-code > englishName-prefix > autonym-prefix > substring,
 * ties alphabetical by englishName. Empty query returns [].
 */
export function lookupByName(query: string): readonly LanguageSummary[];
```

## Behavioral contract

| ID | Given | When | Then |
|---|---|---|---|
| C1 | subtag `"ha"` | `getLanguageDefaults("ha")` | `{ code:"ha", defaultScript:"Latn", defaultRegion:"NG", autonym, englishName:"Hausa", … }` |
| C2 | subtag `"hi"` | `getLanguageDefaults("hi")` | `defaultScript:"Deva"`, `defaultRegion:"IN"` |
| C3 | 3-letter `"hau"` | `getLanguageDefaults("hau")` | resolves to the same record as `"ha"` |
| C4 | mixed case `"HA"` | `getLanguageDefaults("HA")` | same as `"ha"` (case-insensitive) |
| C5 | unknown `"zzz"` | `getLanguageDefaults("zzz")` | `null` (never throws) |
| C6 | any | `listLanguages()` | non-empty; every entry has `code` + `englishName` |
| C7 | `"haus"` | `lookupByName("haus")` | includes Hausa, matched by englishName prefix |
| C8 | autonym text | `lookupByName(autonym)` | includes the language whose `localname` matches |
| C9 | `""` | `lookupByName("")` | `[]` |

## Consumer contract (studio)

- The slim index is imported **lazily** (dynamic `import()`) so it is a separate chunk, not in the
  initial app payload (FR-011 / SC-005).
- Selecting a `LanguageSummary` drives `getLanguageDefaults(code)`; the result seeds the target-script,
  region, autonym, and English-name questions as editable, `langtags`-labeled confirmations (FR-004..7).
- A free-text "not in list" entry path remains; an unknown code yields no proposal (FR-008/FR-009).

## Build contract

- `pnpm run fetch-langtags` downloads the pinned `source/langtags.json`, verifies SHA-256, fails loudly
  on mismatch (FR-012), and retains the MIT notice with the vendored file (FR-010).
- `pnpm run codegen-langtags` regenerates `packages/engine/src/langtags/generated/*` deterministically
  from the vendored data; identical input → byte-identical output.
- Both run in root `prebuild` before any package `tsc -b`.
