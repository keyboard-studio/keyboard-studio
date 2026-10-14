# Specification Quality Checklist: Decision store — one record per decision

**Purpose**: Validate specification completeness before planning
**Created**: 2026-10-06
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details beyond the domain's own vocabulary — the stakeholder
  for maintainer stories is the studio's own developer, and the spec's named types
  (`DecisionSet`, `gatedBy`, store names) are the project's ubiquitous language and
  the literal subject of the change (retiring named duplicates), as in spec 087's
  checklist precedent.
- [x] Focused on user value — US1/US3/US4 are author-visible guarantees (answers and
  history survive reloads, moves, and a version bump); US2 is the maintainer
  guarantee that routing cannot disagree with what was saved.
- [x] All mandatory sections completed — User Scenarios, Edge Cases, Functional
  Requirements, Key Entities, Duplication Ledger, Success Criteria, Assumptions.

## Requirement Completeness

- [x] Requirements are testable and unambiguous — every FR is a MUST with a
  pass/fail reading (FR-004 names the file and call sites to delete; FR-007 names
  the version numbers; FR-009 names the three suites that must pass unmodified).
- [x] Success criteria are measurable — SC-001 (Playwright reload walk), SC-002
  (zero grep hits), SC-003 (100% fixture accounting), SC-004 (parity green
  unmodified), SC-005 (real-StepHost moved-question test).
- [x] Success criteria are measured in the live app — the spec's own lesson from
  087 is stated in its header and honoured by SC-001/SC-005's harnesses.
- [x] All acceptance scenarios are defined — US1 (2), US2 (2), US3 (2); US4 carries
  an Independent Test in place of scenarios.
- [x] Edge cases are identified — multi-provide split rule, gallery answers held
  until 090, two-store disagreement (session field wins, console-only).
- [x] Scope is clearly bounded — the duplication ledger names what 088 retires and
  what stays for 089/090/093; Assumptions bound gallery behaviour.
- [ ] No [NEEDS CLARIFICATION] markers remain — **one open point, recorded as
  OPEN-088-1 in [plan.md](../plan.md)**: US3 AC2 requires an unmapped v1 answer be
  "shown to the author" but does not name the surface. This is the owner's call;
  the plan deliberately does not choose one, and task T030 is blocked on it. All
  other requirements are clarification-free.

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — FR-001/003/007
  via US1+US3; FR-004/005 via US2; FR-008 via US4; FR-002/006/009/010 via SC-002/
  SC-004 and the plan's constraint list.
- [x] User scenarios cover primary flows — answer → reload (US1), routing (US2),
  old-draft load (US3), trail review after a move (US4).
- [x] Feature meets measurable outcomes defined in Success Criteria — SC-001..005
  each trace to at least one story and one quickstart validation.
- [x] Dependencies identified — series position 1 of 6; 089/090/093 consume this
  spec's store, provenance value, and draft version respectively.

## Notes

- Checklist completed during `/speckit-plan` (the specify step for 088 was written
  directly as part of the 088–093 split, so no checklist existed before planning).
- One unchecked item by design: OPEN-088-1 awaits the owner's ruling and does not
  block planning or tasks T001–T029/T031–T038.
