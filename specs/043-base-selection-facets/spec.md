# Feature Specification: Base-Selection & Strategy Facet Classifiers

**Feature Branch**: `043-base-selection-facets`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "Extend the keyboard-facet-index with a new ranked set of facets that improve base-keyboard selection and strategy-tree matching — measurement/classification only, deterministically derivable from each corpus keyboard's own source, organized as three prioritized user stories (selector win / high-value matching / cheap enrichers)."

**Governing sections**: Authoritative design brief [docs/source-facets-design.md](../../docs/source-facets-design.md) (esp. §2 three-vocabulary placement, §4 measurement model, §5 facet inventory, §7 spec-037 findings, §10 open items). Predecessor features: [specs/036-keyboard-facet-index](../036-keyboard-facet-index/spec.md) (index shape + storage — summary stored, exception enumeration deterministically recomputed), [specs/037-facet-classifiers](../037-facet-classifiers/spec.md) (the classifier framework + archetype standard these follow), [specs/040-desktop-base-layout-fallthrough](../040-desktop-base-layout-fallthrough/spec.md) (the pinned base-layout data + produced-set fold these reuse), [specs/041-construction-facet-classifiers](../041-construction-facet-classifiers/spec.md) (the 13 construction classifiers this extends). Strategy consumer: spec §7 strategy selection ([specs/007-strategy-selection](../007-strategy-selection/spec.md)) — the A1–A7 axes and the §7.2 decision tree these facets feed. Downstream consumer (do **not** re-spec here): [specs/039-facet-transform](../039-facet-transform/spec.md), which *switches* facet values — this feature only *measures* them.

## Overview

The shipped [docs/keyboard-facet-index.json](../../docs/keyboard-facet-index.json) currently carries 16 keyboard-facets per base (3 originally shipping + the 13 construction facets landed by spec 041) plus the `orth.display-difficulty` input facet. A four-lens design review found that the index still cannot answer several questions the base-selection surface and the §7.2 strategy selector actually ask of a candidate base — chiefly *"which strategy does this base itself exemplify?"*, *"how far is it from stock?"*, *"where does it run?"*, and *"how well does it cover my target's writing system?"*

This feature adds a ranked set of **new keyboard-facets** (each with its keyboard-facet definition, a real classifier, and its session-facet mirror per the §2 two-vocabulary model) that close those gaps. Like spec 041, it is **classification only** — read each corpus keyboard's source, compute each facet value, and surface it per base in the `--classified-only` index. It does **not** implement any value-*transition* / rewrite logic (that is spec 039's scope).

Every facet in this feature is **deterministically derivable from a corpus keyboard's own in-repo source at build time** — the same corpus commit produces byte-identical index output. No git history, no network, no external service.

## Clarifications

### Session 2026-07-20

