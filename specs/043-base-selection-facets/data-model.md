# Phase 1 — Data Model: Base-Selection & Strategy Facet Classifiers

This feature introduces **no new TypeScript types** in `packages/*`. It adds content records (YAML facet definitions + session mirrors), one pinned reference dataset, and classifier modules that emit the **existing** `Categorization` shape. The entities below are data/record shapes, not new contracts.

## Reused types (unchanged)

- **`Categorization`** (`utilities/facet-index/types.ts`) — every classifier returns this: `value`, optional `distribution`, `confidence`/`confidenceClass`, `provenanceTier`, `evidenceSize`, `analyzedCoverage`, `analysisOutcome`, optional `residue`, optional `notes`. No field added.
- **`FacetDefinition`** (`utilities/facet-index/types.ts` / `load-defs.ts`) — the parsed `content/keyboard-facets/*.yaml` record: `id`, `title`, `description`, `valueType`, `limits`, `derivation.{archetype, classifierId, fallbackChain}`, `feedsSessionFacets`, `schemaVersion`.
- **`ClassifierPair`** (`build-index.ts`) — `{ classify, fallback }`, keyed by facet id in `DEFAULT_CLASSIFIERS`.
- **`ScannedKeyboard`** (`scan.ts`) — `kpsPath`, `kmnPath`, `sources`. The `.kps`/`LICENSE.md` reads attach here.
- **`buildProducedSet`** (`@keyboard-studio/contracts`) and `base-layout.ts` helpers — the produced-character + fall-through source.

## New keyboard-facet definitions (13)

Each is a `content/keyboard-facets/<id>.yaml` following the spec-041 shape (`valueType`, `limits.values`/`limits.domain`, `derivation.archetype`, `derivation.classifierId` = a **real** id, `derivation.fallbackChain`, `feedsSessionFacets`, `schemaVersion: 1`). Grouped by user story.

### US1 — Strategy-selector facets (P1)

| Facet id | `valueType` | Value set / domain | `feedsSessionFacets` | Classifier module |
|---|---|---|---|---|
| `primary-strategy` | enum | `S-01`..`S-13` + `mixed` (honest tie) | `lineage.primary-strategy` | `primary-strategy-classifier.ts` |
| `added-char-count` | scalar + band | count (scalar) + axis-A1 band label | `lineage.added-char-count` | `added-char-count-classifier.ts` |
| `platform-coverage` | set | subset of `{desktop, web, touch}` | `source.platform-coverage` | `platform-coverage-classifier.ts` |
| `font-dependency` | enum | `{self-contained, system-font-reliant}` | `source.font-dependency` | `font-dependency-classifier.ts` |

- **`primary-strategy`**: mode of the per-keyboard strategy tally (Decision 3). A tie emits `mixed`; the tied set is recorded in `notes`/exception data. Distinct from `lineage.strategy-fingerprint`'s aggregate.
- **`added-char-count`**: `|produced-set \ kbdus-base-layout-set|`, banded to spec-§7 axis A1. Both the raw count and the band are surfaced (the band via `value`, the count via `evidenceSize`/`notes`).
- **`platform-coverage`**: modality set from `.kps` `<Files>` extensions (Decision 4). Never OS-level.
- **`font-dependency`**: `system-font-reliant` iff the `.kps` bundles `.ttf`/`.otf` **and** the `.kmn` IR references a `<Font>` visual store; else `self-contained`.

### US2 — Writing-system matching facets (P2)

| Facet id | `valueType` | Value set / domain | Session mirror? | Classifier module |
|---|---|---|---|---|
| `diacritic-mechanism` | enum | `{stacking-combining, replacing-cycling, multi-family, none}` | `construction.diacritic-mechanism` (source-family construction mirror) | `diacritic-mechanism-classifier.ts` |
| `combining-mark-repertoire` | set | set of combining marks; `not-applicable` sentinel | **none** (`keyboard.*`) | `combining-mark-repertoire-classifier.ts` |
| `spare-key-budget` | enum | `{many, ralt-only, fully-booked}` | `construction.spare-key-budget` | `spare-key-budget-classifier.ts` |
| `orthography-coverage-ratio` | scalar | `0.0`–`1.0`; `not-derivable` sentinel | **none** (`keyboard.*`) | `orthography-coverage-ratio-classifier.ts` |

- **`diacritic-mechanism`** (axis A4): IR deadkey/store rewrite-rule shape; multiple independent combining-mark stores → `stacking-combining`; a deadkey store that overwrites/cycles → `replacing-cycling`.
- **`combining-mark-repertoire`**: guarded by `keyboard.script-family`; **not-applicable** for abugida/abjad (Decision 7).
- **`spare-key-budget`** (axis A7): count unbound key+modifier-plane slots after excluding reserved system combos.
- **`orthography-coverage-ratio`**: produced-set vs pinned CLDR exemplar set for the declared BCP47 tag; **not-derivable** when no exemplar set (Decision 5). Missing-character set recorded as exception data; the summary ratio is the `value`.

