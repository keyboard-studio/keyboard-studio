# Phase 0 Research: Construction Facet Classifiers

Resolves the unknowns surfaced by the Technical Context and the spec's edge cases. Each item: **Decision / Rationale / Alternatives considered**.

## R1 — How touch classifiers reach `.keyman-touch-layout` evidence

**Decision**: Extend `ClassifierPair.classify` from `(ir, def)` to `(ir, def, kb)` where `kb: ScannedKeyboard`. Touch classifiers read the `.keyman-touch-layout` bytes from `kb.sources` (the scan already collects `.kmn` header-store siblings, including the touch-layout store — see [scan.ts](../../utilities/facet-index/scan.ts) `collectSources`). Desktop/script classifiers ignore the third arg. A new [touch-layout.ts](../../utilities/facet-index/touch-layout.ts) parses the JSON once and the four touch classifiers share it.

**Rationale**: Keeps a single registry (`DEFAULT_CLASSIFIERS`) and a single per-keyboard loop in [build-index.ts](../../utilities/facet-index/build-index.ts). The touch layout is genuinely outside the `KeyboardIR` (design brief §2: the KMN recognizer is blind to touch), so it must arrive via the scanned source set, which already hashes it for freshness. Additive signature — existing classifiers compile unchanged.

**Alternatives considered**: (a) A parallel "touch registry" with its own loop — rejected: duplicates the shell, forks freshness/coverage handling. (b) Fold the touch layout into `KeyboardIR` — rejected: violates Article II (codec parse semantics untouched, FR-043) and the design brief's own scoping. (c) Classify touch facets entirely in the `fallback(kb, def)` path (which already receives `kb`) — rejected: content-derived values would masquerade as fallback-tier, breaking provenance (FR-007).

## R2 — Measurement-model fields on `Categorization`

**Decision**: Extend the tool-local `Categorization` (in [types.ts](../../utilities/facet-index/types.ts)) additively:
- `consistency?: number` — share of analyzed sites matching the dominant value (design brief §4). For single-valued facets this replaces the ad-hoc use of `confidence`; `confidence` stays for the score-carrying facets.
- `causeTagCounts?: Record<CauseTag, number>` — the **summary** of exception causes (FR-005): how many exception sites got each tag. The per-site enumeration is recomputed at build time and never serialized.
- Reuse the existing `distribution` for `encoding`'s per-role/per-axis shares and `residue` for unrecognized share where a facet has one.

A shared [measurement.ts](../../utilities/facet-index/measurement.ts) assembles `{value, consistency, causeTagCounts, ...}` from (dominant, site list, cause-predicate library) so all nine desktop classifiers produce the shape identically.

**Rationale**: Mirrors design brief §4 ("dominant value + consistency + enumerated exception sites, each with a cause tag") and FR-001..FR-005 exactly. Additive fields keep `facet-index-lint` (which checks value/distribution within limits, provenance, coverage) passing; new fields are optional and outside its closed-set checks. Storing counts not sites honors both the spec-036 storage rule and the spec-037 determinism rule.

**Alternatives considered**: Overloading `confidence`/`residue` to mean consistency — rejected: conflates two distinct axes the strategy-fingerprint classifier deliberately kept separate ([strategy-fingerprint-classifier.ts](../../utilities/facet-index/strategy-fingerprint-classifier.ts) doc). Storing full `exceptionSites[]` in the index — rejected by FR-005 (index bloat over ~900 keyboards).

## R3 — Representing "not-applicable" as a first-class state

**Decision**: Represent not-applicable distinctly from both a value and a fallback: emit a `Categorization` with `value: undefined`, a dedicated `confidenceClass`-adjacent marker `notApplicable: true`, `provenanceTier: "content-derived"` (the *reason* it is n/a was read from source — caseless script, abugida family, no touch layout), and a `notes` string naming the gate. It is **not** `default-fallback` (nothing failed) and **not** an out-of-limits sentinel value.

Applies to: `caps-handling` when `casing = caseless` (FR-013); `normalization-posture` for abugida/abjad (FR-014); the four touch facets when no `.keyman-touch-layout` exists (FR-022).

**Rationale**: SC-004 requires that these keyboards carry *no* facet value — a marker, not a forced or fabricated one. Keeping `provenanceTier: content-derived` is honest: the not-applicability was determined from the keyboard's own script/structure, not from a missing signal. `facet-index-lint` X1 (value within limits) is satisfied because `value` is omitted.

**Alternatives considered**: A reserved `"not-applicable"` enum member in each facet's `limits.values` — rejected: pollutes every value set and would let a transform "switch to not-applicable". A `default-fallback` tier — rejected: misreports a determinate finding as a fallback (breaks FR-007 provenance and the tier counts).

