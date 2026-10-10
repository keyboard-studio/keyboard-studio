# Feature Specification: Steps derived from decisions

**Feature:** specs/091-derived-steps
**Branch:** cut from `main` after 090 merges (`km/derived-steps`)
**Created:** 2026-10-06
**Status:** Draft
**Series:** 4 of 6. The plan is [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md).
**Depends on:** 090 (every decision is a module).

## Summary

Spec 087 derived the **order** of steps from `provides`/`requires`, but which questions a step
shows still comes from hand-written `flowRefs` and `settles` in `stepDependencies.ts`. This spec
derives the steps themselves from the decision modules. A decision goes into the earliest slot
after everything it `requires`. Moving a decision becomes a one-line edit to its `requires`.

## User Scenarios & Testing

### User Story 1 — Moving a decision takes one edit (Priority: P1)

As the maintainer, I add a `requires` to a module and the question appears in its new place,
with nothing else edited.

**Independent Test:** in a test registry, add `requires: ["base-keyboard"]` to
`il_language_autonym`. The derived steps show it after `choose_base`, and the diff touches one
line.

### User Story 2 — The default order is unchanged (Priority: P1)

As an author, I see the same wizard as before.

**Independent Test:** the live walk visits the same screens in the same order as `main`, with the
same questions on each.

### User Story 3 — Survey screens still read as one page (Priority: P2)

Consecutive survey-question decisions merge into one screen, labelled by an optional `group` hint
(for example `"identity"`). The hint never affects order.

### Edge Cases
- A merged screen split by a newly placed custom-UI decision becomes two screens with the same
  group label. The label repeats; the order is the sort's.
- Deep links and footer navigation (spec 081) that name old step ids MUST resolve to the screen
  that now holds that step's decisions.
- Gated decisions: a screen whose decisions are all gated off is skipped, as steps are today.

## Requirements
- **FR-001** Placement rule: each decision goes into the earliest slot after every decision it
  `requires` is settled. Ties keep the current order (087's stable tie-break).
- **FR-002** Each custom-UI decision MUST get a screen of its own. Consecutive `"question"`
  renderers MUST merge into one screen, keyed by `group`.
- **FR-003** `stepDependencies.ts` (`flowRefs`, `settles`, step-level `requires` and `gatedBy`)
  MUST be deleted. `gatedBy` moves onto modules.
- **FR-004** Step ids become derived display ids. Saved answers are already keyed by decision id
  (088), so no data moves.
- **FR-005** The parity tests MUST be rewritten to assert "same order as main unless a `requires`
  edge says otherwise", not frozen literal lists.
- **FR-006** i18n message ids MUST NOT change.

## Duplication ledger

| duplicate | after 091 | retired by |
|---|---|---|
| `flowRefs` / `settles` beside module `provides` | **deleted** | 091 |
| step-level `gatedBy` beside routing | **deleted** | 091 |

## Success Criteria
- **SC-001** The one-edit test in US1 passes as a store-level test through the real `StepHost`.
- **SC-002** A live walk in `pnpm dev` matches `main`'s screen sequence and per-screen questions.
- **SC-003** The golden walk is byte-identical.
- **SC-004** `stepDependencies.ts` doesn't exist.
- **SC-005** Old step-id deep links resolve, checked by a test that lists every step id on `main`
  at 18e63aa4.
