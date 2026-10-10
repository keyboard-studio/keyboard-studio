# Feature Specification: Question decisions write only through `apply`

**Feature:** specs/089-decision-apply
**Branch:** cut from `main` after 088 merges (`km/decision-apply`)
**Created:** 2026-10-06
**Status:** Draft
**Series:** 2 of 6. The plan is [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md), and the
series table is in [088 spec.md](../088-modular-decisions/spec.md).
**Depends on:** 088 (decision store).

## Summary

Today the identity, track, project_name and help steps save and apply answers in step code: an
adapter and per-flow `onCommit`s in `flowStepOptions.tsx`. The declared module write path
(`writes`/`mutate`) runs only behind `VITE_KM_MUTATE_SEAM`, which is off by default, and only
`pb_standard_letters` uses it. This spec gives each question module an `apply` and makes it the
only way a question's decision changes the keyboard.

## User Scenarios & Testing

### User Story 1 — One write path for question decisions (Priority: P1)

As the maintainer, I want a question's effect to live with its module, so a question can move
without its write moving with step code.

**Independent Test:** with every per-flow `onCommit` deleted, a live walk through identity,
project_name and help produces the same keyboard source as `main`.

**Acceptance Scenarios:**
1. **Given** a completed identity step, **When** the decisions are recorded, **Then** attribution
   reaches the working copy through `apply`, and `IdentityLiteAdapter` writes to no store.
2. **Given** the copy track and a project name, **When** it is recorded, **Then** `header.name`
   and `header.keyboardId` are set by `apply`, matching the module's declared `writes`.
3. **Given** a module whose `apply` writes a path outside its `writes`, **When** it runs,
   **Then** the whole application is rejected and the working copy is untouched (087 US3).

### User Story 2 — The flag is gone (Priority: P1)

As the maintainer, I want one write path, not a flagged second one.

**Independent Test:** `VITE_KM_MUTATE_SEAM` and `flags/mutateFlag.ts` no longer exist, and
`pb_standard_letters` writes through `apply` unconditionally.

### Edge Cases
- `authoring-track` has no keyboard effect of its own today. Its effect (how the working copy is
  set up) moves to 092, so its `apply` here is empty, and `setScaffoldSpec(null)` on adapt
  becomes a consequence of the decision, not a store write.
- Help docs are currently session state (`setHelpDocs`, `setHistoryEntryState`). They become the
  value of the `help-docs` decision, and `apply` writes them into the projection.

## Requirements
- **FR-001** `QuestionModule` MUST gain `apply(value, ctx) → WorkingCopyPatch`. `apply` is pure:
  it reads only `ctx` (the IR, its own value, its `requires` inputs) and writes no store.
- **FR-002** A single runner MUST apply patches through the existing declared-writes check
  (`applyMutatePatch` with the module's `writes`). `routeAnswersThroughMutate` becomes that runner
  and runs unconditionally.
- **FR-003** `VITE_KM_MUTATE_SEAM` and `flags/mutateFlag.ts` MUST be deleted.
- **FR-004** The identity, track, project_name and help `onCommit`s/`extract`s in
  `flowStepOptions.tsx`, and the store writes in `IdentityLiteAdapter`, MUST move into module
  `apply`s or be deleted.
- **FR-005** The session fields `identityResult`, `scaffoldSpec` and help docs, and
  `setIdentityPhaseResult` / `setSurveyContext`, MUST be removed or become selectors over
  `decisionStore`. They must not remain stored copies.
- **FR-006** The working copy's identity patch (`setIdentity`, `setAttribution`) MUST be written
  only by `apply`.

## Duplication ledger

| duplicate | after 089 | retired by |
|---|---|---|
| session `identityResult`, `scaffoldSpec`, help docs | **deleted** | 089 |
| per-flow `onCommit` writes | **deleted** | 089 |
| flagged second write path | **deleted** | 089 |
| identity patch as separately stored state | written by `apply` only; stored until rebuilt | 093 |

## Success Criteria
- **SC-001** Golden walk: a scripted Playwright walk in `pnpm dev` (copy track from
  `basic_kbdfr`, fixed answers) produces a source zip byte-identical to the baseline captured
  from `main` before this spec. The baseline script is added by this spec and reused by 090–093.
- **SC-002** Zero `onCommit` definitions remain for the identity, track, project_name and help
  flows, and zero references to `VITE_KM_MUTATE_SEAM`.
- **SC-003** A test module that writes outside its `writes` is rejected with a named error.

## Assumptions
- `basic_kbdfr` is codec-clean and stays the golden-walk keyboard. It is already in
  [docs/keyboard-index.md](../../docs/keyboard-index.md).
