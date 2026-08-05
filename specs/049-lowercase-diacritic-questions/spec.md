# Feature Specification: Show only lowercase base letters in the diacritic (marks) survey questions

**Feature Branch**: `049-lowercase-diacritic-questions`

**Created**: 2026-07-23

**Status**: Draft

**Input**: User description: "Hide uppercase characters in the diacritic-based survey questions."

## Why this exists

The spec-047 work established a casing convention on the "Add your whole alphabet" step:
a cased base keyboard shows only the **lowercase** of each case pair (uppercase hidden in
the character map, letter lists collapsed to lowercase), while both cases are still recorded
because the derivative keyboard is assumed to be cased too. The **diacritic-based survey
questions** that follow — the marks/attachment series ([spec 046](../046-marks-question-series/spec.md):
which base letters each combining mark attaches to, and the related composition questions —
should follow the same convention: when the script is cased, present the author with only the
**lowercase** base letters, and derive the uppercase attachments automatically rather than
asking about them a second time.

The marks series already gestures at this — `AttachmentStation` shows a "Capital letters follow
automatically" note and the engine already has `deriveCaseCounterparts` — but the base-letter
choices offered in those questions are not yet consistently restricted to lowercase, so an author
can still be shown (and asked to tick) uppercase bases that only duplicate their lowercase. This
feature makes the marks/diacritic questions present lowercase-only base letters for cased scripts,
driven by the same base-keyboard casing signal as the character step (issue #1347, and the
casing facet baked into the IR by [spec 048](../048-base-facets-in-ir/spec.md)).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Diacritic questions offer only lowercase base letters (Priority: P1)

On the marks/attachment questions for a cased-script keyboard, the author is shown the base
letters a mark can attach to as **lowercase only**. The uppercase counterparts are not listed as
separate choices — they are handled automatically — so the list is roughly half as long and free
of redundant capital/lowercase duplicates.

**Why this priority**: This is the core of the request and the direct continuation of the
spec-047 casing convention into the next step; it removes redundant choices the author would
otherwise have to tick twice.

**Independent Test**: For a cased (e.g. Latin) base, open a mark-attachment question and confirm
the offered base letters are all lowercase (or caseless) — no uppercase base appears as its own
tickable choice — while the "capitals follow automatically" affordance remains.

**Acceptance Scenarios**:

1. **Given** a cased-script base and a combining mark, **When** the attachment question renders,
   **Then** the base-letter choices are lowercase/caseless only, with no uppercase duplicate of a
   lowercase base.
2. **Given** that question, **When** the author selects a lowercase base for the mark, **Then** the
   uppercase counterpart's attachment is derived automatically (no separate question), and both are
   recorded.
3. **Given** a caseless-script base, **When** the attachment question renders, **Then** every base
   letter is shown as-is (nothing is hidden), because there is no casing to fold.

---

### User Story 2 - Uppercase attachments are still produced (Priority: P1)

Even though the author only answered about lowercase bases, the finished keyboard attaches the
mark to the uppercase counterparts too. The derived uppercase attachments flow through to the
downstream placement/carve output exactly as if they had been ticked.

**Why this priority**: Hiding the uppercase questions must not lose the uppercase behavior — the
produced keyboard has to type accented capitals. This is the correctness guarantee that makes US1
safe.

**Independent Test**: Answer a mark-attachment question for a set of lowercase bases on a cased
base keyboard; confirm the resulting attachment set (or produced output) includes the uppercase
counterparts of every cased base that was selected.

**Acceptance Scenarios**:

1. **Given** the author attached a mark to lowercase bases, **When** the marks step completes,
   **Then** the recorded/produced attachments include each cased base's uppercase counterpart.
2. **Given** a lowercase base with no single-character uppercase counterpart (or a caseless base),
   **When** attachments are derived, **Then** nothing extra is forced — only the base as entered is
   attached.

### Edge Cases

- A base letter with no uppercase counterpart (caseless script, or a lowercase with no single-
  character uppercase) is shown as entered and contributes no derived uppercase (consistent with
  the spec-047 case rule).
- An uppercase-only base the author explicitly added (no lowercase present) is shown as entered
  rather than hidden — the fold only ever hides an uppercase that duplicates a present lowercase.
- If the base keyboard is caseless, the questions are unchanged (no folding), matching the character
  step's behavior.
- The count/affordance that tells the author "capitals follow automatically" stays accurate against
  the lowercase-only list.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: When the base keyboard's script is cased, the diacritic/marks survey questions MUST
  present base-letter choices as lowercase (or caseless) only — an uppercase base that merely
  duplicates a present lowercase MUST NOT appear as its own choice.
- **FR-002**: The uppercase attachments MUST still be derived and recorded/produced for every cased
  base the author selects, without a separate question (reusing the engine's existing
  `deriveCaseCounterparts`).
- **FR-003**: Case derivation MUST respect the language's casing rules and MUST leave caseless
  letters, and letters with no single-character counterpart, untouched (consistent with spec 047
  FR-009/FR-010).
- **FR-004**: When the base keyboard is caseless, the questions MUST be unchanged (no folding).
- **FR-005**: The "capitals follow automatically" affordance/count in the questions MUST reflect the
  lowercase-only list accurately.
- **FR-006**: The casing determination MUST come from the base-keyboard casing signal (the casing
  facet baked into the IR, [spec 048](../048-base-facets-in-ir/spec.md) / issue #1347), not a
  per-question ad-hoc guess — a single source of truth shared with the character step.
- **FR-007**: The change MUST be additive to the recorded marks/attachment data: downstream
  consumers MUST continue to behave as before (the uppercase attachments were already implied).

### Key Entities *(include if feature involves data)*

- **Base-letter choice**: a base letter offered in a mark-attachment question, now restricted to the
  lowercase/caseless representative of each case pair for cased scripts.
- **Derived uppercase attachment**: the uppercase counterpart's mark attachment, computed from the
  lowercase answer via `deriveCaseCounterparts` rather than asked.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a cased base, the base-letter choices in every diacritic question contain zero
  uppercase duplicates of a present lowercase across the test samples.
- **SC-002**: For every cased base the author attaches a mark to, the completed marks step records/
  produces the uppercase counterpart's attachment (both cases covered).
- **SC-003**: On a caseless base, the diacritic questions present the identical base-letter set they
  did before this feature (no regression).
- **SC-004**: The "capitals follow automatically" count matches the number of lowercase bases that
  have an uppercase counterpart.

## Assumptions

- The base-keyboard casing signal from spec 048 / issue #1347 is available to the marks series; if
  it is not yet wired, this feature depends on that plumbing (or derives casing from the same shared
  helper in the interim).
- `deriveCaseCounterparts` (engine marks) is the single mechanism for producing the uppercase
  attachments; no new casing logic is introduced.
- The marks series' existing "Capital letters follow automatically" affordance is the intended UX;
  this feature makes the base-letter list consistent with it, not a new interaction.
- No change to the locked Pattern/ConfirmedAlphabet contracts; the uppercase attachments are derived
  display/output, not a new stored field.

## Out of scope

- The base-keyboard casing facet itself (spec 048 / issue #1347 item 1) — this feature consumes it.
- The character-step casing behavior (spec 047, already shipped).
- Any change to how marks are composed or how attachments are placed on keys beyond restricting the
  base-letter choices and deriving the uppercase counterparts.

## Related

- Issue #1347 — base-keyboard casing facet gate + lowercase-only diacritic questions (this is
  item 2).
- [spec 046](../046-marks-question-series/spec.md) — the marks/attachment question series this
  refines (`AttachmentStation`, `deriveCaseCounterparts`).
- [spec 047](../047-alphabet-inventory-categories/spec.md) — the character-step casing convention
  this continues.
- [spec 048](../048-base-facets-in-ir/spec.md) — the casing facet baked into the IR that supplies
  the signal (FR-006).