### US3 — Eligibility & enricher facets (P3)

| Facet id | `valueType` | Value set | Session mirror? | Classifier module |
|---|---|---|---|---|
| `license-fork-eligibility` | enum | `{permissive, copyleft, proprietary-restricted, unspecified}` | `env.license-fork-eligibility` | `license-fork-eligibility-classifier.ts` |
| `directionality` | enum | `{ltr, rtl, bidi-aware}` | **none** (`keyboard.*`) | `directionality-classifier.ts` |
| `script-family` | enum | `{alphabet, abugida, abjad, syllabary, logographic}` | **none** (`keyboard.*`) | `script-family-classifier.ts` |
| `declared-bcp47-tags` | set | BCP47 tags + claim-vs-actual exception | `source.declared-bcp47-tags` | `declared-bcp47-tags-classifier.ts` |
| `package-completeness` | set | checklist: `{osk, help, predictive, icon}` present-flags | `source.package-completeness` | `package-completeness-classifier.ts` |

- **`license-fork-eligibility`**: `LICENSE.md` header vs a small known-license table + `.kps` `<LicenseFile>` presence; **unspecified** never inferred (Decision 7).
- **`directionality`**: from produced script set + RTL layout metadata; `bidi-aware` when both directions produced.
- **`script-family`**: ISO 15924 → family via a static in-repo lookup table; **guards `combining-mark-repertoire`** (FR-032, must be available to US2's classifier).
- **`declared-bcp47-tags`**: `.kps` `<Languages>` list; cross-checks claimed tags against produced characters, flagging any mismatch as an exception (a corpus smell).
- **`package-completeness`**: one facet absorbing presence of OSK `.kvks`, help/`welcome.htm`, predictive `.model.ts`, icon.

## New session-facet mirrors (9)

Per FR-006 + Decision 6, only family-named facets get a `content/facets/<family>/*.yaml` mirror, following the shape of `content/facets/source/fallback-posture.yaml` (`family`, `valueType`, `values`, `derivations`, `consumers.{prefills, proposes}`, `provenanceLabel`, `status: candidate`, `transformImpactClass`, `houseTargetPolicy`, `invertibility`, `implications`):

- `lineage.primary-strategy`, `lineage.added-char-count`
- `source.platform-coverage`, `source.font-dependency`, `source.declared-bcp47-tags`, `source.package-completeness`
- `construction.diacritic-mechanism`, `construction.spare-key-budget` (construction/source-family mirrors, matching spec 041's construction facets)
- `env.license-fork-eligibility`

**No mirror** (keyboard-facet-index-only): `combining-mark-repertoire`, `orthography-coverage-ratio`, `directionality`, `script-family`.

## New pinned reference datasets

- **CLDR `exemplarCharacters` snapshot** — pinned under the facet-index tool's data area (following `utilities/facet-index/ucd/DerivedAge.txt` and `data/base-layouts.json`), version recorded in `utilities/facet-index/data/SOURCES.json`. Keyed by BCP47/CLDR locale → exemplar character set. Feeds `orthography-coverage-ratio`; absence of a key → `not-derivable`.
- **Known-license signature table** — a small in-repo table (data file or module constant) of `LICENSE.md` header signatures → `{permissive, copyleft, proprietary-restricted}`. Feeds `license-fork-eligibility`; no match → `unspecified`.
- **ISO 15924 → script-family lookup** — a static in-repo table feeding `script-family` (and thereby guarding `combining-mark-repertoire`).

## Validation rules (from requirements)

- Every emitted `Categorization` carries provenance tier + consistency/`analyzedCoverage`; exception sites (where consistency < 1) carry cause tags via the spec-041 `cause-predicates.ts` library (FR-001/FR-002/FR-005; SC-002).
- Exception-site enumeration is deterministically recomputable; the committed index stores only the summary (FR-003; spec 036/037 rule).
- Not-applicable / not-derivable / unspecified sentinels are honest and never overwritten by a guess (SC-004).
- `facet-index-lint` contract holds: C1 (id == filename stem), C3 (limits agree with valueType), C4 (every `feedsSessionFacets` resolves to a real session facet), X1 (values within limits), X3 (every keyboard has a record for every facet). `facet-lint` validates the session-mirror records.

## State transitions

None. This feature only **measures** facet values (FR-042 / NG-002). Value-transition logic is spec 039's scope and is explicitly excluded.
