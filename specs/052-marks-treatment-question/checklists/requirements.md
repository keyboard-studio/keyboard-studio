# Specification Quality Checklist: Marks treatment question

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-29
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Validation passed on the first iteration. Specific observations, so a later reader
knows what was deliberate:

- **Requirements are stated behaviourally, without code anchors.** The file/line
  evidence that motivated each requirement lives in the review record and in
  `C:\Users\thoua\.claude\plans\sleepy-growing-quasar.md`, not in the requirements
  themselves. FR-016 ("a single authoritative key-budget determination") is
  deliberately phrased as an outcome rather than naming which of the three existing
  determinations wins — that selection is a plan-time decision, recorded under
  Dependencies.
- **FR-008 and SC-004 describe jargon bans without using the jargon.** This is
  intentional: the spec must not itself introduce the terms it forbids in the UI.
  The concrete banned strings belong in the test, not here.
- **One design judgement is flagged rather than assumed silently.** The Assumptions
  section marks the reduction of the platform-specific option sets to a single
  answer type as the one call made on the product owner's behalf, and asks for
  confirmation at plan review. It is called out because if it is wrong, the answer
  model in US1 changes shape.
- **Zero [NEEDS CLARIFICATION] markers** because the three decisions that would
  have warranted them — the fate of the separate input-order station, how the work
  is split into specs, and what "prominent" means — were settled with the product
  owner before the spec was written. They are recorded as locked decisions.
- **SC-002, SC-009, and FR-022 restate inherited guarantees** from the governing
  marks-series spec rather than introducing new ones. They appear here because this
  feature could plausibly break them, so they need to be verified against this
  change, not merely assumed to hold.

## Post-write sync audit (2026-07-29)

Two specialist audits ran against the written spec — one on the constitution and the
spec corpus, one on the strategy framework. Three findings were defects in this spec
and have been **fixed**:

1. **Amendment list undercounted.** The Context header named four amendments while
   Assumptions said "all three", silently dropping FR-010 — the very requirement
   whose mechanism this feature replaces. Assumptions now enumerates all five with a
   reason each.
2. **SC-006 was missing from the amendment list.** The governing spec states a
   literal five-screen ceiling; SC-003 here supersedes it with four, so the figure
   becomes false on ship. Added.
3. **Case derivation for promoted composed characters was unspecified.** Spec 049
   guarantees uppercase counterparts are derived without a separate question, but
   this spec introduced promotion as a new dedicated-key mechanism without saying
   whether promotion propagates to the uppercase counterpart. Added as FR-023 plus
   an edge case.

Two further findings were incorporated as constraints rather than corrections:

4. **FR-016's projection must be boundary-preserving.** Exactly one strategy-selection
   rule consumes the categorical key-availability value; if canonicalisation shifts
   the exhausted-budget boundary, three keyboards in the strategy self-consistency
   table change outcome. Recorded in FR-016 and expanded under Dependencies, along
   with the band-spelling mismatch between the three competing determinations.
5. **A neighbouring rule keys on a similar-looking but different signal** (how much
   of the base layout was remapped). Explicitly excluded from FR-016's scope so it is
   not caught up in the canonicalisation.

Verified clean, no action: the changed type is genuinely an engine type and not the
locked `Pattern` schema, so Constitution Article I's stop-and-escalate does not fire;
the demonstration widget is correctly outside decision D3; specifying no-deadkey-on-touch
is platform-correct derivation rather than the forbidden touch-first authoring; the
`km-phase-break` sentinels are intact so this multi-phase feature will halt after
specify; spec 049's additive-expansion guarantee is not broken; spec 050 genuinely
could supply the frequency signal this spec declines, so that claim is honest; no S-01
to S-12 strategy card assumes a single production route, so FR-006's dual reachability
needs no catalog change; and `CLAUDE.md` gains no stale content.

**Both audit escalations were resolved by the product owner after the audit:**

- **The axis-disagreement issue was brought into scope**, not deferred. The strategy
  audit judged that deferring it made it materially worse — US1 triples the size of
  an answer that strategy selection cannot see, widening an existing contradiction
  rather than inheriting it. The owner elected to absorb it, so the spec gained
  **User Story 4** (P4), FR-024 through FR-027, SC-011, SC-012, two edge cases, and
  amendments to the strategy framework's decision tree and self-consistency table.
  Issue #1433 is now closed by this feature rather than referenced by it. This is the
  widest-regression-surface story in the spec and is deliberately last.
- **The team-boundary constraint was waived** for this feature, on the grounds that
  both engine and content sides are being authored together. Constitution Article VI
  is unchanged and still applies elsewhere; the plan's Constitution Check must
  **record the waiver** rather than assert single-team compliance. Recorded in the
  spec's Assumptions.

