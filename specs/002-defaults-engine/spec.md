# Feature Specification: Defaults engine (propose-then-confirm proposers)

**Feature Branch**: `002-defaults-engine`

**Created**: 2026-06-16

**Status**: Draft

**Governing spec**: Implements `spec.md` §3a ("Defaults are the product"), §8 Phases A/B/C′/E/F, §5 "Base-derived pre-fill". This feature **cites** that scope and does not re-derive it. Resolves the implementation half of issue #437 (the spec prose half ships in PR #438, spec v1.3.1).

**Input**: User description: "Defaults engine — the propose-then-confirm proposer layer for the identity, paperwork, and help-documentation phases."

## User Scenarios & Testing *(mandatory)*

The author is a language expert, not a keyboard developer (§3). They accept reasonable defaults and do not question them (§3a). Every story below replaces a blank field the author would otherwise leave empty or guess wrong on with a provenance-labeled proposal they can confirm or override in place.

### User Story 1 - Identity phase is never a blank form (Priority: P1)

When the author reaches Phase A, the copyright holder, autonym, and display name arrive **already proposed**, each labeled with where the proposal came from, rather than as empty boxes.

**Why this priority**: Phase A is the blank-canvas failure mode §2 and §3a name explicitly — the identity/paperwork fields a naive author leaves empty or guesses wrong, which reviewers then silently fix. These are the two HIGH flags (#1 copyright) plus the MEDIUM identity flags (#3 display name, #7 autonym).

**Independent Test**: Run Phase A for a keyboard whose BCP47 tag resolves in `langtags.json` and whose session is on the GitHub path; confirm copyright, autonym, and display name are all pre-populated with visible provenance and require only confirmation — no empty field appears.

**Acceptance Scenarios**:

1. **Given** a session on the GitHub path, **When** Phase A asks for the copyright holder, **Then** the author is offered a *you / an organization* choice — the *you* branch pre-fills the authenticated identity, the *organization* branch shows a hinted field — and the submitter identity is never silently asserted as the holder.
2. **Given** a BCP47 tag with a `langtags.json` `localname`, **When** Phase A asks for the autonym, **Then** that localname is pre-filled as an editable confirmation labeled with its source (langtags), with CLDR as a fallback source.
3. **Given** the scaffolder seeded a provisional display name from the English name, **When** the author reaches the documentation stage, **Then** that value is shown as an editable confirmation, never a blank field.

### User Story 2 - Help documentation writes its own first draft (Priority: P1)

When the author reaches Phase F, `welcome.htm` already contains a usable draft — the keyboard's name, language/autonym, and a table of how to type each special character — that the author edits rather than authoring from nothing.

**Why this priority**: The second HIGH flag (#2). Empty or unhelpful help pages are a recurring review defect; the studio already holds the precise how-to-type information.

**Independent Test**: Complete Phases A–E for a keyboard with several special characters, then open Phase F; confirm the help body contains a character→keystroke table matching the assignment map and an editable narrative, with no blank-canvas state.

**Acceptance Scenarios**:

1. **Given** a completed character inventory and assignment map, **When** Phase F opens, **Then** the help body shows a character→keystroke table derived from that data (not invented), plus an editable surrounding narrative.
2. **Given** the author edits or replaces the draft, **When** the help doc is finalized, **Then** the secondary help format is regenerated from the confirmed content so the two stay in parity.

### User Story 3 - Advisory survey questions arrive pre-answered (Priority: P2)

The non-gating advisory questions (coexisting keyboards; primary use case) arrive with a proposed answer derived from what the studio already knows, which the author adjusts.

**Why this priority**: MEDIUM (#4 coexisting keyboards) and LOW (#8 primary use case). Non-gating, but still blank today; the proposals improve placement decisions and adoption.

**Independent Test**: Run Phase B for a language whose BCP47 tag carries a region; confirm the coexisting-keyboards question and the use-case question are both pre-proposed from region/axis signals and remain skippable.

**Acceptance Scenarios**:

1. **Given** a BCP47 region subtag and Q1 answers, **When** the coexisting-keyboards question is shown, **Then** likely coexisting keyboards are proposed from the region's official/contact languages, and the "will this be the only keyboard?" sub-question is defaulted from the region signal — with no claim of browser/OS layout detection.
2. **Given** the keyboard scale (A1), region/speaker-count, and Q1 context, **When** the primary-use-case question is shown, **Then** the most likely use case is pre-selected, the proposal never blocks a phase exit, and the author can change it.

### User Story 4 - Technical-phase defaults (reorder, touch layers) are pre-selected (Priority: P2)

For Non-Roman keyboards the reorder pattern is pre-selected from the script family, and touch-layer names are auto-derived so the author renames at most the unusual ones.

**Why this priority**: MEDIUM (#5 reorder, #6 touch-layer naming). Converges the gallery phases on the same propose-then-confirm posture the strategy framework (§7) already uses.

**Independent Test**: Run Phase C′ for an Indic abugida and Phase E for a keyboard with a shift + AltGr plane; confirm the canonical reorder is pre-selected with provenance and the touch layers are auto-named, with only author-added planes needing a name.

**Acceptance Scenarios**:

1. **Given** a detected script class and script family, **When** Phase C′ opens, **Then** the family's canonical reorder pattern is pre-selected and ranked with its provenance, and the author can swap to another gallery entry.
2. **Given** a modifier-to-layer mapping, **When** Phase E scaffolds the touch layout, **Then** modifier-derived layers take their standard layer ids automatically and only an author-added non-modifier plane prompts for a name (with a hinted default).

### User Story 5 - Every proposal is auditable, and blanks are caught (Priority: P3)

Every proposed default shows where it came from and is overridable in place; the origin of each filled discovery axis is recorded; and a decision point left blank where a source existed is surfaced as a defect before submission.

**Why this priority**: The cross-cutting §3a guarantee and the foundational `axisFills` provenance primitive the other proposers reuse. P3 because the per-phase proposers (US1–US4) deliver visible value first, but this is what makes the guarantee enforceable.

**Independent Test**: Inspect any proposal for a provenance label; force a derivable field to be skipped and confirm it is flagged at phase exit; inspect the survey result for the recorded origin of each axis fill.

**Acceptance Scenarios**:

1. **Given** any proposed default, **When** it is shown, **Then** it carries a visible provenance label and can be overridden in place.
2. **Given** a missing discovery axis filled from a structural prior, **When** the survey result is produced, **Then** the origin of that fill is recorded (the `axisFills` provenance record) and is auditable.
3. **Given** a decision point the studio could have proposed but rendered blank, **When** the author tries to exit the phase, **Then** it is surfaced as a defect (the same band as a yellow check), not silently accepted.

### Edge Cases

- **No autonym attested** (neither `langtags.json` nor CLDR): the autonym falls to a hinted prompt, recorded as a deliberate no-default, not a blank.
- **No authenticated identity** (ZIP / no-GitHub path): the copyright *you* branch falls to the provenance representative, then to a hinted prompt; the *organization* branch is unaffected.
- **No region subtag** in the BCP47 tag: the coexisting-keyboards proposal degrades to the "will this be the only keyboard?" question with no region-derived default, hinted rather than blank.
- **Script family with no single convergent reorder**: Phase C′ presents the ranked candidates without a forced pre-selection rather than asserting one; abugida/abjad convention is never overridden silently.
- **No LLM backend available** for Phase F: the deterministic skeleton (title, autonym, keystroke table) ships on its own; only the narrative polish is skipped.
- **Conflicting proposals** (e.g. two sources disagree on the autonym): the higher-coverage source is proposed and the alternative is shown, never silently resolved.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST present a provenance-labeled, editable proposal — never a blank field — at every identity, paperwork, and help-documentation decision point enumerated in §8 Phases A/B/C′/E/F, except where no source can supply one (FR-012).
- **FR-002**: For the copyright holder, the system MUST offer a *you / an organization* structured choice, pre-filling the authenticated identity (then a provenance representative) only on the *you* branch, and MUST NOT assert the submitter as the copyright holder without confirmation.
- **FR-003**: For the autonym, the system MUST propose the `langtags.json` `localname` first, then CLDR, then a hinted prompt, and MUST label which source produced the proposal.
- **FR-004**: For the display name, the system MUST surface the scaffolder's provisional value as an editable confirmation at the documentation stage.
- **FR-005**: For coexisting keyboards, the system MUST derive its proposal from the BCP47 region/provenance regions and Q1, MUST default the "only keyboard?" sub-question from the region signal, and MUST NOT claim to detect installed OS/browser layouts.
- **FR-006**: For the primary use case, the system MUST pre-select the most likely option from A1 scale + region/speaker-count + Q1, while remaining non-gating (never blocking a phase exit).
- **FR-007**: For the Non-Roman reorder pattern, the system MUST pre-select and rank the script family's canonical reorder using the detected script class and script-family routing, and MUST allow override; it MUST NOT silently override an abugida/abjad community convention.
- **FR-008**: For touch-layer naming, the system MUST auto-derive standard layer ids for modifier-derived layers from the modifier-to-layer mapping and MUST prompt (with a hinted default) only for author-added non-modifier planes.
- **FR-009**: For the help-documentation body, the system MUST build a deterministic skeleton (title, language/autonym, character→keystroke table from the inventory and assignment map) and MUST restrict any language-model assistance to the surrounding narrative — keystroke instructions MUST NOT be model-generated.
- **FR-010**: The system MUST attach a visible provenance label to every proposal and MUST allow the author to override any proposal in place.
- **FR-011**: The system MUST record the origin of each discovery-axis fill (the `axisFills` provenance record on the survey result) so that how every missing axis was filled is auditable.
- **FR-012**: Where no source can supply a default, the system MUST record a deliberate no-default decision and present a hinted prompt (never an empty field).
- **FR-013**: The system MUST surface a decision point that was rendered blank despite an available source as a defect at phase exit (the same enforcement band as a yellow check), not silently accept it.

### Key Entities *(include if feature involves data)*

- **Default proposal**: a proposed value for one decision point, carrying its value (or hinted-prompt placeholder), a provenance label (source + rationale), and an overridable flag.
- **Provenance label**: the source of a proposal — base, corpus, axis fill, CLDR, langtags, authenticated identity, region, or derived-from-axis — shown to the author.
- **`axisFills` record**: the per-axis origin record on the survey result, marking how each missing discovery axis was filled (the shared provenance primitive the per-phase proposers reuse).
- **No-default decision**: an explicit record that a decision point has no derivable default, paired with the hinted prompt shown in its place.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the §8 identity/paperwork/help decision points present either a pre-filled proposal or a recorded hinted prompt — zero blank fields where a source exists.
- **SC-002**: In the common case (BCP47 tag resolvable, GitHub path), an author can complete Phase A by confirming proposals without typing into a single empty field.
- **SC-003**: Every proposal shown to the author displays its source; no proposal appears without a provenance label.
- **SC-004**: The Phase F help body is non-empty on first view for any keyboard with at least one special character, and its keystroke table matches the assignment map exactly.
- **SC-005**: For every completed survey, the origin of each filled discovery axis is recoverable from the survey result.
- **SC-006**: Any decision point left blank where a source existed is reported before submission; none reaches the output artifact silently.

## Assumptions

- The governing prose (`spec.md` §3a/§8/§5, v1.3.1) lands via PR #438 before implementation begins; this feature is gated on that merge.
- `langtags.json` is already loaded in Phase A for the BCP47 lookup and exposes `localname`/`localnames`; CLDR locale display names are available as a pinned secondary source. The fetch, pin, and codegen that make this true are implemented by [specs/023-langtags-defaults](../023-langtags-defaults/spec.md) (branch `km/langtags-defaults`), which feeds this feature and must land first.
- An authenticated identity is available only on the GitHub-OAuth output path; the ZIP path has none, handled by the copyright edge case.
- The working-copy spine, the discovery-axis computation (§7.1), and the §7.7 assignment map already exist and are reused; this feature adds proposers over them, it does not re-architect the survey.
- A language-model backend may be unavailable; the help-body skeleton must stand alone without it.

## Out of Scope

- The typed `defaultSource` discriminator on `PatternQuestion` (a Pattern-schema change reserved for the #5/#5b joint session, §18). This feature uses provenance labels at the proposal level, not a new schema field.
- Anything requiring the `PlacementMap` contract (blocked on #133/#131).
- CJK / Ethiopic / Hangul reorder (§16) — Phase C′ proposals cover only the in-scope Non-Roman families.
- Browser/OS detection of installed keyboard layouts (technically unavailable; explicitly excluded by FR-005).
