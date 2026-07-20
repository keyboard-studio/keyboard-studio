# Feature Specification: Construction Facet Classifiers

**Feature Branch**: `041-construction-facet-classifiers`

**Created**: 2026-07-19

**Status**: Draft

**Input**: User description: "Implement the classifiers for the 13 currently-planned construction keyboard-facet definitions plus the new `orth.display-difficulty` input facet, so the 'implied' construction decisions a base keyboard carries become visible per base in the shipped facet index."

**Governing sections**: Authoritative design brief [docs/source-facets-design.md](../../docs/source-facets-design.md) (esp. §4 measurement model, §5 facet inventory, §7 spec-037 findings). Predecessor features: [specs/036-keyboard-facet-index](../036-keyboard-facet-index/spec.md) (index shape + storage — exception-site enumeration is deterministically recomputable, not stored) and [specs/037-facet-classifiers](../037-facet-classifiers/spec.md) (the classifier framework + the archetype standard these follow). Downstream consumer (do **not** re-spec here): [specs/039-facet-transform](../039-facet-transform/spec.md), which *switches* facet values — this feature only *measures* them.

## Overview

Sixteen keyboard-facet definitions live in [content/keyboard-facets/](../../content/keyboard-facets/); only three (`script`, `strategy-fingerprint`, `target-mix`) have a classifier and therefore appear in the shipped [docs/keyboard-facet-index.json](../../docs/keyboard-facet-index.json) (built `--classified-only`). The other 13 carry `derivation.classifierId: planned` and are invisible. This feature implements those 13 classifiers plus one new input facet (`orth.display-difficulty`), so every base keyboard in the corpus exposes the **construction decisions baked into it** — how characters are spelled, which combining mechanism was chosen, NFC vs NFD, how capitals are handled, whether base-layout fall-through is blocked, and so on.

The facets are already *defined* (spec 039 authored the YAML). This feature is **classification only**: read each corpus keyboard's source, compute each facet value, and flip each definition's `classifierId` from `planned` to a real id.

## Clarifications

### Session 2026-07-19

- Q: How should `orth.display-difficulty` split the three-way value set from the Unicode block's first-assigned version? → A: Two version-era boundaries keyed to Unicode major version — `well-supported` = block first assigned in an old release (≈ ≤ Unicode 5.x / pre-2007); `partially-supported` = mid-era (≈ 6.0–10.0); `poorly-supported` = recent (≈ ≥ 11.0). Boundaries recorded as the facet's derivation params; PUA observation still overrides to `poorly-supported`.
- Q: At what granularity does observed PUA usage override to `poorly-supported`? → A: Script-level — any PUA usage in the corpus attributed to the script overrides that script's value, matching the facet's per-script emission granularity.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Desktop construction facets surfaced per base (Priority: P1)

