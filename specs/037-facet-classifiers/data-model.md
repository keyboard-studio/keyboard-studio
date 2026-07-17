# Phase 1 Data Model: Deterministic Facet Classifiers

037 populates the record shape [spec 036](../036-keyboard-facet-index/data-model.md) already defined
(Entity 2 — Keyboard categorization). This file models the entities that are **037's own**: the classifier
contract every archetype follows, the pinned reference-data lookups the classifiers read, and the
three concrete classifiers' internal outputs. Field names are the contract 037 ships; per spec Assumption
they are content-owned data, **not** a locked `packages/contracts` type until an evaluation round.

The load-bearing rule: **a classifier is a pure function `(analysis inputs, pinned data) → Categorization`**
that emits exactly the 036 Entity 2 shape. 037 adds no new fields to that record; it defines what fills it.

---

## Entity 1 — Classifier (the contract all three implement)

A named, versioned procedure for one facet. Not persisted; it is the code contract + a definition
declaration. See [contracts/classifier.contract.md](contracts/classifier.contract.md).

| Property | Type | Notes |
|---|---|---|
| `id` | string | `script` / `strategy-fingerprint` / `target-mix` — equals the **facet `id`** and is the `DEFAULT_CLASSIFIERS` registry key (`build-index.ts` looks up `classifiers[def.id]`). **Not** the same string as `derivation.classifierId`, which is the free-form `<facet>-classifier` freshness/doc label (e.g. `script-classifier`) and is never a registry key. |
| `version` | string | bumped on any algorithm/data change; participates in 036 freshness (`scannerVersion`). FR-001. |
| `archetype` | `character-content \| rule-structure \| declared-metadata` | FR-002. script=character-content, strategy-fingerprint=rule-structure, target-mix=declared-metadata. |
| `fallbackChain` | ordered tier id list | FR-002/FR-011. script: `[content-derived, declared-metadata, default-fallback, undetermined]`; strategy: `[content-derived, undetermined]` (no metadata tier — research D7); target: `[declared-metadata, default-fallback]`. |
| `evidenceFloors` | `{ minEvidence?, minCoverage?, … }` | tunable defaults recorded in the definition (spec Assumptions). script: `minConcreteChars=10, minCoverage=0.50`. |
| `classify` | `(inputs) → Categorization` | pure, deterministic (FR-001). Same inputs + same pins + same version ⇒ byte-identical. |

**Invariants (FR-001/FR-003)**: no timestamps, no randomness, no environment-dependent iteration order; a
classifier MUST distinguish `confident` / `mixed` / `undetermined` and never force a single value; the tier
that produced the value is always recorded in `provenanceTier`.

---

## Entity 2 — Reference-data pin (read-only inputs)

Versioned, integrity-checked datasets a classifier reads (FR-004). Recorded in the 036 index manifest
(`referencePins`) and `data/SOURCES.json`. 037 consumes them; 036 owns the pin/fetch/codegen plumbing.

| Pin | Files | Consumer | Shape after codegen |
|---|---|---|---|
| **UCD script lookup** | `Scripts.txt`, `ScriptExtensions.txt`, `PropertyValueAliases.txt`, `Blocks.txt` (Unicode 17.0.0) | script classifier | `scriptOf(cp) → ISO15924 \| 'Zyyy' \| 'Zinh' \| 'Zzzz'`; `scriptExtOf(cp) → sorted ISO15924[]`; `blockOf(cp) → blockName` |
| **langtags default script** | pinned SIL langtags (existing pin) | script classifier (tier 3) | `getLanguageDefaults(subtag).defaultScript` — engine function, not new codegen (`packages/engine/src/langtags/index.ts:25`) |

**Lookup contract**: a codepoint miss ⇒ `Zzzz` (never `undefined`/throw); `Zyyy`/`Zinh`/`Zzzz` are excluded
from the concretely-scripted denominator (research D2). The `scriptExtOf` set is stored canonically sorted
so `Set` iteration is deterministic (research D3).

---

## Entity 3a — Script categorization (US1)

Fills 036 Entity 2 for facet `script`. `valueType: histogram`, `limits.values` = closed ISO 15924 set.

