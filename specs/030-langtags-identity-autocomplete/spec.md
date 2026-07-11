# Feature Specification: Langtags-driven identity autocomplete

**Feature Branch**: `km/030-langtags-identity-autocomplete`

**Created**: 2026-07-08

**Status**: Partially Implemented — see [Implementation Status](#implementation-status) below. The live flow ships this feature's user-facing goal through a Q1 mechanism the team chose over this document's original FR-008/FR-009 wording, for a documented correctness reason; the proposed-flow mirror (FR-015) has not been done.

**Input**: User description: "Redesign the opening identity questions of the IdentityLite survey so the author's language is resolved from the SIL langtags dataset — English-name autocomplete first, then a choice of local names, region disambiguation when a name is ambiguous, and the language code confirmed rather than typed."

## Implementation Status

*(added 2026-07-11, during a km-triage doc-drift review — reconciles this spec's plan against what actually shipped; see [contracts/identity-flow.contract.md](contracts/identity-flow.contract.md) for the authoritative as-shipped mechanism and rationale)*

`tasks.md` still shows every task unchecked, but substantial pieces of this feature landed under an alternate design that the sub-contract doc already records. This section is the reconciliation; FR-008/FR-009/FR-015 below are left as originally written (historical plan) with inline notes pointing here.

| Item | Planned (this spec) | Shipped? | Notes |
|---|---|---|---|
| Langtags data-model extension | `LanguageDefaults`/`LanguageSummary` gain `englishNames`, `localNames`, `regionVariants` | Yes | [`packages/contracts/src/langtags.ts`](../../packages/contracts/src/langtags.ts), `packages/engine/src/langtags/` |
| FR-001/FR-002 — resolve a language from an English-name search | Q1 becomes an English-name autocomplete | Yes, via an alternate mechanism | The pre-existing `il_language_code` picker stays Q1 (not `il_language_english`) and was reworded to search by English name; it commits the language CODE rather than the name, avoiding homonym ambiguity (~98 English names resolve to >1 langtags entry, e.g. "Ainu" -> aib/ain, per `research.md` T008). |
| FR-004/FR-005 — own-language multi-choice | `il_language_autonym` offers recorded local names + free text | Yes | `packages/studio/src/survey/questions/a/il_language_autonym.ts` (`type: autocomplete`) |
| FR-006/FR-007/FR-014 — region disambiguation | Conditional region question | Yes | `il_language_region.ts` + `IdentityLite.tsx` `getNextOverride` |
| FR-008 — code question as a post-hoc confirmation step, positioned after the names | Move `il_language_code` after the name steps, auto-filled for confirmation | No — explicitly rejected | The contract doc records this as a rejected alternative ("No separate code-confirmation step and NO `extractIdentityLite` inversion"); `il_language_code` remains Q1 and doubles as the entry-resolving picker instead. |
| FR-009 — question order | English name -> region (conditional) -> own-language name(s) -> code confirmation | No — shipped order differs | Actual live order: `il_language_code` (Q1, searchable by English name/autonym/ISO code, commits the resolved code) -> `il_language_region` (conditional) -> `il_language_english` (seeded confirmation) -> `il_language_autonym` (seeded multi-choice). See [contracts/identity-flow.contract.md](contracts/identity-flow.contract.md) "Question order (post-change)". |
| FR-015 — mirror into the proposed Phase A flow | Same reorder + region module applied to `phase_a_identity.modular.yaml` / `language_name_*` | No — not started | `content/flows/proposed/phase_a_identity.modular.yaml` and `language_name_english.ts`/`language_name_autonym.ts` are unchanged from before this feature. This requirement is still open. |

## Clarifications

### Session 2026-07-09 (implementation realignment)

The first landed increment (US1–US3) kept the language **code** as the first
question (searchable by English name, storing the code). This session realigned
the live flow to the specified FR-009 order (English name → region → own-language
name → code confirmation) and resolved three implementation choices:

- Q: How is a homonym (one English name → several distinct languages, e.g. "Ainu"
  → `ain`/`aib`) disambiguated? → A: **Inline in the picker dropdown.** Each
  suggestion shows English name + region + own-language name + code, and selecting
  a row resolves that specific entry via an `onEntryResolved` side-channel. The
  answer value stays the English name; the resolved entry is carried out-of-band
  (a name string alone cannot identify the language). A new `@langtags_names`
  options-source drives this picker; the existing `@langtags_iso639` datalist
  (value = code) now backs only the Q3 code confirmation.
- Q: What does the code confirmation (Q3) pre-fill — the canonical subtag or the
  3-letter code? → A: **The 3-letter ISO 639-3 code** (`hau`, `hin`), falling back
  to the canonical bare subtag when the entry carries no 639-3 code. The author can
  override. Consequence accepted: the assembled tag is e.g. `hau-Latn` rather than
  the canonical `ha-Latn`; canonicalization can be added at tag-assembly only if
  Layer-A validation later objects.
- Q: Is the separate region step kept now that the picker shows region inline? →
  A: **Kept as a conditional refinement.** It fires only when the picked language's
  code has more than one region variant (same code, different regional orthography),
  which the inline pick cannot settle; for the ~97% unambiguous case the author sees
  Q1 → Q2 → Q3 with no region screen. Q1 is required (free-text-with-suggestions),
  with no "leave blank" escape — a name is not a technical code.
- Q: What is Q2's (own-language name) choice list and default? → A: The **dropdown is
  sourced from langtags** — the recorded own-script names (`localname` + `localnames`)
  first, then the English/alternate names (`name` + `names`), de-duplicated. The
  **default** is the primary own-script name (`localNames[0]`) when langtags has one;
  when it has none (~45% of languages, plus free-text/unmatched languages) the default
  **falls back to the Q1 response**. An English name is never auto-selected as the
  own-language name (it is only ever an explicit dropdown choice). The "Suggested from
  langtags" caption shows on Q2 only when the default is a genuine recorded own-script
  name; when the default is the author's Q1 input there is no caption (it stays on the
  code + script confirmations). This supersedes the earlier "default = Q1 name" and the
  region-variant autonym-provenance behavior.

### Session 2026-07-08

- Q: How should the English-name autocomplete behave (strict pick vs free-text)? → A: Free-text with suggestions — the author may pick a suggested language or keep a typed English name that matches nothing (unmatched → no defaults, degrade gracefully).
- Q: When does the region-disambiguation question fire, what does it show, and what if skipped? → A: Fire only when the entered English name resolves to >1 langtags entry differing by region; choices are country names (`regionname`); the pick resolves to that entry (drives Q2's local-name choices and the BCP47 region subtag); if skipped, fall back to the primary/default entry (never block).
- Q: Scope — the live IdentityLite flow only, or also the proposed (non-live) full Phase A flow? → A: Both — apply the redesign to the live IdentityLite flow and mirror it into the proposed full Phase A flow so the two copies stay consistent.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Find my language by its English name (Priority: P1)

The first thing the author is asked is what their language is called in English. As they type, the survey suggests matching languages from the curated language database. Choosing a suggestion resolves the language behind the scenes — its default script, its own-language name(s), and its standard code — so the author does not have to know or type a technical code first. An author whose language is not in the database can still type its English name and continue (free text is accepted).

**Why this priority**: This is the entry point of the whole flow and the single biggest usability win — it replaces "type a code / type names from scratch" with "recognise your language by name and pick it." Everything downstream (local-name choices, code confirmation, region) hangs off the resolved entry. It is a viable MVP on its own: even without the later refinements, picking a language by English name and getting sensible defaults is valuable.

**Independent Test**: Enter a well-known unambiguous language by its English name (e.g. "Swahili"), confirm the survey resolves it and pre-fills the downstream defaults; then enter a name absent from the database and confirm free-text entry is accepted and the flow continues.

**Acceptance Scenarios**:

1. **Given** the author is on the first identity question, **When** they type part of an English language name, **Then** matching languages from the database are offered as suggestions.
2. **Given** the author selects a suggested language, **When** they advance, **Then** the language's own-language name(s), default script, and standard code are available to pre-fill later steps.
3. **Given** the author's language is not in the database, **When** they type an English name that matches nothing, **Then** the entry is accepted as free text and the flow continues with graceful degradation (no pre-filled defaults).

---

### User Story 2 — Choose (or type) my language's own-language name (Priority: P2)

After the English name, the author confirms what the language is called in its own language. When the database has one or more own-language names for the resolved language, they are offered as selectable choices. The author may pick one, or type a different name/spelling if theirs differs from every suggestion.

**Why this priority**: The own-language name is what appears on the finished keyboard package, so getting it right (and easy) matters — but it depends on US1 having resolved a language. Offering the real recorded names removes typing and reduces script-entry errors, while free text preserves author authority over their own name.

**Independent Test**: For a resolved language with multiple recorded own-language names, confirm all are offered as choices and any one can be selected; then confirm a custom typed value is accepted and carried forward instead of a suggestion.

**Acceptance Scenarios**:

1. **Given** US1 resolved a language with more than one recorded own-language name, **When** the author reaches the own-language-name step, **Then** each recorded name is presented as a choice.
2. **Given** suggested own-language names are shown, **When** the author types a name that is not among them, **Then** the typed value is accepted and used.
3. **Given** US1 resolved a language with exactly one recorded own-language name, **When** the author reaches the step, **Then** that name is pre-filled and remains editable.

---

### User Story 3 — Disambiguate by region when a name is ambiguous (Priority: P3)

Some English names map to more than one distinct language entry (the same name used in different regions, with different own-language names or scripts). When that happens, the survey asks the author which region their language belongs to, presenting the candidate regions as choices. The chosen region narrows the resolution to a single entry, which then determines the own-language-name choices offered in US2 and is recorded in the language's identity.

**Why this priority**: This is a correctness refinement for the minority of ambiguous names; the flow is usable without it (falling back to the primary/first match), but resolving the ambiguity prevents shipping a keyboard tagged for the wrong regional variant.

**Independent Test**: Enter an English name known to match multiple regional entries, confirm the region question appears with the correct candidate regions, and confirm that selecting one narrows the own-language-name choices and the recorded region accordingly.

**Acceptance Scenarios**:

1. **Given** the entered English name resolves to more than one language entry differing by region, **When** the author advances past the English-name step, **Then** a region question is presented listing the candidate regions.
2. **Given** the author selects a region, **When** they reach the own-language-name step, **Then** the offered names correspond to that region's entry.
3. **Given** the entered English name resolves to exactly one entry, **When** the author advances, **Then** no region question is shown.

---

### User Story 4 — Confirm the language code rather than type it (Priority: P2)

After the names, the author is shown the standard language code that was resolved from their earlier choices, and simply confirms it. If needed, they can override it (for example to select a specific code variant). The confirmed code drives the finished keyboard's language tag.

**Why this priority**: Confirmation is lower-risk and lower-effort than free typing; it depends on US1 resolving a code. Keeping an explicit confirmation step preserves author control over the technical tag without forcing anyone to type one.

**Acceptance Scenarios**:

1. **Given** US1 resolved a language, **When** the author reaches the code step, **Then** the resolved code is pre-filled and presented for confirmation.
2. **Given** the pre-filled code is shown, **When** the author overrides it with a different valid code, **Then** the override is used for the keyboard's language tag.
3. **Given** the author's language was entered as free text with no database match, **When** they reach the code step, **Then** they may enter a code directly or leave it blank (as today).

---

### Edge Cases

- **Language absent from the database**: English name matches nothing → free-text name accepted, no name/script/code pre-fill, own-language step falls back to a single free-text field, code step allows direct entry or blank (graceful degradation, no dead ends).
- **Ambiguous English name, author skips region**: if the region question is skippable, the flow must fall back to a deterministic default entry (e.g. the primary match) rather than stall.
- **No recorded own-language name for a resolved language**: the own-language step presents an empty free-text field (still editable), not an empty picker.
- **Author edits an upstream answer via Back**: changing the English name (or region) after later steps were seeded must re-resolve and re-seed the downstream choices, without silently overwriting a value the author already customised.
- **Own-language names in scripts the author's environment cannot render**: choices must remain selectable even if a glyph shows as tofu.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The first identity question MUST let the author find their language by its English name, offering matching languages from the curated language database as they type.
- **FR-002**: Selecting a suggested language MUST resolve that language's associated data (own-language name(s), default script, standard language code, region) for use in later steps.
- **FR-003**: The English-name question MUST accept a free-text value that matches no database entry, and the flow MUST continue without pre-filled defaults in that case.
- **FR-004**: The own-language-name question MUST present the resolved language's recorded own-language names as selectable choices when one or more exist.
- **FR-005**: The own-language-name question MUST accept a free-text value different from every suggestion, and use it in place of a suggestion when provided.
- **FR-006**: When the entered English name resolves to more than one entry differing by region, the survey MUST present a region-selection question with the candidate regions; when it resolves to exactly one entry, no region question is shown.
- **FR-007**: The selected region MUST determine which own-language-name choices are offered downstream and MUST be recorded in the language's identity/tag.
- **FR-008**: The language-code question MUST be presented pre-filled with the code resolved from the author's earlier choices, for confirmation, and MUST allow the author to override or (for unmatched languages) enter/leave it blank.
  > **Not shipped as written** — see [Implementation Status](#implementation-status). The live flow keeps `il_language_code` as Q1 (the entry-resolving picker) rather than adding a post-hoc confirmation step after the names; the contract doc records this as a deliberate rejection, not a pending item.
- **FR-009**: The identity questions MUST appear in the order: English name → (region, only when ambiguous) → own-language name(s) → language-code confirmation.
  > **Shipped differently** — see [Implementation Status](#implementation-status). The live order is `il_language_code` (Q1, searchable by English name) → `il_language_region` (conditional) → `il_language_english` (seeded confirmation) → `il_language_autonym` (seeded multi-choice).
- **FR-010**: Values that were pre-filled from the database MUST be marked as suggestions/provenance so the author can see they were proposed (and are editable), consistent with the existing defaults-provenance treatment.
- **FR-011**: The finished keyboard's language tag MUST be assembled from the confirmed language code, resolved script, and selected region.
- **FR-012**: The curated language database used MUST be the version already pinned and fetched by the project's build (SIL langtags at the pinned commit); this feature MUST NOT introduce a second or live-fetched source.
- **FR-013**: The English-name autocomplete MUST be free-text-with-suggestions: it offers matching langtags languages as the author types, but a typed value that matches no entry MUST be accepted (the author keeps their name; downstream defaults simply do not populate). A strict pick-from-list is explicitly rejected because target minority languages are often absent from langtags.
- **FR-014**: The region question MUST fire only when the entered English name resolves to more than one langtags entry differing by region; it MUST present the candidate regions as country names (`regionname`); selecting one MUST resolve to that region's entry (determining Q2's local-name choices and the BCP47 region subtag); and if the author skips or leaves it unanswered, the flow MUST fall back to the primary/default entry rather than blocking. (Script differences are handled by the separate script step, not here.)
- **FR-015**: This feature MUST be applied to **both** identity flows: the live IdentityLite flow (`il_*` question modules) and the proposed, non-live full Phase A identity flow (`language_name_*` modules), so the two copies of the identity questions stay consistent. The live flow is the primary target; the proposed flow mirrors the same question order, autocomplete, local-name choices, region disambiguation, and code-confirmation behavior.
  > **Not started** — see [Implementation Status](#implementation-status). `phase_a_identity.modular.yaml` / `language_name_*` are unchanged from before this feature.

### Key Entities *(include if feature involves data)*

- **Language entry** (from the curated database): a resolvable record keyed by a standard language code, carrying one or more English names, one or more own-language names, a default script, and a region. A single English name may correspond to multiple entries differing by region.
- **Resolved identity**: the author's confirmed selection — chosen language code, own-language name (picked or typed), English name, script, and region — from which the keyboard's language tag is assembled.
- **Suggestion provenance**: a marker on any field value that was proposed from the database (so the UI can show "suggested — edit if needed" and the author retains override authority).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author can identify a well-known language and reach the end of the identity questions without typing any technical code by hand.
- **SC-002**: For a language recorded in the database, the own-language name and language code are pre-filled from the author's English-name choice (the author confirms rather than types them).
- **SC-003**: An author whose language is not in the database can still complete every identity question (no step blocks on a missing database match).
- **SC-004**: When an English name is ambiguous across regions, the author is asked exactly one additional question (region) and the resulting keyboard is tagged for the region they chose — not a default guess.
- **SC-005**: No author-entered or author-selected value is silently overwritten by a later database re-resolution (author overrides always survive).

## Assumptions

- The curated language database is SIL langtags, already pinned and SHA-verified at build (the pinned commit is the one the author referenced); this feature reuses it rather than adding a source.
- The autocomplete backend (search by English name / own-language name / code) already exists in the project's language-lookup layer and can be reused; the primary new data work is retaining the *multiple* names / regional variants the current slim index collapses to one each.
- The existing own-language→English pre-fill behaviour is replaced by the new resolution direction (English name resolves the entry, which seeds the own-language and code fields); the seeding logic that currently lives in the IdentityLite component will be reworked for the new order.
- "IdentityLite" (the live minimal identity flow) is the primary target; the proposed non-live full Phase A identity flow is updated in the same change to keep the two copies consistent (FR-015).
- Graceful degradation for languages absent from the database follows the project's existing pattern (fields stay free-text, no dead ends).
