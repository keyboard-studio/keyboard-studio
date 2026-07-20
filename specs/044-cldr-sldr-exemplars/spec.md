# Feature Specification: CLDR/SLDR exemplars

**Feature Branch**: `044-cldr-sldr-exemplars`

**Created**: 2026-07-20

**Status**: Draft

**Input**: User description: "CLDR/SLDR exemplars"

**Governing spec section**: spec.md §8 step 6 "Survey — Characters (Character coverage + strategy axes)" — authoritative in [specs/008-data-flow/spec.md](../008-data-flow/spec.md) (the discovery-methods menu + the "same pinned Unicode/CLDR signal as the kbgen placement seeder" clause). Secondary: §7.6 placement map ([specs/007-strategy-selection/spec.md](../007-strategy-selection/spec.md)), the §16 enumeration-only boundary, and coverage criterion 18.6 `KM_LINT_INVENTORY_UNCOVERED`. Follows the pinned-data precedent set by [specs/023-langtags-defaults/](../023-langtags-defaults/) and [specs/036-glottolog-catalog/](../036-glottolog-catalog/).

## User Scenarios & Testing *(mandatory)*

The tool seeds a language's character inventory from authoritative *exemplar character* data — the set of characters a locale actually uses. Today that seed comes only from the Unicode CLDR, only from its `main` and `auxiliary` sets, and only for locales CLDR happens to cover. CLDR's coverage skews toward major languages; the minority and lesser-resourced languages this tool exists to serve are frequently the ones CLDR omits — and those are precisely the languages SIL's SLDR (Locale Data Repository) does cover. This feature broadens exemplar sourcing so the character-inventory seed is fuller and reaches more of the target languages.

### User Story 1 - Exemplars for a language CLDR does not cover (Priority: P1)

A keyboard author is building for a minority language whose BCP47 tag has no entry in CLDR. Today the Characters survey step falls back to the whole Unicode script block — an undifferentiated wall of characters the author must hand-curate. If SLDR has exemplar data for that language, the tool should seed the inventory from SLDR instead, giving the author the language's actual character set rather than the entire script.

**Why this priority**: This is the feature's core value. The tool's audience is minority-language authors, and the current gap (no seed → whole-script fallback) hits them hardest. Adding SLDR as a source directly closes that gap for the users who need it most.

**Independent Test**: Pick a language present in SLDR but absent from CLDR, run the Characters survey step, and confirm the seeded inventory reflects that language's exemplar set (not the full Unicode block). Delivers value on its own even if no other story ships.

**Acceptance Scenarios**:

1. **Given** a language tag that SLDR covers and CLDR does not, **When** the author reaches the Characters survey step, **Then** the seeded character inventory is drawn from the SLDR exemplar set for that language rather than from the whole-script fallback.
2. **Given** a language tag present in both CLDR and SLDR, **When** exemplars are sourced, **Then** the tool resolves to a single, deterministic inventory using a defined precedence between the two sources, and records which source each character came from.
3. **Given** a language tag absent from both CLDR and SLDR, **When** the author reaches the Characters step, **Then** the tool behaves exactly as today (whole-script fallback) and does not error or block.

---

### User Story 2 - Fuller exemplar coverage: punctuation and numerals (Priority: P2)

An author wants the seeded inventory to include the language's punctuation marks and numerals, not only its letters. Exemplar data classifies characters into distinct sets (`main`, `auxiliary`, `punctuation`, `numbers`, `index`); today only `main` and `auxiliary` are read, so language-specific punctuation and digits are silently dropped from the seed and the author must remember to add them by hand.

**Why this priority**: The governing §8 text explicitly calls for the inventory to include "language-specific punctuation, and numerals." Reading the punctuation and number exemplar sets makes the seed match what the spec already promises, reducing what authors add manually. Valuable but secondary to reaching more languages at all (Story 1).

**Independent Test**: For a language whose exemplar data defines a punctuation and/or numbers set, run the Characters step and confirm those characters appear in the seed, categorized distinctly from the core alphabet.

**Acceptance Scenarios**:

1. **Given** a language whose exemplar data defines a punctuation set, **When** exemplars are sourced, **Then** those punctuation characters are included in the seeded inventory and distinguishable from the core alphabet.
2. **Given** a language whose exemplar data defines a numbers set, **When** exemplars are sourced, **Then** those numerals are included in the seeded inventory and distinguishable from the core alphabet.
3. **Given** a language whose exemplar data defines no punctuation or numbers set, **When** exemplars are sourced, **Then** the seed contains the letter sets as before with no empty or placeholder categories.

