# Feature Specification: Punctuation defaults and the invisible-character question

**Feature Branch**: `075-punctuation-defaults`

**Created**: 2026-09-09

**Status**: Draft

**Input**: User description: "on the 'Choose your punctuation' question. automatically add CLDR punctuation, don't make the user click each, and let's create a new spec to work toward proposing accepting all (or at least basic Ascii) punctuation from the base keyboard. Invisible characters need to be on their own question."

**Governing context**: [spec.md](../../spec.md) §3c (defaults are the product — propose-then-confirm, a derivable-but-blank decision point is a defect) and §8 (data flow — where a confirmed inventory enters and what downstream consumes it). The exemplar source this feature reads is specified in [044-cldr-sldr-exemplars](../044-cldr-sldr-exemplars/spec.md); the "offer characters the base already produces" precedent is [051-carve-orthography-trim](../051-carve-orthography-trim/spec.md); the step-declaration contract the base-punctuation story may touch is [020-qu-wire-buildlist](../020-qu-wire-buildlist/spec.md). Verified code-level findings are in [research.md](research.md); entities in [data-model.md](data-model.md); the proposed surface in [contracts/punctuation-defaults-contract.md](contracts/punctuation-defaults-contract.md).

## Why this exists

The punctuation step already knows the answer and asks anyway.

By the time the author reaches "Choose your punctuation", the studio is holding
the language's CLDR punctuation exemplar set. It resolved the BCP47 tag, it
looked the tag up in a committed offline index of 2381 locales, it filtered that
locale's exemplars down to the punctuation tier, and it rendered the result on
the page. Then it puts every one of those characters behind an individual click
and starts the author from an empty list. An author who presses Done without
touching anything confirms an inventory of **nothing** — for a language whose
punctuation the studio could have named.

That is the shape [spec.md](../../spec.md) §3c calls a defect in as many words:
a decision point left blank when a default was derivable. The affordance for
doing it right already exists on this very page. Proposed characters carry a
dashed "proposed" attribution; chosen characters are click-to-remove. Everything
propose-then-confirm needs is built. Only the initial population is missing —
the set is offered as a tray to shop from instead of a default to trim.

Two further gaps compound with it.

**Punctuation the base keyboard already types is kept silently and never
declared — and the letters beside it are treated the opposite way.** Carve treats every `\p{N}\p{P}\p{S}` character as always-keep and so
never proposes punctuation for removal; the rationale is written down in the
engine as "punctuation needs no question at all." The consequence is that the
base's punctuation survives into the output without ever entering the confirmed
inventory. The author never sees it, never confirms it, and cannot tell the
difference between punctuation the keyboard deliberately supports and
punctuation that happened to ride along. The coverage data needed to show them
already exists — the inventory delta computes exactly which characters the base
IR produces and stamps them — and no user-facing surface reads it.

What makes this more than an oversight is that the same base keyboard's *letters*
get the opposite default. Carve's never-remove guard shields numbers, punctuation
and symbols and says so in as many words; a letter or mark normalizes to a
different category, does not match the guard, and so stays "eligible for removal
recommendations". Surplus base letters are therefore actively proposed for
removal and then asked about, on a spine question that already exists — "Keep
these letters for convenience?". Surplus base punctuation is kept without
comment and asked about nowhere. Same base keyboard, same author, opposite
defaults, and neither family is propose-then-confirm on the *accept* side: the
letters question asks what to keep from a removal proposal, and the punctuation
question does not ask at all. A third family sits between them — base ASCII
letters on a non-Latin keyboard are neither shielded nor plainly removed but
tagged as an optional low-priority group. Three inheritance behaviours, none of
them written down as a decision.

**Invisible format characters get three inconsistent answers on one screen.**
Type a ZWNJ into the punctuation page's input box and it is refused into a
"Skipped" list. Look for it in the page's character grid and it is not there at
all — the pane's punctuation scope keeps only characters whose category is
punctuation, and every format character classifies as a control, so none of them
can be clicked and none can be found by searching. Then enter the same character
by code point in the pane's "Add any character by code point" field and it is
accepted without complaint.

The accepting path is the one that loses the answer. A character added that way
is routed by general category into the draft store's controls bucket, and the
punctuation page renders only the punctuation bucket — so the character the
author just added appears nowhere on the page they added it from, and the step's
result excludes it from the confirmed inventory. It resurfaces only in a
"Control/other" section on a different page. The author gets no error, no
confirmation, and no character.

