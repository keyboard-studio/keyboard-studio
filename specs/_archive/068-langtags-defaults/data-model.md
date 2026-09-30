# Phase 1 Data Model: SIL langtags defaults

## Entities

### LanguageDefaults
The per-language lookup result. Returned by `getLanguageDefaults(subtag)`.

| Field | Type | Source (langtags) | Notes |
|---|---|---|---|
| `code` | `string` | `tag` | canonical bare language subtag (lowercased) |
| `iso639_3` | `string \| undefined` | `iso639_3` | 3-letter code where present |
| `defaultScript` | `string \| undefined` | script subtag of `full` | ISO 15924, e.g. `Latn`, `Deva` |
| `defaultRegion` | `string \| undefined` | region subtag of `full` | ISO 3166-1, e.g. `NG`, `IN` |
| `regions` | `readonly string[]` | `regions` | additional regions sharing the orthography; may be empty |
| `autonym` | `string \| undefined` | `localname` | language name in its own script |
| `englishName` | `string \| undefined` | `name` | English name |

**Validation / invariants**
- A record is emitted only for tagsets whose `tag` is a bare language subtag (no script/region).
- `defaultScript`/`defaultRegion` are `undefined` when `full` lacks them (rare); never fabricated.
- Lookup is case-insensitive on the subtag; returns `null` for unknown subtags (FR-009).

### LanguageSummary
Lightweight entry backing the searchable language list. Returned by `listLanguages()` / `lookupByName()`.

| Field | Type | Source | Notes |
|---|---|---|---|
| `code` | `string` | `tag` | value written into the answer/BCP47 |
| `englishName` | `string` | `name` | primary search + display label |
| `autonym` | `string \| undefined` | `localname` | secondary search term + display |
| `defaultScript` | `string \| undefined` | script of `full` | used to seed the target-script proposal |

**Search rule**: `lookupByName(query)` matches case-insensitively against `code`, `englishName`, and
`autonym` (substring/prefix). Ordering: exact code match → englishName prefix → autonym prefix →
substring; ties broken alphabetically by `englishName`.

### LangtagsProvenance (label primitive)
The proposal-level provenance marker shown to the author (shared with specs/002; not the full
`axisFills` record).

| Field | Type | Notes |
|---|---|---|
| `source` | `"langtags"` | literal discriminator (specs/002's provenance vocabulary) |
| `caption` | `string` | display text, e.g. "Suggested from langtags — edit if needed" |

### Pinned source descriptor (`scripts/langtags-version.json`)
Build-time metadata, not a runtime type.

| Field | Type | Notes |
|---|---|---|
| `source` | `string` | `https://github.com/silnrsi/langtags` |
| `commit` | `string` | `99b856bbe8a7dfc1ef7f05d6087dc7501843eb04` |
| `path` | `string` | `source/langtags.json` |
| `urlTemplate` | `string` | `https://raw.githubusercontent.com/silnrsi/langtags/{commit}/source/langtags.json` |
| `sha256` | `string` | integrity hash, computed at pin time |
| `license` | `string` | `MIT` |
| `notice` | `string` | `Copyright (c) 2019-2025 SIL International (http://www.sil.org)` |

## Generated artifacts (checked in, never hand-edited)

- `packages/engine/src/langtags/generated/index.ts` — `Record<subtag, LanguageDefaults>` + a
  `languages: LanguageSummary[]` export, plus a header comment citing the codegen script + pinned
  commit/version (mirrors the recognizer-rules generated headers).
- `packages/engine/data/langtags/SOURCES.json` — manifest: pinned commit, SHA-256, fetch metadata,
  record/language counts (mirrors kbgen's `SOURCES.json`).

**Note:** Macrolanguages without a bare-subtag tagset in the upstream data (e.g. `zh`) are
intentionally absent from the generated index. They are represented only via individual variety
codes (e.g. `cmn`, `yue`) — the langtags upstream never emits a bare-`zh` tagset with `full`
defaults.

## Relationships

- `LanguageSummary.code` → key into the `LanguageDefaults` map.
- Studio: a selected `LanguageSummary` (from the autocomplete) → `getLanguageDefaults(code)` →
  seeds the target-script (`defaultScript`), region (`defaultRegion`/`regions`), autonym (`autonym`),
  and English-name (`englishName`) questions, each carrying `LangtagsProvenance`.
