# Feature Specification: Marks treatment question

**Feature Branch**: `052-marks-treatment-question`

**Created**: 2026-07-29

**Status**: Draft

**Input**: Redesign marks-series station S2 so it asks the three decisions actually needed — whether any composed character is prominent enough to deserve its own key, whether any mark is productive enough to deserve its own key or deadkey, and which output form results — instead of forcing a single mutually-exclusive choice framed as orthographic unithood.

## Context & governing spec

The governing spec is [specs/046-marks-question-series/spec.md](../046-marks-question-series/spec.md). This feature **amends** its FR-010, FR-011, FR-012, SC-006, and SC-007; it does not re-derive their scope. US4 additionally amends the strategy framework in [specs/007-strategy-selection/spec.md](../007-strategy-selection/spec.md) — its decision tree and its self-consistency table. (That spec's number is shared with [specs/046-i18n-localization/](../046-i18n-localization/), which is unrelated.) It also interacts with [specs/049-lowercase-diacritic-questions/](../049-lowercase-diacritic-questions/), whose case-counterpart expansion runs on the answer this station produces, and with spec §7 strategy selection.

Station S2 currently asks, once per mark-class, whether marked letters are "its own letter of the alphabet" or a letter the mark "is added to as you type", and takes one answer. Three things are wrong:

1. **The question and its use disagree.** The label asks orthographic unithood — a collation and literacy-teaching question — while the answer is consumed as a decision about which unit receives a key.
2. **The framing presupposes alphabetic writing.** "Letter of the alphabet" is a category error for Devanagari dependent vowel signs, Arabic ḥarakāt, and Hebrew niqqud, all of which reach this station.
3. **A single exclusive choice cannot state the real answer.** An orthography may legitimately want a few prominent composed characters on dedicated keys *and* a productive mark on its own key. Cameroonian tone orthographies are the motivating case.

A related defect makes the affordability signal unusable: the key budget is never supplied to the station's proposal logic, so a dedicated key is always reported as affordable. For a fully-booked base keyboard this actively reports the wrong answer and hides the correct one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record both mechanisms for one alphabet (Priority: P1)

An author whose orthography marks tone across many vowels, and which also has two composed vowels in such common use that they warrant dedicated keys, records both facts in one pass through the marks series. The productive tone mark is assigned its own key; the two common composed characters are promoted to their own keys; every other tone-bearing combination is produced by the mark mechanism. The author is also asked, in the same place, whether the mark is typed before or after its base letter.

**Why this priority**: This is the defect. Everything else in this feature improves a question that, until this story ships, cannot express the answer at all. It is independently valuable even with plain-text options and no demonstration.

**Independent Test**: Confirm an alphabet with one productive mark and several attested composed characters; answer with a productive mark key plus two promoted composed characters; verify the resulting placement worklist contains both a unit for the bare mark and units for exactly the two promoted composed characters, and that the recorded input order reaches downstream placement.

**Acceptance Scenarios**:

1. **Given** a confirmed alphabet with one mark attested on five bases, **When** the author chooses a dedicated key for the mark and promotes two composed characters, **Then** both choices are recorded and neither cancels the other.
2. **Given** the same alphabet, **When** the author promotes no composed characters, **Then** only the mark unit is produced and the outcome matches today's behaviour for that answer.
3. **Given** a mark class containing more than one mark, **When** the author sets the class-level answer and then changes one member mark, **Then** that mark carries the override and its siblings keep the class answer.
4. **Given** a script whose marks are not letters — dependent vowel signs, ḥarakāt, or niqqud — **When** the station renders, **Then** no designer-facing text asserts that a marked form is or is not a letter of an alphabet.
5. **Given** an alphabet whose marks store is empty, **When** the series runs, **Then** the station is skipped entirely, as today.
6. **Given** a mark class with exactly one mark reaching exactly one base, **When** the series runs, **Then** no screen is rendered for that class and both its treatment and promotion answers are taken from the proposal.
7. **Given** the author edits the confirmed alphabet after answering, **When** the evidence for a class changes, **Then** the affected treatment, promotion, and order answers are re-proposed and must be reconfirmed before the series can complete.

---

### User Story 2 - Understand the options by trying them (Priority: P2)

Rather than reading a description of each option, the author presses a small two-or-three-key demonstration for each one and watches what lands in the text. The demonstration uses the author's own letters and marks. For the option where the mark key is pressed *before* the letter, the intermediate state — normally invisible, because nothing appears on screen after the first press — is shown explicitly as a pending mark awaiting a letter.

**Why this priority**: The product owner's stated requirement is that the author "gets" what is being asked. Prose has already failed at this once. This story is what makes US1's question comprehensible to a community member rather than a keyboard engineer, but US1 delivers value without it.

**Independent Test**: Open the station for an alphabet with at least one attested composed character; operate each option's demonstration with pointer and with keyboard only; verify each produces the correct text for that option, that the before-the-letter option shows a pending state between presses, and that selecting an option is not triggered by operating its demonstration.

**Acceptance Scenarios**:

1. **Given** the station is showing an option, **When** the author operates that option's demonstration, **Then** the text produced matches what the finished keyboard would produce for that option, and the author's selection does not change.
2. **Given** the mark-before-letter option, **When** the author presses the mark key and stops, **Then** an on-screen pending indication shows a mark awaiting a letter, and assistive technology announces that state.
3. **Given** the letter-then-mark option, **When** the author presses the letter and stops, **Then** the letter itself is shown — making the contrast with the pending state legible side by side.
4. **Given** a touch target, **When** the options are shown, **Then** the mark-before-letter option is not offered.
5. **Given** any demonstration, **When** the author operates it, **Then** the working copy is unchanged and no diagnostic is produced.
6. **Given** the author navigates the station with the keyboard only, **When** they move between options, **Then** option selection and demonstration controls are separately reachable and neither traps focus.

---

### User Story 3 - Only be offered what actually fits (Priority: P3)

When the base keyboard has no room for additional dedicated keys, the author is not offered the option of promoting composed characters to their own keys. Instead the option is shown as unavailable with the reason stated in plain language, so the author understands why rather than making a choice the keyboard cannot honour.

**Why this priority**: This corrects a live wrong answer — today a fully-booked base is reported as having room. It is last because the question is still an improvement without it, and because it requires settling which of the project's three competing key-budget notions is canonical.

**Independent Test**: Run the station against a base keyboard with a saturated shift and modifier plane and confirm promotion is unavailable with a stated reason; run it against a base with ample free keys and confirm promotion is offered.

**Acceptance Scenarios**:

1. **Given** a base keyboard whose spare-key budget is exhausted, **When** the station renders, **Then** promoting composed characters is unavailable and a plain-language reason is shown.
2. **Given** a base keyboard with ample spare keys, **When** the station renders, **Then** promotion is offered.
3. **Given** an exhausted budget, **When** the author completes the station, **Then** at least one option remains selectable — the author is never left with nothing to choose.
4. **Given** any base keyboard, **When** the key budget is reported anywhere in the product, **Then** all reports of it agree with one another.

---

### User Story 4 - Strategy selection can see the answer (Priority: P4)

The author's recorded answer and the mechanism the studio selects can no longer contradict each other. Today the answer never reaches strategy selection at all, so a keyboard can be built on two contradictory premises at once — the author states that composed characters get their own keys while the independently-elicited diacritic-behaviour axis selects a compose-as-you-type mechanism — and nothing detects it.

**Why this priority**: Last, because it is the only story that touches the strategy framework and its self-consistency table, and therefore carries by far the widest regression surface. But it belongs in *this* spec rather than a later one: US1 triples the size of the answer while leaving it disconnected, which widens an existing contradiction rather than merely inheriting it.

**Independent Test**: Construct a case where the recorded treatment and the diacritic-behaviour axis imply different mechanisms for the same mark; verify the disagreement is resolved by stated precedence or surfaced, never silently built. Then run the strategy self-consistency table and verify every keyboard it covers still selects what it selected before, or that each changed row carries a recorded reason.

**Acceptance Scenarios**:

1. **Given** a recorded treatment that gives a mark's composed characters their own keys, **When** the diacritic-behaviour axis independently indicates a compose-as-you-type mechanism for the same mark, **Then** the contradiction is either resolved by a stated precedence or surfaced to the author — never silently built into the keyboard.
2. **Given** any keyboard covered by the strategy self-consistency table, **When** strategy selection runs after this change, **Then** it selects what it selected before, or the table is amended in the same change with a reason recorded for that row.
3. **Given** the author changes the recorded treatment, **When** strategy selection runs again, **Then** the selection reflects the change.
4. **Given** the gaps already documented as open in the self-consistency table, **When** this change lands, **Then** each is either still open with its reason unchanged, or closed with evidence.

---

### Edge Cases

- **Marks present but nothing attested.** A confirmed alphabet may carry marks with no attested combinations. There is then nothing to promote; promotion must be absent rather than empty, and treatment must still be answerable.
- **A mark attested only on an uppercase base.** The station offers only lowercase and caseless bases, and uppercase attachment is derived. A mark whose sole attested base is uppercase must still be treated as confirmed, and must not render a blank summary.
- **Caseless scripts.** No case pairs exist to derive; the derived-capitals note must not claim otherwise.
- **Promotion offered for a mark that is not getting its own key.** If every reachable combination for a mark is already a dedicated unit, promotion is a no-op and must not be offered.
- **A promoted composed character in a cased script.** Promotion is offered on lowercase and caseless bases only, so the uppercase counterpart's promotion is derived (FR-023). A cased base whose uppercase form is absent from the confirmed alphabet, or which has no single-character uppercase form, must be promotable on its own without error.
- **Exhausted budget *and* high productivity.** Both mechanisms are constrained at once. The station must still complete.
- **Target platform unknown or both.** The option set differs by platform. The station must resolve to a coherent set when the project targets desktop, touch, or both.
- **Alphabet edited mid-series.** Re-proposal must cover the new promotion and order answers, not only the treatment answer.
- **An imported base whose own behaviour contradicts the recorded answer.** The base keyboard's mechanism is one of the proposal signals, so the author may knowingly choose against it. That is a legitimate override, not a disagreement to surface under FR-024 — only a contradiction between the recorded answer and the *selected strategy* counts.
- **A mark class whose members are treated differently.** Per-mark override means one class can contain both a mark with its own key and a mark without. Strategy reconciliation must handle a class that is internally mixed rather than assuming one answer per class.

## Requirements *(mandatory)*

### Functional Requirements

**The answer**

- **FR-001**: The station MUST record, for each mark, whether that mark receives a key of its own, seeded from a per-class default that an individual mark may override.
- **FR-002**: The station MUST separately record which specific composed characters are promoted to dedicated keys.
- **FR-003**: FR-001 and FR-002 MUST be independently settable. Choosing a dedicated key for a mark MUST NOT prevent promoting composed characters, and vice versa.
- **FR-004**: The station MUST record whether a mark is typed before or after its base letter, as part of the same answer rather than as a separate question.
- **FR-005**: The recorded answer MUST produce placement units for both the bare mark and each promoted composed character when both are chosen, and every base and mark MUST remain accounted for.
- **FR-006**: A composed character reachable by more than one route MUST be permitted. Dual reachability is an intended outcome of FR-003, not an error condition.

**The question's language**

- **FR-007**: No designer-facing text in the station may assert or deny that a marked form is a letter of an alphabet, nor otherwise presuppose alphabetic writing.
- **FR-008**: No designer-facing text in the station may use production jargon, including the terms for a mark key that waits for a letter, character encoding, or character normalisation.
- **FR-009**: Every option MUST be presented as a proposal with a recommendation already selected, never as an unanswered open choice.

**Demonstration**

- **FR-010**: Each offered option MUST have an operable demonstration of two or three keys, built from the author's own confirmed letters and marks, which produces the text that option would produce.
- **FR-011**: The demonstration for the mark-before-letter option MUST show the pending intermediate state on screen and announce it to assistive technology.
- **FR-012**: Operating a demonstration MUST NOT change the author's selection, mutate the working copy, or emit a diagnostic.
- **FR-013**: Demonstrations MUST advance only in response to author action — no timed or automatic playback.
- **FR-014**: The mark-before-letter option MUST NOT be offered for a touch target, and MUST NOT be producible there by any answer the author can give.

**Key budget**

- **FR-015**: Promotion under FR-002 MUST be offered only when the base keyboard has room for the additional keys, and MUST otherwise be shown as unavailable with a plain-language reason.
- **FR-016**: The product MUST have a single authoritative key-budget determination; all other representations of key availability MUST be derived from it rather than computed independently. The derivation MUST preserve the existing exhausted-budget boundary exactly, so that strategy selection produces the same result for every keyboard it produces today.
- **FR-017**: At least one option MUST remain selectable regardless of budget.

**Screens and continuity**

- **FR-018**: The marks series MUST NOT gain a station. Folding the input-order question into this station MUST reduce the rendered station count.
- **FR-019**: A class with nothing to decide MUST render no screen, and MUST take every one of its answers from the proposal.
- **FR-020**: A change to the confirmed alphabet MUST re-propose all affected answers and require reconfirmation before the series completes.
- **FR-021**: Previously saved drafts MUST remain loadable without migration.
- **FR-022**: The output-form decision MUST remain a separate, whole-keyboard question, and MUST continue to derive its proposal from this station's answers.
- **FR-023**: Promoting a composed character MUST derive the promotion of its uppercase counterpart rather than asking about it separately, consistent with the existing convention that this station offers only lowercase and caseless bases. The derivation MUST be additive and MUST never withdraw a promotion the author made.

**Strategy consistency**

- **FR-024**: The recorded mark treatment and the diacritic-behaviour axis MUST NOT be able to disagree silently. The product MUST either derive one from the other, or detect the disagreement and surface it.
- **FR-025**: Where the two are reconciled by precedence, that precedence MUST be stated in the governing strategy specification rather than left implicit in behaviour.
- **FR-026**: Strategy selection MUST produce, for every keyboard covered by the strategy self-consistency table, the same result it produces today — or the table MUST be amended in the same change, with a recorded reason for each changed row.
- **FR-027**: A change to the recorded treatment MUST be reflected in subsequent strategy selection.

### Key Entities

- **Mark treatment**: Per mark, whether that mark earns a key of its own. Seeded per mark-class; overridable per mark.
- **Promoted composed character**: A specific base-plus-mark combination the author has elected to place on a dedicated key. A set, independent of mark treatment.
- **Mark input order**: Whether the mark is typed before or after its base. One value per keyboard; never "before" on touch.
- **Key budget**: How much room the base keyboard has for additional dedicated keys. One authoritative determination, projected wherever else availability is reported.
- **Placement unit**: What the author will later assign to a key — either a bare mark or a composed character. Produced from the above.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An author can record a productive mark key and one or more promoted composed characters for the same alphabet in a single pass through the series. This is impossible today.
- **SC-002**: An orthography whose combinations are all attested and unambiguous still confirms its marks in at most two rendered screens.
- **SC-003**: The marks series renders at most four stations, down from five.
- **SC-004**: Zero designer-facing strings in the station presuppose alphabetic writing, and zero contain production jargon. Verified by assertion, not review.
- **SC-005**: Every option the author can select has a demonstration the author can operate before selecting it.
- **SC-006**: At every point in the mark-before-letter demonstration, the pending state is represented on screen — there is no press after which the demonstration appears to have done nothing.
- **SC-007**: Zero cases in which promotion is offered on a base keyboard that has no room for it.
- **SC-008**: All reports of key availability in the product agree with one another for the same base keyboard.
- **SC-009**: Every base and every mark in the confirmed alphabet is accounted for by at least one placement unit, with nothing unclassified.
- **SC-010**: Drafts saved before this feature load unchanged.
- **SC-011**: Zero keyboards can be produced in which the recorded treatment and the selected strategy imply different mechanisms for the same mark.
- **SC-012**: The strategy self-consistency table passes for every keyboard it covers, and every row whose outcome changed carries a recorded reason.

## Assumptions

- **Prominence is derived from attestation and productivity only.** No frequency signal is introduced. The project has a text-sample prefill feature that could supply frequency; it is deliberately not used here, so "prominent" means attested with a mark of low productivity spread rather than measurably frequent.
- **Platform option sets reduce to one answer.** The touch "layer then single key" option is a placement variant of the single-key answer, and the desktop "deadkey then letter" option is an order variant of the mark-key answer. Consequently no platform-specific answer type is needed, and "deadkey discouraged on touch" is expressed by that combination being unrepresentable rather than by a warning. **This reduction is the one design judgement made on the owner's behalf and should be confirmed at plan review.**
- **The station's answer type is a locked engine contract**, so this change requires a major version bump of the owning package and a joint engine+content session per §18. It is *not* the `Pattern` schema, so Constitution Article I's stop-and-escalate does not fire; the §18 process still applies.
- **The placement-worklist shape does not change.** A promoted composed character occupies the same kind of slot a composed unit occupies today, so downstream galleries, runtime schemas, and persisted drafts are unaffected.
- **No draft migration is required**, because the station's answers are transient and never persisted — only the derived worklist and output form are.
- **The output-form question keeps its current wording constraint**, which is scoped to that station alone; this feature adds an equivalent constraint scoped to this station.
- **Amendments land with the feature.** Five requirements in the governing spec must be amended in the same change as the behaviour, not afterwards:
  - **FR-010** specifies the single mutually-exclusive per-class confirmation this feature replaces outright.
  - **FR-011** enumerates a fixed list of proposal signals, which the key-budget change alters.
  - **FR-012** describes mark input order as a separate station, which this feature retires.
  - **SC-006** states a literal five-screen ceiling for the series; SC-003 here supersedes that figure with four.
  - **SC-007** requires each unit to be classified exactly once, which must become "at least once / nothing unclassified" because FR-006 makes dual reachability intended. The corresponding "classified twice" assertion must be deleted rather than worked around.
- **Regional prefill is out of scope**, deferred to a follow-up spec: inferring the keyboards a community has likely used from its region, joining declared language tags against measured diacritic mechanism, a reverse region index, a curated dataset for vendor touch keyboards, activating the community muscle-memory facet, and converting the two existing prior-keyboard questions from unused free text into prefilled confirmation. This feature's proposals therefore continue to draw only on the confirmed alphabet, the base keyboard, and the key budget.
- **A stale design note quotes the current wording** and will need updating alongside the station.
- **The team-boundary constraint is waived for this feature, by the product owner.** Constitution Article VI asks a plan to declare which team owns a change, phrased in the singular, and this feature genuinely spans both — engine for the answer type, worklist mapping, key budget, and strategy reconciliation; content for the designer-facing wording. The owner has waived the split for this work on the grounds that both sides are being authored together. The plan's Constitution Check should therefore **record the waiver** rather than assert single-team compliance; Article VI itself is unchanged and still applies to other features.

## Dependencies

- The governing marks-series spec's amendments (FR-010/FR-011/FR-012, SC-007) must land in the same change as the behaviour.
- The key-budget canonicalisation in US3 depends on choosing among three existing competing determinations; that choice is a plan-time decision. Two constraints bound it. First, exactly one strategy-selection rule consumes the categorical availability value today — the one that appends a modifier-layer strategy when the budget is exhausted — so FR-016's projection must preserve that boundary or three keyboards in the strategy self-consistency table change outcome (`sil_euro_latin`, `armenian_mnemonic_r`, `russian_mnemonic_r`, all currently at the intermediate band). Second, the three determinations spell their bands differently (`RAlt only` / `ralt-only`, `fully booked` / `fully-booked`); reconciling the names is not sufficient, the boundary values must be reconciled too. The strategy self-consistency table must be re-run once a source is chosen.
- A separate strategy-selection rule keys on a superficially similar signal — how much of the base layout was remapped — which is **not** the key budget and is out of scope for FR-016.
- Issue [#1433](https://github.com/keyboard-studio/keyboard-studio/issues/1433) — this station's answer and the diacritic-behaviour axis can silently disagree — **is closed by this feature**, via US4. It was originally filed for deferral; the product owner brought it into scope after review found that US1 would otherwise widen the contradiction rather than merely inherit it, because it triples the size of an answer that strategy selection cannot see.
- US4 amends the governing strategy specification's decision tree and its self-consistency table. Every keyboard the table covers needs revalidation, and the gap already documented as open there for a multi-family case is directly implicated — US4 must either close it with evidence or restate it as open with its reason unchanged.