Nor does it have a name while any of this is happening. The punctuation chips
label characters with a bare `U+XXXX`. A label map with human-readable names for
invisible characters does exist, but it is imported only by the carve and assign
surfaces; neither the character-map pane nor the punctuation step uses it, and it
has no entry for WORD JOINER. So the one path that accepts an invisible character
shows the author a blank glyph beside a bare code point, and then discards it.

Refused in one input, hidden from another, accepted-and-dropped by a third. The
escape hatch is not the problem — it is the only route that exists, and there is
no other Unicode-browsing surface in the studio to move it to. The problem is
that it is unlabelled, unexplained, and lossy, and that the question it belongs
to has never been written.

### The invariant this feature names

[spec.md](../../spec.md) §3c already states the posture. What this feature adds
is the boundary condition that makes it checkable on an inventory question:

> **If the studio can name the character, the studio proposes the character.**
> A character the studio holds evidence for arrives already chosen, carrying its
> provenance, for the author to remove. A character the studio cannot name is
> asked for with a hint. A character the studio silently keeps is a bug; a
> character the studio silently discards is a worse one; and a character the
> studio accepts, unnamed, through a field it then drops the result of belongs
> to a question nobody has written yet.

The three gaps above are the three ways that invariant is currently broken on
one page: evidence held but not proposed (CLDR), a character kept but not named
(base punctuation), and a character that three inputs on one page refuse, hide
and silently swallow respectively (invisibles).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - CLDR punctuation arrives already chosen (Priority: P1)

As a keyboard author for a language CLDR knows, I want to arrive at "Choose your
punctuation" and find my language's punctuation already in the chosen list, so
that my job is to remove what my language does not use rather than to re-enter
data the studio already looked up.

**Why this priority**: This is the reported defect and the whole of Matt's first
sentence. It is also the smallest slice that stands alone — pre-populating the
CLDR tier is strictly better than today's empty start even if base punctuation
is never offered, invisible characters never get a question, and removals are
not remembered across visits. It needs no new data source, no new contract
field, and no new UI affordance: the exemplars are already fetched on this page
and the proposed attribution is already drawn.

**Independent Test**: For a set of language tags that resolve to non-empty
punctuation exemplars, enter the punctuation step, press Done without any other
interaction, and confirm the confirmed inventory equals that locale's CLDR
punctuation tier. Repeat with one removal and confirm the result is the tier
minus that character.

**Acceptance Scenarios**:

1. **Given** a resolved language tag whose exemplar record has a non-empty
   punctuation tier, **When** the author first arrives at the punctuation step,
   **Then** every character in that tier is present in the chosen list, not in a
   suggestion tray.
2. **Given** that pre-populated state, **When** the author presses Done without
   any other interaction, **Then** the confirmed inventory contains exactly that
   punctuation tier — not an empty list.
3. **Given** a pre-populated character the author's language does not use,
   **When** the author clicks it, **Then** it is removed from the chosen list, by
   the same click-to-remove gesture that removes a hand-typed character today.
4. **Given** a pre-populated character, **When** the author looks at it, **Then**
   it is visibly attributed as proposed rather than as something the author
   chose, using the existing proposed attribution, and its provenance names CLDR
   or SLDR and the locale it came from.
5. **Given** a character the author typed in by hand, **When** the step
   re-derives its proposals, **Then** the author's own character is never
   restyled as proposed and never removed.

---

### User Story 2 - Base-keyboard punctuation is declared, not assumed (Priority: P2)

As a keyboard author, I want the punctuation my base keyboard already types to be
offered to me as a second proposed group, so that the punctuation my keyboard
ships with is something I confirmed rather than something that rode along
invisibly.

**Why this priority**: This is Matt's second sentence and it is independently
valuable — it closes the "silently always-kept" gap even for a language CLDR
does not cover, and it is the only story that produces a declared answer where
today there is no answer at all. It is P2 rather than P1 because the CLDR gap is
the reported one, because this story needs coverage data the punctuation step
does not read today, and because it carries the unresolved policy question
below.

The pattern this story follows already exists for letters and is **not** being
rebuilt: the convenience question is a spine step between punctuation and carve
that computes its own gate, renders nothing when the base yields no surplus
basic-Latin letters, and arrives pre-checked when it does. Story 2 is that
established shape applied to punctuation.