## R4 — Cause-predicate library shape and the `character-class` guard

**Decision**: A [cause-predicates.ts](../../utilities/facet-index/cause-predicates.ts) module exporting an ordered array of predicates, each `{ id: CauseTag, guard(ctx): boolean, fits(exceptionSites, ctx): boolean }`. `measurement.ts` runs them in order over the exception set; the first whose `guard` passes and `fits` returns true assigns its tag; if none fit, the site set is tagged `gap-omission` (the residue, FR-002). Starter library (FR-003):
- `character-class` → `principled-split`, `guard` = script family ∈ {Latin, Cyrillic, Greek} (alphabetic-with-diacritics), `fits` = all deviations are combining marks (FR-004).
- `layer-capacity` → `capacity-forced`, no family guard, `fits` = deviations begin exactly after the primary layer filled.

Script family comes from the existing `script` facet / langtags data (spec Assumption), reused, not re-derived.

**Rationale**: Directly encodes design brief §4 (predicate-fit, extensible, guarded). The array-of-predicates shape makes the library content-team-extensible (FR-003) and auditable (the fitting predicate id is recorded). The guard prevents mis-tagging abugida/abjad exceptions with a diacritic-oriented predicate (§4, FR-004, Edge Case).

**Alternatives considered**: Hard-coded if/else cause logic per classifier — rejected: not extensible, duplicates the guard across nine classifiers. A scoring/confidence blend across predicates — rejected: first-match-wins is deterministic (FR-006) and matches the brief's "whichever predicate fits".

## R5 — `orth.display-difficulty` derivation mechanism (brief open item §10)

**Decision**: Implement as a **per-script pure derivation** [display-difficulty.ts](../../utilities/facet-index/display-difficulty.ts): `displayDifficultyOfScript(script, { puaObserved }) → {well|partially|poorly}-supported`. Primary signal = the script's Unicode block first-assigned version from the pinned UCD data ([utilities/facet-index/ucd/generated/](../../utilities/facet-index/ucd/generated/)), split by the two version-era boundaries recorded as the facet's derivation params (FR-031): well = ≤ Unicode 5.x (pre-2007), partially = 6.0–10.0, poorly = ≥ 11.0. A `puaObserved` flag (any PUA usage in the corpus attributed to that script — script-level granularity per the clarification) forces `poorly-supported`. Flip [content/facets/orth/display-difficulty.yaml](../../content/facets/orth/display-difficulty.yaml) `sourceStatus: planned → available` and set `source` to the engine-style id `engine:displayDifficultyOfScript` (matching the existing `engine:detectBaseLayoutFamily` convention in [env/base-layout-affinity.yaml](../../content/facets/env/base-layout-affinity.yaml)).

**Rationale**: This is a `content/facets/` **input** facet (per-script), not a per-keyboard keyboard-facet, so it does not flow through `DEFAULT_CLASSIFIERS` or `facet-index-lint`; it is validated by `facet-lint`. The UCD block-age table needed already exists in the tool. Corpus PUA observation is a corpus-scan signal the tool is positioned to compute. Font-coverage databases stay deferred (brief §10, spec Assumption).

**Alternatives considered**: Emitting it per-keyboard into `keyboard-facet-index.json` — rejected: it is per-script, and the facet's schema/consumers (`axis:A4`, `source.encoding.houseTargetPolicy`) are session-facet inputs, not base measurements. Deferring PUA override to a later spec — rejected: FR-031 requires the override now; only the font-coverage database is deferred.

## R6 — Confirming the two named shape fixtures suffice, and what to add

**Decision**: Reuse `fx_arabic` (caseless/abjad → exercises n/a rules for `caps-handling` + `normalization-posture`, and the `character-class` guard *not* firing) and `fx_latin` (cased alphabetic → dominant + exception with `character-class` predicate firing) from [__fixtures__/corpus/](../../utilities/facet-index/__fixtures__/corpus/). Add minimal fixtures for the shapes those two don't cover: a `&MNEMONICLAYOUT` keyboard (mnemonic gate), a keyboard with mixed quoted/`\u` output (encoding roles + minority exception), an unset-vs-set `&baselayout` pair (fallback-posture defaulted vs declared), a `group(reorder)` keyboard (reordering-rules), and a `.keyman-touch-layout`-bearing keyboard + a desktop-only one (P2 touch present vs not-applicable).

**Rationale**: The Independent Tests for US1/US2 name exactly these shapes; fixtures make them verifiable without whole-corpus dependency and keep determinism tests fast. Reusing the two established fixtures anchors the new classifiers to the same corpus the `script` classifier is tested against.

**Alternatives considered**: Testing solely against the live sibling corpus — rejected: non-hermetic, slow, and the corpus commit is not pinned in unit tests.
