# Feature Specification: Live extraction from the starting point

**Feature:** specs/092-live-extraction
**Branch:** cut from `main` after 091 merges (`km/live-extraction`)
**Created:** 2026-10-06
**Status:** Draft
**Series:** 5 of 6. The plan is [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md).
**Depends on:** 091 (placement from `requires`).

## Summary

`extract()` exists on five modules but never runs in the live app. Every live pre-fill is
step-specific seeding code. This spec runs extraction once the working copy is set up, seeds every
unanswered decision with its source named, and turns the step-specific seeders into `extract`s.
It also fixes the order of setup: the working copy is currently set up before the track is known.
This spec contains the series' acceptance test.

Values from the starting point become defaults the author knowingly confirms, changes or
overturns. They are never applied silently.

## User Scenarios & Testing

### User Story 1 — The acceptance test (Priority: P1)

Add `requires: ["authoring-track"]` to `il_copyright_holder` and change nothing else.
- **Adapt track:** the question appears after the track choice, pre-filled from the keyboard's
  own copyright and labelled "from <keyboard>".
- **Copy track:** it defaults to the author, because the copied keyboard's notice is kept
  automatically.

**Independent Test:** a Playwright walk of both tracks in `pnpm dev`.

### User Story 2 — Starting-point values seed decisions (Priority: P1)

As an author, after I choose a starting point, the questions it can answer arrive pre-filled
and labelled with their source, in both the default and custom renderers.

**Acceptance Scenarios:**
1. **Given** an unanswered decision whose module can extract a value, **When** the working copy
   is set up, **Then** it is seeded `{ provenance: "extracted", source: <keyboard id> }`.
2. **Given** a decision the author already answered, **When** extraction runs, **Then** the answer
   is kept and the extracted value is shown beside it (`offered`).
3. **Given** an extracted value the module's `validate` rejects, **Then** it is treated as absent
   and the question is asked normally (087 US1).

### User Story 3 — The track is chosen before setup (Priority: P1)

Setting up the working copy `requires: ["authoring-track"]`. The adapt track takes effect on the
first commit, not the second (HANDOFF G7, StudioShell.tsx refresh hazard).

### User Story 4 — The starting-point log entry is written (Priority: P2)

`recordBaseContribution` runs after setup, so the starting-point entry is no longer null
(HANDOFF G7).

### Edge Cases
- A starting point missing a value: the question is asked normally, never silently defaulted.
- Defaults from lookups (langtags, the GitHub profile) are seeded with `default` provenance and
  their source named. They are not `extracted`.

## Requirements
- **FR-001** After setup, every applicable module `extract` MUST run once, seeding unanswered
  decisions only.
- **FR-002** The step-specific seeders MUST become `extract`s or lookup defaults of the same
  record shape:
  - `IdentityLite.tsx` (langtags and GitHub profile);
  - `Prefill.tsx` and `CharactersStep.tsx`;
  - `prefillCarveDispositions`;
  - `PHASE_F_SEEDS`.
- **FR-003** Both renderer kinds MUST show the source label, and the `offered` value beside an
  override.
- **FR-004** Setting up the working copy MUST be the `apply` of a decision that requires
  `authoring-track`, so it runs once, with the track known.
- **FR-005** `il_copyright_holder` MUST declare `requires: ["authoring-track"]`.

## Success Criteria
- **SC-001** The US1 Playwright walk passes on both tracks in `pnpm dev`.
- **SC-002** The share of decisions pre-filled after choosing `basic_kbdfr` is measured in the live
  wizard. It replaces 087 SC-001, which was measured in the demo.
- **SC-003** None of the seeders listed in FR-002 remain as step code.
- **SC-004** The adapt track takes effect on the first commit, shown by a live walk with no
  refresh.
- **SC-005** The starting-point log entry is present after every live walk.

## Duplication ledger

| duplicate | after 092 | retired by |
|---|---|---|
| step-specific seeders beside module `extract` | **deleted** | 092 |
| two setups of the working copy (new-from-base, then adapt) | **deleted** | 092 |
