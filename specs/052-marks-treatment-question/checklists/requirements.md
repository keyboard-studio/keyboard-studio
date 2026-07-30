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