---

### User Story 3 - Offline, deterministic, version-pinned exemplar data (Priority: P3)

The tool authors keyboards entirely in-memory with no host-disk writes, and its other authoritative language datasets (langtags, Glottolog) are fetched once against a pinned version + checksum, vendored, and reduced to a committed lookup index so authoring is fully offline and reproducible. Exemplar data should follow the same discipline: a maintainer can pin the CLDR and SLDR versions, regenerate the index reproducibly, and every author on every machine gets byte-identical exemplar results without network access during authoring.

**Why this priority**: Correctness and reproducibility hardening rather than new author-facing capability. It brings exemplar sourcing in line with repo convention (offline authoring, pinned datasets, deterministic builds) and removes the runtime network dependency the current live fetch carries. Important, but the coverage wins (Stories 1–2) deliver user value first.

**Independent Test**: With no network access, run the Characters step for a covered language and confirm exemplars still resolve; regenerate the index from the pinned data twice and confirm the output is byte-identical.

**Acceptance Scenarios**:

1. **Given** the pinned exemplar dataset is present, **When** the Characters step runs with no network connectivity, **Then** exemplar sourcing succeeds for covered languages.
2. **Given** a pinned version and checksum for each source, **When** the raw data is fetched, **Then** a checksum mismatch or placeholder file fails loudly rather than producing a silently wrong index.
3. **Given** the pinned raw data, **When** the lookup index is regenerated, **Then** the output is deterministic (byte-identical across repeated runs).

---

### Edge Cases

