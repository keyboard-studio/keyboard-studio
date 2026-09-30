# Feature Specification: SIL langtags defaults at the front of the survey

**Feature Branch**: `km/langtags-defaults`

**Created**: 2026-06-30

**Status**: Draft

**Input**: User description: "Vendor and wire the SIL langtags dataset as the default-data source for the front of the keyboard-authoring questionnaire — so the author identifies their language once and gets reasonable, editable, provenance-labeled defaults (script, region, autonym, English name) instead of blank fields."

## Context & Governing Specs

Realizes spec §3c *"Defaults are the product"* and the propose-then-confirm posture (§8) for the
identity questions at the **head of the survey**. Provides the data source that
[specs/002-defaults-engine](../002-defaults-engine/spec.md) already assumes exists (its FR-003 reads
the `langtags.json` `localname`; its assumptions claim *"langtags.json is already loaded in Phase A"*)
but which is not loaded anywhere today. This feature **feeds and unblocks** specs/002 — it does not
duplicate or close it. It also resolves the live `options_source: "@langtags_iso639"` placeholder in
the `iso_code` and identity-lite language questions, which currently render *"Dynamic options … not
loaded in this build"*.

[SIL langtags](https://github.com/silnrsi/langtags) groups language tags into orthographic
equivalence sets. Each set's `full` tag (e.g. `ha` → `ha-Latn-NG`) yields the **default script** and
**default region**; `localname` is the autonym, `name` the English name, `iso639_3` the 3-letter code,
and `regions` the additional regions sharing the orthography.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find my language and get a default script (Priority: P1)

A language expert opens the studio and reaches the first identity questions. Instead of typing a raw
code or guessing a script subtag, they search a list of the world's languages by English name,
autonym, or code, pick theirs, and the keyboard's **target script** arrives already proposed (e.g.
"Hausa" → Latin) as an editable confirmation labeled as coming from langtags. They confirm or change
it and move on.

**Why this priority**: This is the core of the request ("especially at the beginning") and the single
biggest defaults win — it removes the two hardest cold-start questions (which code? which script?) for
a non-technical author and is independently demonstrable on its own.

**Independent Test**: Run the identity step for a language present in langtags; confirm the language
list is searchable by name/autonym/code, and that selecting a language pre-proposes the default target
script as an editable, langtags-labeled confirmation that can be overridden.

**Acceptance Scenarios**:

1. **Given** the first identity question, **When** the author types "Hausa", "ha", or the autonym,
   **Then** matching languages are offered for selection.
2. **Given** the author has selected a language whose langtags default script is Latin, **When** the
   target-script question is shown, **Then** "Latin" is pre-proposed as an editable confirmation
   labeled "Suggested from langtags", and the author can change it to romanization, IPA, or another
   script.
3. **Given** the author selects a language, **When** any langtags-derived value is shown, **Then** it
   appears as a pre-filled editable field, never as a blank box and never auto-locked.

---

### User Story 2 - Autonym, English name, and region pre-filled (Priority: P2)

Having identified their language, the author finds the autonym, the English name, and the country/
region already proposed from langtags, each editable and labeled with its source. They correct any
that are wrong and continue, rather than typing all of them from scratch.

**Why this priority**: Completes the "identify once, the rest is proposed" experience and directly
satisfies specs/002 FR-003 (autonym from langtags `localname`). Builds on US1's lookup; valuable but
secondary to getting the script right.

**Independent Test**: Run identity for a language whose langtags record carries `localname`, `name`,
and a region; confirm all three arrive as editable, source-labeled confirmations and that overrides
stick.

**Acceptance Scenarios**:

1. **Given** a selected language with a langtags `localname`, **When** the autonym field is shown,
   **Then** the `localname` is pre-filled as an editable confirmation labeled with its source.
2. **Given** a selected language with a langtags `name`, **When** the English-name field is shown,
   **Then** the `name` is pre-filled as an editable confirmation.
3. **Given** a selected language with a langtags default region, **When** the region question is shown,
   **Then** that region is pre-filled as an editable confirmation that the author can replace with
   free text or additional regions.

---

### User Story 3 - The long tail still works (Priority: P2)

An author whose language is not in langtags (or who does not recognize the listed name) is never
blocked: they can type their language name, autonym, code, script, and region as free text and finish
the identity step exactly as before.

**Why this priority**: A defaults source must never become a gate. Equal weight to US2 because a
regression here would break the existing flow for unlisted languages.

**Independent Test**: Run identity for a language absent from langtags; confirm every field accepts
free text, no proposal is forced, and the step completes.

**Acceptance Scenarios**:

1. **Given** a language not in langtags, **When** the author searches the list, **Then** a free-text
   entry path remains available and the step can be completed.
2. **Given** no langtags record for the entered code, **When** the dependent fields are shown, **Then**
   they are blank/free-text (no false proposal) and the author proceeds unblocked.

---

### Edge Cases

