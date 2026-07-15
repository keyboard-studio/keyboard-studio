# Feature Specification: Deterministic Facet Classifiers (Script + Two Representative Facets)

**Feature Branch**: `037-facet-classifiers`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Spec out a deterministic system for determining where each keyboard fits in each facet. Start with script, and do two other representative facets, setting the standard for later facets."

**Governing sections**: spec.md §7.1 (discovery axes — script class), §8 (data flow / inventory), §9 (three-group routing by script), [content/facets/README.md](../../content/facets/README.md) (`corpus:` derivation convention). Sibling features: [specs/036-keyboard-facet-index](../036-keyboard-facet-index/spec.md) (the artifact these classifiers populate), [specs/038-adaptation-questions](../038-adaptation-questions/spec.md) (how ambiguous classifications are confirmed with users).

## Problem

The facet index (spec 036) needs values, and those values must be **deterministic and evidence-based**, not hand-curated: ~1,000 keyboards, rescanned on every corpus update, with likelihoods a human can audit. This feature specifies the classification system and its first three classifiers — chosen deliberately, one per derivation archetype, so every later facet has a template to follow:

| Facet | Archetype | Evidence read |
|---|---|---|
| Script | character-content-based | the characters the keyboard actually produces |
| Strategy fingerprint | rule-structure-based | the input-method strategies its rules exhibit |
| Target/device mix | package-metadata-based | what the package declares it supports |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Script classification with likelihood (Priority: P1)

The system determines, for every corpus keyboard, which script(s) it produces — as a likelihood distribution, not a single guess. A keyboard whose output is 95% Arabic-script characters and a few neutral punctuation marks classifies as dominantly `Arab`; a genuinely dual-script keyboard shows a split distribution; and a keyboard that cannot be analyzed from content falls back through declared metadata to language-default data, with the tier recorded.

**Why this priority**: Script is the facet that fixes the observed defect (wrong-script base suggestions) and the one the user named first. It is also the hardest of the three, so it sets the evidentiary standard.

**Independent Test**: Run the script classifier over a fixture set of known keyboards (Arabic-script, Devanagari, Cyrillic, plain Latin, IPA, extended Latin, one dual-script) and compare dominant script + distribution against hand judgments.

**Acceptance Scenarios**:

