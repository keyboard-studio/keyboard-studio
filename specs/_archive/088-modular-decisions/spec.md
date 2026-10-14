# Feature Specification: Decision store — one record per decision

**Feature:** specs/088-modular-decisions
**Branch:** `km/modular-decisions`
**Created:** 2026-10-06
**Status:** Draft
**Series:** 1 of 6 in the "decisions modular underneath" effort. The source plan is
[HANDOFF.md](HANDOFF.md), and [decision-spine.html](decision-spine.html) is the overview.

| # | spec | delivers |
|---|---|---|
| **1** | **088 decision store (this spec)** | one live record per decision; answers saved by decision id |
| 2 | [089 decision apply](../089-decision-apply/spec.md) | question decisions write only through `apply` |
| 3 | [090 gallery decision modules](../090-gallery-decision-modules/spec.md) | galleries and pickers become modules; overlays become decision values |
| 4 | [091 derived steps](../091-derived-steps/spec.md) | steps placed from `requires`; `stepDependencies.ts` retired |
| 5 | [092 live extraction](../092-live-extraction/spec.md) | starting-point values seed decisions in the live wizard |
| 6 | [093 derived keyboard](../093-derived-keyboard/spec.md) | keyboard rebuilt from decisions; changes recalculate |

**Governing rule for the series:** decisions are the only stored state, and the keyboard is
derived from them. Every fact is stored once. Each spec retires the duplicates it can and names
which later spec retires the rest (see "Duplication ledger").

**Lesson from 087:** every success criterion is measured in the live app, as a Playwright walk in
`pnpm dev` or a store-level test that drives the real `StepHost`. Results from `DecisionsDemo` or
`sc004Harness` don't count.

## User Scenarios & Testing

### User Story 1 — Answers survive a reload under their decision id (Priority: P1)

As an author, I answer the identity, track and project-name questions, then reload. Every answer
comes back, because it was saved under its decision id, not under the step that asked it.

**Why this priority:** it is the foundation every later spec writes into. Today a question moved
to another step loses its saved answer on resume.

**Independent Test:** walk identity, track and project_name in `pnpm dev`, reload, and confirm
every answer is restored. Then confirm the saved draft holds those answers only in its
`decisions` slice.

**Acceptance Scenarios:**
1. **Given** an author who answered `language-code`, `copyright-holder` and `authoring-track`,
   **When** the page reloads, **Then** each answer is restored with the same value and provenance.
2. **Given** a test registry in which `il_copyright_holder` is moved to a different step,
   **When** a draft saved before the move is loaded, **Then** the answer is still present.

### User Story 2 — One store drives routing (Priority: P1)

As the maintainer, I want `gatedBy` to read one live decision store, so routing can't disagree
with what was saved.

**Why this priority:** `decisionsFromTraversal` currently rebuilds a two-entry set from session
fields on every call. That set is a second copy of `authoring-track` and `touch-seed-source`.

**Independent Test:** delete `decisionsFromTraversal`, and the gate tests and the live walk still
route `project_name` (copy track only) and `touch_seed_source` (asked once) correctly.

**Acceptance Scenarios:**
1. **Given** the adapt track, **When** the flow is derived, **Then** `project_name` is skipped,
   read from the `authoring-track` decision.
2. **Given** a recorded `touch-seed-source`, **When** the author reaches touch, **Then** the seed
   step is skipped.

### User Story 3 — Old drafts migrate (Priority: P2)

As an author with a draft saved before this change, I reopen it and nothing is lost.

**Independent Test:** load a version-1 draft fixture captured from `main` at 18e63aa4. Every
answer appears under its decision id, and any answer with no matching decision is shown to the
author.

**Acceptance Scenarios:**
1. **Given** a v1 draft, **When** it loads, **Then** step-keyed answers map onto decision ids
   through each question module's `provides`.
2. **Given** a v1 answer whose question no longer exists, **When** it loads, **Then** it is shown
   to the author to re-answer, never dropped (087 Q5 precedent).

### User Story 4 — The decision log is keyed by decision (Priority: P2)

As an author reviewing my decision trail, I see an answer's superseded history even if its
question has moved to another step.

**Independent Test:** answer a question twice, move it to another step in a test registry, and
the trail still shows both entries.

### Edge Cases
- A question module that `provides` several decisions (087 Q4): its answer is split into one
  record per decision. The split rule is the module's own, not the store's.