| Field (036) | How the script classifier fills it |
|---|---|
| `value` | dominant script key of `distribution` (highest share; ties broken by lexicographic code for determinism). |
| `distribution` | `Record<ISO15924, number>` summing to ~1: each script's full-weight tally ÷ sum of all tallies (research D3). Keys sorted. |
| `confidence` | dominant share (the histogram carries it). |
| `confidenceClass` | dominant share ≥0.80 ⇒ `confident`; else `mixed`; no concrete evidence ⇒ `undetermined` (spec Assumptions, tunable). |
| `provenanceTier` | one of the **three** enum tiers `content-derived` / `declared-metadata` / `default-fallback` (research D5). The fallback chain's terminal `undetermined` step is **not** a fourth `provenanceTier` value: an undetermined outcome is recorded as `value: "undetermined"` (the reserved sentinel in `limits.values`) + `confidenceClass: "undetermined"`, with `provenanceTier` staying `default-fallback` (shipped `fallback.ts` `deriveScriptFallback` tier 3; the manifest's `undetermined` coverage bucket is keyed off `value === "undetermined"` in `build-index.ts`, not off a fourth tier). |
| `evidenceSize` | count of distinct concretely-scripted produced scalars. |
| `analyzedCoverage` | `1 − opaqueShare` (research D6). |
| `analysisOutcome` | `fully`/`partially`/`fallback-only` from `ImportStatus` (research D9). |
| `notes` | e.g. count of `Zzzz` unknown-script scalars reported distinctly (spec Edge Cases). |

**Sub-profile (FR-010)**: when `value` is `Latn`, add a facet-owned `subProfile.latin ∈ {plain, extended,
ipa}` — block-derived hint (research D4), evaluated against a *Latin-specific* evidence floor, labeled a
hint not a claim. Recorded in 036 Entity 2's per-record `subProfile` field (added for 037 — see 036
data-model Entity 2), which is opaque to 036's generic validation and whose shape this classifier owns.
Distinct from Entity 1's definition-level `subProfiles` field: that one declares the *possible* sub-
dimensions a facet may report; this one is the *actual* per-keyboard value.

**State rules**: distribution not summing to ~1 (tolerance ε) ⇒ build fails (036). `undetermined` /
`fallback-only` requires `provenanceTier ≠ content-derived`. Zero concretely-scripted characters ⇒ never
divide by zero: skip content tier, record `evidenceSize: 0`, fall through (spec Edge Cases).

---

## Entity 3b — Strategy fingerprint categorization (US2)

Fills 036 Entity 2 for facet `strategy-fingerprint`. `valueType: histogram`, `limits.values` = the
`StrategyId` union **S-01..S-13** (`packages/contracts/src/strategy.ts`).

| Field | How filled |
|---|---|
| `value` | dominant recognized `StrategyId` (highest `distribution` share), or omitted when residue dominates / undetermined. |
| `distribution` | `Record<StrategyId, number>`: `strategyRuleCount(S) / totalRules` (research D7). Zero-share ids omitted. |
| `residue` | `1 − recognizedRatio` — the unrecognized share, a **distinct field**, never a `distribution` key (research D7 / 036 D7 / 036 Entity 2 `residue`). |
| `confidenceClass` | `confident` when a single strategy ≥0.80 of recognized share and residue low; `mixed` when strategies split; `undetermined` when parse failed. |
| `provenanceTier` | `content-derived` when the recognizer ran; else `default-fallback`/undetermined. |
| `evidenceSize` | `totalRules` (rule population the fingerprint was computed over). |
| `analyzedCoverage` | `1 − opaqueShare`, where `opaqueShare = ir.raw.length / (typedRuleCount + ir.raw.length)` and `typedRuleCount = Σ ir.groups[].rules.length` — the **same parse-opacity definition the script facet uses** (research D6), so `analyzedCoverage` means the same thing (how much of the keyboard the parser could model) across all three classifiers, per 036's generic schema intent. |
| `analysisOutcome` | `fully`/`partially`/`fallback-only`. On parse failure: `fallback-only`, **omit** `distribution`/`residue`, set `notes` reason (US2 scenario 2). |