**Independent Test**: With a base keyboard whose produced-glyph set includes
punctuation, enter the step and confirm a distinct proposed group appears
carrying those characters attributed to the base. Press Done untouched and
confirm they are in the confirmed inventory. Repeat with a base whose coverage
cannot be computed and confirm the ASCII floor is offered instead.

**Acceptance Scenarios**:

1. **Given** a base keyboard whose produced-glyph set contains punctuation,
   **When** the author arrives at the step, **Then** those characters appear as a
   proposed group labelled as punctuation the base keyboard already types,
   visually distinct from the CLDR group.
2. **Given** that group, **When** the author presses Done without interaction,
   **Then** those characters are in the confirmed inventory, so the punctuation
   the keyboard supports is a declared answer rather than an assumption inside
   carve.
3. **Given** a character present in both the CLDR tier and the base-produced set,
   **When** the step renders, **Then** it appears exactly once, attributed to
   both sources, and is counted once.
4. **Given** a base whose output cannot be fully determined — coverage is
   reported incomplete because opaque source fragments make the produced set
   unknowable — **When** the author arrives, **Then** the basic-ASCII floor
   (U+0021–U+002F, U+003A–U+0040, U+005B–U+0060, U+007B–U+007E) is proposed
   instead of a claimed base set, and the uncertainty is stated in the group's
   label rather than hidden.
5. **Given** a base whose produced punctuation is known, **When** the proposed
   base group is computed, **Then** it contains every punctuation character that
   base can produce — not a curated subset, and not the ASCII range with the rest
   held back — and the ASCII floor plays no part.
6. **Given** an author who removes a base-proposed character, **When** they press
   Done, **Then** that character is absent from the confirmed inventory and the
   removal is recorded, even though carve's always-keep rule means the base may
   still emit it — the declared inventory and carve's behaviour must not silently
   disagree.
7. **Given** the studio's treatment of base characters as a whole, **When** the
   punctuation default is specified, **Then** the intended default for each
   character family is stated rather than assumed — punctuation and symbols,
   letters and marks, and base ASCII letters on a non-Latin target are three
   different cases today and the spec must say which behaviour each is meant to
   have.

---

### User Story 3 - Invisible characters get a named question (Priority: P3)

As a keyboard author whose orthography needs a zero-width non-joiner, I want a
question that names the invisible format characters, explains when a language
needs each one, and keeps the one I pick, so that I stop guessing at code points
in a field that accepts them and then throws them away.

**Why this priority**: This is Matt's third sentence. It is neither a new build
nor a relocation — it is the **promotion of an existing escape hatch into a real
question**. The characters are already reachable today, through the pane's "Add
any character by code point" field, which accepts every one of them. What is
missing is a question that names them, labels them, says when they are needed,
and does not discard the author's pick. It is P3 because Stories 1 and 2 improve
the punctuation question without it, and because promoting a lossy path needs a
carry-over rule the earlier stories do not.

**Independent Test**: Add ZWNJ through the punctuation pane's code-point field
today and observe that it appears nowhere on the page and is absent from the
step's confirmed inventory — that is the baseline. Then, with the feature,
confirm the invisible-character question offers it by name with an explanation,
that selecting it puts it in the confirmed inventory, and that a saved answer in
which an author already added an invisible through the code-point field arrives
with that character still selected.

**Acceptance Scenarios**:

1. **Given** the invisible-character question, **When** it renders, **Then** it
   offers at minimum ZWJ (U+200D), ZWNJ (U+200C), ZWSP (U+200B), SOFT HYPHEN
   (U+00AD) and WORD JOINER (U+2060), plus the bidi controls the existing
   allowlist covers where the script warrants it — so every character today
   reachable only by code point is reachable by name.
2. **Given** any offered character, **When** the author reads its entry,
   **Then** it shows a human-readable name, its U+ notation, and a one-line "you
   need this if…" statement. Today the same character renders as a blank glyph
   beside a bare `U+XXXX`.
3. **Given** the author selects an invisible character, **When** they confirm the
   question, **Then** the character is in the confirmed inventory. It MUST NOT
   vanish into a controls bucket that the page does not render and the step's
   result does not report — the silent loss is the defect this story fixes.
4. **Given** an author who types an invisible character into the punctuation
   step's input box, **When** it is recognised, **Then** they are routed to the
   invisible-character question with that character pre-selected, rather than
   being told it was skipped while the same character is accepted by the
   code-point field on the same page.
