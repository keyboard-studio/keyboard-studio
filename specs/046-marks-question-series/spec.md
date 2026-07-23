# Feature Specification: Mark Composition Model and the Marks Question Series

**Feature Branch**: `046-marks-question-series`

**Created**: 2026-07-21

**Status**: Draft

**Input**: User description: "Mark composition model and the marks question series — implement the design captured in docs/design-notes/mark-composition-model.md: split the alphabet inventory into bases/marks/attested-stacks; adapt the character picker to decompose whole graphemes visibly and prompt for role on private-use characters; add the S0-S5 marks question series between the alphabet picker and the mechanism gallery; emit a typed worklist to the mechanism gallery; enforce the uniformity invariant (a monolingual keyboard's output is uniformly composed or uniformly decomposed, never mixed); retire the marks-related questions this series absorbs."

This feature implements the design recorded in
[docs/design-notes/mark-composition-model.md](../../docs/design-notes/mark-composition-model.md)
and governs how it composes with the alphabet-confirmation step already
covered by the platform's survey framework (spec.md §8 data flow, §7 strategy
selection).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A language with no accent marks skips the series entirely (Priority: P1)

A designer builds a keyboard for a language whose confirmed alphabet has no
marks at all (every confirmed character is a plain letter or digit). The
system must not show any mark-related question — asking about accent
handling when there is nothing to decide is exactly the kind of empty,
no-signal question the product avoids.

**Why this priority**: This is the majority case for many of the languages
this product targets, and it is the cheapest possible failure mode to get
wrong — a single stray screen shown to every no-diacritic language would be
noticed immediately and erodes trust in "prefilled, propose-then-confirm."

**Independent Test**: Confirm an alphabet with zero marks, proceed past the
alphabet-confirmation step, and verify the designer lands directly on the
mechanism (key-placement) step with no intervening marks screens.

**Acceptance Scenarios**:

1. **Given** a confirmed alphabet whose marks list is empty, **When** the
   designer advances past alphabet confirmation, **Then** the system skips
   directly to the mechanism gallery step with no marks-series screen shown.
2. **Given** the same empty-marks alphabet, **When** the designer later
   revisits the alphabet-confirmation step and adds a character that carries
   a mark, **Then** the marks series becomes reachable again on the next
   advance.

---

### User Story 2 - A simple, fully-attested orthography confirms in about two screens (Priority: P1)

A designer builds a keyboard for a language whose only mark is a cedilla,
attested on a single base letter (e.g. "c"), with a ready-made character
available for the combination. The system must recognize this as
low-ambiguity and let the designer confirm it with minimal interaction,
never forcing them through a full six-station sequence to bless a fact that
is already obvious from the confirmed alphabet.

**Why this priority**: Most real single-language orthographies fall closer
to this end of the complexity spectrum than to the tonal/never-composing
end; over-asking here would violate the defaults-first principle for the
common case.

**Independent Test**: Confirm an alphabet containing exactly one mark
attested on exactly one base letter, with a precomposed form available for
that combination, and verify the designer reaches the mechanism gallery
after at most two screens of the marks series, with the attachment fact
pre-confirmed rather than asked as an open question.

**Acceptance Scenarios**:

1. **Given** a mark attested on exactly one base letter with no plausible
   additional bases, **When** the marks series runs, **Then** the
   attachment station shows that mark as an already-confirmed summary,
   not as a question the designer must actively answer.
2. **Given** every base+mark pair in the confirmed alphabet has a
   ready-made combined form, **When** the designer reaches the output-form
   station, **Then** the system proposes the ready-made-character form as a
   pre-explained notice rather than presenting an open choice.
3. **Given** this simple, single-mark, single-base orthography, **When**
   the designer completes the marks series, **Then** no more than two
   screens were shown between leaving alphabet confirmation and arriving at
   the mechanism gallery.

---

### User Story 3 - A tonal orthography with bases that never form a ready-made combined character is proposed the decomposed output form (Priority: P1)

