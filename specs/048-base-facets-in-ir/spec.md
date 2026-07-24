# Feature Specification: Bake base-keyboard facets into the working-copy IR (available + overridable)

**Feature Branch**: `047-alphabet-inventory-categories` (authored here by request; not its own branch)

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "The facets of the current base keyboard should be baked into the IR so that they can be available and overridden."

## Why this exists

Facets — the machine-derived classification of a keyboard (its `casing`, `directionality`,
`script`, `script-family`, diacritic mechanism, and the rest of the catalog in
[content/keyboard-facets/](../../content/keyboard-facets)) — are currently computed **offline**
by the `utilities/facet-index` tool and shipped as the static artifact
[docs/keyboard-facet-index.json](../../docs/keyboard-facet-index.json). The studio does **not**
read that index at runtime (the only seam, `packages/studio/src/adaptation/evidence.ts`, is a
mock left as an explicit follow-up). As a result, the survey and authoring steps cannot ask a
simple question like "is the base keyboard cased?" without re-deriving it ad hoc — the immediate
motivation is the casing gate tracked in issue #1347, but the same gap blocks every facet-aware
decision (directionality, script family, diacritic mechanism, …).

This feature makes the **current base keyboard's facets a first-class part of the working copy**:
computed once when the base is instantiated, carried on the in-memory `KeyboardIR` spine so any
step can read them, and **overridable** so an author (or the engine) can correct an undetermined
or misclassified value without editing offline data.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Facets are available at runtime from the working copy (Priority: P1)

When a keyboard author selects a base keyboard, the studio derives that base's facet values and
attaches them to the working copy. Every downstream step (character discovery, marks/attachment,
strategy selection, carve) can read a facet — e.g. `casing`, `directionality`, `script-family` —
directly from the working copy, with no offline index load and no per-step re-derivation.