5. **Given** a saved answer in which the author had already added an invisible
   character through the code-point field, **When** they reopen the survey after
   this question exists, **Then** that character is carried across as an accepted
   answer on the new question — the split does not drop a choice already made,
   including one made on the alphabet scope rather than the punctuation scope.
6. **Given** a selection on the invisible-character question, **When** the author
   confirms it, **Then** an unselected offered character is recorded as declined
   rather than simply absent, so a reviewer can tell an author's "no" from a gap.
7. **Given** a script with no plausible need for any offered invisible character,
   **When** the question is reached, **Then** the studio proposes none selected
   and says why, rather than presenting an unexplained blank multi-select.
8. **Given** this question exists, **When** an RTL script is being surveyed,
   **Then** the author is asked about direction marks once, not twice — this
   question subsumes the existing RTL-only advisory direction-marks question
   rather than duplicating it.

---

### User Story 4 - A rejection sticks (Priority: P4)

As a keyboard author who has already removed the characters my language does not
use, I want them to stay removed when I come back to the step, so that
auto-population is a head start and not a chore I redo every visit.

**Why this priority**: Without it, Story 1 turns a one-time click burden into a
recurring one, which is worse than the defect it fixes. It is P4 because it only
bites on the second visit, and because Stories 1 to 3 are demonstrable and
shippable in a single pass through the survey.

**Independent Test**: Enter the step, remove two proposed characters, leave the
step, re-enter it, and confirm those two are still absent while the rest of the
proposal is intact. Then change the language tag to one whose exemplars are
re-resolved and confirm the same two are still absent if they are still proposed.

**Acceptance Scenarios**:

1. **Given** the author removed a proposed character, **When** they leave and
   return to the punctuation step, **Then** that character is not re-proposed and
   the remaining proposals are unchanged.
2. **Given** the same removal, **When** the language tag is re-resolved and the
   exemplar set is recomputed, **Then** the removed character is still not
   re-proposed.
3. **Given** a removed character, **When** the author types that same character
   in by hand, **Then** it is added as an author-chosen character and the earlier
   rejection no longer suppresses it.
4. **Given** an author who completed the punctuation step before this feature
   shipped, **When** they reopen the step, **Then** their saved answer is not
   overwritten and characters they had not chosen are not retroactively proposed
   over it.

---

### Edge Cases

- **No exemplars resolve.** The language tag is confidence-gated, or its
  macrolanguage is on the exemplar blocklist, or the tag is simply absent from
  the offline index. The CLDR group is then empty and must be shown as absent
  with a reason, not as an empty tray; the basic-ASCII floor is the only
  proposal, and the step must remain completable.
- **Empty punctuation tier for a resolved locale.** The locale record exists but
  its punctuation exemplar set is empty. This is distinct from "no exemplars
  resolved" and must not be reported as a lookup failure.
- **A CLDR punctuation character the base cannot produce.** Accepting it is real
  placement work, not free. It must be counted in the missing side of the
  inventory delta and be visible as such before Done, so pre-population cannot
  quietly inflate the amount of keyboard the author has to build.
- **Normalization.** Proposed characters are compared and stored in the same
  normalized form the draft store already uses, so a proposal, an author-typed
  character and a base-produced character that are the same character
  de-duplicate to one entry rather than appearing twice.
- **The phase-C result quirk.** The step reports its result under phase "C" and
  not "B" specifically because same-phase results are shallow-merged and a phase
  "B" result would clobber the alphabet step's confirmed inventory. Any change to
  the result shape must preserve that, and a test must pin it — this is a
  correctness trap, not an implementation detail.
- **Overlap between the two proposed groups.** A character in both the CLDR tier
  and the base-produced set is proposed once with both attributions. Counting it
  twice would misreport inventory size; proposing it twice would look like a bug
  to the author.
- **An author who already added an invisible through the code-point field.**
  Their character is sitting in the controls bucket, absent from the punctuation
  answer, surfaced only on the alphabet page's "Control/other" section. The new
  question must adopt it as an accepted decision — not drop it, not duplicate it
  into two answers, and not re-ask it as though it had never been decided.
- **An invisible added on the alphabet scope rather than the punctuation scope.**
  The same code-point field exists there. A character entered from that scope
  reaches the same bucket and must be carried over on the same terms; the split
  must not be scoped to whichever page the author happened to be on.
