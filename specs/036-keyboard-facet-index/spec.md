# Feature Specification: Per-Keyboard Facet Index

**Feature Branch**: `036-keyboard-facet-index`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Create a per-keyboard facet index, with an extensible schema for determining the limits of each facet and categorization for each keyboard."

**Governing sections**: spec.md §3c (defaults are the product), §8 (data flow), [content/facets/README.md](../../content/facets/README.md) (facet record schema, `corpus:` derivation convention). Sibling features: [specs/037-facet-classifiers](../037-facet-classifiers/spec.md) (how values are computed), [specs/038-adaptation-questions](../038-adaptation-questions/spec.md) (how values are confirmed with the user).

## Problem

The studio's runtime keyboard catalog assigns every keyboard the script `Latn`, so onboarding suggests related-language keyboards in the wrong script (right language, wrong writing system). More broadly, the facet catalog under `content/facets/` declares fourteen `corpus:` derivations — signals to be "mined from the keyboards-corpus fingerprint scan" — and every one is `sourceStatus: planned` because no such scan exists. This feature creates the missing substrate: a committed, machine-readable index that records, for every keyboard in the corpus, its categorization along each **keyboard-level facet**, with a likelihood, a provenance trail, and a freshness stamp.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Downstream consumer looks up a keyboard's facet values (Priority: P1)

A studio subsystem (base suggestion ranking, a session-facet `corpus:` derivation, the glottolog relatedness bridge) or a content-team script looks up any corpus keyboard by id and reads its categorization for a facet — e.g. script — receiving the dominant value, the full likelihood distribution, the provenance tier that produced it, and the freshness stamp.

**Why this priority**: This is the product of the feature. Everything else (schema extensibility, rescan) exists so this lookup is trustworthy. It directly unblocks fixing the wrong-script suggestion defect and un-planning the fourteen `corpus:` derivations.

**Independent Test**: With an index built for the sibling keyboards corpus, look up a known Arabic-script keyboard and a known Latin-script keyboard; verify each returns the correct dominant script, a likelihood distribution summing to 1, a named provenance tier, and a freshness stamp — with no studio code changes required.

**Acceptance Scenarios**:

1. **Given** a built index, **When** a consumer looks up a keyboard whose output characters are overwhelmingly Arabic-script, **Then** the script facet reports dominant value `Arab` with a likelihood at or near the Arabic character share, and provenance names the content-derived tier.
2. **Given** a built index, **When** a consumer looks up a keyboard the classifiers could not analyze from content, **Then** the record still exists, carries a value from a declared-metadata or default fallback tier, and the provenance field says which.
3. **Given** a built index, **When** a consumer asks for a facet the index does not define, **Then** the failure is explicit (unknown facet id), not a silent empty value.

---

### User Story 2 - Facet author adds a new keyboard-level facet (Priority: P2)

A content-team member defines a new keyboard-level facet (its id, value type, the closed or open set of permitted values — its "limits" — its derivation method, and its likelihood semantics) and the next index build populates it for every keyboard, **without reshaping or invalidating any existing facet's records**.

**Why this priority**: The user's stated requirement is an *extensible* schema; script is only the first facet. If adding facet N+1 forces a migration of facets 1..N, the index cannot grow with the catalog.

**Independent Test**: Add a trivial new facet definition (e.g. a boolean derived from package metadata), rebuild, and diff: existing facet records are byte-identical; every keyboard gains exactly one new categorization.

**Acceptance Scenarios**:

1. **Given** an index built with N facets, **When** a new facet definition is added and the index rebuilt, **Then** all prior facet categorizations are unchanged and each keyboard carries a categorization for the new facet.
2. **Given** a facet definition declaring a closed value set, **When** a classifier emits a value outside that set, **Then** the build fails loudly (schema violation), never silently recording an out-of-limits value.
3. **Given** a facet definition, **When** it is reviewed, **Then** its value type is one of the declared kinds (enum, set, scalar, histogram) and its limits are stated in the definition itself, not implied by whatever values happen to occur in the data.

---

### User Story 3 - Maintainer rescans the corpus incrementally (Priority: P3)

After pulling new commits in the sibling keyboards checkout, a maintainer re-runs the index build. Only keyboards whose source files changed are re-analyzed; the rest are carried forward untouched. Bumping the Unicode data version or the scanner version forces a full rescan.

**Why this priority**: The corpus is ~1,000 keyboards and changes continuously upstream. Without a cheap, correct rescan story the index rots and consumers stop trusting it — but the index is already valuable with full rebuilds only.

**Independent Test**: Build the index, touch one keyboard's source, rebuild — verify exactly that keyboard's records changed and the manifest's corpus commit stamp updated.

**Acceptance Scenarios**:

1. **Given** a built index and an unchanged corpus, **When** the build is re-run, **Then** the output is byte-identical (determinism).
2. **Given** a built index, **When** one keyboard's source changes and the build is re-run, **Then** only that keyboard's records (and the manifest) differ.
3. **Given** a built index, **When** the pinned Unicode data version or scanner version changes, **Then** all content-derived records are recomputed.

---

### Edge Cases

