# Feature Specification: Criteria compliance page — per-keyboard approval-criteria status in the decisions-tab pattern

**Feature Branch**: `spec/084-criteria-compliance-page`

**Created**: 2026-10-05

**Status**: **Proposed** — planning spec only; no implementation.

**Input**: Owner directive 2026-10-05 (side-chat): surface the keyboard-approval
criteria on a page similar to the decisions tab, so that once the studio
creates a keyboard we can show the Keyman team it meets more criteria than
they ever realized they had — and that it is closer to approval than
human-built projects.

## Why this exists

On day one of this project the upstream keyboard-approval requirements were
pulled into the repo (`docs/criteria.md`, ~133 criteria in 17 sections, plus
the DISCUS design heuristics as section 18 and import-output as section 19 —
149 rows total in `packages/contracts/data/criteria.json`, each triaged into
one of four enforcement bands). That triage was built so the studio could
*enforce* the criteria. But there is nowhere an author — or the Keyman team —
can *see* them: no single surface answers "does this keyboard meet the
approval criteria, and which ones are still open?"

This page is that surface, and it is also the demonstration. A studio-built
keyboard arrives with 40 criteria met by construction (scaffolder-bake), the
implemented mechanical checks green, survey answers recorded, and the manual
items listed — a compliance posture no human-built submission can match
without extraordinary discipline, because no human holds 149 criteria in
their head. The page makes that posture visible, criterion by criterion, with
evidence. That is the artifact we show the Keyman team.

## The page

Follow the decisions-tab pattern (`packages/studio/src/decisions/`):
one list, grouped by the 19 criteria sections, each row collapsed by default
and expandable to its evidence. A summary header sits above the list with
counts. Like the decision trail, the value is in being complete and readable,
not clever — and like the trail's notices, the page must be honest about what
it cannot show (a partial picture is still worth reading; a false-green
picture is not).

### Status model

Each criterion resolves to exactly one status:

- **Met** — the check passed, the survey question was answered affirmatively,
  or the scaffolder guarantees it.
- **Not met** — a mechanical check failed, or a survey answer indicates
  non-compliance. Expandable to the failing evidence.
- **Not applicable** — the criterion does not apply to this keyboard
  (e.g. font criteria for a keyboard with no bundled font). Shown muted,
  counted separately, never silently hidden.
- **Needs author** — a yellow-survey criterion whose question has not been
  answered yet in this project. Expandable to the question itself, answerable
  in place where the survey infrastructure allows.
- **Needs human** — a red-checklist criterion awaiting manual confirmation.
  Expandable to the checklist text with a confirm control; confirmation is
  recorded per project.
- **Not yet checkable** — a layer-c-enforce criterion with no implemented
  check (roughly two-thirds of the band today). Rendered honestly as
  "specified but not yet enforced" — this status is load-bearing for the
  Keyman-team demonstration: it shows the criteria were *considered*, which
  is precisely the "more criteria than they realized they had" point.

### Band handling

- **scaffolder-bake (40)** — Met by construction. Evidence line: "guaranteed
  by the scaffolder" with the criterion text. These are the free rows that
  make the studio's posture visibly stronger than a hand-built keyboard's.
- **layer-c-enforce (67)** — Run the implemented checks (`KM_LINT_*` findings
  from the lint engine) against the working copy; map findings to criteria by
  `lintRuleId`. Implemented → Met/Not met. Unimplemented → Not yet
  checkable. No criterion in this band may render as Met without an executed
  check behind it.
- **yellow-survey (32)** — Resolved from the project's survey answers via
  `surveyQuestionId`. Answered → Met/Not met per the answer. Unanswered →
  Needs author.
- **red-checklist (10)** — Manual confirmations via `preSubmitChecklistText`.
  Confirmed → Met. Otherwise → Needs human.

### Summary header