- **A multi-codepoint grapheme mixing punctuation with a format character.** The
  category test that routes characters runs over the whole string, so a cluster
  combining a punctuation mark with a format character classifies as punctuation
  and is filed as punctuation. Such a cluster must not be silently split, and
  must not smuggle a format character into the punctuation answer where no label
  or explanation will ever be attached to it.
- **A character that is both punctuation and format-adjacent.** A soft hyphen
  behaves like punctuation to an author even though Unicode calls it a format
  character. The split must state which question owns each such character rather
  than letting it fall between the two.
- **A rejection of a character that later stops being proposed.** The rejection
  record outlives the proposal. It must not resurrect the character, and it must
  not accumulate unboundedly for characters no source ever proposes again.
- **Base ASCII letters on a non-Latin keyboard.** A third inheritance path
  already exists and may overlap this feature's base group: ASCII Latin letters
  surfacing on a non-Latin target through desktop base-layout fall-through are
  deliberately not hard-excluded. They flow through the ordinary guard chain and,
  if they survive it, are tagged as a separate optional low-priority removal
  group rather than kept silently or mixed into the primary recommendation. A
  punctuation default must not contradict that treatment for the ASCII
  punctuation arriving by the same fall-through.
- **Interaction with the always-keep carve rule.** An author who declines a
  base-produced punctuation character has expressed an intent carve currently
  cannot honour. The disagreement must be surfaced or explicitly deferred, never
  resolved by silently ignoring the author.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: On first arrival at the punctuation step, the studio MUST
  pre-populate the chosen punctuation list with the resolved locale's CLDR/SLDR
  punctuation exemplar tier — the same set the step already computes via
  `useSourcedExemplars` and the `"punctuation"` tier filter — rather than
  presenting it as a tray of unclicked suggestions.
- **FR-002**: Pre-populated characters MUST carry proposed provenance, MUST be
  rendered with the existing proposed attribution so the author can tell at a
  glance which characters they chose and which the studio proposed, and that
  provenance MUST name the supplying source — CLDR or SLDR with the resolved
  locale, the base keyboard, or the ASCII floor. A character supplied by more
  than one source MUST carry all of them.
- **FR-003**: Pressing Done with no interaction MUST yield a confirmed inventory
  containing the proposed set. An empty confirmed punctuation inventory MUST only
  be reachable by the author removing everything.
- **FR-004**: Every proposed character MUST be removable by the same
  click-to-remove gesture that removes an author-chosen character today; the
  studio MUST NOT require a confirmation dialog or a separate mode to reject a
  proposal.
- **FR-005**: The studio MUST NOT modify, restyle or remove characters the author
  entered by hand when it computes or recomputes proposals.
- **FR-006**: The studio MUST surface punctuation the base keyboard already
  produces as a proposed group distinct from the CLDR group, derived from the
  existing produced-glyph and inventory-delta machinery (`buildProducedSet`,
  `computeInventoryDelta`, and the `inBaseOutput` contract field) rather than
  from a new base analysis.
- **FR-007**: The basic-ASCII punctuation floor (U+0021–U+002F, U+003A–U+0040,
  U+005B–U+0060, U+007B–U+007E) is a **fallback**, not a policy. The studio MUST
  propose it in place of the base group when, and only when, base coverage cannot
  be determined — the base cannot be resolved, or coverage is reported incomplete
  because opaque fragments make the base output unknowable. Where the base set is
  known, the base set is the proposal, whether it is wider or narrower than the
  floor.
- **FR-008**: When base coverage is reported incomplete — `coverageComplete` is
  false because opaque fragments make the produced set unknowable — the studio
  MUST state that the base set is not fully known and MUST NOT present a partial
  base set as if it were complete.
- **FR-009**: The base group MUST propose **every** punctuation character the
  base keyboard can produce, taken from the existing base-coverage machinery. It
  is not a curated subset and it is not the ASCII range with extras added. The
  degradation rule is one-way and explicit: where that set cannot be determined,
  and only there, the basic-ASCII floor of FR-007 stands in for it.
- **FR-010**: Proposed characters MUST be normalized to the same form the draft
  store uses before de-duplication, and a character proposed by more than one
  source MUST appear exactly once in the UI and be counted exactly once in the
  inventory.