- An answer given before this spec lands that is also held in `surveyAnswerStore` for a gallery
  step (not yet a module): it stays there until 090 (see the ledger).
- Two stores disagree on load (for example `selectedTrack` in a v1 draft and a different track in
  its log): the draft's session field wins, because it is what the author last saw, and the
  mismatch is logged to the console (no on-screen warning, per house rule).

## Requirements

### Functional Requirements
- **FR-001** A `decisionStore` MUST hold the live `DecisionSet`. Each record is
  `{ id, value, provenance, source?, inputs?, offered?, step }`. `inputs` holds the values of the
  decision's `requires` as seen when it was decided, and `offered` holds an extracted value shown
  beside an author's override. `step` is display metadata only.
- **FR-002** `DecisionProvenance` MUST gain `"derived"` (computed from other decisions). It is
  declared here and first written by 090. It lives in `packages/studio`; nothing in
  `packages/contracts` changes.
- **FR-003** Every survey-question completion MUST write its decisions into `decisionStore`, with
  provenance `asked`, or the provenance a pre-fill set when the author accepted it unchanged.
- **FR-004** `gatedBy` MUST read `decisionStore` only. `decisionsFromTraversal` and all its call
  sites (`advance.ts`, `lib/resolveLocation.ts`) MUST be deleted.
- **FR-005** `selectedTrack` and `touchSeedSource` MUST be removed from `surveySessionStore`. The
  `authoring-track` and `touch-seed-source` decisions are their only record, and existing readers
  move to a selector over `decisionStore`.
- **FR-006** Survey-question answers MUST be stored only in `decisionStore`. They leave
  `surveyAnswerStore` (which keeps within-step view position and the gallery answers 090 retires)
  and the v2 draft's persisted `surveyAnswers` slice. `workingCopy.phaseAnswersByStep` is NOT
  deleted by 088 (owner ruling 2026-10-06 (km-lead proposals Q8): the T006 inventory showed its contents are predominantly
  gallery/phase answers that become decisions only in 090, so no decision-derived replacement
  exists yet); it is **retired by 090** as a tail task after 090's US4, and 090 likewise owns
  re-pointing any `phaseResults` answer readers.
- **FR-007** Drafts MUST save `decisionStore` as a `decisions` slice keyed by decision id.
  `DRAFT_VERSION` goes from 1 to 2, and loading a v1 draft migrates it per US3.
- **FR-008** The decision-log slot key MUST become the decision id. The step id is kept as display
  metadata, and v1 logs migrate with the draft.
- **FR-009** No visible change: `orderParity`, `gateWalkParity` and `steps/manifest` tests MUST
  stay green unmodified.
- **FR-010** No new timer (D3), no `packages/contracts` change, and no i18n id change.

### Key Entities
- **Decision record:** one resolved fact, with its provenance and what supplied it.
- **decisionStore:** the only saved record of answers. It grows across the series until, in 093,
  it is the only thing saved.

## Duplication ledger

| duplicate | after 088 | retired by |
|---|---|---|
| `decisionsFromTraversal` set | **deleted** | 088 |
| session `selectedTrack`, `touchSeedSource` | **deleted** | 088 |
| question answers in `surveyAnswerStore` | **deleted** | 088 |
| `phaseAnswersByStep` | remains — named retirement owner 090 (tail task after its US4; owner ruling 2026-10-06 (km-lead proposals Q8)) | 090 |
| gallery answers in `surveyAnswerStore`, `phaseBDraftStore` accept/decline | remain | 090 |
| session `identityResult`, `scaffoldSpec`, help docs | remain | 089 |
| working-copy overlays | remain | 090 |
| saved `workingCopy` slice | remains | 093 |

## Success Criteria
- **SC-001** In a Playwright walk in `pnpm dev`, answer identity, track and project_name, then
  reload. All answers are restored, and the saved draft holds no question answer outside
  `decisions`.
- **SC-002** Zero source references to `decisionsFromTraversal`, `selectedTrack` or
  `touchSeedSource` as session fields.
- **SC-003** A v1 draft fixture loads with 100% of its answers present or shown to the author.
- **SC-004** The parity tests pass unmodified.
- **SC-005** A store-level test through the real `StepHost` moves a question to another step and
  keeps both its answer and its log history.

## Assumptions
- Question modules' `provides` is complete for every live question (087 enforced one provider per
  decision).
- Gallery steps keep saving as they do today until 090. This spec doesn't touch their components.