Above the list: total counts per status, plus a per-band breakdown. The header
is the glanceable version of the argument — e.g. "118 of 149 resolved, 40 met
by construction" — and the list is the auditable version. Both must always
agree (computed from the same resolution pass, not separately derived).

### Evidence expansion

Expanding a row shows *why* it has its status, in the criterion's own terms:
the lint finding text, the survey question and the recorded answer, the
checklist text with its confirmation control, or the "specified but not yet
enforced" note with the criterion's `lintRuleId` for traceability. Rows never
show a bare status without reachable evidence.

## User Scenarios & Testing *(mandatory)*

### US1 — the page renders a complete, honest picture (P1)

An author opens the criteria page for a studio-created keyboard. All 149
criteria appear, grouped by section, each with a status and expandable
evidence. The summary header counts agree with the list.

**Independent Test**: fixture project with known check outcomes, survey
answers, and manual confirmations; render the page; assert every criterion
row present, statuses match the fixture's expected resolution, header counts
equal the row counts.

**Acceptance Scenarios**:
1. **Given** a project, **When** the criteria page opens, **Then** all 149
   criteria render grouped by their 19 sections with exactly one status each.
2. **Given** the rendered page, **When** the header counts are compared to the
   rows, **Then** they agree exactly.
3. **Given** a layer-c-enforce criterion with no implemented check,
   **When** its row renders, **Then** its status is "Not yet checkable" —
   never "Met".

### US2 — scaffolder-baked criteria are visibly met (P1)

The 40 scaffolder-bake criteria show as Met with "guaranteed by the
scaffolder" evidence. This is the core of the Keyman-team demonstration.

**Acceptance Scenarios**:
1. **Given** a keyboard created by the studio scaffolder, **When** the page
   loads, **Then** all 40 scaffolder-bake rows are Met without running any
   check.

### US3 — failing checks are actionable (P1)

A keyboard failing a mechanical check (e.g. version format, HISTORY.md
ordering) shows Not met with the finding text as evidence.

**Acceptance Scenarios**:
1. **Given** a working copy failing an implemented check, **When** the page
   resolves, **Then** the mapped criterion is Not met and expanding the row
   shows the finding.

### US4 — unanswered survey / unconfirmed checklist items are reachable (P2)

Yellow-survey criteria without answers show Needs author with the question
reachable; red-checklist criteria show Needs human with a confirm control.
Confirming updates the row and header counts without a page reload.

### US5 — the demonstration read (P2)

The page, shown to a Keyman team reviewer alongside a human-built keyboard's
hypothetical posture, makes the studio's case: criteria met by construction
are distinguished from criteria met by checking, and criteria not yet
enforceable are shown as considered rather than omitted. No row implies
approval — the page is a compliance picture, not a certification. Copy must
never claim the keyboard "is approved" or "will be approved".

## Non-goals

- Implementing the unimplemented layer-c-enforce checks (~two-thirds of the
  band). Separate work; this spec only requires they be surfaced honestly.
- Remediation proposals ("here's the change that would fix this") — the
  earlier-planned "second draft". Follow-up spec.
- Comparing against a specific human-built keyboard automatically. The
  demonstration is narrative (this page, shown to the team), not a
  diff tool — though the page's data model should not preclude a future
  comparison view.
- Pre-submit gating (blocking export/PR on unresolved items). This spec is
  read-only surfacing; gating is a separate decision.

## Key files (expected)

- `packages/studio/src/criteria/` — NEW: page, row, section-group components
  (decisions-tab pattern: list + expandable rows + header notices)
- `packages/contracts/data/criteria.json` + `packages/contracts/src/criteria.ts`
  — the criterion catalog and band hooks (read-only consumption; no schema
  change expected)
- Engine lint findings (`KM_LINT_*`) — consumed via `lintRuleId` mapping
- Survey answer store — consumed via `surveyQuestionId` mapping
- New per-project record for red-checklist confirmations (mirroring the
  decision record's append-only style, session/project scope TBD in
  implementation)