- **FR-011**: A confirmed punctuation character the base cannot produce MUST be
  counted on the missing side of the inventory delta, so the placement work
  implied by accepting a proposal is visible before the author leaves the step.
- **FR-012**: The intended base-inheritance default MUST be stated per character
  family rather than assumed to be one rule. Punctuation, numbers and symbols are
  shielded from removal recommendations today; letters and marks are eligible for
  them and are asked about by the existing convenience question; base ASCII
  letters on a non-Latin target are tagged as a separate optional group rather
  than either. Whatever default this feature sets for punctuation MUST be
  written as a deliberate choice against those three, not inherited by silence.
- **FR-013**: The studio MUST offer a question, distinct from the punctuation
  question, covering invisible format characters — at minimum ZWJ (U+200D), ZWNJ
  (U+200C), ZWSP (U+200B), SOFT HYPHEN (U+00AD) and WORD JOINER (U+2060) — plus
  the bidi controls covered by the existing allowlist where the script warrants
  it. Every character reachable today only by code point MUST be reachable by
  name.
- **FR-014**: An invisible character the author selects MUST reach the confirmed
  inventory. It MUST NOT be routed by general category into a draft-store bucket
  that no question renders and no step result reports, which is what happens
  today to a character added through the pane's code-point field.
- **FR-015**: Every offered invisible character MUST carry a human-readable name,
  its U+ notation, and a one-line statement of when the author needs it. The name
  MUST come from the existing invisible-character label helper, extended to cover
  U+2060 WORD JOINER, rather than from a second parallel label map; the bare
  `U+XXXX` label the punctuation chips use today is not sufficient.
- **FR-016**: The punctuation page's input paths MUST stop disagreeing. An
  invisible character typed into the input box MUST NOT be declined as
  wrong-category while the same character is accepted by the code-point field on
  the same page; it MUST be routed to the invisible-character question with that
  character pre-selected. No character the author enters anywhere in the survey
  may be discarded without a stated reason.
- **FR-017**: Introducing the invisible-character question MUST NOT drop an
  answer the author already gave. An invisible character previously added through
  the pane's code-point field — on the punctuation scope or the alphabet scope —
  MUST be carried across as an accepted decision on the new question, and MUST
  NOT be silently removed or silently duplicated into both answers.
- **FR-018**: The invisible-character question MUST record declined offers as
  declined, distinguishable from never having been asked, so a later reviewer can
  tell an author's "no" from a gap.
- **FR-019**: The invisible-character question MUST subsume the existing RTL-only
  advisory direction-marks question rather than duplicate it, so an RTL author is
  asked about a given direction mark once.
- **FR-020**: Where the invisible-character question sits MUST be resolved:
  [NEEDS CLARIFICATION: a spine step in the phase-B order alongside marks,
  punctuation and convenience, which asks every author about invisibles, or a
  side trail reachable from the punctuation step that rejoins the spine, which
  asks only authors whose script or typing suggests they are relevant? The
  convenience question offers a third shape — a spine step with a computed gate
  that renders nothing when there is nothing to ask.]
- **FR-021**: The fate of the pane's code-point entry field MUST be resolved:
  [NEEDS CLARIFICATION: does "Add any character by code point" remain available
  on the punctuation scope once the named invisibles question exists — keeping an
  escape hatch for characters no question offers, at the cost of a second route
  that can reintroduce the routing loss — or is it removed from that scope so the
  named question is the only way to reach a format character?]
- **FR-022**: A character the author removed from a proposal MUST NOT be
  re-proposed when the step is revisited or when the language tag is re-resolved.
  Typing that character in by hand MUST override the rejection.
- **FR-023**: An author who completed the punctuation step before this feature
  shipped MUST NOT have their saved answer overwritten or retroactively extended
  by new proposals.
- **FR-024**: The punctuation step's result shape MUST continue to report under
  phase "C" so that the alphabet step's confirmed inventory is not clobbered by
  the shallow same-phase merge, and this MUST be pinned by a test rather than left
  as a comment.
- **FR-025**: Every character the author adds through any input on a survey step
  MUST either appear in that step's confirmed result or be visibly declined with
  a reason. A write that produces neither outcome MUST fail a test rather than
  pass silently.

### Key Entities

- **Proposed punctuation character**: a character the studio puts into the chosen
  list on the author's behalf. Carries the character itself, its normalized form,
  and one or more provenance entries. Distinct from an author-chosen character
  only by provenance and attribution — it is in the same list, removable by the
  same gesture.
