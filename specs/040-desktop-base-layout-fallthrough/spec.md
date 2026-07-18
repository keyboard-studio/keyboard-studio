# Feature Specification: Desktop base-layout fall-through in the script facet

**Feature Branch**: `040-desktop-base-layout-fallthrough`

**Created**: 2026-07-17 · **Formalized**: 2026-07-18

**Status**: Specified

**Governing section**: spec.md §7 FR-007 amendment (desktop base-layout fall-through in produced
evidence). Carved out of [spec 037 — facet classifiers](../037-facet-classifiers/) on 2026-07-17
(037 tasks T012 + the leak-edge sub-case of T010). **Team**: Content (facet definitions + classifier
algorithm, spec §12).

**Input**: The 037 leak-edge carve-out — "a non-Latin desktop keyboard that leaves alphabetic keys
un-blocked emits a small, real sliver of base-layout (Latin) output that the rule-only `script`
histogram misses entirely."

## Overview

The 036/037 `script` classifier derives its per-keyboard script histogram from the characters a
keyboard's rules explicitly produce. On **desktop**, that under-counts: physical keys a keyboard does
**not** remap fall through to the operating-system base layout (US QWERTY by default), so the
keyboard effectively also produces those base-layout characters even though no rule names them. A
non-Latin desktop keyboard that leaves the alphabetic keys un-blocked therefore emits a small, real
sliver of Latin output the current histogram ignores. This feature folds that **un-blocked**
fall-through into the classifier's evidence as a minor, distribution-only entry that can never flip
the keyboard's dominant script. It is a **Keyman Desktop** concern by construction (touch layouts
declare every key; mobile physical keyboards assume QWERTY and expose no per-keyboard base-layout
setting), and it lives entirely inside the content-owned facet-index tool.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Un-blocked base-layout key surfaces as a script sliver (Priority: P1)

A content maintainer runs the facet-index over the keyboard corpus. A non-Latin desktop keyboard
leaves some alphabetic physical keys un-remapped, so on a real desktop those keys type the US Latin
letters. The maintainer expects the keyboard's `script` record to reflect that real behavior: the
leaked Latin letters appear as a small, visible minority in the script distribution, distinct from
the dominant non-Latin script.

**Why this priority**: This is the whole point of the feature — making the `script` facet reflect
what the keyboard actually emits on desktop, not just what its rules name. Without it, the classifier
is silently blind to a real, observable behavior. It is the minimum viable slice: an un-blocked key
producing a visible leaked sliver.

**Independent Test**: Classify a fixture non-Latin desktop keyboard that leaves `K_A` un-named. The
resulting `script` categorization contains a minor `Latn` entry in its distribution, its evidence
count reflects the leaked character(s), and its provenance remains content-derived.

**Acceptance Scenarios**:

1. **Given** a desktop keyboard whose rules produce a dominant non-Latin script and leave `K_A`
   un-named, **When** the `script` classifier runs, **Then** `Latn` appears as a minor entry in the
   distribution and the dominant value stays the non-Latin script.
2. **Given** the same keyboard, **When** the record is written, **Then** the notes record the leak
   base layout as `base-layout: kbdus (default)`, and append `; branches-on: <value>` when the rules
   carry a base-layout context guard.
3. **Given** a keyboard that already remaps `K_A` to a non-Latin character, **When** the classifier
   runs, **Then** no leaked Latin evidence is added for `K_A` (the key is named, so it does not fall
   through).

---

### User Story 2 - Suppressed keys stay silent and the leak never dominates (Priority: P2)

The maintainer must trust that this new evidence source is safe: a key the keyboard deliberately
blocks (`> nul`) must contribute nothing, and even a keyboard that leaves many alphabetic keys
un-blocked must never have its dominant script flipped to Latin or its confidence downgraded by the
leak. The leak is informational detail in the distribution, not a vote for the dominant script.

**Why this priority**: These are the safety guarantees that make US1 acceptable to ship. They are
distinct, independently testable properties (suppression handling; no-flip / no-confidence-loss) that
prevent the feature from corrupting existing correct records.

**Independent Test**: Classify (a) a keyboard that blocks every base-layout key with `> nul` and
confirm zero leaked evidence; and (b) a mostly-passthrough non-Latin keyboard and confirm its
dominant value and confidence class are identical with and without the leak folded in.