A designer builds a keyboard for a tonal language whose vowel inventory
includes letters that never have a ready-made accented counterpart in
Unicode (for example a schwa-like vowel or an open-o) but that do carry tone
marks in the confirmed alphabet. The system must recognize that at least one
attested combination has no ready-made single-character form and propose
storing all mark-bearing letters as base-plus-mark sequences, with an
explanation the designer can act on but does not have to research.

**Why this priority**: This is the case the design note identifies as the
one most likely to be gotten wrong by a naive "always prefer the simple
combined form" default — a wrong default here breaks search and backspace
consistency across the whole keyboard, not just for the exotic letters.

**Independent Test**: Confirm an alphabet where at least one attested
base+mark combination has no ready-made single-character form, and verify
the output-form station presents the base-plus-mark form as the proposed
default, with a plain-language explanation, and that the same form applies
uniformly to every mark-bearing letter in the keyboard (including the ones
that do have a ready-made form available).

**Acceptance Scenarios**:

1. **Given** an alphabet where a base letter and one of its attested marks
   has no ready-made combined character, **When** the designer reaches the
   output-form station, **Then** the system proposes storing every
   mark-bearing letter as base-plus-mark, states the reason in plain
   language (consistent search and backspace behavior), and does not use
   the words "Unicode" or "normalization" anywhere in the prompt.
2. **Given** the designer accepts that proposal, **When** the resulting
   keyboard is produced, **Then** every mark-bearing letter it can output —
   including ones that do have a ready-made combined form — is produced in
   the base-plus-mark form, never a mix of forms.

---

### User Story 4 - A fully composable orthography with a letter-plus-mark mental model gets an open output-form choice (Priority: P2)

A designer builds a keyboard for a language where every attested base+mark
combination has a ready-made single-character form available, but the
community treats at least one mark as a productive modifier that attaches
to many base letters rather than as part of a fixed set of whole letters
(e.g. an acute accent usable on most vowels). Because both output forms are
technically viable here, the system must present the choice openly rather
than silently deciding, while still recommending one option first and
describing the consequence of each in plain language.

**Why this priority**: This is the genuinely ambiguous case the design note
calls out; getting the framing right (recommended-first, consequence-led,
no jargon) matters for designer trust but affects fewer keyboards than
Stories 1-3.

**Independent Test**: Confirm an alphabet meeting the "all pairs have
ready-made forms, but at least one mark-class is productive" condition, and
verify the output-form station renders as a choice (not a notice) with a
recommended option listed first and a preview demonstrating backspace
behavior for both options.

**Acceptance Scenarios**:

1. **Given** an alphabet where every base+mark pair has a ready-made
   combined form and at least one mark-class was confirmed as
   letter-plus-mark, **When** the designer reaches the output-form
   station, **Then** it presents an open choice between the two output
   forms, with the recommended option listed first and each option's
   consequence stated in plain language.
2. **Given** either choice, **When** the designer views the station's
   preview, **Then** it demonstrates what happens on repeated backspace for
   a mark-bearing letter under that choice (e.g. a fully-marked letter
   peeling down one mark at a time versus disappearing in one step).

---

### User Story 5 - Picking a whole accented character in the alphabet picker visibly populates both the letters and marks lists (Priority: P1)

A designer searching the character picker for a letter types or selects a
whole accented character (e.g. "e with an acute accent") as a single
selectable item — they should never have to know or declare that it is
"really" two things. Upon picking it, the system must show the designer, in
the same moment, that its base letter has been added to the Letters list
and its mark has been added to the Marks list, teaching the underlying
model without an interrupting question.

**Why this priority**: This is the mechanism that keeps the picker itself
free of the mental-model question — if picking a whole character silently
skipped this visible decomposition, the marks series downstream would have
nothing to work from and the design note's "no clarifying question at pick
time" property would not hold.

**Independent Test**: Search the picker for a known precomposed character,
select it, and verify both the Letters and Marks sections of the alphabet
inventory update to reflect the decomposition, using only the whole
character as the unit of selection.

**Acceptance Scenarios**:

1. **Given** a character picker search for an accented letter, **When**
   the designer selects the whole accented character as a single item,
   **Then** the system records its base letter in the alphabet's Letters
   list and its mark in the Marks list, and records the combination itself
   in the attested-combinations list.