- **Proposal provenance**: where a proposal came from — the CLDR/SLDR exemplar
  tier with its resolved locale, the base keyboard's produced set, or the ASCII
  floor. A character may carry several. Drives both the visible attribution and
  the de-duplication in FR-011.
- **Base punctuation coverage**: the punctuation subset of the base keyboard's
  produced-glyph set, together with a completeness flag. When completeness is
  false the set is a lower bound, not the answer, and must be presented as such.
- **Basic-ASCII floor**: the fixed set U+0021–U+002F, U+003A–U+0040,
  U+005B–U+0060, U+007B–U+007E. A constant, not a derivation. It is the proposal
  of last resort and the guaranteed lower bound on what is offered.
- **Invisible-character candidate**: an offerable format character with its
  codepoint, plain-language label, U+ notation, one-line need statement, and the
  script or condition that makes it relevant. The label map that exists today
  supplies part of this and is missing U+2060.
- **Rejection ledger**: the record of proposals the author removed, scoped to the
  keyboard being authored and durable across step revisits and language-tag
  re-resolution. Consulted before proposing; overridden by the author typing the
  character in by hand.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a named set of language tags whose exemplar records carry a
  non-empty punctuation tier, entering the punctuation step and pressing Done
  with zero interaction yields a confirmed punctuation inventory equal to that
  locale's CLDR punctuation tier. Measured as an exact set comparison per tag,
  across the whole named set, not a sample.
- **SC-002**: The number of clicks required to accept the studio's own punctuation
  proposal is zero. Today it equals the size of the punctuation tier.
- **SC-003**: No character appears twice across the CLDR group and the
  base-produced group, and no character is counted twice in the inventory total.
  Measured by asserting the two proposed groups are disjoint as rendered and that
  the inventory count equals the size of their union.
- **SC-004**: No invisible character is silently discarded anywhere in the
  survey. Measured by driving every survey input that accepts typed text with
  each of ZWJ, ZWNJ, ZWSP, SOFT HYPHEN, WORD JOINER and each allowlisted bidi
  control, and asserting each is either accepted, or routed to the
  invisible-character question, or refused with a stated reason — never dropped
  into an unexplained skipped list, never refused by one input on a page while
  accepted by another on the same page, and never accepted into a bucket the page
  does not render and the step result does not report. Carry-over is measured
  separately: for a saved answer containing an invisible character added through
  the code-point field, on either scope, the character is present and accepted on
  the new question afterwards.
- **SC-005**: Every character offered on the invisible-character question has a
  non-empty plain-language label and a non-empty need statement. Measured as a
  completeness assertion over the offer list, so adding a codepoint without
  explaining it fails.
- **SC-006**: A removal survives a round trip. After removing N proposed
  characters, leaving the step and returning, the chosen list contains exactly
  the original proposal minus those N, with no re-proposals. Measured for a
  step-revisit round trip and for a language-tag re-resolution round trip.
- **SC-007**: Every punctuation character in the final keyboard's output is
  accounted for in the confirmed inventory — no character reaches the output only
  because carve's always-keep rule let it through unexamined. Measured by
  differencing the emitted punctuation set against the confirmed punctuation
  inventory and asserting the difference is empty.
- **SC-008**: Across the journey corpus, the proportion of authored keyboards
  whose confirmed punctuation inventory is empty falls below a threshold to be
  set once the current rate is measured. The current rate has not been measured
  and this criterion is a measurement to take, not a result already known.

- **SC-009**: No survey write is unobservable. For every input on every survey
  step — the type-in boxes, the character-map grid, the code-point entry field —
  a character the author adds either appears in that step's confirmed result or
  is visibly declined with a reason, and a build in which it does neither fails a
  test. This covers two defects of one shape: a code-point pick that reaches no
  result and turns nothing red, and a step that stops rendering altogether while
  its walk still passes because the walk only acts when the screen appears.

## Assumptions

### Decisions taken

- **2026-09-09, repo owner** — the base punctuation proposal starts with *all*
  available punctuation: every punctuation character the base keyboard can
  produce, not a curated subset and not the basic-ASCII range as the primary
  rule. Basic ASCII is retained only as the fallback floor for the case where
  base coverage cannot be determined (FR-007, FR-009). This question is settled;
  it is not reopened by the proposal list turning out to be long.

