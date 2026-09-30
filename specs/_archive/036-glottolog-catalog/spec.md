# Feature Specification: Glottolog classification catalog + related-keyboard-base bridge

**Feature Branch**: `036-glottolog-catalog`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "We need access to a local (updatable) catalog of Glottolog's list of languages and especially the whole classification tree. The goal is: if someone suggests a language that is not supported by any keyboard, we can find closely related languages and suggest a keyboard for that as a base if it exists. To do that we need a map of what languages are related. There is a pyglottolog for Python but not for TypeScript. langtags define the target language, and we should be able to look up 'close' languages."

## Overview

Keyboard authoring in this project starts by picking a language and, ideally, an existing keyboard to copy or adapt (Track 1). When the requested language has **no** existing keyboard, the author is left without a starting point. In practice the best starting point is usually a keyboard for a **genealogically related** language — one that shares the same script conventions and often much of the same phoneme inventory.

Today the project can resolve a language's identity (langtags: BCP47 → orthography defaults, ISO 639-3) but has **no map of which languages are related to which**. This feature adds that map: a local, pinned, offline copy of Glottolog's language classification tree, plus the queries that turn "language X has no keyboard" into "here are keyboards for close relatives of X, ranked by how close they are."

This is the TypeScript-native equivalent of the parts of `pyglottolog` we need — classification, not the full bibliographic dataset.

## Clarifications

### Session 2026-07-13

- Q: Does v1 relatedness stay strictly genealogical, or also offer cross-family candidates by shared script? → A: Genealogical first **with a script-based fallback tier** — and the two signals must **coincide**: a base candidate must match the target's script. The genealogical (same-family) tier is intersected with script; when it yields no keyboard-backed same-script relative, the already-existing script-based fallback (same-script keyboards regardless of family) supplies candidates. This feature contributes the genealogy signal and integrates with the existing script mechanism rather than rebuilding it.
- Q: How is genealogical closeness measured for Tier 1 ranking? → A: Depth of the deepest shared subgroup (length of the shared ancestor prefix from the family root); ties broken by the shorter total path between the two languoids. Decided (no longer a planning soft spot).
- Q: When one keyboard supports several of the target's relatives, is it listed once or once per language? → A: Once per keyboard, ranked by its closest supported relative; the other supported relatives are carried as secondary metadata on that single candidate.
- Q: What is the default output bound when a caller passes none? → A: No default cap — return all matching candidates ranked closest-first; consumers truncate (e.g. top-N) themselves. The bound in FR-013 remains available but is opt-in.
- Q: How are Glottolog's pseudo-families identified for exclusion? → A: A curated set of known pseudo-family glottocodes (stable IDs), checked in and pinned alongside the dataset version; a languoid whose family root is in that set is treated as non-genealogical. Not name-matching, not a derived data flag.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find genealogically close languages for a target language (Priority: P1)

A consumer (the studio, or another engine subsystem) has a target language — identified by BCP47 tag or ISO 639-3 code via langtags — and needs the list of languages most closely related to it, ranked by closeness, regardless of whether any of them has a keyboard yet.

**Why this priority**: This is the foundational capability and the hard part. It is independently valuable to any consumer that reasons about language relatedness, and every higher-level feature (including the keyboard-base suggestion) is built on it. Without it, nothing else in this feature is possible.

**Independent Test**: Given a known glottocode (or an ISO 639-3 code resolved through the langtags bridge), the catalog returns its ancestry chain and a relatedness-ranked list of other languoids, verifiable against Glottolog's published classification for a fixed pinned release — with no network access and no host-disk writes.

**Acceptance Scenarios**:

1. **Given** a valid glottocode for a language, **When** its ancestry is requested, **Then** the system returns the ordered chain of parent groups up to the family root (or an empty chain for a top-level isolate/family).
2. **Given** a valid ISO 639-3 code, **When** the language is looked up, **Then** the system returns the corresponding languoid (the langtags → Glottolog bridge entry point), or a clear "not found" result when the code is not in the pinned dataset.
3. **Given** a target languoid, **When** related languages are requested, **Then** the system returns other languoids ranked by relatedness (closest first), where closeness reflects the depth of the deepest shared subgroup between the two.
4. **Given** an ISO 639-3 code that maps to more than one glottocode, **When** related languages are requested, **Then** the system unions the relatives of every matched glottocode and returns the combined set of possibly-related ISO 639-3 codes, deduplicated, each keeping its closest distance.
5. **Given** two languoids that share only a pseudo-grouping (e.g. Glottolog's "Bookkeeping", "Unclassifiable", "Sign Language", "Artificial Language", "Mixed Language", "Pidgin", or "Speech Register" containers), **When** relatedness is computed, **Then** they are NOT reported as genuinely related through that container.

---

### User Story 2 - Suggest an existing keyboard as a base for an unsupported language (Priority: P2)

An author asks for a keyboard for a language that no keyboard currently supports. The system finds the closest relatives that DO have keyboards and offers those keyboards, ranked by relatedness, as candidate bases to copy/adapt.

**Why this priority**: This is the headline goal — it turns the relatedness map into an actionable authoring suggestion. It builds directly on User Story 1 by joining the relatedness ranking back to the keyboard inventory through langtags and the keyboard phonebook.

**Independent Test**: Given a target language with no keyboard but with at least one keyboard-backed relative in the pinned data, the system returns a ranked, non-empty list of candidate bases, each naming a related language, the keyboard(s) that support it, and its relatedness distance. Given a target language with no keyboard-backed relatives, it returns an empty list without error.

**Acceptance Scenarios**:

1. **Given** a target language with no keyboard, **When** base candidates are requested, **Then** the system returns keyboards for related languages ranked by relatedness (closest relative first).
2. **Given** a related language supported by more than one keyboard, **When** base candidates are requested, **Then** each supporting keyboard is offered (the author chooses), attributed to the same related language and distance.
3. **Given** a target language that already has its own keyboard(s), **When** base candidates are requested, **Then** the system still surfaces the direct keyboard(s) at distance zero and does not fail.
4. **Given** a target language whose family contains no keyboard-backed same-script languages, **When** base candidates are requested, **Then** the system falls back to Tier 2 (same-script keyboards regardless of family); only when Tier 2 is also empty does it return an empty result. It MUST never offer a keyboard whose script differs from the target's.

---

### User Story 3 - Update the catalog to a newer Glottolog release (Priority: P3)

A maintainer bumps the pinned Glottolog release to pick up new/reclassified languages and regenerates the checked-in catalog as a build step.

**Why this priority**: Keeps the map current over time, but the feature delivers value against the initial pinned release without it. It is a maintenance flow, not a user-facing one.

**Independent Test**: Bumping the version pin and re-running the fetch + codegen build steps reproduces a fresh checked-in index; running codegen twice against the same pinned source yields a byte-identical index (determinism), and a tampered/mismatched download fails loudly rather than silently proceeding.

**Acceptance Scenarios**:

1. **Given** an updated version pin (release tag + SHA-256), **When** the fetch step runs, **Then** it downloads and SHA-256-verifies the source, records a source manifest, and fails loudly on any hash mismatch or placeholder hash.
2. **Given** a vendored source file, **When** the codegen step runs twice, **Then** the generated index is byte-identical across runs (deterministic ordering).
3. **Given** the pinned release, **When** the project builds from a clean checkout, **Then** the catalog is produced by the same prebuild pipeline that produces the langtags and kmcmplib artifacts — no separate manual step.

---

### Edge Cases

- **Language not in Glottolog**: the requested code has no languoid → lookups return a clear not-found result; the bridge returns an empty candidate list; consumers must never be blocked on absence.
- **Language with no ISO 639-3 code**: many Glottolog languoids (esp. dialects and subgroups) have no ISO code → the ISO-indexed bridge cannot reach them, but glottocode-keyed queries still work.
- **ISO → glottocode is not 1:1**: an ISO 639-3 code may map to zero, one, or (rarely) more than one languoid → resolution is **permissive**: return every candidate languoid deduplicated by Glottocode, and carry all of them downstream (into relatedness and the base bridge) rather than silently picking one. Deduplication happens again at the end so a language reachable via two matched languoids is not offered twice.
- **Isolates and top-level families**: a language isolate has an ancestry chain of length zero (it is its own family) → relatedness to anything outside itself is effectively none; do not crash on empty ancestry.
- **Pseudo-families**: Glottolog's non-genealogical containers (Bookkeeping, Unclassifiable, Unattested, Artificial Language, Sign Language, Mixed Language, Pidgin, Speech Register) must not create spurious relatedness or spurious base suggestions.
- **Dialect vs language vs family level**: results should distinguish languoid level so consumers can decide whether a dialect-level relative is an acceptable base.
- **Target already supported**: a target with its own keyboard yields a distance-zero direct hit, not just relatives.
- **Keyboard phonebook drift**: a related language's keyboard exists in the wider `keymanapp/keyboards` set but is not yet in the project's phonebook → the bridge can only see keyboards the project knows about; newly referenced keyboards must be added to the phonebook (see Assumptions).

## Requirements *(mandatory)*

### Functional Requirements

#### Data acquisition & update (pin-and-regen)

- **FR-001**: The system MUST source classification data from a pinned Glottolog CLDF release identified by a version file recording release tag/commit, source URL, SHA-256, and license/notice — the same shape and discipline as the existing SIL langtags and kmcmplib pins.
- **FR-002**: The acquisition step MUST download the pinned source, SHA-256-verify it, fail loudly on mismatch or placeholder hash, write the vendored source into a gitignored data directory, and record a source manifest (release, hash, byte count, record count).
- **FR-003**: A codegen step MUST derive a slim, checked-in lookup index from the vendored source, and MUST produce byte-identical output across repeated runs against the same source (deterministic ordering).
- **FR-004**: Both acquisition and codegen steps MUST run as part of the project's existing prebuild pipeline (alongside the langtags and kmcmplib steps), so a clean-checkout build produces the catalog without a separate manual step.
- **FR-005**: A routine catalog update MUST be achievable by bumping the version pin and re-running the build steps; no data-source, runtime-cache, or code change may be required. The only companion artifact reviewed at bump time is the curated pseudo-family glottocode set (FR-012), which is stable across releases and normally needs no edit.

#### Runtime catalog (offline, synchronous)

- **FR-006**: The catalog MUST answer all queries synchronously from the checked-in index with NO runtime network access and NO host-disk writes, consistent with the VirtualFS invariant.
- **FR-007**: The catalog MUST provide lookup of a languoid by its Glottolog code, returning at least: name, level (family / language / dialect), ISO 639-3 code (when present), parent, and family root.
- **FR-008**: The catalog MUST provide lookup by ISO 639-3 code — the langtags bridge entry point — and MUST be **permissive**: when the code maps to more than one languoid it MUST return ALL matching languoids (deduplicated by Glottocode, in a deterministic order), not a single arbitrary pick; it MUST return an empty/not-found result only when the code maps to none.
- **FR-009**: The catalog MUST provide the ancestry chain of a languoid (its ordered enclosing groups up to the family root), returning an empty chain for top-level isolates/families.
- **FR-010**: The catalog MUST report the languoid `level` on results so consumers can distinguish families, languages, and dialects.

#### Relatedness

- **FR-011**: The system MUST compute a relatedness ranking between a target languoid and other languoids, ordered closest-first, where closeness is the **depth of the deepest shared subgroup** (the length of the shared ancestor prefix from the family root; equivalently the position of the nearest common ancestor). Ties MUST be broken by the shorter total path between the two languoids, then by a stable order (glottocode) so results are deterministic.
- **FR-011a**: Relatedness results MUST be **projectable to a set of possibly-related ISO 639-3 codes** — the traversal runs in glottocode-space, but the consumer-facing output is the ISO codes of the related languoids, deduplicated. When the target ISO maps to more than one glottocode (FR-008), the related-ISO set is the **union** across all of those glottocodes' relatives (so more glottocodes yields more candidate ISO codes), deduplicated, each keeping its closest distance. Related languoids that carry no ISO code contribute nothing to this set (they cannot be matched to a keyboard) but MUST NOT cause an error.
- **FR-012**: Relatedness MUST exclude Glottolog's non-genealogical pseudo-families (e.g. Bookkeeping, Unclassifiable, Unattested, Artificial Language, Sign Language, Mixed Language, Pidgin, Speech Register) so that sharing only such a container does not register as genuine relatedness. Recognition MUST be by a **curated set of stable pseudo-family glottocodes**, checked in and pinned alongside the dataset version (not name-matching, not a derived data flag): a languoid whose family root is in that set is treated as non-genealogical. The curated set MUST be reviewed whenever the dataset pin is bumped.
- **FR-013**: Relatedness queries MUST accept an optional bound (maximum number of results and/or a minimum-closeness cutoff). The **default when no bound is given is no cap** — all matching candidates are returned, ranked closest-first, and truncation is the consumer's explicit choice; the query MUST NOT silently drop candidates by default.

#### Keyboard-base bridge (the full join)

- **FR-014**: The system MUST, given a target language (as resolved by langtags to ISO 639-3 / glottocode), return a ranked list of candidate keyboard bases — each identifying the related language, the keyboard(s) that support it (from the project's keyboard phonebook), and the relatedness distance — closest-first. When the target resolves to more than one languoid (permissive ISO resolution, FR-008), relatedness MUST be computed from ALL of them and the results merged; a related language reachable from more than one seed MUST appear once, keeping its closest (smallest) distance.
- **FR-015**: The bridge MUST return an empty result (not an error, not a fabricated suggestion) only when BOTH tiers are empty — i.e. no same-script genealogical relative (Tier 1) AND no same-script fallback (Tier 2) yields a keyboard.
- **FR-016**: When a related language is supported by multiple keyboards, the bridge MUST surface each supporting keyboard as a distinct candidate attributed to that language and distance.
- **FR-016a**: Conversely, when a single keyboard supports several of the target's relatives, the bridge MUST surface that keyboard **once**, ranked by its closest supported relative (smallest distance); the other relatives it supports MUST be carried as secondary metadata on that candidate, not as duplicate candidates. (FR-016 and FR-016a together: candidates are unique per keyboard, and a related language with several keyboards still yields several candidates.)
- **FR-017**: When the target language itself has one or more keyboards, the bridge MUST surface those as distance-zero candidates in addition to (ahead of) related-language candidates.
- **FR-017a**: Glottocode is an **internal identifier** used only for tree traversal. The keyboard-matching layer MUST operate entirely in ISO 639-3 / BCP47 terms — because Keyman keyboards declare BCP47/ISO tags, not glottocodes. The bridge therefore joins the related-ISO set (FR-011a) to the keyboard phonebook by ISO 639-3 / BCP47; glottocodes MUST NOT appear in the keyboard-facing output as a matching key (they MAY be carried as provenance/debug metadata).
- **FR-017b**: Genealogy and script MUST **coincide** on every base candidate: a candidate keyboard MUST be for the same script as the target language. A genealogically close relative whose keyboard is in a different script from the target MUST NOT be offered (a base in the wrong script is not a usable base). The Glottolog-derived genealogical ranking is thus intersected with the target's script.
- **FR-017c**: The bridge MUST expose two tiers, genealogical first: **Tier 1** = same-family relatives with keyboards in the target's script, ranked by genealogical closeness (FR-011); **Tier 2 (fallback)** = same-script keyboards regardless of family, supplied by the project's already-existing script-based fallback, used when Tier 1 yields no candidate and ranked after all Tier 1 candidates. This feature MUST integrate with the existing script-based fallback rather than reimplement it, and MUST tag each candidate with the tier it came from.

#### Packaging & boundaries

- **FR-018**: The catalog MUST be delivered as a new standalone workspace package that builds to the shared contracts package as its dependency root and participates in the monorepo's `pnpm -r` scripts.
- **FR-019**: The package inventory in the project's contributor docs (CLAUDE.md package list and README) MUST gain a row describing the new package.
- **FR-020**: If the bridge causes the project to reference any keyboard not already in the keyboard phonebook, that keyboard's phonebook row MUST be added in the same change (phonebook-currency invariant).

### Key Entities *(include if feature involves data)*

- **Languoid**: a node in the Glottolog classification tree. Attributes: Glottocode (stable id), name, level (family/language/dialect), ISO 639-3 code (optional), parent (Glottocode or none), family root (Glottocode). Relationships: forms a tree via parent links; leaves are typically languages/dialects, internal nodes are subgroups/families.
- **Ancestry / Classification path**: the ordered sequence of enclosing groups from a languoid up to its family root; the basis for relatedness.
- **Relatedness result**: a related languoid plus a closeness measure (shared-subgroup depth / distance) relative to a target.
- **Keyboard-base candidate**: a related language + the keyboard(s) supporting it (from the phonebook) + the relatedness distance to the target; the actionable output of the bridge.
- **Version pin / source manifest**: the pinned Glottolog release identity (tag/commit, URL, SHA-256, license/notice) and the recorded provenance of the vendored source.
- **Curated pseudo-family set**: the checked-in, version-pinned list of non-genealogical family glottocodes (Bookkeeping, Sign Language, Artificial Language, etc.) used by FR-012 to suppress spurious relatedness.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a target language that has no keyboard but has at least one keyboard-backed relative in the pinned data, the system returns at least one candidate base, and the closest keyboard-backed relative appears ahead of more distant ones.
- **SC-002**: The system never suggests a base whose script differs from the target's, and returns an empty candidate list only when neither a same-script genealogical relative nor a same-script fallback keyboard exists.
- **SC-003**: Catalog and relatedness queries return synchronously with no perceptible delay and with zero network requests and zero host-disk writes during any query.
- **SC-004**: Every ISO 639-3 code that langtags can resolve for a language present in the pinned Glottolog release also resolves to a languoid through the bridge (no gap between "langtags knows the language" and "Glottolog can place it") — measured as coverage over the langtags language set.
- **SC-005**: Running codegen twice against the same pinned source produces a byte-identical index (determinism), and a corrupted/mismatched source download fails the build loudly instead of producing a partial catalog.
- **SC-006**: Two languages that are genealogically related in Glottolog rank as related, while two languages sharing only a pseudo-family container do not — verified against a fixed set of known related and known-unrelated language pairs.
- **SC-007**: A maintainer can move the catalog to a newer Glottolog release by editing only the version pin and re-running the build, with no code changes required for a routine bump.

## Assumptions

- **Data flavor**: Glottolog is consumed via its CLDF release (structured tabular data giving Glottocode, parent, family, ISO 639-3, level, name), not the raw per-languoid source repo and not the full bibliographic dataset. The full classification tree is reconstructed from parent links.
- **Scope is classification, not the whole of Glottolog**: references/bibliography, endangerment status, and geo-coordinates beyond what (if any) placement needs are out of scope for v1.
- **Relatedness metric (decided)**: closeness is the depth of the deepest shared subgroup (nearest common ancestor); ties break by shorter total path, then by glottocode for determinism. Locked via Clarifications 2026-07-13.
- **Script comparison (default)**: "same script" means equality of the ISO 15924 script code as supplied by langtags for the target and by the phonebook/langtags for the candidate. This makes FR-017b testable; the exact source of a candidate's script is a contract detail for planning.
- **Ancestry ordering default**: ancestry is returned in a fixed, documented order (family-root-first or leaf-first — to be fixed in the contract); consumers must not depend on an unspecified order.
- **Permissive ISO resolution (decided)**: when an ISO 639-3 code maps to more than one glottocode, the catalog uses *all* of them (deduplicated by Glottocode) rather than choosing one, unions their relatives, and the more glottocodes the target has, the *more* possibly-related ISO codes come out the other side. Breadth is preferred over precision — a spurious extra candidate is cheaper than a missed base. This resolves what was previously an open clarify item.
- **Glottocode is internal; ISO/BCP47 is the currency (decided)**: input arrives as ISO 639-3 (from langtags) and output for the keyboard layer is ISO 639-3 / BCP47. Glottocodes exist only to walk the tree; they are never the matching key against keyboards, because Keyman keyboards declare BCP47/ISO tags and do not carry glottocodes.
- **Target-language resolution is langtags' job**: this feature does not re-derive language identity from BCP47; it consumes the ISO 639-3 / language identity that langtags already provides and joins it into Glottolog. langtags remains the source of truth for the target language.
- **Keyboard inventory source**: "which keyboards support which languages" is read from the project's existing keyboard phonebook (`docs/keyboard-index.md`) / keyboard inventory, not by scanning the external `keymanapp/keyboards` checkout at query time.
- **Update model is pin-and-regen**: no runtime refresh from Glottolog and no runtime cache; updating means bumping the pin and rebuilding, matching the langtags/kmcmplib model and the no-runtime-network invariant.
- **Downstream UI is out of scope**: the studio picker / base-browser integration that consumes these suggestions is a separate downstream feature; this spec covers the catalog, the relatedness API, and the bridge only.

## Dependencies

- The existing langtags subsystem (target-language identity: BCP47 → ISO 639-3, and the script of the target).
- The **existing script-based fallback** mechanism (Tier 2) and the script metadata it relies on — this feature integrates with it, does not rebuild it.
- The keyboard phonebook / inventory (`docs/keyboard-index.md`) for the keyboard side of the bridge.
- The shared contracts package as the dependency root for shared types.
- The existing prebuild pipeline (fetch + codegen wiring) and its pinning/verification conventions.
- Upstream `glottolog/glottolog-cldf` releases (pinned; MIT/CC-licensed data — exact license recorded in the version pin and source manifest).