Re-validation after these changes: all 16 checklist items still pass. US4 introduces
no [NEEDS CLARIFICATION] markers — its one genuinely open choice (whether the two
signals are reconciled by derivation or by detection-and-surfacing) is expressed as
an either/or in FR-024, which is testable as written, with the precedence itself
required to be documented by FR-025.

---

## Implementation verification (2026-07-29, spec 052 T041)

The checklist above validates the **specification**; every item there still passes and
none was re-opened by implementation. This section is the separate walk the tasks call
for: each shipped requirement and success criterion against the behaviour that actually
landed, with the check that proves it. `[x]` = verified by a passing automated check or
a recorded measurement.

### Functional requirements

**The answer**

- [x] **FR-001** per-mark treatment seeded from a per-class default, overridable per mark
      — `treatmentFor` resolves override -> class -> prefill (`marks-foundations.test.ts`,
      "resolves override > class > prefill"); the station renders the per-mark override
      group for any class with more than one member.
- [x] **FR-002** promoted composed characters recorded separately — `promotableCharacters`
      + `MarkTreatmentAnswer.promoted`, rendered as a checkbox group
      (`MarkTreatmentStation.test.tsx`, "promotion is a set of CHECKBOXES").
- [x] **FR-003** independently settable — asserted directly ("toggling a promotion ...
      does not touch treatment") and structurally, since promotion is a separate field
      the worklist honours regardless of treatment.
- [x] **FR-004** input order recorded as part of the same answer —
      `MarkTreatmentAnswer.inputOrder`, folded group asserted present inside the
      `marks-treatment` subtree (`MarksSeriesStep.test.tsx`).
- [x] **FR-005** both the bare mark and each promoted character produce placement units —
      `worklist-and-prefill.test.ts`, "US1 AC1 / FR-005+FR-006: an own-key mark WITH
      promotions produces BOTH".
- [x] **FR-006** dual reachability permitted, not an error — the `classified twice`
      problem is deleted; asserted by its absence and by the coverage invariant passing
      on a dual-reachable worklist.

**The question's language**

- [x] **FR-007** no text presupposes alphabetic writing — asserted over a five-script
      fixture matrix (Latin cased, Devanagari, Arabic, Hebrew, caseless) against
      `/letter of the alphabet/i`, `/its own letter/i`, `/alphabet/i`.
- [x] **FR-008** no production jargon — same matrix, against `/dead ?key/i`,
      `/unicode/i`, `/normali[sz]/i`, `/codepoint/i`, `/precomposed/i`.
- [x] **FR-009** every option a proposal with a recommendation pre-selected —
      the recommended radio is pre-checked and tagged `(suggested)`; `treatmentFor`
      has no unanswered state by construction.

**Demonstration**

- [x] **FR-010** an operable two-or-three-key demo per offered option, built from the
      author's own letters — `MarkTreatmentStation.test.tsx`, demo key count bounded
      2..3 and the author's letter asserted present on a key cap.
- [x] **FR-011** the pending state shown and announced — `demo-pending` carries
      `role="status"` / `aria-live="polite"`; asserted with non-empty text.
- [x] **FR-012** operating a demo changes nothing — selection, promotion, order, and
      per-mark handlers all asserted un-called; the widget receives no store handle and
      no diagnostic sink.
- [x] **FR-013** no timed playback — asserted by advancing fake timers 10s and
      requiring the output unchanged.
- [x] **FR-014** mark-before-character not producible on touch — pinned as a
      *derivation* property over all four `(treatment, order)` combinations
      (`scaffoldTouchLayout.test.ts`): no bare waiting mark and no deadkey reference
      reaches any touch key, and the desktop deadkey resolves into a long-press `sk[]`
      menu rather than being dropped.
      **Limit, recorded not hidden:** the requirement's *first* clause ("not offered for
      a touch target") is satisfied only vacuously, because the spine routes every
      project through both the desktop and touch steps — there is no touch-only target
      to withhold an option from (research D5). The second, load-bearing clause is the
      one verified above.

**Key budget**

- [x] **FR-015** promotion offered only where there is room, else unavailable with a
      plain-language reason — `promotion-unavailable-reason-<classId>` present iff
      unaffordable, asserted free of jargon; the proposal is withheld rather than
      silently offered.
- [x] **FR-016** one authoritative determination, boundary preserved —
      `packages/contracts/src/keyBudget.ts` is the only measurement; the facet
      classifier delegates to it; the A7 projection is asserted total and bijective,
      with rule 10's predicate firing on exactly one band. Corpus evidence: re-running
      `facet-index` over 927 keyboards changed **zero** classified values.
- [x] **FR-017** at least one option always selectable — asserted at both affordable
      and unaffordable bands; the budget gates promotion only, never treatment.

**Screens and continuity**

- [x] **FR-018** the series does not gain a station, and folding reduces the count —
      `MarksStationId` is four members; asserted at most four rendered screens.
- [x] **FR-019** a class with nothing to decide renders no screen and takes every
      answer from the proposal — asserted, including that the derived worklist still
      reflects the proposal.
- [x] **FR-020** an alphabet edit re-proposes all affected answers and requires
      reconfirmation — treatment re-seeded, overrides pruned, promotions pruned to
      still-reachable pairs, order re-seeded only when not explicitly set; asserted to
      return to the first station.
- [x] **FR-021** previously saved drafts load without migration — `draftPersistence.test.ts`,
      a pre-052-shaped phase result round-trips byte-identically with no `computedAxes`
      invented.
- [x] **FR-022** the output-form decision stays a separate whole-keyboard question,
      still derived from this station — `resolveOutputFormProposal` now reads
      "at least one mark resolves to own-key"; its own station is untouched.
- [x] **FR-023** uppercase counterpart derived, additively, never withdrawing —
      `expandCaseCounterpartPromotions`; asserted additive (result is a superset of the
      input), tolerant of a base with no single-character uppercase form, and inert for
      caseless scripts.

**Strategy consistency**

- [x] **FR-024** the two cannot disagree silently — derivation (`deriveMarksComputedAxes`)
      plus a post-`selectStrategy` surface (`surfaceStrategyDisagreement`). The check runs
      on the *selection*, so a knowingly-overridden base mechanism stays silent, which is
      asserted as its own case.
- [x] **FR-025** the precedence is stated in the governing strategy spec — 7.2 gains an
      explicit three-level precedence (recorded answer > base-derived fill >
      script-class prior).
- [x] **FR-026** every covered keyboard selects what it selected before — the 7.5 suite
      was re-run: all 13 rows unchanged, so no row required amendment; the revalidation
      is recorded in 7.5 with the reason it held.
- [x] **FR-027** a treatment change is reflected in subsequent selection — asserted at
      axes where A4 is the deciding input (A1=small / A3=weak, so rule 7 rather than
      rule 5 decides).

### Success criteria

- [x] **SC-001** a productive mark key *and* promoted characters recorded in one pass —
      the dual-reachability worklist test is exactly this case.
- [x] **SC-002** a fully-attested orthography still confirms in at most two screens.
- [x] **SC-003** at most four stations rendered.
- [x] **SC-004** zero designer-facing strings presuppose alphabetic writing or carry
      jargon — verified by assertion over the five-script matrix, not by review.
- [x] **SC-005** every selectable option has an operable demonstration.
- [x] **SC-006** no press leaves the pending demo appearing to have done nothing —
      asserted for *every* press in the prefix demo.
- [x] **SC-007** zero cases of promotion offered where there is no room.
- [x] **SC-008** all reports of key availability agree — there is now exactly one
      measurement; the facet index delegates to it and A7 is its projection.
- [x] **SC-009** every base and mark accounted for by at least one unit, nothing
      unclassified — `verifyWorklistCoverage`, asserted empty under dual reachability
      and still reporting a genuinely unclassified mark.
- [x] **SC-010** pre-feature drafts load unchanged.
- [x] **SC-011** the recorded treatment and the selected strategy cannot imply different
      mechanisms — the agreeing case surfaces nothing; the contradicting case surfaces.
- [x] **SC-012** the self-consistency table passes for every covered keyboard, with every
      changed row reasoned — zero rows changed, so the reason set is empty by
      construction; the revalidation itself is recorded.

### Deviations from the design artifacts, recorded

1. **`KeyBudget` carries a fourth field.** [contracts/key-budget.md](../contracts/key-budget.md)
   pins `band` / `spareKeys` / `notes`; the shipped interface adds
   `planes: { shiftBound, altgrBound, stockKeys }`. Reason: the facet classifier reports
   the total bound-key count as its `evidenceSize`, and the only alternatives were
   re-deriving the plane analysis inside the tool — the exact duplication FR-016 exists
   to remove — or parsing the counts back out of the `notes` prose. Additive; nothing
   reads fewer fields than before.
2. **`@keyboard-studio/contracts` bumped 0.16.0 -> 0.17.0.** Not in `tasks.md` (which
   bumps only the engine). US3 adds a new locked surface to contracts (`keyBudget.ts`,
   its zod mirrors and drift guards, and the relocated pinned table), and this package's
   own convention bumps its 0ver minor for every locked-surface change. Recorded in
   [docs/spec-signoff.md](../../../docs/spec-signoff.md) alongside the engine bump.
3. **The facet-index artifact diff is one line, not zero.** T033 says "expect no change".
   The measurement did not change — the structural diff over 927 keyboards shows exactly
   one differing leaf, `manifest.referencePins[].file`, the recorded *path* of the
   relocated table, whose `sha256` is unchanged and therefore proves the bytes are
   identical. Zero `Categorization` values moved. Accepted as a path rename, not as a
   measurement change.