- The offline exemplar index shipped with the engine is the source of the CLDR
  proposal. This feature does not add a network lookup and does not change which
  index is committed.
- Confidence gating, the macrolanguage blocklist, and CLDR-over-SLDR precedence
  stay exactly as [044-cldr-sldr-exemplars](../044-cldr-sldr-exemplars/spec.md)
  specifies them. A tag those rules exclude yields no CLDR proposal here, and
  that is correct behaviour, not a gap to work around.
- The proposed-versus-chosen attribution already on this page is sufficient to
  communicate provenance visually. This feature reuses it and does not introduce
  a competing visual language for defaults.
- An author who removes a proposed character means it. Removal is treated as a
  decision to record, not as an accident to guard against.
- The base's produced-glyph set is derivable at the time the punctuation step
  renders, because a base has been selected before phase B. Where it is not
  derivable, the incomplete-coverage path in FR-009 applies.
- The unrelated modular prose questions about punctuation are a different
  surface, answer a different question, and are untouched by this feature.
- Basic-ASCII punctuation is a reasonable floor for keyboards produced by this
  studio because the desktop bases in scope are ASCII-capable. This is Matt's
  "at least basic Ascii" taken at face value.

### Open decisions

A genuine choice this spec does not settle, recorded here rather than as
a clarification marker because the feature is specifiable without it and it can
be taken at plan time:

- **Whether this step starts declaring `writes`.** Consuming base coverage and
  asserting an inventory may mean the step should declare non-empty
  `inputs`/`writes` under the spec-066 declaration contract, where it declares
  both empty today — or confirming an inventory may remain a survey-result
  concern that leaves both declarations empty. The convenience step is the
  precedent and also declares both empty.

## Out of scope

- Changing the CLDR or SLDR version pins, the committed exemplar index, or the
  confidence and blocklist rules that govern it.
- Touch-layout placement of punctuation — where these characters land on a
  layout, and on which longpress, is a separate decision from whether they are in
  the inventory.
- Carve behaviour for digits and symbols. The always-keep rule covers `\p{N}`,
  `\p{P}` and `\p{S}` together; only the punctuation half is examined here, and
  changing carve's rule is not proposed.
- LDML output and any change to what is emitted for these characters.
- Rewriting the modular prose punctuation questions, which are a different
  surface answering a different question.
- Any change to how the alphabet, marks or convenience steps build their own
  inventories, beyond preserving the phase-merge behaviour they depend on.

## Dependencies

- [044-cldr-sldr-exemplars](../044-cldr-sldr-exemplars/spec.md) — supplies the
  exemplar source, the punctuation tier, the confidence gate, the macrolanguage
  blocklist, the CLDR-over-SLDR precedence rule, and the proposed attribution
  this feature reuses for Story 1.
- [051-carve-orthography-trim](../051-carve-orthography-trim/spec.md) — the
  nearest precedent for offering the author characters the base produces that the
  orthography does not require. Story 2 is that pattern applied to punctuation
  instead of basic-Latin letters.
- **The convenience question's spec home is unsettled.** The convenience step is
  the shape Story 2 follows, and it has no spec that describes it: its manifest
  entry points its `specRef` at `specs/051-carve-orthography-trim`, which never
  mentions the step, and the component itself cites a "spec v1.3.1 §3c" — the
  root spec has a §3c that matches in substance, but no such version label
  appears in it. [NEEDS CLARIFICATION: should spec 075 adopt the convenience
  step, making this the spec home for base-inheritance behaviour across both
  character families, or should the gap be closed elsewhere? This is the repo
  owner's call and is deliberately left unchecked here; spec 051 is not
  restructured or renumbered either way.]
- [020-qu-wire-buildlist](../020-qu-wire-buildlist/spec.md) — the build-list
  wiring the confirmed inventory feeds.
- [spec.md](../../spec.md) §3c and §8 — the governing doctrine and the data-flow
  position of the confirmed inventory.
- The spec-066 `inputs`/`writes` declaration contract at
  `packages/studio/src/steps/types.ts:45-47`. This step declares both empty
  today; FR-025 asks whether Story 2 changes that.
- The inventory-delta and produced-glyph machinery that Story 2 reads. It exists
  and is correct; what is missing is a consumer, not a computation.

No `plan.md`, `tasks.md` or `.spec-context.json` is included in this folder: those
are outputs of the later plan and tasks stages, and writing them here would
present a Constitution Check that was never run.