2. **Given** the same pick, **When** the designer looks at the alphabet
   inventory screen, **Then** the newly added base letter and mark are
   visibly highlighted or otherwise indicated as just having been added by
   that one pick, without any question having interrupted the pick.

---

### User Story 6 - Picking a private-use character prompts for its role because no linguistic data exists to infer one (Priority: P2)

A designer picks a private-use-area character (used, for example, for a
community-specific symbol with no assigned Unicode properties). Because the
system has no linguistic data source to determine whether this character
behaves as a letter or as a mark, it must ask the designer directly and
concretely at the moment of picking, rather than guessing or silently
defaulting.

**Why this priority**: Private-use characters are explicitly in scope (per
the design note) but are the one case where the system has no signal to
derive a default from — asking is the only defaults-first-compliant option
available.

**Independent Test**: Pick a private-use-area character in the picker and
verify the system prompts, at pick time, for whether it should be treated
as a letter or as a mark, and that the designer's answer determines which
inventory list it is recorded in.

**Acceptance Scenarios**:

1. **Given** a designer picks a character in the private-use area, **When**
   the pick is committed, **Then** the system asks explicitly whether to
   record it as a letter or as a mark, before adding it to any inventory
   list.
2. **Given** the designer answers "mark", **When** the pick completes,
   **Then** the character appears in the Marks list and is available in
   later marks-series stations exactly as any other mark would be.
3. **Given** the designer answers "letter", **When** the pick completes,
   **Then** the character appears in the Letters list and never appears as
   an option in the marks-series stations.

---

### User Story 7 - The mechanism gallery receives a typed worklist reflecting every marks-series decision (Priority: P1)

Once the marks series completes (or is skipped), the mechanism gallery
step needs a clear, unambiguous list of what it must place: which letters
need their own key (including accented letters the community treats as
whole letters), which marks need their own key (with a known attach-before-
or attach-after behavior), and which combinations are blocked and must
never be reachable by typing at all.

**Why this priority**: Everything upstream in the marks series exists to
produce this handoff correctly; if the worklist is wrong or ambiguous, every
downstream placement decision inherits the error.

**Independent Test**: Run the marks series to completion for an alphabet
with a mix of own-letter and letter-plus-mark mark-classes, then inspect
what the mechanism gallery step is given, and verify it separates
own-letter units, mark units (with input order), and blocked combinations
into three distinguishable groups with nothing left unclassified.

**Acceptance Scenarios**:

1. **Given** a completed marks series with at least one own-letter
   mark-class and at least one letter-plus-mark mark-class, **When** the
   mechanism gallery step starts, **Then** it receives a worklist in which
   every accented letter confirmed as its own letter is listed as a unit
   needing a key placement, every mark confirmed as productive is listed
   separately as needing a key placement plus its confirmed attach order,
   and every combination not attested or judged plausible is listed as
   blocked.
2. **Given** the marks series was skipped entirely (Story 1), **When** the
   mechanism gallery step starts, **Then** it receives an empty
   mark-related worklist and proceeds using only the plain-letter
   placement flow already in place.

---

### User Story 8 - A combination blocked by the attachment decision cannot be produced by typing on the finished keyboard (Priority: P2)

A mark was confirmed to attach to some letters but not others (for example,
a tone mark that attaches to vowels but was left unchecked for consonants).
The finished keyboard must not let a typist produce that unconfirmed
combination — the block recorded during the marks series must actually
constrain the compiled keyboard's behavior, not just the survey's own
bookkeeping.

**Why this priority**: This is the acceptance test that proves the
attachment matrix is load-bearing rather than decorative; without it, the
whole per-mark attachment station (Story 2's "auto-confirm" and the
general attestation/plausible/blocked tri-state) would be advisory only.

**Independent Test**: Complete the marks series leaving a specific
base+mark combination blocked, produce the keyboard, and verify that
attempting to type that base followed by that mark on the produced keyboard
does not yield the combined result a typist might expect from an attested
combination.

**Acceptance Scenarios**:

1. **Given** a mark confirmed as attaching to some but not all letters in
   the alphabet, **When** the keyboard is produced, **Then** typing that
   mark against one of the letters left unchecked does not produce a
   composed result reachable through the keyboard's ordinary key sequence.