- A keyboard exists in the corpus but its rule source cannot be analyzed (malformed, or uses constructs the analysis cannot model): the record must still exist, populated via fallback tiers, never omitted.
- A keyboard's package metadata declares no languages at all: language-derived fallbacks are unavailable; the record must say so rather than guess.
- Two keyboards share an id across corpus subtrees (e.g. a release and an experimental variant): index keys must be unambiguous. (Assumed resolved by scoping to the release subtree — see Assumptions.)
- The sibling keyboards checkout is absent or at an unexpected path: the build must fail with a clear message, not produce an empty index that looks valid.
- A facet definition is edited (its limits change) without a version bump: the build must detect that existing records may be stale for that facet and recompute them.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The index MUST contain one record set per keyboard in the corpus scope (see Assumptions), keyed by an unambiguous keyboard identifier, covering every defined keyboard-level facet.
- **FR-002**: Each facet MUST be declared by a **facet definition** stating: a unique id, a value type (one of: enum, set, scalar, histogram), the facet's limits (the closed value list for enums/sets, or the domain for scalars/histograms), its derivation method, and its likelihood semantics. Definitions are data, not code: adding a facet definition MUST NOT require reshaping existing records (US2).
- **FR-003**: Each categorization MUST carry a **likelihood**: a distribution over the facet's values (for histogram/enum facets, e.g. script `{Arab: 0.95, Latn: 0.05}`) or a confidence for single values. A keyboard that does not fit a facet cleanly is representable as-is; consumers, not the index, decide thresholds.
- **FR-004**: Each categorization MUST carry **provenance**: which derivation tier produced it. At minimum the tiers content-derived (computed from what the keyboard actually produces), declared-metadata (taken from the keyboard's own declared tags/metadata), and default-fallback (inferred from external language data) MUST be distinguishable.
- **FR-005**: Each record MUST carry **freshness**: content hashes of the keyboard source files it was derived from, plus index-level stamps for the corpus commit, the pinned Unicode data version, and the scanner/schema version — sufficient to decide, per keyboard, whether a rescan is needed (US3).
- **FR-006**: The index build MUST be deterministic: identical inputs (corpus state, facet definitions, pinned data versions) produce byte-identical output.
- **FR-007**: The index MUST be a committed, machine-readable artifact in this repository, readable without network access and without the sibling corpus checkout present.
- **FR-008**: Values outside a facet's declared limits MUST fail the build (loud schema violation), and the index artifact MUST be validated against the schema as part of repository lint.
- **FR-009**: The keyboard-level facet vocabulary MUST be defined in relation to the existing session-level facet catalog (`content/facets/`): where a session facet's `corpus:` derivation names a signal (e.g. sibling-script-spread, same-language-keyboards, recognized-strategy-distribution, sibling-keyboard-targets), the keyboard-level facet that feeds it MUST be identified in the facet definition, and no second vocabulary may be forked where an existing facet fits. Session-facet records' `sourceStatus` flips from `planned` to `available` only in the change that actually wires the derivation.
- **FR-010**: The index MUST record, per keyboard, the analysis outcome (fully analyzed / partially analyzed / fallback-only) so consumers and the evaluation harness can weight evidence accordingly.

### Key Entities

- **Facet definition**: The declaration of one keyboard-level facet — id, value type, limits, derivation method, likelihood semantics, and the session-level facet derivation(s) it feeds. Owned by the content team, like `content/facets/`.
- **Keyboard categorization**: One keyboard × one facet — value(s), likelihood distribution, provenance tier, per-keyboard freshness (source hashes, analysis outcome).
- **Index manifest**: Build-level metadata — corpus commit stamp, pinned Unicode data version, scanner/schema version, build determinism inputs, keyboard count, per-facet coverage counts.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of keyboards in the corpus scope have a record for every defined facet; zero keyboards are silently omitted.
- **SC-002**: For a hand-verified sample of at least 20 keyboards spanning at least 5 scripts, the script facet's dominant value matches the human judgment in at least 95% of cases (the remainder must be explainably ambiguous, e.g. genuinely dual-script keyboards).
- **SC-003**: A new facet can be added and populated corpus-wide without any change to existing records (byte-diff clean for prior facets).
- **SC-004**: An unchanged-corpus rebuild is byte-identical; a one-keyboard change rebuild touches only that keyboard's records plus the manifest.
- **SC-005**: At least 4 of the 14 `planned` `corpus:` derivations in `content/facets/` can name a concrete field in the index as their source (they flip to `available` in the follow-up wiring feature, not this one).

## Assumptions

- **Corpus scope is the release subtree** of the sibling keyboards checkout (`../keyboards/release/**`) — experimental and legacy subtrees are excluded from v1 of the index. This resolves id ambiguity and matches what the studio's base catalog scans today.
- **The index is built offline and committed**; the studio never rescans at runtime (consistent with the VirtualFS/no-host-disk articles — the SPA only ever reads the committed artifact via its existing catalog channels; wiring that consumption is a follow-up feature, out of scope here).
- **The schema is content-team-owned data, not a locked contract** — like `content/facets/`, it deliberately does not graduate to `packages/contracts` until it survives an evaluation round (per the facet catalog README's graduation rule). No locked `Pattern`/`Criterion` contract is touched.
- **Classifier behavior** (how each facet's values are computed, including the script histogram semantics and fallback chain) is specified separately in [specs/037-facet-classifiers](../037-facet-classifiers/spec.md); this spec owns the artifact shape, extensibility, and freshness model.
- **Team ownership**: content team owns facet definitions and their limits; engine team owns the build tooling and schema validation. The split mirrors spec §12.
- The sibling keyboards checkout is available at build time at its conventional path, per the existing keyboard phonebook convention ([docs/keyboard-index.md](../../docs/keyboard-index.md)).

## Out of Scope

- Wiring the index into the studio's suggestion ranking, the base catalog, or the glottolog bridge (follow-up feature).
- The classifier algorithms themselves (spec 037) and the user-facing confirmation questions (spec 038).
- Session-level facet schema graduation to `packages/contracts`.
- Live rescans inside the SPA.
- CJK/Ethiopic pattern work (constitution Article VII) — those keyboards still get index records (classification is analysis, not authoring support), but no authoring features are built on them.