**Acceptance Scenarios**:

1. **Given** a keyboard that maps every alphabetic base-layout key to no output (`> nul`), **When**
   the classifier runs, **Then** no leaked base-layout evidence is added and the record matches the
   pre-feature baseline.
2. **Given** a non-Latin keyboard that leaves many alphabetic keys un-blocked, **When** the leaked
   evidence is folded in, **Then** the dominant value is still the rule-produced non-Latin script and
   the confidence class is no worse than it was before the leak.
3. **Given** any keyboard, **When** leaked evidence is added, **Then** the dominant value and
   confidence class are computed from the rule-produced evidence only, so leaked characters change
   only the distribution and evidence count.

---

### User Story 3 - Deterministic, versioned regeneration of the committed index (Priority: P3)

Because the change shifts committed records for affected desktop keyboards, the maintainer needs the
change to be versioned and the regenerated `docs/keyboard-facet-index.json` to be reproducible: the
same corpus and pinned inputs must always yield the same records, with the classifier version bumped
and the new pinned base-layout table recorded for freshness auditing.

**Why this priority**: Correct evidence (US1/US2) is only trustworthy if the committed artifact
regenerates deterministically and the version bump forces a clean recompute. This is the
release-hygiene slice; it depends on the classifier logic being final.

**Independent Test**: Bump the classifier version, regenerate the index twice from the same inputs,
and confirm the two outputs are byte-identical; confirm the pinned base-layout table appears in the
manifest's reference pins and the artifact passes its lint.

**Acceptance Scenarios**:

1. **Given** the classifier change is complete, **When** the `script` facet's schema version is
   bumped and the index is regenerated, **Then** every affected desktop keyboard's `script` record is
   recomputed and the artifact passes `facet-index-lint`.
2. **Given** identical pinned inputs (corpus, base-layout table, Unicode data), **When** the index is
   regenerated twice, **Then** the two runs produce byte-identical records (no environment reads).
3. **Given** the pinned base-layout table, **When** the index manifest is written, **Then** the table
   is recorded in the manifest's reference pins alongside the existing Unicode pins.

### Edge Cases

- **Touch-only keyboards**: an IR with no desktop physical-key rules has nothing that falls through
  to a base layout; its record must be byte-identical to the pre-feature baseline (no regression).
- **Base-layout branches**: a keyboard that carries a `baselayout('...')` context guard is *testing*
  the host's active base layout, not declaring its own — the leak source stays the environment
  default; the branch value is recorded in notes as an audit hint only.
- **Fully-remapped keyboard**: a keyboard that names every base-layout key (remap or block) leaks
  nothing — the whole feature is a no-op for it.
- **Shifted layer**: v1 scopes fall-through to the unshifted base layer only; shifted fall-through is
  deferred (the leaked Latin sliver is fully demonstrated by the base layer).
- **Non-alphabetic keys**: v1 ships only the alphabetic base-layer keys (`K_A`…`K_Z`); punctuation
  and digit fall-through are out of scope.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `script` classifier MUST fold **un-blocked** desktop base-layout characters into a
  keyboard's script evidence. A physical alphabetic base-layout key is *un-blocked* when **no**
  base-layer rule context names it; an un-blocked key contributes its base-layout character.
- **FR-002**: A base-layout key that any base-layer rule names — whether it is remapped to output, or
  suppressed with `> nul`, or handled under a context guard or group routing — MUST contribute **no**
  new leaked evidence (a named key does not fall through).
- **FR-003**: Leaked base-layout characters MUST appear as minor entries in the script
  **distribution** and MUST increase the recorded evidence count, so the leak is visible and
  auditable.
- **FR-004**: The dominant script value and the confidence classification MUST be computed from the
  **rule-produced (non-leaked) evidence only**. Adding leaked evidence MUST NOT change the dominant
  value or worsen the confidence class of any keyboard.
- **FR-005**: The leak source MUST be the deterministic host-environment default base layout
  (`kbdus`). The system MUST NOT read the OS/environment; base-layout resolution MUST be a pure
  function of the keyboard IR and a pinned base-layout table. (Corrects the original draft's
  assumption of a keyboard-settable `&baselayout` store — upstream confirms `baselayout('...')` is a
  context *test* against a host-supplied store, not a keyboard declaration.)