- **Multiple orthographies for one language** (e.g. a language written in two scripts): the default
  (the bare-language-subtag tagset's `full`) is proposed; the author can still pick another script via
  the existing script question — language↔script decoupling (spec §8/§9) is preserved.
- **Author already typed a value** before a proposal could apply: the author's own input wins; a
  langtags value never overwrites a non-empty field the author has edited.
- **Code entered with no langtags match**: no proposal is fabricated; dependent fields stay free-text
  (a deliberate no-default, not a wrong default).
- **Default script is one not yet supported in v1** (Ethiopic/Han/Hangul): the proposal is shown
  honestly and the existing "not supported" routing applies — the proposal is not suppressed or
  silently rewritten.
- **Langtags data missing at build time**: the build fails loudly (checksum/codegen gate), rather than
  shipping an empty or partial index silently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST make the SIL langtags dataset available to the studio as a pinned,
  versioned, integrity-verified data source, vendored at build time (not fetched at runtime).
- **FR-002**: The system MUST derive, at build time, a compact lookup index keyed by language subtag
  (covering both 2-letter and 3-letter codes where present) exposing, per language: default script,
  default region, additional regions, autonym (`localname`), and English name (`name`).
- **FR-003**: The system MUST provide a searchable list of the world's languages usable for
  type-ahead selection by English name, autonym, or language code, resolving the existing
  `@langtags_iso639` options source.
- **FR-004**: When the author selects/identifies a language, the system MUST propose that language's
  default script as an editable confirmation at the target-script question, and MUST NOT force it —
  the author can still choose romanization, IPA, or another script (preserving §8/§9 decoupling).
- **FR-005**: The system MUST propose the autonym (from langtags `localname`) and the English name
  (from langtags `name`) as editable confirmations, consistent with specs/002 FR-003.
- **FR-006**: The system MUST propose the default region (from langtags default region/`regions`) as
  an editable, free-text-overridable confirmation at the region question.
- **FR-007**: Every langtags-derived value MUST be presented as an editable proposal carrying a
  visible provenance label identifying langtags as the source, and MUST be overridable in place;
  none MAY appear as a blank field or be auto-locked (spec §3c, specs/002 FR-010).
- **FR-008**: A proposal MUST NOT overwrite a value the author has already entered/edited; author
  input takes precedence over any langtags proposal.
- **FR-009**: Where langtags has no record for the entered language, the system MUST leave the
  dependent fields as free-text (no fabricated default) and MUST allow the identity step to complete.
- **FR-010**: The vendored data MUST retain the upstream MIT copyright and permission notice
  ("Copyright (c) 2019-2025 SIL International (http://www.sil.org)") and record the pinned source
  version/commit and integrity hash.
- **FR-011**: The browser application MUST NOT load the full raw langtags dataset; only the compact
  derived index is delivered to the client, loaded on demand rather than as part of the initial app
  payload.
- **FR-012**: The build MUST fail loudly if the vendored data fails its integrity check or the derived
  index cannot be regenerated, rather than producing an empty or stale index silently.

### Key Entities *(include if feature involves data)*

- **Langtags source dataset**: the upstream `source/langtags.json` equivalence-set data, pinned by
  commit + integrity hash, vendored under MIT terms with its notice retained.
- **Language defaults record**: per language subtag — default script, default region, additional
  regions, autonym, English name, 3-letter code. The unit returned by a lookup.
- **Language summary**: the lightweight per-language entry (code, English name, autonym, default
  script) backing the searchable language list.
- **Default proposal**: a proposed value for one identity decision point, carrying its value, a
  langtags provenance label, and its editable/overridable nature (the proposal-level primitive shared
  with specs/002; the full `axisFills` record remains specs/002's scope).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a language present in langtags, the author reaches the end of the identity step with
  script, region, autonym, and English name **pre-proposed** — zero of those four shown as blank
  fields requiring cold entry.
- **SC-002**: 100% of langtags-derived values shown carry a visible provenance label and can be
  overridden in place (no unlabeled and no locked proposals).
- **SC-003**: For a language absent from langtags, the author can still complete the identity step
  entirely via free text — the defaults source never blocks completion.
- **SC-004**: The searchable language list finds a target language by English name, autonym, or code
  for the full set of languages present in the dataset.
- **SC-005**: The initial application payload does not grow by the size of the raw dataset; the derived
  index loads only when the survey needs it.
- **SC-006**: A clean build regenerates the derived index deterministically and fails loudly on a data
  integrity or regeneration error.

## Assumptions

- **Scope is foundation + start-of-survey only.** Copyright you/org choice, coexisting-keyboards and
  use-case proposals, reorder pre-selection, touch-layer naming, the help-doc skeleton, the full
  `axisFills` provenance record, and the blank-default-is-a-defect phase-exit gate are **out of scope**
  here and remain with [specs/002-defaults-engine](../002-defaults-engine/spec.md).
- **License & pin are resolved.** Upstream is MIT (vendoring permitted with notice retained); the pin
  target is `source/langtags.json` at commit `99b856bbe8a7dfc1ef7f05d6087dc7501843eb04` (master,
  2026-06-25); the repo cuts no release tags, so the commit SHA is pinned and the integrity hash is
  computed at pin time.
- **Existing survey machinery is reused, not re-architected.** The identity questions, the working-copy
  spine, the per-question forward-seed mechanism, and the autocomplete widget already exist; this
  feature adds a data source and proposals over them.
- **langtags `full`-tag defaults are authoritative for the proposal.** Tag/full values are not stable
  across upstream versions, but the equivalence sets are; proposing from the pinned `full` tag is
  acceptable because every value is an editable confirmation, not a locked decision.
- **Types are additive.** New language-defaults types do not alter the locked Pattern/Criterion
  contract.
- **The exact placement of the autonym/English-name proposals** (a language-picker-first redesign of
  the identity head vs. seeding those fields where the code is already known) is an implementation
  decision for `/speckit-plan`/`/speckit-clarify`; both satisfy FR-005/FR-007/FR-008.