A keyboard author (or the studio's base-selection surface proposing candidate bases) is evaluating a corpus keyboard as a base. Today they can see its script and strategy fingerprint, but not the construction decisions in its `.kmn` — whether it duplicates rules per case or folds case with `any()`/`index()`, whether it spells output as quoted literals or `\u` notation, whether it uses deadkeys or modifier-keys for combining, whether it relies on base-layout fall-through, whether it is mnemonic (Windows-only) or positional. This story computes the **nine facets readable from the parsed `.kmn` (or script identity)** so those decisions become visible per base.

The nine: `caps-handling`, `casing`, `desktop-combo-mechanism`, `encoding`, `fallback-posture`, `mnemonic-vs-positional`, `normalization-posture`, `reordering-rules`, `rule-store-compaction`.

**Why this priority**: Delivers the bulk of the value (9 of 14 facets) with no new scanning capability — all nine reuse the established spec-037 rule-structure classifier pattern. This is the MVP: a viable, shippable increment that answers "what construction decisions does this base carry?" for the desktop mechanisms across the ~900-keyboard corpus.

**Independent Test**: Rebuild the index with `--classified-only` and confirm the nine facets appear on corpus keyboards with a dominant value, a consistency measure, enumerated exception sites, and a cause tag per exception — verifiable against known-shape fixtures (e.g. `fx_arabic`, `fx_latin`) without any touch-layout parsing.

**Acceptance Scenarios**:

1. **Given** a corpus keyboard whose `.kmn` folds case via a single case-neutral store, **When** the index is rebuilt, **Then** its `caps-handling` value is `any-index-fold` with consistency 1 and no exception sites.
2. **Given** a keyboard whose output stores mix quoted literals and `\u` notation, **When** classified, **Then** `encoding` records the per-role (`input`/`base`/`combining`) distribution and flags the minority spelling sites as exceptions.
3. **Given** a keyboard declaring `&MNEMONICLAYOUT`, **When** classified, **Then** `mnemonic-vs-positional` is `mnemonic` and the facet is marked as a **gate** (surfaced, never offered for transform).
4. **Given** a caseless-script keyboard (e.g. Arabic), **When** classified, **Then** `casing` is `caseless` and `caps-handling` is recorded **not-applicable** rather than forced to a value.
5. **Given** an abugida/abjad keyboard, **When** `normalization-posture` is classified, **Then** it is marked **not-applicable** (the NFC/NFD axis is near-vacuous for that family) rather than assigned `nfc`/`nfd`.
6. **Given** a keyboard with an unset `&baselayout`, **When** `fallback-posture` is classified, **Then** the fall-through base is recorded as **defaulted** (the packaging format's default), not as a declared value.
7. **Given** each of the nine definitions after implementation, **When** the facet YAML is inspected, **Then** `derivation.classifierId` is a real classifier id, not `planned`, and `pnpm run facet-index-lint` passes.

---

### User Story 2 - Touch-layout construction facets surfaced per base (Priority: P2)

The same base-evaluation surface needs to show the **touch** construction decisions: whether combining is exposed as longpress / flick / multitap / layer / key, whether a 5th (number) row is shown and what it carries, whether a dedicated symbol layer exists, and whether desktop modifier layers (ALT/RALT/CTRL) leaked into the touch layout. These live in the keyboard's `.keyman-touch-layout` JSON, which the existing KMN strategy recognizer is **blind to** (design brief §2) — so this story adds a new touch-layout scan.

The four: `touch-combo-mechanism`, `touch-number-row`, `touch-symbol-layer`, `touch-modifier-layers`.

**Why this priority**: Adds a genuinely new capability (a `.keyman-touch-layout` reader) rather than reusing the `.kmn` path, so it carries more risk and is separable from P1. Valuable but only for keyboards that ship a touch layout; the desktop story stands alone without it.

**Independent Test**: Rebuild the index and confirm the four touch facets appear for keyboards that ship a `.keyman-touch-layout`, and are absent/not-applicable for keyboards with no touch layout — verifiable against a touch-layout fixture without any `.kmn` rule-structure dependency.

**Acceptance Scenarios**:

1. **Given** a keyboard whose touch layout exposes base+mark via longpress popups, **When** classified, **Then** `touch-combo-mechanism` records `longpress` as the dominant mechanism with its distribution.
2. **Given** a keyboard with no `.keyman-touch-layout` file, **When** classified, **Then** the four touch facets are recorded **not-applicable** (no touch modality to model) rather than defaulted to a value.
3. **Given** a touch layout that reproduces desktop ALT/RALT layers, **When** classified, **Then** `touch-modifier-layers` is `maps-desktop-modifiers` and (per the cause taxonomy) the sites carry the appropriate cause tag.
4. **Given** each of the four definitions after implementation, **When** inspected, **Then** `derivation.classifierId` is real and `facet-index-lint` passes.

---

### User Story 3 - Display-difficulty input facet (Priority: P3)

The `source.encoding` house-target policy needs to know whether a script renders in common system fonts/editors — poor rendering pushes the recommended spelling toward `U+` notation. This story adds the new **input** facet `orth.display-difficulty`, derived per script from the Unicode block's first-assigned version (older blocks → broader font support), overridden to `poorly-supported` when Private-Use-Area usage is observed in the corpus for that script/range.

**Why this priority**: A supporting signal, not a base-construction measurement — it feeds the encoding facet's house-target policy (a spec-039 concern). Lowest user-visible value on its own; sequenced last.

**Independent Test**: For a given script, confirm the facet yields `well-supported` / `partially-supported` / `poorly-supported` from the Unicode block age, and flips to `poorly-supported` when PUA usage is present — verifiable per-script without the base classifiers.

**Acceptance Scenarios**:

1. **Given** a long-established Unicode block (e.g. Basic Latin), **When** `orth.display-difficulty` is derived, **Then** it is `well-supported`.
2. **Given** a script for which the corpus uses PUA code points, **When** derived, **Then** it is overridden to `poorly-supported` regardless of block age.

---

### Edge Cases

- **Codec-unparseable base**: a keyboard whose `.kmn` the codec cannot parse fails the scaffold today (KeyboardIR spine, no try/catch). The classifiers operate on the parsed IR, so such keyboards yield no content-derived value — they must land at the definition's fallback tier, not crash the build.
- **CleanWithOpaque imports**: rules preserved as opaque `RawKmnFragment` are not analyzable. `analyzedCoverage` must reflect the opaque share (partially analyzed), and exception-site enumeration must not treat opaque regions as either conforming or deviating.
- **Empty exception set**: a fully consistent keyboard has consistency 1 and zero exception sites — no cause predicates run.
- **No predicate fits an exception**: the exception's cause tag is `gap-omission` (the residue when neither `character-class` nor `layer-capacity` fits).
- **Character-class predicate outside its guard**: on abugida/abjad corpora the `character-class` predicate is **not applied** (its applicability guard scopes it to alphabetic-with-diacritics families); exceptions there fall through to other predicates or `gap-omission`.
- **Facet definition present but classifier not yet registered**: the default (non-`--classified-only`) build must continue to fail loud on a `planned` def with no classifier; only `--classified-only` scopes the artifact to classified facets.

## Requirements *(mandatory)*

### Functional Requirements

#### Measurement model (cross-cutting — all facets)

- **FR-001**: Each classifier MUST record a **dominant value** plus a **consistency** measure and an enumerated set of **exception sites** (the sites deviating from the dominant value), per design brief §4.
- **FR-002**: Each exception site MUST carry a **cause tag** assigned by **predicate-fit**: try a small library of cause predicates and tag the site with whichever fits; when none fits, tag `gap-omission` (the residue).
- **FR-003**: The cause-predicate library MUST include the two starter predicates — **`character-class`** ("all deviations are combining marks" → `principled-split`) and **`layer-capacity`** ("deviations begin exactly after the primary layer filled" → `capacity-forced`) — and MUST be extensible for content-team-authored predicates.
- **FR-004**: The `character-class` predicate MUST carry a **script-family applicability guard**: applied only to alphabetic-with-diacritics corpora (Latin/Cyrillic/Greek-family) and **not applied** to abugida/abjad corpora until family-specific predicates exist.
- **FR-005**: Exception-site enumeration MUST be **deterministically recomputable** from the corpus at build time (spec 037 determinism rule); the committed index stores the **summary** (value + consistency + cause-tag counts), not the per-site enumeration (spec 036 storage rule).
- **FR-006**: Classification MUST be deterministic — the same corpus commit produces byte-identical index output across runs (no wall-clock or random ordering).
- **FR-007**: Each classifier MUST attach the correct **provenance tier** (`content-derived` when read from source; the definition's `fallbackChain` tier otherwise) and an **`analyzedCoverage`** reflecting the opaque share of the keyboard's rules.

#### US1 — Desktop `.kmn` / script facets

- **FR-010**: The system MUST classify the nine desktop facets from the parsed `KeyboardIR` (or script identity for `casing`), following the spec-037 rule-structure classifier pattern and registering each in the classifier registry.
- **FR-011**: Each facet's value set MUST match its definition and the design-brief §5 inventory (e.g. `caps-handling` ∈ `{per-rule-duplication, any-index-fold, no-caps-rules, mixed}`; `desktop-combo-mechanism` ∈ `{direct-key, modifier-key, deadkey, context-match, os-compose}`; `reordering-rules` ∈ `{none, group-reorder-swap, inline-swap, mixed}`; `fallback-posture` ∈ `{relies-on, blocks-comprehensively, mixed}`).
- **FR-012**: `encoding` MUST classify **per role** via its `input`/`base`/`combining` sub-profiles, including the input **match-kind axis** (`key-ref` / `char-ref` / `mixed`) distinct from the within-kind spelling axes. (The match-kind axis is a semantic distinction, not behavior-preserving — recorded, never auto-normalized; any transform of it is spec 039's concern, not this feature's.)
- **FR-013**: `caps-handling` MUST be recorded **not-applicable** when `casing` = `caseless` (a gate dependency, not a base filter).
- **FR-014**: `normalization-posture` MUST be recorded **not-applicable** for abugida/abjad families (NFC/NFD near-vacuous), and its **backspace-match** signal MUST be recorded as consistency/exception data layered on the `{nfc, nfd, mixed}` value, not as a value of the facet.
- **FR-015**: `fallback-posture` MUST read the keyboard's own `&baselayout` system store (not an assumed US QWERTY); when `&baselayout` is unset, the packaging default MUST be recorded as **defaulted**, not declared. Modality is physical-only. Leaked keys are the exception sites.
- **FR-016**: `mnemonic-vs-positional` MUST be treated as a **gate** facet — measured and surfaced, tagged so downstream never offers it for transform.

#### US2 — Touch-layout facets

- **FR-020**: The system MUST add a `.keyman-touch-layout` JSON scanner (a new evidence source; the KMN recognizer does not cover touch mechanisms) and classify the four touch facets from it.
- **FR-021**: The four touch facets MUST use the value sets in the design-brief §5 inventory (e.g. `touch-combo-mechanism` ∈ `{key, layer, longpress, flick, multitap}`; `touch-number-row` ∈ `{absent, digits, letters, mixed}`; `touch-symbol-layer` ∈ `{present, absent}`; `touch-modifier-layers` ∈ `{none, maps-desktop-modifiers, mixed}`).
- **FR-022**: A keyboard with **no** `.keyman-touch-layout` MUST record the four touch facets as **not-applicable** (no touch modality), never a defaulted value.

#### US3 — Display-difficulty input facet

- **FR-030**: The system MUST author and derive the new input facet `orth.display-difficulty` with values `{well-supported, partially-supported, poorly-supported}`.
- **FR-031**: Derivation MUST use the Unicode block's first-assigned version as the primary signal, split by **two version-era boundaries** recorded as the facet's derivation params: `well-supported` = block first assigned in an old release (≈ ≤ Unicode 5.x / pre-2007), `partially-supported` = mid-era (≈ Unicode 6.0–10.0), `poorly-supported` = recent (≈ ≥ Unicode 11.0). Any block-age result MUST be overridden to `poorly-supported` at **script-level granularity** — any PUA usage observed in the corpus attributed to the script overrides that script's value, matching the facet's per-script emission granularity. (Font-coverage databases are a deferred open item — brief §10.)

#### Integration & hygiene

- **FR-040**: Each implemented classifier MUST flip its facet definition's `derivation.classifierId` from `planned` to the real id, and each facet MUST then appear per base keyboard in the `--classified-only` index build.
- **FR-041**: `pnpm run facet-index-lint` (artifact validator) and the existing facet-index tests MUST pass after each facet lands.
- **FR-042**: The feature MUST NOT implement any value-*transition* / rewrite logic — switching a facet's value is spec 039's scope. This feature stops at measurement + surfacing.
- **FR-043**: The feature MUST stay within the content/engine ownership of the facet-index utility (a standalone `utilities/*` tool, not a `packages/*` build target) and MUST NOT touch the locked `Pattern`/`Criterion` contract or the KeyboardIR codec's parse semantics.

### Key Entities

- **Construction facet value**: per keyboard, per facet — a dominant value (from the definition's value set), a consistency measure, a provenance tier, an `analyzedCoverage`, and (for `set`-typed facets like `encoding`) a per-role/per-sub-profile distribution.
- **Exception site**: a rule/store/layout location deviating from the facet's dominant value, carrying a predicate-fit **cause tag** (`principled-split` / `capacity-forced` / `gap-omission`). Deterministically recomputable; not stored in the committed index.
- **Cause predicate**: a named, auditable test over an exception set that, when it fits, assigns a cause tag. Starter library: `character-class` (guarded to alphabetic-with-diacritics), `layer-capacity`. Content-team-extensible.
- **Touch-layout evidence**: the parsed `.keyman-touch-layout` JSON — a new evidence source distinct from the `KeyboardIR`, feeding the four touch facets.
- **Display-difficulty signal**: per-script rendering-support tier derived from Unicode block age + observed PUA usage; feeds the (spec-039) encoding house-target policy.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the feature lands, **16** keyboard facets (the current 3 + the 13 planned) appear per base keyboard in the shipped `--classified-only` index — up from 3 today. Zero definitions in [content/keyboard-facets/](../../content/keyboard-facets/) retain `classifierId: planned`.
- **SC-002**: Every classified value on a corpus keyboard carries a provenance tier, a consistency measure, and (where consistency < 1) exception sites each with a cause tag — no value is emitted without its measurement-model fields.
- **SC-003**: The index build is deterministic: rebuilding against the same corpus commit produces byte-identical output, and `facet-index-lint` plus the facet-index test suite pass.
- **SC-004**: Not-applicable rules hold across the corpus — no caseless-script keyboard is assigned a `caps-handling` value, no abugida/abjad keyboard is assigned `nfc`/`nfd`, and no touch-layout-less keyboard is assigned a touch-facet value.
- **SC-005**: A person evaluating a candidate base can read, from the index alone, the base's construction decisions across capitals, encoding spelling, combining mechanism (desktop and touch), normalization, reordering, fall-through, and mnemonic-vs-positional — without opening the keyboard's source.

## Assumptions

- The 13 facet YAML definitions authored by spec 039 are the authoritative value sets; this feature implements classifiers *to* those definitions and does not redefine them (any value-set change is a spec-039/brief-§5 edit, surfaced separately).
- The transform engine that switches facet values is owned by spec 039; this feature is its measurement input only, cited as the downstream consumer.
- Classifiers follow the spec-037 archetype standard; no new *classifier-framework* spec is required (design brief §7.2) — the work is content/engine implementation under spec-036 extensibility.
- Exception-site enumeration is recomputed at build time rather than stored, consistent with spec 036's storage rule and spec 037's determinism rule.
- Script-family classification (needed for the `character-class` guard and the `normalization-posture` / `casing` not-applicable rules) is available from the existing `script` facet / langtags data; this feature reuses it rather than deriving a new script taxonomy.
- The `.keyman-touch-layout` files are present in the sibling `keymanapp/keyboards` corpus for keyboards that ship touch layouts; keyboards without them are desktop-only and correctly yield not-applicable touch facets.
- `orth.display-difficulty` uses Unicode block age + PUA observation only; font-coverage databases are explicitly deferred (brief §10).
- The feature is multi-phase (three user stories) and therefore builds one phase per conversation on the Companion pipeline per the constitution's "One conversation per phase" policy.