1. **Given** a keyboard producing predominantly Arabic-script characters plus Arabic-script-associated punctuation and digits, **When** classified, **Then** the distribution is computed over concretely-scripted characters only — characters whose script property is Common or Inherited (shared punctuation, digits, combining marks) count as neutral evidence, not as evidence against — and the dominant script is `Arab`.
2. **Given** a keyboard whose characters are shared across scripts (script-extension characters, e.g. Arabic-script digits used by several scripts), **When** classified, **Then** the shared characters strengthen rather than dilute the scripts they extend to.
3. **Given** a keyboard whose rule source cannot be analyzed, **When** classified, **Then** the script value comes from the declared script subtag in its package language tags if present, else from the language's default script in the pinned language-tag data, and the provenance tier records which.
4. **Given** a Latin-script keyboard, **When** classified, **Then** a sub-script profile distinguishes plain Latin, extended Latin, and IPA orientation (ISO 15924 calls all three `Latn`; the studio's onboarding treats them as distinct target choices), based on the character ranges the keyboard produces.
5. **Given** the same keyboard source and the same pinned data, **When** classified twice, **Then** the outputs are identical.

---

### User Story 2 - Strategy fingerprint classification (Priority: P2)

The system determines, for every analyzable keyboard, the distribution of input-method strategies its rules exhibit (per the spec §7.3 strategy catalog, as detected by the existing recognizer) — e.g. "mostly direct mapping with some deadkey composition." This feeds the `lineage` session facets (nearest-neighbors, strategy-fingerprint) whose `corpus:recognized-strategy-distribution` source is currently `planned`.

**Why this priority**: It is the representative for the rule-structure archetype and the key input to "carry the base keyboard's decisions forward" — knowing *how* a base solves input is what later adaptation steps inherit.

**Independent Test**: Run over fixture keyboards with known strategies (a plain direct-mapping keyboard, a deadkey-heavy keyboard, a stateful toggle keyboard) and verify the fingerprint distribution names the expected strategies.

**Acceptance Scenarios**:

1. **Given** an analyzable keyboard, **When** fingerprinted, **Then** the record lists recognized strategy ids with their prevalence (share of rules or equivalent normalized measure), plus the share of rule content that no strategy matched (the opaque/unrecognized residue) — never presenting partial recognition as full coverage.
2. **Given** a keyboard that cannot be analyzed, **When** fingerprinted, **Then** the record states the analysis outcome explicitly (no fingerprint, with reason) rather than an empty distribution that reads as "no strategies."

---

### User Story 3 - Target/device mix classification (Priority: P3)

The system determines, for every keyboard, which device classes it supports — desktop physical, touch/mobile, web — from its package and project declarations plus the presence of touch-layout sources. This feeds the `env` session facets (device-mix, form-factor) whose `corpus:sibling-keyboard-targets` source is currently `planned`.

**Why this priority**: It is the representative for the declared-metadata archetype — the cheapest tier, no rule analysis needed — and rounds out the standard: later facets pick the archetype whose evidence they read.

**Independent Test**: Run over fixtures: a desktop-only keyboard, a keyboard with a touch layout file, a package declaring web targets — verify each classifies accordingly.

**Acceptance Scenarios**:

1. **Given** a keyboard package with a touch-layout source file, **When** classified, **Then** touch support is reported regardless of what the declared target list says (artifact presence outranks declaration, and a declaration/artifact mismatch is recorded).
2. **Given** a keyboard with no explicit target declarations, **When** classified, **Then** the default target semantics of the packaging format apply and the provenance notes the value was defaulted, not declared.

---

### Edge Cases

- **Zero concretely-scripted characters** (a keyboard producing only punctuation/symbols/digits): script classification must report "undetermined from content" and fall back through the declared/default tiers — never divide by zero, never report a fabricated distribution.
- **Opaque rule content**: characters produced inside rule constructs the analysis cannot model are not counted; the record must carry the analyzed-coverage share so consumers know the histogram may undercount. A keyboard that is mostly opaque should classify via fallback tiers rather than from a sliver of evidence (minimum-evidence rule; see Assumptions for the default floor).
- **Multiple declared languages with different scripts** (e.g. one package declaring both a Latin-tagged and an Arabic-tagged language): the declared-metadata tier must represent the set, not silently pick the first tag.
- **Dual-script keyboards**: a real split distribution (e.g. 55/45) is a legitimate result — the classifier reports it; deciding what to *do* with it is the consumer's (and spec 038's) job.
- **Presentation-form characters** (e.g. Arabic presentation forms): must count toward their script, not be dropped because they live in unusual blocks.
- **Unassigned or unknown codepoints** (newer Unicode than the pinned data): count as unknown-script, reported distinctly, never crash.
- **Pinned-data drift**: a Unicode data update may change classifications; determinism is defined *relative to the pinned versions*, and version bumps force recomputation (per spec 036 freshness rules).

## Requirements *(mandatory)*

### Functional Requirements

**Classification system (the standard all classifiers follow)**

- **FR-001**: Every classifier MUST be deterministic: identical keyboard sources + identical pinned reference data + identical classifier version produce identical categorizations, byte-for-byte, across machines and runs (no timestamps, no randomness, no environment-dependent iteration order).
- **FR-002**: Every classifier MUST declare its derivation archetype (character-content, rule-structure, or declared-metadata) and its fallback chain, and MUST record per keyboard which tier actually produced the value (provenance, per spec 036 FR-004).
- **FR-003**: Every classifier MUST emit likelihoods per spec 036 FR-003 and MUST distinguish "confidently single-valued," "genuinely mixed," and "undetermined" outcomes rather than forcing a single value.
- **FR-004**: External reference data (Unicode script/script-extension/block data; language-tag default-script data) MUST be version-pinned with verifiable integrity, following the repository's existing pinned-fetch + generated-lookup convention, and MUST be recorded in the index manifest.
- **FR-005**: Classifiers MUST run as an offline standalone tool per the repository's standalone-utilities convention (not a workspace package, no SPA involvement), supporting both full and incremental runs (per spec 036 FR-005/FR-006).
- **FR-006**: Classifier fixtures MUST include, for each classifier, at least one clear-cut case per archetype outcome (confident, mixed, undetermined, fallback-tier) drawn from real corpus keyboards, with keyboards cited in the keyboard phonebook per repository convention.

**Script classifier**

- **FR-007**: The script classifier MUST derive its primary evidence from the set of characters the keyboard can produce (the existing produced-characters analysis over the parsed keyboard), mapped to scripts via pinned Unicode script data.
- **FR-008**: Characters with script property Common or Inherited MUST be excluded from the denominator (neutral evidence). Characters with script extensions MUST count fractionally or wholly toward each extended script (exact weighting decided in planning; the requirement is that shared characters never count *against* the scripts that share them).
- **FR-009**: The classifier MUST emit: the per-script distribution, the dominant script, a confidence, the count of concretely-scripted characters (evidence size), and the analyzed-coverage share (portion of rule output that was analyzable).
- **FR-010**: For Latin-dominant keyboards, the classifier MUST additionally emit a sub-script profile distinguishing at minimum: plain/basic Latin, extended Latin, and IPA orientation, derived from character-range membership. (Named-orthography labels like "Ajami" are NOT emitted by this classifier: Ajami = Arab script + language identity, which is a join the consumer performs; same for romanization-vs-native distinctions.)
- **FR-011**: The fallback chain MUST be, in order: content-derived histogram (when evidence meets the minimum-evidence floor) → script subtags declared in the package's language tags → default script for the declared language(s) from pinned language-tag data → undetermined. Each tier only fires when all earlier tiers are unavailable or below evidence floors, and the firing tier is recorded.