- **FR-006**: When a keyboard's rules carry one or more `baselayout('...')` context guards, the
  system MUST record the distinct guard values in the record's notes as an audit hint (e.g.
  `base-layout: kbdus (default); branches-on: azerty`), without changing the leak source.
- **FR-007**: The leaked evidence MUST keep the record's provenance as content-derived — the leak is
  the keyboard's real desktop behavior, not a metadata fallback.
- **FR-008**: The base-layout character table MUST be tool-owned, checked-in, pinned data (v1: the
  `kbdus` unshifted `K_A`…`K_Z` map) recorded in the index manifest's reference pins for freshness.
- **FR-009**: The change MUST bump the `script` facet's classifier/schema version and MUST force a
  full, deterministic recompute of the committed `docs/keyboard-facet-index.json`, which MUST then
  pass `facet-index-lint`.
- **FR-010**: Touch-only keyboards and any keyboard that names all of its base-layout keys MUST be
  unaffected — their regenerated records MUST be byte-identical to the pre-feature baseline.
- **FR-011**: The work MUST stay within the content-owned facet-index tool. The shared "glyphs the
  rules produce" produced-set contract, the KeyboardIR, and the codec MUST NOT be changed.

### Key Entities *(include if feature involves data)*

- **Base-layout table**: pinned, tool-owned reference data mapping a base-layout family name (v1:
  `kbdus`) to the unshifted character each alphabetic physical key emits (`K_A`…`K_Z`). Pure data, no
  environment dependency; pinned by content hash.
- **Base-layout resolution**: the internal, non-persisted result of deciding which base layout a
  keyboard leaks to — always the environment default in v1 — plus the set of `baselayout('...')`
  guard values the keyboard branches on (audit hint only).
- **Base-layer key classification**: for each alphabetic base-layout key, whether the keyboard's
  rules leave it un-blocked (leaks its character), name it (remap — already counted), or block it
  (`> nul` — contributes nothing).
- **Script categorization (extended)**: the existing per-keyboard `script` record. Leaked characters
  ride on its existing distribution / evidence-count / notes fields; no new persisted field is added
  and the dominant value / confidence remain rule-derived.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A non-Latin desktop keyboard with un-blocked alphabetic keys records the leaked
  base-layout script as a minor distribution entry (a non-zero, non-dominant share), with notes
  stating the base layout and any branch-awareness.
- **SC-002**: For 100% of keyboards, folding leaked evidence never changes the dominant script value
  and never worsens the confidence class relative to the pre-feature result.
- **SC-003**: A keyboard that blocks every base-layout key (`> nul`) produces zero leaked evidence —
  its record is byte-identical to the pre-feature baseline.
- **SC-004**: 100% of touch-only keyboards are unaffected — byte-identical records before and after
  the change.
- **SC-005**: The committed index regenerates deterministically: two regenerations from identical
  pinned inputs produce byte-identical output, and the artifact passes `facet-index-lint`.

## Assumptions

- **Desktop-only by construction**: touch layouts declare every key (no fall-through), and mobile
  physical/bluetooth keyboards assume QWERTY with no per-keyboard base-layout setting; neither is in
  scope. The feature models Keyman Desktop base-layout resolution only.
- **Environment-default leak source**: a keyboard cannot declare which base layout its un-blocked
  keys fall through to — the host decides, defaulting to `kbdus`. v1 uses that default as the fixed,
  deterministic leak source; other families (AZERTY/QWERTZ) are additive future rows behind the same
  pinned-table schema.
- **Unshifted alphabetic scope**: v1 folds only the unshifted `K_A`…`K_Z` base-layer keys; shifted
  and non-alphabetic fall-through are deferred.
- **Determinism over completeness**: base-layout resolution reads only the keyboard IR and the pinned
  table — never the OS — so records are reproducible.
- **Version-bump + recompute is expected fallout**: shifting produced evidence changes committed
  desktop records, so a classifier-version bump and a full deterministic regenerate of
  `docs/keyboard-facet-index.json` (plus re-lint) are in scope, consistent with the 036 freshness
  contract.
- **Tool-local, contract-preserving**: all logic lives in the standalone facet-index utility; the
  shared produced-set contract, the KeyboardIR, and the codec are untouched (the fall-through is a
  desktop-classification concern, not a produced-set concern).