2. **Given** the same produced keyboard, **When** typing that mark against
   a letter that was checked (attested or plausible-and-accepted), **Then**
   the composed result is produced as expected.

### Edge Cases

- What happens when a mark's attachment set is edited after the mental-model
  station has already been confirmed for its class (e.g. the designer adds
  a new attested base to a mark after saying "own-letter")? The mental-model
  confirmation for that mark-class must be revisited before the series can
  be considered complete again, since the underlying evidence changed.
- How does the system handle a mark-class where some individual pairs were
  answered "own-letter" and others "letter-plus-mark" within the same class
  (a mixed answer at the mental-model station)? It must be recorded as a
  per-pair split, and each pair's own mechanism/output-form consequences
  flow independently downstream.
- What happens when two different marks are both attested on overlapping
  sets of bases and the orthography also has an attested combination
  carrying both marks at once (a two-mark stack, e.g. a letter with both a
  circumflex and an underdot)? The stacking station must surface and let
  the designer confirm the attested stack list explicitly; it is never
  silently inferred from the two marks' individual attachment sets.
- What happens when a base letter in the confirmed alphabet never appears
  with any mark at all? It is placed as an ordinary letter and never
  appears as a row in any marks-series station.
- What happens if the output-form decision would be ambiguous because the
  alphabet has zero attested base+mark combinations that would need a
  choice (all marks blocked from every base, an unusual but possible
  editing state)? The output-form station must not render at all in that
  state — there is nothing to decide.
- What happens to a digraph (a two-base sequence like a letter pair, as
  distinct from a base+mark pair)? It stays on its own existing survey
  question outside this series; this feature only reaches base+mark
  combinations.
- What happens when the designer picks a whole accented character whose
  base letter or mark is already in the inventory from an earlier pick?
  The already-present item is not duplicated; only the newly implied
  attested combination (if not already recorded) is added.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST maintain three distinct records for a
  keyboard's confirmed alphabet: a list of base letters, a list of marks
  (diacritics attachable to a base), and a list of attested combinations,
  where each attested combination records an ordered sequence of one base
  and one or more marks exactly as confirmed (order-preserving, so a
  letter carrying two marks in a specific stacking order is distinguishable
  from the same two marks in the other order).
- **FR-002**: The character picker MUST let a designer select a whole
  accented or otherwise composed character as a single pick; the designer
  is never required to select a base letter and a mark as two separate
  actions to represent one combined character.
- **FR-003**: When a designer picks a whole composed character with known
  linguistic decomposition, the system MUST record its base letter in the
  Letters list, its constituent mark(s) in the Marks list, and the
  combination itself in the attested-combinations list, and MUST make this
  three-way update visible to the designer at the point of picking.
- **FR-004**: When a designer picks a character in the private-use area
  (for which no linguistic decomposition data exists), the system MUST ask
  the designer, at the point of picking, whether to record it as a letter
  or as a mark, and MUST record the answer as a permanent, designer-owned
  classification for that character rather than re-deriving it later from
  any other data source.
- **FR-005**: The system MUST compute, without displaying, a gate that
  determines whether the marks question series runs at all: if the Marks
  list is empty, the entire series MUST be skipped and the designer MUST
  proceed directly from alphabet confirmation to the mechanism gallery
  step.
- **FR-006**: When the marks series runs, the system MUST present exactly
  one attachment row per mark, asking which of the confirmed base letters
  may carry that mark, with the row pre-populated so that every base
  already attested with that mark is pre-checked, every base judged
  plausible by mark-class heuristics is proposed but not yet checked, and
  every other base is unchecked.
- **FR-007**: The system MUST treat every base left unchecked at the
  attachment row for a given mark as blocked for that mark, and MUST state
  the consequence of being unchecked (that the combination will not be
  reachable on the finished keyboard) in the row's help text.
- **FR-008**: When a mark has exactly one attested base and no
  mark-class-heuristic-proposed additional bases, the system MUST present
  its attachment row as an already-confirmed summary rather than as a row
  requiring the designer's action, while still allowing the designer to
  open and edit it.
