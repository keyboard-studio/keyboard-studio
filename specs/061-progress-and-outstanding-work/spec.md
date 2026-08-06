# Feature Specification: Honest progress — one mark per activity page, and the first work still owed

**Feature Branch**: `km/061-progress-and-outstanding-work`

**Created**: 2026-08-05

**Status**: Clarified 2026-08-05 — seven decisions resolved in session (see Clarifications). One
assumption (A3, marked-for-later's effect on the nudge) is recorded as a resolved default rather
than an open question, and is a one-term flip if the author disagrees.

**Input**: User description: "I'm trying to find the middle ground. I want Touch Gallery, Mechanism
gallery, and other pages to get their own nav 'dots', but I don't want every letter in each gallery
to get a dot. Also the diacritic questions should get dots. One dot per activity page, not one dot
per letter. … I see one dot for all the galleries and diacritic steps that changes names (mechanisms
is one of those names). This is very wrong. … I see a handy notification in the top bar: '2
characters still need review – resume in the Mechanism Gallery'. This space should be used for the
'first' of the previous sections with [required] work. Some survey questions can be skipped, some are
required, all letters have to be handled at some point. … We shouldn't allow someone to 'publish' a
keyboard to GitHub that is missing required letter(s), but a keyboard without that letter placed is
compileable. We should complain loudly, but allow download of the unfinished KMP and .zip."

## Governing documents

This spec **implements**, and does not restate, the following. On conflict, they win.

- [spec.md](../../spec.md) §3c "Defaults are the product" and the v1.3.1 defaults-first amendment —
  "no default is a defect". A progress row that silently omits a stage, and a gate that refuses an
  artifact the compiler would happily produce, are both defects of this class.
- [specs/057-bulletproof-navigation/](../057-bulletproof-navigation/) — the footer, the dot row, the
  `Location` grammar, and the single `jumpToLocation` implementation (FR-030…FR-035, FR-042…FR-049,
  FR-060…FR-063). **This feature amends 057's dot taxonomy** rather than forking a second row; see
  "Specs that must be extended" below.
- [specs/026-qu-survey-session-store/](../026-qu-survey-session-store/) — `surveySessionStore` owns
  traversal (`activeStepId`, `history`, `visited`, `lastNavigation`). Nothing here may introduce a
  competing notion of "where am I" or of "where have I been".
- [specs/034-mvp-authoring-walk/](../034-mvp-authoring-walk/) US3 — the durable draft envelope. Any
  signal this feature surfaces must either round-trip through that envelope or be derived from the
  working copy on every render. A session-scoped derivation that reports "finished" on a restored
  draft is a defect, not a limitation (see FR-013).
- [specs/052-marks-treatment-question/](../052-marks-treatment-question/) — the marks question
  series and its station model. This feature makes those stations *addressable*; it does not change
  which stations exist, their order, or the evidence that raises each one.
- [specs/056-ada-accessibility/](../056-ada-accessibility/) and
  [docs/accessibility.md](../../docs/accessibility.md) — house rules 2 (no div-buttons), 3
  (keyboard-operable), 6 (non-text contrast ≥ 3:1), 7 (colour never alone), 9 (name/role/value), 11
  (all strings through lingui). Two marks that share a shape MUST NOT share a name (FR-008).
- [specs/046-i18n-localization/contracts/catalog-format.md](../046-i18n-localization/contracts/catalog-format.md)
  — message-id rules. The nudge's wording changes *meaning*, not just phrasing, so it takes new ids
  rather than re-pointing the gallery-specific ones (FR-021).
- [specs/059-keyboard-attribution/](../059-keyboard-attribution/) D5 and D6 — the licence and
  attribution emission gates. This feature relaxes the **coverage** term of the download gate and
  nothing else; the attribution and licence refusals stand exactly as specified (FR-030).
- [.specify/memory/constitution.md](../../.specify/memory/constitution.md) Article IV — the single
  300 ms debounce cycle. Nothing here validates, so nothing here may add a validation timer.
- [CLAUDE.md](../../CLAUDE.md) "Conventions" — route changes go through `navigateTo()`; no component
  assigns `window.location.hash`.

## Problem statement

The studio does not tell the author honestly where their unfinished work is. Three surfaces are
each wrong in the same direction, and all three understate what is owed:

1. **The progress row forgets whole sections.** Once a stage is finished it can vanish from the
   footer entirely, so the row reads as a much shorter journey than the author actually walked.
2. **A section with many pages gets one mark.** The marks series asks up to four separate questions
   and shows a single dot; the galleries walk dozens of letters and correctly show one, but nothing
   in the row distinguishes "one page" from "four pages collapsed to one".
3. **The one banner that names outstanding work can only name two places**, and it names whichever
   gallery it was hardcoded to rather than the first section actually owed.

Underneath all three, the enforcement is inverted. A keyboard with an unplaced letter still
compiles, yet the studio refuses to let the author download it — while the *publish* path, which
genuinely should refuse, gets its refusal only by borrowing the download gate. The author is blocked
from the harmless action and protected only incidentally from the consequential one.

The reported symptom is worth quoting precisely: *"I see one dot for all the galleries and diacritic
steps that changes names (mechanisms is one of those names)."* A single mark that relabels itself as
the author moves through five stages is the visible signature of defect 1.

### Observed defects

Each is traced to a specific mechanism, not inferred from behaviour.

- **D-1 — There is no completed-stage mark in the model at all.**
  [progressDots.ts](../../packages/studio/src/decisions/progressDots.ts) gives a step three chances
  to contribute: decision-record entries (accepted only when `payload.kind === "survey-answer"`), a
  published within-step walk, or the upcoming-stage projection — which returns nothing for any step
  at or behind the author's position. A step that records no survey answer and publishes no walk
  therefore has **no** representation once passed.
- **D-2 — Five steps are exactly that shape.** `choose_base` records only a base contribution;
  `marks` and `convenience` complete with an empty answer list; `carve` records an editor action;
  `touch_seed_source` records nothing. All five disappear from the row the moment they are finished.
- **D-3 — The two galleries survive only by accident.** Their character walk is never cleared —
  `clearStepWalk` has no production caller — so a stale published walk is the only reason
  `mechanisms` and `touch` keep a mark. A gallery left with uncovered letters then renders as a
  hollow mark sitting *behind* the author, visually identical to a stage not yet reached.
- **D-4 — The marks series publishes no walk**, so its up-to-four stations share one mark even while
  the author is standing in them, and no station is individually addressable.
- **D-5 — The outstanding-work nudge is hardcoded to two destinations.** Its target is typed as the
  two gallery ids; its two counts are separate scalars; and when both apply it shows two buttons
  side by side rather than naming the first section owed.
- **D-6 — That nudge bypasses the single jump implementation**, writing the active step id directly
  and then assigning the route, so it gets no reachability resolution and no refusal reason — the
  one navigation surface in the studio that is not `Location`-addressed.
- **D-7 — Coverage blocks the wrong action.** The download gate refuses the `.kmp` and `.zip` on
  incomplete coverage, and the community-submission control inherits that same flag, so the
  permissive-but-loud posture exists nowhere. Reaching the Output screen at all is additionally
  blocked in three independent places, so relaxing only the download button would leave it
  unreachable.
- **D-8 — Nothing pinned any of this.** No test asserts the row's composition against the real
  manifest: the shell-level assertion checks only that at least one mark exists, in a state where
  every upcoming mark is suppressed by construction, and the unit-level upcoming assertions use
  subset matchers that pin no count.

## Clarifications

### Session 2026-08-05

- **Q1 — What is an "activity page"?** **Resolved.** A page is a screen the author acts on: one
  survey question, one marks station, one gallery. A gallery is **one** page however many letters it
  walks — letter navigation is an in-page affordance and must not be duplicated in the row.
- **Q2 — How many marks does the marks series contribute?** **Resolved.** One per **visible**
  station. A station the evidence never raises is a page the author will never see, and 057 FR-049a
  forbids a greyed-out placeholder for it. Two relevant stations means two marks; the row lengthens
  as evidence resolves, which 057 FR-049c already calls expected.
- **Q3 — Is the Touch Gallery's "By character" / "By key" pair one page or two?** **Resolved: one.**
  The modes are two views of one page — switching preserves the draft and the overlay — so Touch
  Layout contributes a single mark, symmetric with Mechanisms.
- **Q4 — What does a stage look like once the author leaves it with work unfinished?**
  **Resolved: hollow.** A stage behind the author with work still owed stays hollow rather than
  reading as complete. The author accepted the consequence that hollow-behind and hollow-ahead share
  a shape; the distinction moves into the accessible name (FR-008). No fourth mark shape is added.
- **Q5 — Which sections may the nudge name?** **Resolved: only sections behind the author.** The
  section being worked in is excluded — the author is already there and it carries its own in-page
  indicators.
- **Q6 — Should an incomplete keyboard be downloadable?** **Resolved: yes, loudly.** A keyboard
  missing a required letter still compiles, so the `.kmp` and `.zip` must be obtainable after an
  explicit, dismissible-to-safety complaint. **Publishing** that keyboard to the community
  repository MUST be refused.
- **Q7 — Does "Mark for later review" discharge a letter?** **Resolved: it defers, it does not
  discharge.** All letters must be handled at some point, so a marked letter keeps its section named
  by the nudge and its stage mark hollow. Marking continues to relax only the gallery's own
  completion control. Recorded as assumption A3 because it narrows an existing derivation's
  consumers; a one-term flip if reversed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every section I walked, and which of them still owe work (Priority: P1)

An author who has worked through identity, the character inventory, accents and marks, convenience
letters, carve, and into the Mechanism gallery looks at the progress row and sees a mark for **each**
of those sections, in journey order, with the ones that still owe work visibly distinct from the ones
that are done. The marks series shows one mark per question it actually asked. No letter anywhere has
a mark of its own.

**Why this priority**: This is the reported defect. The row is the studio's only always-visible
answer to "how far along am I", and today it answers wrongly for five of the eleven sections.

**Independent Test**: Walk a project to the Mechanism gallery and compare the row against the
manifest spine — every section walked has exactly one mark, except the marks series which has one per
visible station. Delivers an honest journey view with no other part of this feature implemented.

**Acceptance Scenarios**:

1. **Given** the author has finished `choose_base`, `marks`, `convenience` and `carve` and is standing
   in `mechanisms`, **When** they look at the progress row, **Then** each of those four sections has
   at least one mark of its own and none of them is missing.
2. **Given** the marks series raised two of its four stations, **When** the author is standing in it,
   **Then** the row shows two station marks — not one, and not four.
3. **Given** a gallery with a thirty-character inventory, **When** the author is standing in it,
   **Then** that gallery contributes exactly one mark.
4. **Given** the author left the Mechanism gallery with letters unassigned, **When** they look at that
   gallery's mark, **Then** it is hollow, and its accessible name says work remains rather than "not
   yet reached".
5. **Given** an optional question the author deliberately left blank, **When** they have moved past
   it, **Then** its mark reads as complete — a skipped optional question is not outstanding work.
6. **Given** a side-trail step the author's path bypassed entirely, **When** the author is past its
   position, **Then** it has no mark at all (057 FR-049a/d).

### User Story 2 - Be told the first section that still owes required work, and get taken there (Priority: P2)

The top bar holds one nudge. It names the **earliest** section the author has already passed that
still owes required work, says how much, and takes them there when activated. When that section is
settled, the nudge moves to the next one owed, or disappears.

**Why this priority**: The nudge exists and works, but only for two hardcoded destinations. This
generalizes it; the author is not blocked in the meantime.

**Independent Test**: Leave required work in two different sections and confirm the nudge names the
earlier one, then settles to the later one when the first is finished.

**Acceptance Scenarios**:

1. **Given** required work outstanding in both `marks` and `mechanisms`, **When** the author is
   standing in `touch`, **Then** the nudge names `marks` — the earliest owed — and not the gallery
   most recently visited.
2. **Given** the only outstanding work is in the section the author is standing in, **When** they
   look at the top bar, **Then** no nudge is shown.
3. **Given** the nudge names a section, **When** the author activates it, **Then** they arrive at that
   section through the same jump mechanism and the same refusal rules as a progress-row mark.
4. **Given** an author reloads the studio mid-build with letters still uncovered, **When** the shell
   restores their draft, **Then** the nudge still names the owed section — the count is derived from
   the working copy, never from session-only state.
5. **Given** the author has marked a letter for later review, **When** they look at the top bar,
   **Then** the nudge still names that gallery (Q7).
6. **Given** no section behind the author owes required work, **When** they look at the top bar,
   **Then** no nudge is shown at all — not an empty slot.

### User Story 3 - Download an unfinished keyboard; never publish one (Priority: P2)

An author with an unplaced letter can reach the Output screen, is told loudly and specifically what
is missing, and can still download the `.kmp` and the `.zip` after acknowledging the complaint. The
control that submits the keyboard to the community repository refuses, with the reason visible.

**Why this priority**: Independently valuable and independently testable, and it removes a hard block
on work the compiler already supports. Sequenced after US1 because the same outstanding-work
derivation names what the complaint reports.

**Independent Test**: Leave one character unimplemented, reach Output, download both artifacts, and
confirm submission refuses.

**Acceptance Scenarios**:

1. **Given** one inventory character has no implementation, **When** the author finishes the help
   step, **Then** they can reach the Output screen rather than being parked before it.
2. **Given** the author is on the Output screen with incomplete coverage, **When** they request the
   `.kmp`, **Then** a complaint names the missing characters and the section that owns them, and
   offers both "go back and finish" and "download anyway"; dismissing it by Escape or backdrop takes
   the safe path and downloads nothing.
3. **Given** the same state, **When** the author chooses "download anyway", **Then** the `.kmp` is
   produced.
4. **Given** the same state, **When** the author looks at the community-submission control, **Then**
   it is refused and states that a keyboard missing required letters cannot be published.
5. **Given** coverage is incomplete but the download gate's other terms are satisfied, **When** the
   submission control is evaluated, **Then** it is still refused — publish MUST NOT be enabled merely
   because download became possible.
6. **Given** attribution or licence emission is blocked (059 D5/D6), **When** the author requests
   either artifact, **Then** it is refused as before — this feature relaxes the coverage term only.

### Edge Cases

- A section whose evidence changes so that a previously-raised station is no longer raised: its mark
  leaves the row, and the series returns to its first station (052 FR-023 keeps precedence over any
  restored cursor).
- A gallery entered and left with **every** letter handled: its mark is filled, and it is not named
  by the nudge.
- A terminal position (the walk is over): every visited section reads complete; nothing reads
  upcoming.
- A restored draft in which no gallery has been mounted this session: the row and the nudge must both
  still report uncovered letters (FR-013).
- A corrupted touch layout: coverage fails closed and marked letters are ignored entirely — the
  existing carve-out is preserved unchanged (FR-035).
- A step id present in a restored record but absent from this build's manifest: unchanged from 057 —
  its mark is kept at the tail and states its reason on activation.
- Every section owes work: the nudge still names exactly one — the earliest.

## Requirements *(mandatory)*

### A. Activity pages and their marks

- **FR-001**: The progress row MUST carry one mark per **activity page**, defined as a screen the
  author acts on: one survey question, one marks station, one gallery. It MUST NOT carry a mark per
  letter, per key, or per gallery view mode.
- **FR-002**: A section the author has **passed** MUST keep a mark. This closes D-1/D-2: a section
  that records no survey answer and publishes no within-step walk MUST still be represented once
  behind the author.
- **FR-003**: A section the author's path **bypassed** MUST have no mark, before or after the
  author's position. Absence, never a greyed-out placeholder (057 FR-049a/d).
- **FR-004**: The marks series MUST contribute one mark per **visible** station, each individually
  addressable, and MUST restore to the station named by an activated mark on arrival — without
  overriding the series' own evidence-changed reset.
- **FR-005**: Each gallery MUST contribute exactly one mark, whatever the size of its inventory and
  whichever view mode is active.
- **FR-006**: A mark for a section behind the author MUST read as **complete** when that section owes
  no required work, and as **outstanding** (the existing hollow shape) when it does.
- **FR-007**: An **optional** question left unanswered MUST NOT make its section read outstanding.
  Required-ness MUST be declared by the surface that owns the question, not inferred by the row.
- **FR-008**: Because "outstanding behind" and "not yet reached" share a shape (Q4), they MUST NOT
  share an accessible name: each MUST state which it is, through the message catalog.

### B. One derivation of outstanding required work

- **FR-009**: There MUST be exactly one derivation of "what does this section still owe", consumed by
  both the progress row and the top-bar nudge. Two surfaces disagreeing about outstanding work is the
  defect class this replaces.
- **FR-010**: Required work MUST comprise (a) every unhandled inventory character on a surface in
  scope, and (b) every unanswered **required** question of a section's walk. Optional questions
  contribute nothing.
- **FR-011**: The derivation MUST be a pure function of its inputs, with a React composition seam
  alongside it, following the existing gate-composition idiom rather than forking a second one.
- **FR-012**: Character coverage MUST be read from the existing single coverage predicate. This
  feature MUST NOT fork, reimplement, or partially inline that composition.
- **FR-013**: The derivation MUST be correct on a **restored draft**. Within-step walks are
  session-scoped and absent after a reload, so character coverage MUST come from the working copy;
  any surface reporting completeness from session-only state is a defect.
- **FR-014**: Marked-for-later characters MUST still count as outstanding for the row and the nudge
  (Q7). Marking MUST continue to relax only the gallery's own completion control.
- **FR-015**: The derivation MUST be addressable: each outstanding section MUST yield a `Location`,
  so both consumers navigate through the one jump implementation.
- **FR-016**: The derivation MUST NOT import from the dashboard layer, preserving the existing
  layering boundary, and MUST NOT read stores directly from the pure module.

### C. The top-bar nudge

- **FR-017**: The top bar MUST hold **one** nudge slot naming the **earliest** section behind the
  author that owes required work, with its count. Not one per surface, and not a stack.
- **FR-018**: The section the author is standing in, and any section ahead, MUST NOT be named.
- **FR-019**: Activating the nudge MUST navigate through the same mechanism and the same refusal
  rules as a progress-row mark (057 FR-045), closing D-6. Where a backward landing needs a traversal
  primitive to avoid corrupting history, that primitive MUST be generalized to take a section id —
  not reintroduced as a second navigation path.
- **FR-020**: A section MUST be named identically in the nudge and in the row, from one shared label
  source.
- **FR-021**: The nudge's strings MUST go through the catalog, and MUST take **new** ids: the message
  no longer means "a gallery needs review" but "this section owes required work", and its count is
  no longer necessarily characters.
- **FR-022**: With nothing owed, the nudge MUST be **absent**, not an empty or disabled slot.

### D. Download loudly; refuse to publish

- **FR-023**: Incomplete character coverage MUST NOT block download of the `.kmp` or the `.zip`.
- **FR-024**: Requesting either artifact with incomplete coverage MUST first raise an explicit
  complaint naming what is missing and which section owns it, offering both a return-and-finish path
  and a proceed-anyway path.
- **FR-025**: Dismissing that complaint indirectly (Escape, backdrop) MUST take the **safe** path and
  produce no artifact. Proceeding MUST be an explicit, deliberate choice.
- **FR-026**: Submitting the keyboard to the community repository MUST be refused while required
  letters are missing, and MUST state that reason.
- **FR-027**: The publish refusal MUST have its **own** coverage term. It MUST NOT be derived from
  the download gate, so that a later change to download cannot silently open publish (D-7). This MUST
  be pinned by a test asserting publish stays refused while download is permitted.
- **FR-028**: The author MUST be able to **reach** the Output screen with incomplete coverage.
  Every gate that today prevents arrival MUST be relaxed to a warning that names the outstanding work
  rather than a refusal to route.
- **FR-029**: The Output screen's coverage banner MUST remain loud and specific, and MUST be reworded
  to state that download is possible and submission is not.
- **FR-030**: No other emission gate is relaxed. Compile readiness, working-copy instantiation,
  attribution (059 D6), licence parseability (059 D5), and the stale-touch-step refusal all stand
  exactly as specified.

### E. Non-regression

- **FR-031**: The three existing mark classes and their shapes are unchanged; no fourth shape is
  introduced (Q4).
- **FR-032**: The row's overflow behaviour is unchanged: horizontal scroll, no silent truncation, the
  current position always visible (057 FR-047). The row grows by roughly a third; it MUST NOT grow
  the footer's height.
- **FR-033**: Per-letter addressing MUST NOT return to the row. The in-page character strip remains
  the affordance for choosing a letter.
- **FR-034**: Nothing in this feature may introduce a validation timer (constitution Article IV).
- **FR-035**: The coverage predicate's fail-closed behaviour on a corrupted touch layout, including
  its deliberate disregard of marked letters in that state, MUST be preserved.

### Key Entities

- **Activity page** — a screen the author acts on, and the unit the row marks: one survey question,
  one marks station, one gallery. Not a letter, not a key, not a view mode.
- **Outstanding required work** — per section, the count of unhandled required items: uncovered
  inventory characters plus unanswered required questions. Zero means the section owes nothing.
- **Section mark** — the row's representation of a section that contributed no finer marks; complete
  when the section owes nothing, outstanding when it does, absent when the section is off-path.
- **Nudge target** — the earliest section behind the author with outstanding required work, carrying
  its label, its count, and its `Location`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a project walked to the Mechanism gallery, the number of sections represented in
  the row equals the number of manifest sections on the author's path up to and including that
  gallery — no section missing, none duplicated.
- **SC-002**: No mark in the row is ever addressed to a single letter, at any inventory size.
- **SC-003**: A marks series raising *n* visible stations contributes exactly *n* marks, for every
  *n* from one to four.
- **SC-004**: A section left with required work outstanding reads outstanding rather than complete,
  including after a full page reload.
- **SC-005**: With required work outstanding in more than one passed section, exactly one nudge is
  shown and it names the manifest-earliest of them.
- **SC-006**: With incomplete coverage, both artifacts can be downloaded after an explicit
  acknowledgement, and the community-submission control is refused — in the same session, on the same
  screen.
- **SC-007**: The footer's height is unchanged, and the current-position mark remains visible without
  manual scrolling at the narrowest supported width.
- **SC-008**: The row's composition is pinned by an exact-match test against the real manifest, not a
  subset matcher and not a minimum count (closing D-8).

## Assumptions

- **A1**: Every inventory character is required work. "All letters have to be handled at some point"
  is taken as given; no per-character optionality is introduced.
- **A2**: Each marks station is required. The series gates its own advance, so a station the author
  has not walked is outstanding.
- **A3**: Marked-for-later defers rather than discharges (Q7). This narrows the mark-aware
  derivation's consumers to the gallery completion control alone. Reversible as a single term if the
  author prefers the nudge to fall silent on marking.
- **A4**: A within-step walk that persists after its section is left is treated as usable history,
  not staleness — this feature does not begin clearing walks, since the row's correctness after a
  reload is guaranteed by FR-013 instead.
- **A5**: Publish enforcement belongs on the client, where the working copy lives. No server-side
  coverage check is added.

## Out of scope

- Clearing published walks, or persisting them into the draft envelope.
- Any fourth mark shape, or a per-section progress meter inside a mark.
- Per-letter addressing from the footer, in any form (FR-033).
- Making the touch key-grid mode its own activity page (Q3).
- A per-question "skipped deliberately" record. Unanswered and never-asked remain indistinguishable
  in the decision record; required-ness alone decides what is owed.
- Server-side or lint-level enforcement of coverage. Layer C stays warning-only.
- Reordering, renaming, or re-gating any manifest section.

## Specs that must be extended, not left alone

- **[specs/057-bulletproof-navigation/](../057-bulletproof-navigation/) FR-042** enumerates three
  mark classes — completed *question*, current position, upcoming *stage*. A finished section that
  asked no questions falls into none of them, which **is** D-1. FR-042 MUST gain a completed-section
  class (or generalize "completed question" to "completed stop" covering both), and **FR-043** MUST
  gain the "outstanding behind" name beside "not yet reached". 057's Q2 resolution — "the row is the
  whole journey" — is the intent being satisfied, not overturned.
- **057's data-model note** on upcoming dots, and the within-step-dots handoff's open caveat about
  `marks` and `convenience`, MUST be reconciled: `marks` becomes multi-mark, while `convenience` and
  `carve` stay single-mark **by design** — one page each — rather than by omission.
- The download-versus-publish policy change is user-visible contract, not an implementation detail:
  it MUST be recorded in [docs/spec-signoff.md](../../docs/spec-signoff.md) as a 061 decision.
- Spec-corpus edits MUST be acknowledged through `utilities/spec-trace` in the same commit.

## Test surface

- **Unit** — the outstanding-work derivation: coverage-only input with an empty walk map still
  reports both galleries (the reload case, FR-013); earliest-owed selection ignores the current and
  ahead sections; marked letters do not reduce the count (FR-014); optional unanswered stops
  contribute nothing (FR-007).
- **Unit** — row composition against the **real** manifest with a project open: exact ordered
  match (SC-008); a bypassed side trail contributes nothing; at a terminal position every visited
  section reads complete; no mark id is ever a character token (FR-033); a marks series with two
  visible stations yields two marks.
- **Component / a11y** — an outstanding mark behind the author and an unreached mark ahead have
  distinct accessible names (FR-008); the nudge is absent when nothing is owed (FR-022); the nudge's
  label matches the row's label for the same section (FR-020).
- **Component** — Output screen with coverage incomplete: both download controls enabled, the
  complaint raised, indirect dismissal produces nothing (FR-025), "download anyway" produces the
  artifact, and the submission control refused **while** download is permitted (FR-027).
- **E2E** — walk to Output with an uncovered character, download the `.kmp`, confirm submission
  refuses; and reload mid-build to confirm the nudge and the outstanding mark survive.