**Two independent axes — do not conflate.** `analyzedCoverage` = parse-opacity: how much of the source the
parser could model at all (shared definition with script's coverage measure, research D6). `residue` =
recognizer-gap: of the content the parser *did* model, the share matching no recognized strategy. They are
independent: a fully-parsed keyboard using an unrecognized strategy has `analyzedCoverage` ≈ 1 and high
`residue`; a mostly-opaque keyboard has low `analyzedCoverage` regardless of what the recognizer found in
the parsed remainder.

**Recognizer-coverage honesty**: the record documents "recognizer covers S-01/S-02 as of classifier
version X" (research D7) so residue is read as recognizer-gap, not opacity.

---

## Entity 3c — Target/device-mix categorization (US3)

Fills 036 Entity 2 for facet `target-mix`. `valueType: set`, `limits.values` = device classes
`{desktop, touch, web}` (mapped from `KeymanPlatformTarget`).

| Field | How filled |
|---|---|
| `value` | the device-class **set** — union of declared ∪ artifact evidence (research D8). |
| `distribution` | per-member presence with per-source provenance (declared vs artifact). |
| `provenanceTier` | `declared-metadata` when from `<Targets>`/`&TARGETS`; `default-fallback` when defaulted (`.kps` absent ⇒ `windows`/desktop, FR-014 AC2). |
| `confidenceClass` | `confident` when declaration and artifacts agree; `mixed` on mismatch. |
| `notes` | **declaration/artifact mismatch flag** (FR-014 AC1): e.g. "touch layout present but not declared." |
| `analysisOutcome` | `fully` (metadata read); `fallback-only` if neither `.kps` nor `.kmn` readable. |

**Sentinel handling**: `&TARGETS 'any'` (`.kmn`) ⇒ expand to all device classes, not a literal
(research D8). `.kps <Targets>` is enum-validated; `.kmn &TARGETS` is raw — recorded as different-fidelity.

---

## Relationships

- **Classifier → Categorization**: each classifier emits exactly one 036 Entity 2 record per keyboard for
  its facet. Each classifier registers under its **facet `id`** — the shipped `DEFAULT_CLASSIFIERS` map in
  `build-index.ts` is keyed by `def.id`, so `strategy-fingerprint`/`target-mix` register under exactly those
  keys (matching the YAML `id`). `derivation.classifierId` (`<facet>-classifier`) is a documentation/freshness
  label the definition carries, **not** the registry key.
- **Reference pin → Categorization**: the pins' versions flow into 036's manifest and freshness; a UCD or
  langtags version bump forces recompute of content-derived script records (036 US3).
- **Categorization → session facet** (036 D8 / FR-009): script → `community.multi-orthography`
  (`sibling-script-spread`); strategy-fingerprint → `lineage.strategy-fingerprint`
  (`recognized-strategy-distribution`); target-mix → `env.device-mix` (`sibling-keyboard-targets`).

---

## Sample facet definitions 037 ships (illustrative; content-owned)

```yaml
# content/keyboard-facets/strategy-fingerprint.yaml
id: strategy-fingerprint
title: Input-method strategy fingerprint
description: >
  Distribution of recognized §7 input-method strategies over the keyboard's rules,
  by owned-rule share, plus an unrecognized-residue share. Recognizer covers S-01/S-02
  as of classifier v1; unrecognized strategies land honestly in residue.
valueType: histogram
limits:
  values: [S-01, S-02, S-03, S-04, S-05, S-06, S-07, S-08, S-09, S-10, S-11, S-12, S-13]
  open: false
likelihoodSemantics: "share of total rules attributed to each recognized strategy; residue = 1 - recognizedRatio"
derivation:
  archetype: rule-structure
  classifierId: strategy-fingerprint-classifier
  fallbackChain: [content-derived, undetermined]
feedsSessionFacets: [lineage.strategy-fingerprint]
schemaVersion: 1
```

```yaml
# content/keyboard-facets/target-mix.yaml
id: target-mix
title: Target device mix
description: >
  Device classes the keyboard supports — desktop, touch, web — from package/project
  declarations unioned with touch-layout artifact presence; artifact outranks declaration.
valueType: set
limits:
  values: [desktop, touch, web]
  open: false
likelihoodSemantics: "membership per device class, with per-source (declared vs artifact) provenance"
derivation:
  archetype: declared-metadata
  classifierId: target-mix-classifier
  fallbackChain: [declared-metadata, default-fallback]
feedsSessionFacets: [env.device-mix]
schemaVersion: 1
```

(The `script.yaml` definition is illustrated in [036 data-model](../036-keyboard-facet-index/data-model.md).)