- **FR-009**: The system MUST derive, without a separate question, which
  base+mark combinations have an uppercase/lowercase counterpart pair from
  the confirmed alphabet's case data, superseding any separate
  capitals-and-marks question.
- **FR-010**: The system MUST group marks into mark-classes (sets of marks
  that behave alike, such as "quality accents" versus "tone marks") using
  attachment-set similarity and the marks' own linguistic function, and
  MUST present the mental-model confirmation (Story 4's "own-letter" versus
  "letter-plus-mark" choice) once per class rather than once per individual
  mark, while still allowing a designer to split an individual mark or pair
  out of its class's answer.
- **FR-011**: The mental-model confirmation for each mark-class MUST be
  pre-filled with a recommended answer derived from: how many different
  base letters the mark actually attaches to in the confirmed alphabet
  (widely attached suggests letter-plus-mark), whether the base keyboard
  this keyboard derives from already treats the mark as a single dedicated
  key or as a keystroke that combines with a following letter, and whether
  the number of attested/plausible combinations exceeds the number of
  physical key positions available for dedicated letter units (if it does,
  the own-letter option MUST be presented as unaffordable with the reason
  stated).
- **FR-012**: The system MUST present the mark input-order question
  (attach-before-letter versus attach-after-letter) only when at least one
  mark-class was confirmed as letter-plus-mark, and MUST pre-fill it from
  the corresponding behavior of the keyboard this one derives from, when
  that information is available.
- **FR-013**: The system MUST determine the output form (a single
  ready-made character versus a base-plus-mark sequence) for every
  mark-bearing letter in the keyboard as one decision that applies
  uniformly across the whole keyboard — never a per-letter or per-pair
  mixture.
- **FR-014**: When at least one attested or plausible-and-accepted
  base+mark combination in the confirmed alphabet has no ready-made
  single-character form, the system MUST propose the base-plus-mark output
  form for the whole keyboard as a pre-explained default, presented as a
  notice with a plain-language reason and a way to change it, not as an
  open multi-option question.
- **FR-015**: When every attested or plausible-and-accepted base+mark
  combination has a ready-made single-character form AND no mark-class was
  confirmed as letter-plus-mark, the system MUST propose the
  ready-made-character output form for the whole keyboard as a
  pre-explained default, presented as a notice with a plain-language
  reason and a way to change it, not as an open multi-option question.
- **FR-016**: When every attested or plausible-and-accepted base+mark
  combination has a ready-made single-character form AND at least one
  mark-class was confirmed as letter-plus-mark, the system MUST present the
  output-form decision as an open choice between the two forms, with a
  recommended option listed first and each option's consequence described
  without using the words "Unicode" or "normalization" anywhere in
  designer-facing prompt text.
- **FR-017**: The output-form station's preview MUST demonstrate the
  step-by-step effect of repeated backspace on a mark-bearing letter under
  whichever form is selected, so the designer can see the consequence
  rather than take it on faith.
- **FR-018**: The system MUST present a stacking confirmation (can one
  letter carry two marks at once) only when the confirmed alphabet contains
  an attested combination with two or more marks on one base, or when two
  marks' plausible-base sets overlap; otherwise it MUST leave two-mark
  combinations blocked without asking.
- **FR-019**: When the stacking confirmation is answered affirmatively, the
  system MUST show the designer the specific attested multi-mark
  combinations for confirmation, rather than inferring the full set of
  allowed stacks from the individual marks' attachment rows.
- **FR-020**: Upon completion (or skip) of the marks series, the system
  MUST hand the mechanism gallery step a classification of every relevant
  unit into exactly one of: an own-letter unit needing its own key
  placement, a mark unit needing its own key placement together with its
  confirmed attach-before/attach-after behavior, or a blocked combination
  that must never be reachable by typing.
- **FR-021**: The system MUST NOT allow a finished keyboard to reach a
  blocked combination by any ordinary key sequence; a mark left unchecked
  against a given base at the attachment station MUST correspond to no
  reachable path from that base plus that mark's key(s) to a composed
  result on the produced keyboard.
