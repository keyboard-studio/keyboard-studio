# Phase 1 Data Model: Langtags-driven identity autocomplete

Entities are described at the contract level (fields + rules), not as implementation types. Concrete TS types live in the code; the authoritative interface changes are in [contracts/langtags-api.md](contracts/langtags-api.md).

## Entity: LanguageDefaults (extended)

The record returned by `getLanguageDefaults(subtag)`. **Existing fields unchanged** (back-compat); new fields are additive + optional.

| Field | Type | New? | Notes |
|---|---|---|---|
| `subtag` | string | — | canonical bare language subtag |
| `iso639_3` | string? | — | |
| `script` | string | — | default script (ISO 15924) |
| `region` | string | — | default region code (from primary tag) |
| `regions` | string[] | — | additional regions sharing the orthography (existing) |
| `autonym` | string? | — | **primary** own-script name (unchanged) |
| `englishName` | string | — | **primary** English name (unchanged) |
| `englishNames` | string[] | ✅ | all recorded English/alternate names (incl. primary) |
| `localNames` | string[] | ✅ | all recorded own-script names (incl. primary) |
| `regionVariants` | RegionVariant[] | ✅ | one per region-distinct tagset; `length > 1` ⇒ ambiguous (FR-014 trigger) |

**Rules**:
- Existing consumers (script seeding, `defaultsFor`) read only the unchanged fields — MUST keep working.
- `englishNames`/`localNames` include the primary and are de-duplicated, stable-ordered (primary first).
- When langtags has a single tagset for the subtag, `regionVariants` has exactly one entry.

## Entity: RegionVariant (new)

A region-distinct resolution of a language.

| Field | Type | Notes |
|---|---|---|
| `region` | string | ISO 3166 / UN M.49 code |
| `regionName` | string | country/region display name (the region-question choice label) |
| `script` | string | script for this variant |
| `autonym` | string? | primary own-script name for this variant |
| `localNames` | string[] | own-script names for this variant (Q2 choices) |

**Rules**: `regionName` is the human-facing choice in the region question; `region` is what feeds the BCP47 region subtag.

## Entity: LanguageSummary (extended search result)

Returned by `lookupByName(query)` / `searchLanguages(query)` for the autocomplete.

| Field | Type | New? | Notes |
|---|---|---|---|
| `subtag` | string | — | value written into the answer/BCP47 |
| `englishName` | string | — | primary search + display label |
| `autonym` | string? | — | secondary search term + display |
| `script` | string | — | seeds the target-script proposal |
| `hasRegionVariants` | boolean | ✅ | true when the subtag resolves to >1 region variant (lets the UI know a region step will follow) |

## Entity: Resolved identity (survey session state, in-memory)

Not persisted to a new store — mirrors the existing `IdentityLiteResult` + `IdentityLite.tsx` ref pattern.

| Field | Source | Notes |
|---|---|---|
| resolved entry | Q1 English-name pick (or free-text → null) | `resolvedEntryRef` |
| selected region variant | Q1 (if unambiguous) or Q1.5 region pick | `selectedVariantRef`; falls back to primary variant |
| english | Q1 answer | the entered/picked English name |
| autonym | Q2 answer (chosen or typed) | own-script name |
| languageCode | Q3 confirmation (seeded from resolved entry) | drives `bcp47` |
| script | seeded from resolved variant | existing `il_target_script` step |
| bcp47 | assembled: code + script + region (FR-011) | `buildTargetBcp47` |

**Rules**:
- Author overrides always survive re-resolution (SurveyRunner "seed on first arrival, never overwrite" — FR "back-edit", SC-005).
- Free-text (no resolved entry) → `localNames`/code seeds empty; every step still completable (FR-003, SC-003).

## Entity: Question module (per-question, both flows)

The survey's per-question `definition` (`id`, `prompt`, `type`, `required`, `next`, optional `options_source`). Order/routing lives in `definition.next` + the flow YAML membership list.

**Live IdentityLite (`il_*`) order after change**:
`il_language_english` (autocomplete) → *(il_language_region, conditional)* → `il_language_autonym` (multi-choice + free text) → `il_language_code` (confirm) → `il_target_script` → `il_script_not_supported`.

**Proposed Phase A (`language_name_*`) mirror**: same reordering applied to `phase_a_identity.modular.yaml` + the `language_name_*` modules (per FR-015).

**New module**: `il_language_region` — `type: autocomplete`/choice, options = resolved entry's `regionVariants[].regionName`, `required: false` (skippable → primary variant), conditional `next` so it only appears when `hasRegionVariants`.

## State transitions (flow)

```text
Q1 english (autocomplete)
  │  resolves entry
  ├─ hasRegionVariants? ── yes ──► Q1.5 region (pick regionName) ─► sets selectedVariant
  │                         no  ──► selectedVariant = primary
  ▼
Q2 autonym (choices = selectedVariant.localNames, + free text)
  ▼
Q3 language code (auto-filled from resolved entry.subtag; confirm/override)
  ▼
il_target_script (seeded from selectedVariant.script)  →  … (unchanged tail)
```