**Strategy-fingerprint classifier**

- **FR-012**: The fingerprint MUST be computed from the existing strategy recognizer's output over the parsed keyboard, normalized into a prevalence distribution over recognized strategy ids, plus an unrecognized-residue share.
- **FR-013**: The fingerprint MUST be stable under semantically-irrelevant source differences the parser already normalizes (comment changes, whitespace) — i.e. it is a function of the parsed structure, not the raw text.

**Target/device-mix classifier**

- **FR-014**: The classifier MUST combine declared targets (package/project declarations) with artifact evidence (presence of touch-layout sources), report the union with per-source provenance, and flag declaration/artifact mismatches.

### Key Entities

- **Classifier**: A named, versioned procedure (archetype, fallback chain, evidence floors) producing categorizations for one facet. Its version participates in spec 036 freshness.
- **Reference data pin**: A versioned, integrity-checked external dataset (Unicode script/extensions/blocks; language-tag defaults) a classifier reads. Recorded in the index manifest.
- **Classification outcome**: value(s) + likelihood + confidence class (confident / mixed / undetermined) + provenance tier + evidence-size measures. The record shape is owned by spec 036.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a hand-judged validation set of at least 30 keyboards spanning at least 6 scripts (including at least 3 Arabic-script, 3 IPA/extended-Latin, and 2 dual-script keyboards), the script classifier's dominant value agrees with human judgment in ≥95% of confidently-classified cases, and every disagreement is either flagged "mixed"/"undetermined" or explainable from the evidence record alone.
- **SC-002**: ≥80% of corpus keyboards classify at the content-derived tier for script (the fallback tiers are the exception, not the norm) — measured and reported in the index manifest, not assumed.
- **SC-003**: Two consecutive full runs over an unchanged corpus produce byte-identical output on two different machines.
- **SC-004**: The strategy-fingerprint and device-mix classifiers each correctly classify their fixture sets (100% on clear-cut fixtures), and their records are sufficient for the corresponding session-facet `corpus:` derivations (`recognized-strategy-distribution`, `sibling-keyboard-targets`) to be implemented against without further corpus scanning.
- **SC-005**: A reviewer can trace any single keyboard's classification from the index record back to its evidence (character set, recognizer output, or declarations) using only committed artifacts and the classifier documentation — no re-running required for audit.

## Assumptions

- **Minimum-evidence floor**: content-derived script classification requires at least 10 concretely-scripted characters and at least 50% analyzed coverage; below either, the classifier falls back a tier. These floors are starting defaults, recorded in the classifier's definition and tunable without spec revision.
- **Confidence classes**: dominant share ≥0.80 → "confident"; otherwise "mixed"; no concrete evidence → "undetermined". Also a tunable starting default — spec 038's threshold questions exist precisely because such policies deserve user-visible confirmation when they drive decisions.
- **The recognizer's current strategy coverage is sufficient** for a v1 fingerprint; strategies it cannot yet recognize land in the unrecognized residue honestly rather than blocking this feature.
- **Sub-script profiling is heuristic by design** (character-range membership, e.g. IPA extension ranges), and its labels are profile hints, not authoritative orthography claims — the authoritative claim is always confirmed by the user (spec 038, §3c propose-then-confirm).
- **Engine team owns the classifiers** (they read parsed keyboard structure); **content team owns the facet definitions and validation-set judgments**. Mirrors spec §12.
- Codec-unparseable keyboards are expected and legitimate in the corpus; the constitution's "unparseable base fails the scaffold" article governs *authoring*, not corpus analysis — here unparseable keyboards flow to fallback tiers by design.

## Out of Scope

- Classifiers beyond the three specified (later facets follow the standard set here; each new classifier is content/engine work under spec 036's extensibility rules, not a new spec).
- Named-orthography labeling (Ajami, romanization) — a consumer-side join of script × language, not a classifier output.
- Wiring classifications into studio suggestions/ranking (follow-up feature) and the user-facing confirmation questions ([specs/038](../038-adaptation-questions/spec.md)).
- Any change to locked contracts, the validator layers, or the recognizer's rule catalog itself.