**Why this priority**: Nothing facet-aware can be gated at runtime today. This is the foundation
the override story and every consumer (starting with the casing gate, #1347) build on.

**Independent Test**: Instantiate a working copy from a Latin base and from a Devanagari base;
confirm the working copy reports `casing = cased` for the former and `casing = caseless` for the
latter, read through one accessor, without loading `docs/keyboard-facet-index.json`.

**Acceptance Scenarios**:

1. **Given** a cased-script base keyboard, **When** the working copy is instantiated, **Then**
   its facets include `casing = cased` (and the other catalog facets that apply).
2. **Given** a caseless-script base keyboard, **When** the working copy is instantiated, **Then**
   its facets include `casing = caseless`.
3. **Given** an instantiated working copy, **When** a step reads a facet value, **Then** it
   receives the value without any network or offline-artifact access.

---

### User Story 2 - Override a facet value (Priority: P1)

A facet the tool derived may be wrong or `undetermined`. The author (or an engine step) can set an
override for any facet on the working copy. The override takes precedence over the derived value
and persists for the life of the working copy; reading the facet afterwards returns the overridden
value.

**Why this priority**: "Available" without "overridable" leaves a misclassification unfixable at
authoring time; the user explicitly asked for both. Overrides are what let a human correct the
machine.

**Independent Test**: Take a working copy whose derived `casing` is `caseless`, override it to
`cased`, and confirm the effective value read by a consumer is `cased`; clear the override and
confirm it reverts to `caseless`.

**Acceptance Scenarios**:

1. **Given** a working copy with a derived facet value, **When** an override is set for that facet,
   **Then** reading the facet returns the override, not the derived value.
2. **Given** an overridden facet, **When** the override is cleared, **Then** reading the facet
   returns the original derived value again.
3. **Given** a facet the tool could not determine, **When** the author sets a value, **Then** that
   value is treated as an override and used by consumers.

---

### User Story 3 - Provenance is visible (Priority: P2)

Each facet value on the working copy carries where it came from — derived from the base, overridden
by a human/engine, or undetermined — so the UI can show "auto-detected" vs "you changed this," and
so consumers can decide how much to trust a value.

**Why this priority**: A quality/trust refinement on top of US1–US2; the facets are usable without
it, but provenance is what makes an override auditable and lets the UI explain itself.

**Independent Test**: Read a derived facet and an overridden facet; confirm the first reports
provenance "derived" and the second reports "overridden."

**Acceptance Scenarios**:

1. **Given** a freshly instantiated working copy, **When** a facet is read, **Then** its provenance
   is "derived" (or "undetermined" when no value could be computed).
2. **Given** an overridden facet, **When** it is read, **Then** its provenance is "overridden."

### Edge Cases

- A facet the derivation cannot determine is recorded as `undetermined` (never silently absent), so
  a consumer can distinguish "caseless" from "unknown."
- The derived facet set must stay consistent with the offline `utilities/facet-index` classifiers —
  the same base must not be classified `cased` by the index and `caseless` at runtime. A single
  shared derivation is the intended source of truth.
- Track 2 (import an existing keyboard) instantiates the working copy the same way as Track 1
  (copy/adapt a base) — facets are derived and attached on both paths.
- Overriding a facet does not mutate the base keyboard or any offline artifact; it lives only on the
  working copy.
- Facets are metadata about the keyboard, not `.kmn` constructs — they are **not** emitted into the
  produced `.kmn`/`.kps` output (see Out of scope).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When a working copy is instantiated from a base (Track 1 `instantiateFromBase`) or
  from an existing keyboard (Track 2 `instantiateFromExisting`), the system MUST derive the base
  keyboard's facet values and attach them to the working-copy `KeyboardIR`.
- **FR-002**: The facets carried on the IR MUST cover, at minimum, the facets needed by survey-time
  decisions — starting with `casing` — and SHOULD align with the applicable subset of the
  [content/keyboard-facets/](../../content/keyboard-facets) catalog (e.g. `directionality`, `script`,
  `script-family`).
- **FR-003**: Each baked facet MUST record its value together with its provenance (derived,
  overridden, or undetermined).
- **FR-004**: Any facet value on the working copy MUST be overridable; the override MUST persist on
  the working copy and take precedence over the derived value.
- **FR-005**: Reading a facet MUST return the **effective** value — the override when present,
  otherwise the derived value — through a single accessor.
- **FR-006**: Clearing an override MUST restore the previously derived value.
- **FR-007**: Facet derivation MUST be browser-safe (operate on the in-memory IR / base metadata,
  with no network or offline-artifact access at runtime).
- **FR-008**: The runtime derivation MUST be consistent with the offline `utilities/facet-index`
  classifiers for the same input — a single shared derivation is REQUIRED rather than a second,
  divergent implementation.
- **FR-009**: The change MUST be additive to the locked `KeyboardIR` / contract: existing consumers
  that do not read facets MUST behave exactly as before, and round-trip (parse → emit) of a base
  that had no facets MUST be unaffected.
- **FR-010**: An override MUST NOT modify the base keyboard, the offline facet index, or any other
  shared/off-working-copy data.

### Key Entities *(include if feature involves data)*

- **Facet**: a named classification of the keyboard (id from the facet catalog, e.g. `casing`) with
  an enumerated or typed value.
- **Facet value + provenance**: the effective value of a facet on the working copy, plus where it
  came from (derived / overridden / undetermined).
- **Facet set on the IR**: the collection of facet values baked into the working-copy `KeyboardIR`,
  read via one accessor and mutated via override/clear.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After instantiating a working copy from any supported base, its facet set is
  populated and readable through one accessor with zero offline-artifact/network access.
- **SC-002**: For a representative cased base and a representative caseless base, the runtime
  `casing` facet matches the value the offline `utilities/facet-index` produces for the same
  keyboard.
- **SC-003**: Setting an override changes the effective facet value for every consumer; clearing it
  restores the derived value — verified in test.
- **SC-004**: A facet that cannot be determined reads as `undetermined`, never as a missing/absent
  value.
- **SC-005**: A base keyboard with no facets baked in still parses, emits, and round-trips exactly
  as before this feature (additive-contract regression).

## Assumptions

- The `casing` facet is the first concrete consumer (issue #1347); the mechanism is general and the
  remaining catalog facets can be baked in incrementally as consumers need them.
- Facets are working-copy metadata, derived from the base; per-session overrides persist with the
  working copy's existing draft-persistence mechanism (no new persistence store is assumed).
- The shared derivation lives where both the offline `utilities/facet-index` build tool and the
  browser studio can use one source of truth (e.g. hoisted into `@keyboard-studio/contracts` or the
  engine), rather than duplicating the `utilities/facet-index` logic.
- No change to the produced `.kmn`/`.kps` output is required; facets are in-memory IR metadata.

## Out of scope

- Emitting facet metadata into the produced `.kmn`/`.kps` artifact.
- Loading the full offline `docs/keyboard-facet-index.json` at runtime (a separate, heavier
  `AdaptationEvidenceProvider` follow-up); this feature derives facets from the base in-memory.
- Editing/authoring the offline facet catalog or the `utilities/facet-index` classifiers beyond
  what FR-008 (shared derivation) requires.
- The specific UI for surfacing/editing facet overrides (owned by the consuming features, e.g. the
  casing gate in #1347); this feature provides the data model and accessors those UIs build on.

## Related

- Issue #1347 — base-keyboard casing facet gate + lowercase-only diacritic questions (the first
  consumer of this data model).
- [content/keyboard-facets/](../../content/keyboard-facets), `utilities/facet-index/` — the offline
  facet catalog and classifiers this runtime derivation must stay consistent with (FR-008).
- Architecture invariant: `KeyboardIR` is the engine spine (Constitution Article II) and the working
  copy is the single mutable spine (Article III); facets ride on that spine additively (FR-009).
