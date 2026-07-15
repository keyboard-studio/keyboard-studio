# Phase 1 Data Model: Per-Keyboard Facet Index

Three entities (from spec §Key Entities) plus the concrete on-disk shapes. The **facet definition** is
content-owned YAML; the **index** (records + manifest) is the machine-generated JSON artifact. Field
names below are the contract this feature ships — but per spec Assumption, the schema is content-owned
data, **not** a locked `packages/contracts` type until it survives an evaluation round.

---

## Entity 1 — Facet definition (`content/keyboard-facets/<id>.yaml`)

The declaration of one keyboard-level facet. Data, not code — adding a definition MUST NOT reshape
existing records (FR-002 / US2).

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | unique; matches filename (`script.yaml` → `script`). Lint-enforced. |
| `title` | string | yes | short human title. |
| `description` | string | yes | what the facet captures; written for a future contributor. |
| `valueType` | `enum \| set \| scalar \| histogram` | yes | FR-002. `histogram` = distribution over a closed value set (script); `enum` = single closed-set value; `set` = subset of a closed set; `scalar` = number in a domain. |
| `limits` | see below | yes | FR-002/FR-008. The **closed value list** (enum/set/histogram) or **domain** (scalar). Stated here, never implied by observed data (US2 scenario 3). |
| `limits.values` | string[] | when enum/set/histogram | e.g. ISO 15924 codes for script. |
| `limits.domain` | `[min,max]` | when scalar | inclusive numeric domain. |
| `limits.open` | boolean | optional | default `false`. `true` = open set (documented exception; still validated for shape). |
| `likelihoodSemantics` | string | yes | FR-003. How the likelihood is read — e.g. "share of concretely-scripted characters" / "confidence in [0,1]". |
| `derivation.archetype` | `character-content \| rule-structure \| declared-metadata` | yes | which evidence the classifier (037) reads. |
| `derivation.classifierId` | string | yes | names the 037 classifier + its version participates in freshness. |
| `derivation.fallbackChain` | string[] | yes | ordered tier ids, e.g. `[content-derived, declared-metadata, default-fallback, undetermined]`. |
| `feedsSessionFacets` | string[] | yes | FR-009. `content/facets/` ids whose `corpus:` derivation this feeds (e.g. `community.multi-orthography`). No second vocabulary is forked. |
| `subProfiles` | object | optional | facet-specific extra dimensions (e.g. script's Latin plain/extended/IPA). Shape is the facet's own; opaque to the index shell. |
| `schemaVersion` | integer | yes | bump forces recompute of this facet's records (Edge Case: limits changed without version bump ⇒ stale). |

**Validation rules**: `id` unique + matches path; `valueType` ∈ the 4 kinds; `limits` present and
shaped per `valueType`; every `feedsSessionFacets` entry is a real `content/facets/` id; a closed-set
facet's `limits.values` non-empty. All lint-enforced (D7).

---

## Entity 2 — Keyboard categorization (one keyboard × one facet)

The load-bearing record. Lives inside the index under `keyboards[<id>].facets[<facetId>]`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `value` | facet-typed | yes | dominant value (enum), member set (set), number (scalar), or dominant key (histogram). Within `limits` or build fails (FR-008). |
| `distribution` | `Record<string, number>` | when histogram/enum | likelihood distribution over facet values; **sums to ~1** (FR-003). Keys sorted for determinism. |
| `confidence` | number \| null | yes | confidence for single values, or null when a full distribution carries it. |
| `confidenceClass` | `confident \| mixed \| undetermined` | yes | 037's tri-state; never forces a single value (FR-003). |
| `provenanceTier` | `content-derived \| declared-metadata \| default-fallback` | yes | which tier produced it (FR-004). At minimum these three are distinguishable. |
| `evidenceSize` | integer | yes | e.g. count of concretely-scripted characters — lets consumers weight (FR-003/FR-010). |
| `analyzedCoverage` | number | yes | fraction of rule output analyzable (`1 − opaque share`); 037's coverage measure. |
| `analysisOutcome` | `fully \| partially \| fallback-only` | yes | FR-010. Maps from `ImportStatus` (Clean / CleanWithOpaque / ParseFailure) — see research D5. |
| `notes` | string | optional | e.g. declaration/artifact mismatch flag (target facet). |

**Per-keyboard freshness** (shared across that keyboard's facets, stored once at
`keyboards[<id>].freshness`, not per facet):

| Field | Type | Notes |
|---|---|---|
| `sourceHashes` | `Record<path, sha256>` | the `.kmn` + sibling files the record set was derived from (FR-005). Gates incremental rescan. |
| `analyzedAtScannerVersion` | string | the `scannerVersion` this record set was produced under. |

**State/validation**: a value outside `limits` ⇒ **build fails** (never recorded). A `distribution` not
summing to ~1 (tolerance ε) ⇒ build fails. `analysisOutcome: fallback-only` requires `provenanceTier ≠
content-derived`. Every keyboard in scope MUST have a record for every defined facet (SC-001) — a missing
facet record is a build failure, not a silent omission.

---

## Entity 3 — Index manifest (`docs/keyboard-facet-index.json` → `manifest`)

Build-level metadata sufficient to decide rescan and to audit (FR-005).

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | integer | the index-shell schema version (distinct from per-facet `schemaVersion`). |
| `scannerVersion` | string | combined tool+classifier version; bump ⇒ full content-derived recompute (US3). |
| `corpusCommit` | string | the `../keyboards` commit the scan ran against. |
| `corpusScope` | string | `release/**` (v1). |
| `unicodeVersion` | string | `17.0.0` — pinned UCD release (FR-005 / 037 FR-004). |
| `referencePins` | `Array<{file, sha256}>` | the 4 pinned UCD files + langtags pin ref. Mirrors `data/SOURCES.json`. |
| `keyboardCount` | integer | total keyboards in scope. |
| `facetCoverage` | `Record<facetId, {content, declared, fallback, undetermined}>` | per-facet tier counts (SC-002 measured, not assumed). |
| `facetIds` | string[] | facets present in this build (sorted). |

**No timestamps inside the hashed payload** (FR-006 determinism). A human-readable build time, if any,
lives in the `.md` companion only.

---

## Top-level artifact shape (`docs/keyboard-facet-index.json`)

```jsonc
{
  "manifest": { /* Entity 3 */ },
  "keyboards": {
    "<keyboardId>": {                         // sorted by id
      "freshness": { "sourceHashes": { "...": "sha256" }, "analyzedAtScannerVersion": "..." },
      "facets": {
        "script": { /* Entity 2 categorization */ }   // sorted by facetId
      }
    }
  }
}
```

**Extensibility invariant (US2 / SC-003)**: adding a facet definition and rebuilding adds exactly one key
under each keyboard's `facets` object and leaves every prior facet's record byte-identical. Because each
categorization is self-contained (no cross-facet references) and keys are sorted, a new facet is a pure
addition — proven by the byte-diff test in quickstart.

---

## Relationships

- **Facet definition 1..N → categorization**: each keyboard carries exactly one categorization per defined
  facet (SC-001). Definitions are the closed set of facet ids the index must populate.
- **Categorization → session facet**: via the definition's `feedsSessionFacets`; the index field is the
  concrete source a `content/facets/` `corpus:` derivation names (FR-009, research D8).
- **Freshness → manifest**: per-keyboard `sourceHashes` gate incremental rescan; manifest `scannerVersion`
  / `unicodeVersion` bumps gate full rescan (US3).

## Sample facet definition (`content/keyboard-facets/script.yaml`, illustrative)

```yaml
id: script
title: Output script
description: >
  The script(s) the keyboard actually produces, as an ISO 15924 distribution over
  concretely-scripted output characters. Common/Inherited characters are neutral.
valueType: histogram
limits:
  values: [Arab, Cyrl, Deva, Latn, Grek, Hebr, Thai, Ethi, ...]   # closed ISO 15924 set
  open: false
likelihoodSemantics: "share of concretely-scripted produced characters attributed to each script"
derivation:
  archetype: character-content
  classifierId: script-classifier
  fallbackChain: [content-derived, declared-metadata, default-fallback, undetermined]
feedsSessionFacets: [community.multi-orthography]
subProfiles:
  latin: [plain, extended, ipa]     # block-derived; hints, not authoritative (037)
schemaVersion: 1
```