- **FR-022**: **[RETIRED 2026-07-23]** This requirement previously read:
  "The system MUST enforce the uniformity invariant on every keyboard this
  feature governs: the produced keyboard's mark-bearing output is either
  uniformly in the ready-made-character form or uniformly in the
  base-plus-mark form, and this property MUST be checkable mechanically
  against the finished keyboard's design, not merely asserted by the survey
  answer that produced it." Retired by explicit maintainer decision: the
  concern that an accented/diacritic character can be typed more than one
  way is no longer enforced via a validator warning. The implementing
  check (`checkNormalizationUniformity`, the `layer-c-enforce` criteria row
  carrying `KM_LINT_MARK_NORMALIZATION_UNIFORM`, and its wiring into the
  validator oracle/index) has been removed from the engine. No replacement
  mechanism is specified at this time; any future handling of this concern
  will be defined in a separate amendment. The FR-022 id is retained
  as a placeholder (not reassigned) so later FR references stay stable.
- **FR-023**: If editing the confirmed alphabet after the marks series has
  been completed changes the evidence a prior mental-model or output-form
  decision was based on (e.g. adding a base to a mark whose class was
  confirmed as "own-letter", or adding a never-composing combination after
  the output form was set to the ready-made-character form), the system
  MUST mark the affected station(s) as requiring reconfirmation before the
  designer can proceed past them again.
- **FR-024**: The marks series MUST NOT be presented, at any station, as a
  single up-front question asked before the alphabet is confirmed; every
  station's content MUST be derived from the alphabet already confirmed at
  that point.
- **FR-025**: This feature MUST supersede and remove from active use the
  existing standalone questions for: the top-level accent-marks gate, the
  diacritic-selection picker prompt, the single combined
  precomposed-vs-combining preference question, and the
  capitals-plus-marks question and the two-mark-stacking question; the
  existing mark-input-order question's content and pre-fill behavior MUST
  be preserved and relocated into this series rather than duplicated.
- **FR-026**: Digraph (two-base) combinations MUST remain governed by
  their existing, separate question and MUST NOT be folded into any
  marks-series station; the two MUST use parallel wording where the
  underlying "is this a unit or a sequence" distinction is the same, so a
  designer answering both does not perceive an inconsistency.

### Key Entities

- **Base letter**: An orthographic letter that can appear on its own,
  independent of any mark; the fundamental unit of the Letters list.
- **Mark**: A diacritic or similar attachment (e.g. an accent, tone
  marker, or nasalization marker) that combines with a base letter; the
  fundamental unit of the Marks list. Distinct from a base letter even
  when the two together form a single visual/ready-made character.
- **Attested combination (stack)**: An ordered sequence of exactly one
  base letter plus one or more marks, as actually confirmed present in the
  language's orthography, order preserved (so which mark was "closest" to
  the base is distinguishable from the reverse). The source of truth for
  what the language actually uses; every attachment, mental-model, and
  output-form proposal is derived from this list, never invented
  independently of it.
- **Mark-class**: A group of marks that behave alike for the purposes of
  the mental-model and output-form decisions (e.g. "quality accents" as
  one class, "tone marks" as another), grouped by how similarly they
  attach across base letters and by their shared linguistic function.
  Confirmations are made per class by default, with per-mark or per-pair
  overrides available.
- **Attachment decision**: A per-mark record of which base letters may
  carry it, in one of three states per base — attested (observed in the
  confirmed alphabet), plausible-and-accepted (proposed by heuristics and
  confirmed by the designer), or blocked (everything else, by default).
- **Mental-model decision**: A per-mark-class (or, on override, per-mark or
  per-pair) record of whether the community treats a marked letter as its
  own letter of the alphabet or as a base letter with an added mark. Drives
  which units the mechanism gallery must place as dedicated keys versus
  productive mark keys.
- **Mark input-order decision**: For any mark-class recorded as
  letter-plus-mark, whether the mark's key is pressed before or after the
  base letter's key.
- **Output-form decision**: A single, keyboard-wide record of whether
  mark-bearing letters are produced in the ready-made single-character
  form or the base-plus-mark sequence form. Always one value per keyboard,
  never mixed, per the uniformity invariant.
- **Stacking decision**: Whether the keyboard allows more than one mark on
  a single base letter at once, and if so, the specific attested
  multi-mark combinations that are allowed.