- **Confidence gate carries over**: the existing suppression rules (no seed for `und`, script-only tags, ISO-639-3 private-use `qaa-qtz`, and un-narrowed macrolanguages such as `ms/zh/ar/fa`) must continue to apply regardless of which source (CLDR or SLDR) holds data — the tool still returns nothing rather than guess for those tags.
- **Source disagreement**: when CLDR and SLDR both cover a language but list different characters, the resolved inventory is deterministic per the defined precedence, and the divergence is observable (each character's source is recorded) rather than silently merged.
- **Malformed exemplar set**: an exemplar set that fails to parse (bad UnicodeSet syntax, unexpected escapes) must fail loudly during index generation, never emit a partial or silently-truncated inventory at authoring time.
- **Normalization**: all sourced characters remain NFC-normalized, consistent with today's behavior and the §8 NFC-vs-output-NFD note; adding SLDR or new sets must not introduce un-normalized characters.
- **Script mismatch**: an exemplar set whose characters fall outside the base keyboard's declared script should be surfaced (as it is today via the cross-check), not dropped.
- **Locale granularity**: a request for a specific locale (e.g. region- or script-tagged) with no exact exemplar entry but a covered base language — the tool resolves to the best available covered ancestor tag deterministically or falls through, consistent with existing tag-narrowing behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tool MUST be able to source exemplar characters for a language from SLDR in addition to CLDR.
- **FR-002**: When a language is covered by SLDR but not CLDR, the tool MUST seed the character inventory from SLDR rather than falling back to the whole Unicode script block.
- **FR-003**: When a language is covered by both sources, the tool MUST resolve to a single deterministic inventory using a defined, documented precedence between CLDR and SLDR.
- **FR-004**: The tool MUST record, per sourced character, which source (CLDR or SLDR) it came from, so source disagreement is observable and auditable.
- **FR-005**: The tool MUST read the punctuation exemplar set and include those characters in the seeded inventory, categorized distinctly from the core and auxiliary alphabets.
- **FR-006**: The tool MUST read the numbers exemplar set and include those numerals in the seeded inventory, categorized distinctly from the core and auxiliary alphabets.
- **FR-007**: The tool MUST continue to read the existing `main` and `auxiliary` exemplar sets, preserving current behavior for languages already covered by CLDR.
- **FR-008**: The tool MUST preserve the existing confidence gate — returning no exemplar seed (rather than guessing) for `und`, script-only tags, private-use `qaa-qtz` ranges, and un-narrowed macrolanguages — for both sources.
- **FR-009**: All sourced exemplar characters MUST be NFC-normalized.
- **FR-010**: A language covered by neither source MUST fall through to the current whole-script behavior without error or blocking the survey.
- **FR-011**: Exemplar sourcing MUST succeed during authoring without network access (offline-capable), consistent with the tool's offline-authoring model.
- **FR-012**: Each exemplar source MUST be pinned to a specific version with an integrity checksum; fetching MUST fail loudly on a checksum mismatch or placeholder file rather than emit a wrong index.
- **FR-013**: Generation of the exemplar lookup index from pinned raw data MUST be deterministic (byte-identical across repeated runs).
- **FR-014**: The feature MUST stay within the §16 enumeration-only boundary — it sources which characters a language uses, and MUST NOT introduce wordlists, frequency corpora, or prediction models.
- **FR-015**: The picker seed, the linguist cross-check, and the missing-character suggestion path MUST all draw on the broadened exemplar data through one shared sourcing path (no divergent copies of exemplar logic).

*Assumption-driven decisions are recorded in the Assumptions section rather than left as open clarifications.*

### Key Entities *(include if data involved)*

- **Exemplar source**: an authoritative locale-data repository providing per-language exemplar character sets. Two are in scope: CLDR (Unicode) and SLDR (SIL). Each is pinned to a version with an integrity checksum.
- **Exemplar set**: a named subset of a language's characters — `main` (core alphabet), `auxiliary` (loanword/secondary letters), `punctuation`, `numbers`, and `index` (collation headers). Characters within a set may be single graphemes, digraphs, or characters requiring special handling.
- **Sourced inventory**: the resolved set of characters for a language, each annotated with its exemplar set category and its originating source (CLDR or SLDR), after precedence resolution and NFC normalization.
- **Language tag**: the BCP47 identifier used to look up exemplars, subject to the confidence gate and tag-narrowing behavior.
- **Version pin**: the recorded source version + checksum + license/notice that makes exemplar data reproducible and offline-capable.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a representative set of minority languages present in SLDR but absent from CLDR, the Characters survey step seeds a language-specific inventory instead of the whole-script fallback for 100% of them.
- **SC-002**: For languages whose exemplar data defines punctuation and/or numbers sets, those characters appear in the seeded inventory in 100% of cases (previously 0%).
- **SC-003**: The number of distinct languages for which the tool can produce a non-fallback exemplar seed increases measurably versus the CLDR-only baseline, and the increase is attributable to SLDR coverage.
- **SC-004**: Exemplar sourcing completes successfully with no network connectivity for every covered language.
- **SC-005**: Regenerating the exemplar index from pinned data produces byte-identical output across repeated runs (0 differences).
- **SC-006**: No language that produced a seed before this feature loses its seed or gains incorrectly categorized characters (no regressions against the CLDR-only baseline).
- **SC-007**: Every character in a resolved inventory carries a source attribution, so any CLDR/SLDR disagreement is inspectable rather than hidden.

## Assumptions

- **SLDR is greenfield**: SLDR is not referenced anywhere in the repo today; this feature introduces it. langtags (also SIL) is the closest existing precedent for a SIL data source.
- **Precedence default**: when both sources cover a language, SLDR is preferred for languages CLDR classifies as lesser-covered and CLDR is otherwise authoritative — the exact rule is a design decision for planning; the requirement is only that it be deterministic, documented, and source-attributed. (Refined during `/speckit-plan`.)
- **Exemplar sets in scope**: `main` and `auxiliary` (existing) plus `punctuation` and `numbers` (new) are in scope. The `index` (collation-header) set is treated as out of scope for the character inventory unless planning shows a keyboard-authoring need, since it drives sorting UI rather than key coverage.
- **Offline/pinned model**: this feature adopts the fetch → checksum-verify → vendor → committed-slim-index pattern already used by langtags ([specs/023-langtags-defaults/](../023-langtags-defaults/)) and Glottolog ([specs/036-glottolog-catalog/](../036-glottolog-catalog/)), replacing the current live runtime fetch of CLDR. Version pins live alongside the existing `scripts/*-version.json` files.
- **Current CLDR pin**: CLDR is pinned to 46.1.0 today (hard-coded in two places); this feature centralizes and formalizes that pin. Bumping the CLDR/SLDR version is a deliberate, separate maintenance action, not part of this feature.
- **Enumeration only**: consistent with §16, the deliverable is character enumeration; no corpus/frequency/prediction data is introduced.
- **No new UI surface required**: the broadened data flows through the existing Characters survey step (build-list and manual paths); this feature does not, by itself, add new screens.
- **Ownership**: the exemplar data plumbing (fetch/codegen/pin/index) and the sourcing service are Engine-owned; any prompt or category-presentation text remains Content-owned, per the §12/§13 team split.
