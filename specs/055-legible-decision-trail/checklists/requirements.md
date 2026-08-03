# Specification Quality Checklist: Legible decision trail — every stage reports what it did

**Purpose**: Validate Companion specification completeness before planning
**Created**: 2026-08-02
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs) — *in the mandatory sections*. See Note 1: the Problem statement's "Observed defects" cites file paths and line numbers deliberately, as dated evidence for the requirements.
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders — User Scenarios, Requirements, Success Criteria and Out of scope read without codebase knowledge. See Note 1 for the bounded exception.
- [x] All mandatory sections completed (User Scenarios, Requirements, Success Criteria)

## Requirement Completeness

- [x] Any [NEEDS CLARIFICATION] markers are genuine ambiguities (≤3) deferred to clarify — not unresolved guesses. Zero markers remain: six questions were resolved in the 2026-08-02 clarification session; three items are deferred explicitly under **Open questions**, each named as a contained plan-time decision (see Note 2).
- [x] Each Functional Requirement is a single, testable MUST/SHOULD statement — 38 requirements (FR-001…FR-035 plus FR-005a / FR-017a / FR-019a)
- [x] Success criteria are measurable — SC-001…SC-013 state counts, percentages, or pass/fail, and eight carry an explicit "Today: …" baseline
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined — 5 prioritized user stories (P1 ×2, P2 ×2, P3 ×1), each with Given/When/Then scenarios and an independent test
- [x] Edge cases are identified — 11, including the pre-feature-record and base-swap cases
- [x] Scope is clearly bounded — 7 explicit out-of-scope items, each pointing at the spec that owns it
- [x] Dependencies and assumptions identified — Governing documents (6) plus 11 Assumptions

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria — every FR group maps to a user story's scenarios and to at least one SC
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into the specification — see Note 1

## Notes

- Items marked incomplete require spec updates before clarify or plan.
- **Note 1 — the bounded technical section is deliberate.** This is a remediation spec: it exists because a shipped build under-reports against [spec 053](../../053-decision-audit/spec.md). Its "Observed defects" (D-1…D-7) name files and lines, audited against `main` at `2f35a50e` on 2026-08-02, so each requirement is traceable to the evidence that motivated it. The spec labels these as evidence, not a task list. The requirements themselves stay technology-agnostic. Consequence to watch: line references rot — treat a stale reference as documentation drift, not as a change of requirement.
- **Note 2 — three items are deferred to plan time, and one of them gates contract work.** The spec's Open questions carry (a) how pre-feature records present their unmeasurable zeros (SC-011), (b) whether the stage roll-up restates entries or summarizes net effect (FR-023), and (c) an **unconfirmed reading** that `EditorActionSummary` is spec 053's own contract rather than a Day-1 locked type. Item (c) is not a presentation detail: FR-004's new producer and FR-005's optional counts both change that type and its zod mirror. Per [CLAUDE.md](../../../CLAUDE.md) "Pattern schema is a contract" and spec §18, confirm that reading before the contract change is made — if the type is treated as locked, the change needs a major version bump of `packages/contracts` plus a joint engine+content session.
- **Note 3 — scope is oversized by the Companion guardrail** (5 files / 10 tasks) and runs the full pipeline. The work spans `packages/contracts` (two types plus their zod mirrors), `packages/studio` (recording, headlines, impact, trail presentation), `packages/engine` (PR-summary agreement), and `content/i18n` (an optional per-question audit label plus its parity rule). US5 is marked as the first scope cut if one is needed.