- **Declared role**: For a private-use-area character only, a
  designer-supplied classification (letter or mark) that stands in for the
  linguistic decomposition data that does not exist for such characters.
- **Placement worklist**: The classification handed to the mechanism
  gallery step at the end of the series: own-letter units, mark units
  (each with its input-order behavior), and blocked combinations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of keyboards whose confirmed alphabet has no marks skip
  the marks series entirely (zero marks-series screens shown).
- **SC-002**: For an alphabet where every mark has exactly one attested
  base and no plausible additions, a designer reaches the mechanism
  gallery step having seen at most two marks-series screens.
- **SC-003**: For any keyboard produced by this feature, checking the
  produced keyboard's mark-bearing output for uniformity (entirely
  ready-made-character form, or entirely base-plus-mark form) always
  succeeds — 0% of produced keyboards mix the two forms.
- **SC-004**: 100% of base+mark combinations left unchecked at the
  attachment station are unreachable by ordinary typing on the produced
  keyboard.
- **SC-005**: 0% of designer-facing prompt text in the output-form station
  contains the words "Unicode" or "normalization".
- **SC-006**: In a review of representative orthographies spanning the
  four scenario shapes in Stories 1-4, no orthography requires more than
  five marks-series screens (one per station that can ever be shown to a
  designer, excluding the always-invisible gate check) to complete, and
  the majority require two or fewer.
- **SC-007**: For every keyboard produced by this feature, the mechanism
  gallery step's placement worklist accounts for every base letter and
  every mark in the confirmed alphabet exactly once, with zero units left
  unclassified.

## Assumptions

- **Card-based stations, with a static-question fallback for MVP.** Two of
  the six stations (per-mark attachment rows, per-class mental-model
  confirmation) need content interpolated from the designer's own
  confirmed alphabet and cannot be expressed as the platform's static
  question shape. This spec treats them as dynamic content requirements
  (FR-006, FR-010) without prescribing the presentation mechanism. An MVP
  may satisfy the mental-model requirement with a single global
  confirmation covering all mark-classes at once, deferring per-class
  refinement to a follow-up increment, provided the single global
  confirmation still carries the pre-fill signals in FR-011.
- **Touch mechanism is out of scope for this feature.** The mental-model
  decision this series produces is consumed later by the touch-layout step
  to decide diacritic-row rendering there; this feature is responsible only
  for producing and recording that decision, not for touch rendering
  itself.
- **The reverse (ready-made-to-base-plus-mark) transform for existing
  content is a recorded consequence, not a deliverable of this feature.**
  When a designer picks the base-plus-mark output form while adapting a
  base keyboard whose own content uses the ready-made form, converting
  that existing content is a follow-on migration need. This feature only
  needs to record that the need exists at the point the decision is made;
  building the conversion itself is out of scope here.
- **Mark×mark exclusivity is represented as attested stacks, not a general
  slot model, for this feature's scope.** The stacking station
  (FR-018/FR-019) surfaces and confirms specific attested multi-mark
  combinations. A more general "one mark per position" slot model that
  would generalize stacking to unattested combinations is a design
  refinement the design note leaves open and is not required by this
  feature; the attested-list approach is a safe, non-blocking default that
  never proposes a stack the designer has not seen evidence for.
- **Mental-model and output-form pre-fill heuristics ship with reasonable
  initial thresholds, calibrated later.** The specific productivity-spread
  threshold, weighting of the base keyboard's own mechanism signal, and
  similar tuning constants for FR-011 are expected to need adjustment
  against real orthographies after this feature ships; this spec requires
  that the signals exist and drive the pre-fill, not a specific numeric
  threshold.
- **This feature governs single-language (monolingual) keyboards.**
  Multilingual/country-scale keyboards, where the attachment matrix is
  deliberately left open, are existing out-of-scope territory for this
  product; this feature's attested/plausible/blocked tri-state and
  uniformity invariant apply to the single-language case the product
  targets.
- **Digraphs keep their own existing question.** This feature's
  attested-combinations list and stations apply only to base+mark pairs;
  two-base digraph sequences continue to be handled by their own existing
  question, referenced here only for wording consistency (FR-026).