- Q: `source.platform-coverage` — where is target-platform breadth declared? → A: This corpus's `.kps` dialect (verified against `bambara.kps`) carries **no** `<Targets>` element; platform coverage MUST be **inferred from bundled file types** in the `.kps` `<Files>` list (`.kmx` → desktop, `.js` → web, `.keyman-touch-layout` → touch/mobile), never from an assumed `<Targets>` field.
- Q: Should a base "maturity"/recency signal be included? → A: **No.** Recency requires git log / blame / commit dates or GitHub activity, all of which break byte-determinism across clone depth and mirror sync. Only in-repo file *contents* are eligible; a recency facet is explicitly rejected for this feature.
- Q: How is `keyboard.orthography-coverage-ratio` handled where no reference inventory exists? → A: It falls back to **not-derivable** (never guesses) for languages with no CLDR exemplar-character set; the ratio is emitted only when a pinned reference inventory exists for the base's declared BCP47 tag.
- Q: `source.platform-coverage` — what granularity should the value set emit, given file-type presence cannot distinguish OSes? → A: **Modality only** — value set is a subset of `{desktop, web, touch}` (`.kmx` → desktop, `.js` → web, `.keyman-touch-layout` → touch), the granularity bundled file types can honestly prove. OS-level labels (windows/mac/linux/ios/android) are NOT emitted — they are not derivable from file presence.
- Q: Which of the 13 new facets get a session-facet mirror (vs. keyboard-facet-index only)? → A: **Only the facets whose id names a session family** (`lineage.*`, `source.*`, `env.*`) get a session-facet mirror. The four `keyboard.*` facets (`directionality`, `script-family`, `combining-mark-repertoire`, `orthography-coverage-ratio`) are **keyboard-facet-index-only** — no session mirror.
- Q: What in-repo reference inventory feeds `keyboard.orthography-coverage-ratio`? → A: A **pinned CLDR `exemplarCharacters` release**, pinned in-repo like langtags/glottolog; `not-derivable` when a language has no exemplar set. (Exact release version is a plan-level pin.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Strategy-selector facets surfaced per base (Priority: P1)

A keyboard author (or the studio's base-selection surface ranking candidate bases) is choosing a base to adapt. The §7.2 selector needs, per candidate base, four signals the index does not expose today: the base's **own** dominant strategy, how many characters it adds beyond stock, where it runs, and whether it depends on a bundled font. This story computes the four facets that reuse machinery spec 037/040/041 already built, so the selector can rank bases by primary-strategy match and adaptation distance rather than inferring them from the neighborhood aggregate alone.

The four: `lineage.primary-strategy`, `lineage.added-char-count`, `source.platform-coverage`, `source.font-dependency`.

**Why this priority**: Delivers the highest selector value at the lowest effort — each of the four reuses an existing derivation (`lineage.primary-strategy` is the per-keyboard mode the strategy-fingerprint recognizer already computes but aggregates away; `lineage.added-char-count` diffs the already-computed produced-set against the spec-040 base-layout data; the two `source.*` facets are file-tree/`.kps` reads). Two of the four (`primary-strategy`, `added-char-count`) directly close documented gaps in the §7.2 selector (primary-match scoring and the A1 axis). This is the MVP: a viable, shippable increment that makes the index rank bases, not just describe them.

**Independent Test**: Rebuild the index with `--classified-only` and confirm the four facets appear per corpus keyboard with a dominant value, a provenance tier, and (where consistency < 1) exception sites — verifiable against known-shape fixtures (e.g. `fx_latin`, `fx_arabic`) and the corpus keyboards named in [docs/keyboard-index.md](../../docs/keyboard-index.md), without touching P2/P3 facets.

**Acceptance Scenarios**:

1. **Given** a corpus keyboard whose recognizer strategy vector has a clear mode, **When** the index is rebuilt, **Then** `lineage.primary-strategy` records that single `S-0N` id — the base's *own* dominant strategy, distinct from the `strategy-fingerprint` neighborhood aggregate.
2. **Given** a base that adds a handful of accented letters over `kbdus`, **When** classified, **Then** `lineage.added-char-count` records the count and the spec-§7 axis-A1 band it falls in, computed by diffing the produced-char set against [utilities/facet-index/data/base-layouts.json](../../utilities/facet-index/data/base-layouts.json).
3. **Given** a `.kps` whose `<Files>` list bundles a `.kmx` and a `.js` but no `.keyman-touch-layout`, **When** classified, **Then** `source.platform-coverage` = `{desktop, web}` and does **not** claim `touch`.
4. **Given** a `.kps` that bundles a `.ttf`/`.otf` and a `.kmn` that references a `<Font>` visual store, **When** classified, **Then** `source.font-dependency` = `system-font-reliant`; a base with no bundled font is `self-contained`.
5. **Given** each of the four definitions after implementation, **When** the facet YAML is inspected, **Then** `derivation.classifierId` is a real id (not `planned`) and `pnpm run facet-index-lint` passes.

---

### User Story 2 - Writing-system matching facets surfaced per base (Priority: P2)

The same base-evaluation surface needs to know **how close a base's writing-system capability is to what a target orthography needs** — the mechanism it uses for diacritics, the combining marks it can actually input, how much spare key budget it has, and what fraction of a target orthography it already covers. This story adds the four higher-effort matching facets.

The four: `construction.diacritic-mechanism` (axis A4), `keyboard.combining-mark-repertoire`, `construction.spare-key-budget` (axis A7), `keyboard.orthography-coverage-ratio`.

**Why this priority**: High matching value but moderate effort — `diacritic-mechanism` needs new IR rule-shape classification (A4 is the busiest §7.2 branch), `combining-mark-repertoire` needs a script-family applicability guard, and `orthography-coverage-ratio` needs a pinned reference-inventory (CLDR) dependency. Valuable, but the P1 selector facets stand alone without them.

**Independent Test**: Rebuild the index and confirm the four facets appear with the correct values on family-appropriate fixtures, that the combining-mark and coverage-ratio facets are recorded **not-applicable** / **not-derivable** where their guards say so — verifiable without the P1 facets.

**Acceptance Scenarios**:

1. **Given** a Latin base that stacks multiple independent combining-mark stores, **When** classified, **Then** `construction.diacritic-mechanism` = `stacking-combining`; a base whose deadkey store overwrites (cycles) records `replacing-cycling`.
2. **Given** an alphabetic base, **When** `keyboard.combining-mark-repertoire` is classified, **Then** it records the set of combining marks the base can input; **given** an abugida/abjad base, **Then** the facet is recorded **not-applicable** (its `character-class` unit does not apply — same guard pattern as `normalization-posture`), gated by `keyboard.script-family`.
3. **Given** a base whose RAlt plane is full but other planes are free, **When** classified, **Then** `construction.spare-key-budget` = `ralt-only` (∈ `{many, ralt-only, fully-booked}`), counting unbound key+modifier slots after excluding reserved system combos.
4. **Given** a base declaring a BCP47 tag with a CLDR exemplar-character set, **When** classified, **Then** `keyboard.orthography-coverage-ratio` records a 0.0–1.0 ratio plus the missing-character set; **given** a tag with no CLDR exemplar set, **Then** the facet is recorded **not-derivable**, never guessed.
5. **Given** each of the four definitions after implementation, **When** inspected, **Then** `derivation.classifierId` is real and `facet-index-lint` passes.

---

### User Story 3 - Eligibility & enricher facets surfaced per base (Priority: P3)

The base-selection surface benefits from cheap, high-signal enrichers and a hard eligibility gate: can this base legally be forked, which direction does it write, what script family is it, what languages does its author *claim*, and how complete is its package. This story adds the five low-effort facets.

The five: `env.license-fork-eligibility`, `keyboard.directionality`, `keyboard.script-family`, `source.declared-bcp47-tags`, `source.package-completeness`.

**Why this priority**: Lowest per-facet value individually and mostly enrichment rather than selector-ranking input — but cheap, and `license-fork-eligibility` is a genuine hard gate (a base that cannot be forked cannot be a base at all), while `script-family` is a prerequisite guard for US2's combining-mark facet. Sequenced last because none of them block the selector's core ranking.

**Independent Test**: Rebuild the index and confirm the five facets appear per base with correct values against fixtures — a permissively-licensed base reads `permissive`, an RTL-script base reads `rtl`, an abugida base reads `abugida`, and a base whose `.kps` claims more languages than its rules produce is flagged by the claim-vs-actual cross-check.

**Acceptance Scenarios**:

1. **Given** a base whose `LICENSE.md` header matches a known permissive license, **When** classified, **Then** `env.license-fork-eligibility` = `permissive`; a missing/off-template license reads `unspecified` (∈ `{permissive, copyleft, proprietary-restricted, unspecified}`).
2. **Given** a base whose produced script set includes an RTL script, **When** classified, **Then** `keyboard.directionality` = `rtl` (or `bidi-aware` when both directions are produced) ∈ `{ltr, rtl, bidi-aware}`.
3. **Given** a base's ISO 15924 script code, **When** classified, **Then** `keyboard.script-family` ∈ `{alphabet, abugida, abjad, syllabary, logographic}` via the static lookup, and the value correctly guards US2's `combining-mark-repertoire`.
4. **Given** a `.kps` `<Languages>` list that claims a language whose characters the base does not actually produce, **When** classified, **Then** `source.declared-bcp47-tags` surfaces the claim **and** flags the claim-vs-actual mismatch as an exception (a corpus smell).
5. **Given** a base missing an OSK `.kvks`, a `welcome.htm`, a predictive `.model.ts`, and an icon, **When** classified, **Then** `source.package-completeness` records the checklist shortfall (one facet absorbing all four presence checks).

---

### Edge Cases

- **Codec-unparseable base**: a keyboard whose `.kmn` the codec cannot parse yields no content-derived value for IR-reading facets (`primary-strategy`, `added-char-count`, `diacritic-mechanism`, `spare-key-budget`, `combining-mark-repertoire`); it MUST land at the definition's fallback tier, not crash the build (KeyboardIR spine, no try/catch).
- **CleanWithOpaque imports**: rules preserved as opaque `RawKmnFragment` are not analyzable; `analyzedCoverage` must reflect the opaque share, and IR-reading facets must not treat opaque regions as conforming or deviating.
- **No `.kps` or malformed `.kps`**: `source.platform-coverage`, `source.font-dependency`, `source.declared-bcp47-tags`, `source.package-completeness` fall to their fallback tier, not crash.
- **No `LICENSE.md` / off-template license**: `env.license-fork-eligibility` = `unspecified` (never inferred from author name or copyright year alone).
- **No CLDR exemplar set for the declared tag**: `keyboard.orthography-coverage-ratio` = **not-derivable** (distinct from a 0.0 ratio, which means "reference exists, base covers none").
- **Caseless / non-alphabetic scripts**: `keyboard.combining-mark-repertoire` = **not-applicable** (guarded by `keyboard.script-family`).
- **Ambiguous strategy mode**: when the recognizer strategy vector has no clear mode (a tie), `lineage.primary-strategy` records the tie honestly (e.g. `mixed` or the tied set) rather than silently picking one.
- **Facet definition present but classifier not yet registered**: the default (non-`--classified-only`) build must continue to fail loud on a `planned` def with no classifier; `--classified-only` scopes the artifact to classified facets.

## Requirements *(mandatory)*

### Functional Requirements

#### Measurement model (cross-cutting — all facets)

- **FR-001**: Each classifier MUST record a **dominant value** plus a **consistency** measure and, where consistency < 1, an enumerated set of **exception sites**, per design brief §4 and the spec-036/037 model.
- **FR-002**: Each exception site MUST carry a **cause tag** by predicate-fit (`principled-split` / `capacity-forced` / `gap-omission` residue), reusing the spec-041 cause-predicate library and its script-family applicability guards.
- **FR-003**: Exception-site enumeration MUST be **deterministically recomputable** at build time (spec 037 rule); the committed index stores the **summary** (value + consistency + cause-tag counts), not the per-site enumeration (spec 036 rule).
- **FR-004**: Classification MUST be **deterministic** — the same corpus commit produces byte-identical index output across runs, using **only in-repo file contents**. Git log/blame/commit dates, GitHub API, and any network access are prohibited as derivation inputs.
- **FR-005**: Each classifier MUST attach the correct **provenance tier** (`content-derived` when read from source; the definition's `fallbackChain` tier otherwise) and an **`analyzedCoverage`** reflecting the opaque share of the keyboard's rules.
- **FR-006**: Each facet MUST have a **keyboard-facet definition** (measured per base, appears in the index). Facets whose id names a session family (`lineage.*`, `source.*`, `env.*`) MUST **also** have a **session-facet mirror** in that family, per the §2 two-vocabulary model and the pairing spec 041 established. The four `keyboard.*` facets (`directionality`, `script-family`, `combining-mark-repertoire`, `orthography-coverage-ratio`) are **keyboard-facet-index-only** and MUST NOT get a session-facet mirror.

#### US1 — Strategy-selector facets (P1)

- **FR-010**: The system MUST classify `lineage.primary-strategy` as the **mode of the recognizer's per-keyboard strategy vector** (the base's own dominant `S-01..S-12`), explicitly distinct from `lineage.strategy-fingerprint`'s neighborhood aggregate; a tie MUST be recorded honestly, not silently resolved.
- **FR-011**: The system MUST classify `lineage.added-char-count` by diffing the base's produced-character set (already computed for `script`/`target-mix`, including the spec-040 base-layout fall-through fold) against the stock base-layout char set from [utilities/facet-index/data/base-layouts.json](../../utilities/facet-index/data/base-layouts.json), banded to the spec-§7 **axis A1** bands.
- **FR-012**: The system MUST classify `source.platform-coverage` ∈ subset of `{desktop, web, touch}` (**modality only**, not OS-level) **inferred from bundled file types** in the `.kps` `<Files>` list (`.kmx` → desktop, `.js` → web, `.keyman-touch-layout` → touch), NOT from a `<Targets>` element (absent in this corpus's `.kps` dialect). OS-level labels are NOT emitted — file-type presence cannot distinguish Windows/macOS/Linux/iOS/Android.
- **FR-013**: The system MUST classify `source.font-dependency` ∈ `{self-contained, system-font-reliant}` from whether the `.kps` bundles a `.ttf`/`.otf` **and** the `.kmn` references a `<Font>` visual store; it corroborates `orth.display-difficulty`.

#### US2 — Writing-system matching facets (P2)

- **FR-020**: The system MUST classify `construction.diacritic-mechanism` ∈ `{stacking-combining, replacing-cycling, multi-family, none}` from the IR deadkey/store rewrite-rule shape (spec-§7 **axis A4**), following the spec-037 rule-structure classifier pattern.
- **FR-021**: The system MUST classify `keyboard.combining-mark-repertoire` as the set of combining marks the base can input, recorded **not-applicable** for abugida/abjad families (guarded by `keyboard.script-family`, same guard pattern as `normalization-posture`).
- **FR-022**: The system MUST classify `construction.spare-key-budget` ∈ `{many, ralt-only, fully-booked}` by counting unbound key+modifier-plane slots in the base IR after excluding reserved system combos (spec-§7 **axis A7**).
- **FR-023**: The system MUST classify `keyboard.orthography-coverage-ratio` as a 0.0–1.0 ratio plus the missing-character set, comparing the produced-character set against a **pinned CLDR `exemplarCharacters` snapshot** for the base's declared BCP47 tags; where no exemplar set exists, the facet MUST be recorded **not-derivable** (never guessed). The CLDR snapshot MUST be pinned in-repo for determinism.

#### US3 — Eligibility & enricher facets (P3)

- **FR-030**: The system MUST classify `env.license-fork-eligibility` ∈ `{permissive, copyleft, proprietary-restricted, unspecified}` by matching the `LICENSE.md` header against a small known-license table plus `.kps` `<LicenseFile>` presence; a missing/off-template license MUST read `unspecified`, never inferred.
- **FR-031**: The system MUST classify `keyboard.directionality` ∈ `{ltr, rtl, bidi-aware}` from the base's produced script set plus any RTL layout metadata.
- **FR-032**: The system MUST classify `keyboard.script-family` ∈ `{alphabet, abugida, abjad, syllabary, logographic}` from the ISO 15924 script code via a static in-repo lookup; this facet MUST be available to guard FR-021.
- **FR-033**: The system MUST classify `source.declared-bcp47-tags` from the `.kps` `<Languages>` list and MUST **cross-check** the claimed tags against actually-produced characters, flagging any claim-vs-actual mismatch as an exception.
- **FR-034**: The system MUST classify `source.package-completeness` as a single checklist facet absorbing presence of an OSK `.kvks`, help/`welcome.htm` docs, a predictive `.model.ts`, and an icon.

#### Integration & hygiene

- **FR-040**: Each implemented classifier MUST flip its facet definition's `derivation.classifierId` from `planned` (or author it directly with a real id where the definition does not yet exist) and MUST appear per base in the `--classified-only` index build.
- **FR-041**: `pnpm run facet-lint`, `pnpm run facet-index-lint`, and the existing facet-index test suite MUST pass after each facet lands.
- **FR-042**: The feature MUST NOT implement any value-*transition* / rewrite logic — switching a facet's value is spec 039's scope. This feature stops at measurement + surfacing.
- **FR-043**: The feature MUST stay within the content/engine ownership of the facet-index utility (a standalone `utilities/*` tool, not a `packages/*` build target) and MUST NOT touch the locked `Pattern`/`Criterion` contract or the KeyboardIR codec's parse semantics.

### Non-Goals (explicit)

- **NG-001**: **No maturity/recency facet.** Any signal requiring git history, commit dates, or GitHub activity is rejected for breaking determinism (Clarifications, FR-004).
- **NG-002**: **No transform/rewrite** of any facet value (spec 039).
- **NG-003**: **No `lineage.axis-coverage-vector`** in this feature. The per-base A1/A4/A7 adaptation-distance vector is a natural successor once the P1/P2 axis facets exist, but it is a composition over them and is out of scope here.
- **NG-004**: **No font-coverage database.** `orth.display-difficulty` stays on Unicode-block-age + PUA observation (design brief §10); this feature does not add a font-coverage signal.
- **NG-005**: **No base-side facets for axes A3/A5/A6.** These are target-side elicited/policy properties with no honest base-side analogue; measuring them per base would be fabrication, not a gap to close.
- **NG-006**: **No offline-unreliable linguistic measures** — tone-mark *correctness* and abugida conjunct-completeness are not reliably derivable offline and are not attempted.

## Key Entities

- **Keyboard-facet definition**: per new facet, the `content/keyboard-facets/*.yaml` record naming its value set, `derivation.classifierId`, fallback chain, and (where relevant) applicability guard.
- **Session-facet mirror**: the paired `content/facets/<family>/*.yaml` record (per §2 two-vocabulary model) authored **only** for the `lineage.*` / `source.*` / `env.*` facets; the four `keyboard.*` facets have no mirror (FR-006).
- **Classifier**: a registered `{ classify, fallback }` pair under `utilities/facet-index/*-classifier.ts`, keyed by facet id, following the spec-037 archetype.
- **Produced-character set**: the base's emitted-character set (rules + spec-040 base-layout fall-through), reused by `added-char-count`, `combining-mark-repertoire`, `orthography-coverage-ratio`, `directionality`, and the `declared-bcp47-tags` cross-check.
- **Pinned reference inventory**: the in-repo pinned CLDR `exemplarCharacters` snapshot feeding `orthography-coverage-ratio`; absence of an entry yields **not-derivable**.
- **Known-license table**: the small in-repo table of license-header signatures feeding `license-fork-eligibility`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the feature lands, **13** new keyboard-facets (4 P1 + 4 P2 + 5 P3) appear per applicable base keyboard in the shipped `--classified-only` index, each with a real `derivation.classifierId` (zero remain `planned`).
- **SC-002**: Every classified value on a corpus keyboard carries a provenance tier, a consistency measure, and (where consistency < 1) exception sites with cause tags — no value is emitted without its measurement-model fields.
- **SC-003**: The index build is **deterministic**: rebuilding against the same corpus commit produces byte-identical output; no classifier reads git history or the network; `facet-index-lint`, `facet-lint`, and the facet-index test suite pass.
- **SC-004**: Not-applicable / not-derivable rules hold across the corpus — no abugida/abjad base is assigned a `combining-mark-repertoire`, no base without a CLDR exemplar set is assigned an `orthography-coverage-ratio`, and no base without a `LICENSE.md` is assigned a license other than `unspecified`.
- **SC-005**: A person (or the base-selection surface) evaluating a candidate base can read, from the index alone, the base's own dominant strategy, its distance from stock (axis A1), its platform reach, its diacritic mechanism (axis A4), its spare-key budget (axis A7), its writing-system coverage against a target, its fork eligibility, and its script family — without opening the keyboard's source.
- **SC-006**: The §7.2 strategy selector can rank candidate bases by **primary-strategy match** and **A1 adaptation distance** using index facets alone, where before it inferred both from the neighborhood aggregate.

## Assumptions

- The recognizer already produces a **per-keyboard strategy vector** (the input `strategy-fingerprint` aggregates); `lineage.primary-strategy` reuses that vector's mode rather than re-deriving strategy.
- The **produced-character set** and the **spec-040 base-layout data** are reused as-is; this feature does not re-derive character production or base-layout fall-through.
- **Script-family classification** is available from ISO 15924 via a static lookup (FR-032) and from existing `script`/langtags data; this feature reuses it rather than deriving a new taxonomy.
- A **CLDR `exemplarCharacters` snapshot** can be pinned in-repo (as langtags/glottolog data already are) for deterministic `orthography-coverage-ratio` derivation; where a language has no exemplar set, `not-derivable` is the honest value.
- The `.kps` package files and `LICENSE.md` are present in the sibling `keyboard-studio/keyboards` fork corpus for keyboards that ship them; bases lacking them yield fallback-tier values, not crashes.
- Classifiers follow the spec-037 archetype standard; no new *classifier-framework* spec is required — this is content/engine implementation under spec-036 extensibility.
- The feature is multi-phase (three user stories) and builds one phase per conversation on the Companion pipeline per the constitution's "one conversation per phase" policy.
