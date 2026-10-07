# Feature Specification: The keyboard is derived from decisions

**Feature:** specs/093-derived-keyboard
**Branch:** cut from `main` after 092 merges (`km/derived-keyboard`)
**Created:** 2026-10-06
**Status:** Implemented with held items (2026-10-07) — the replay engine,
the StepHost/StudioShell rebuild wiring (T009), starting-point
recalculation (T017, core), determinism (SC-002) and the replay-path
perf re-measurement (T021) are landed; the touch/repropagate retirement
(T010/T011) and the decisions-only draft (US2: T014–T016, T018) are
HELD on spec 090's US3/US4 landing on this stack, with evidence in
[followups.md](followups.md). Owner decisions stand as ruled 2026-10-06:
(a) starting-point change = recalculation; (b) perf budgets
measure-first — the <300 ms / <2 s numbers remain PROPOSED (T021
evidence: warm edit median 7.20 ms, cold resume median 9.58 ms on
sil_euro_latin), never converted to a gate here.
**Series:** 6 of 6. The plan is [088 HANDOFF.md](../088-modular-decisions/HANDOFF.md)
(sections "Recalculation on change" and phase 6).
**Depends on:** 090 (pure `apply`, overlays as decision values) and 092 (setup as a decision).

## Summary

The working copy becomes `replay(starting point, apply(d1), …, apply(dn))`: a cache rebuilt from
decisions, never saved and never edited directly. Changing a decision recalculates everything
downstream of it. What the author chose is kept, and what the studio supplied is recomputed. A
draft saves the starting point's id and the decisions, and nothing else.

## User Scenarios & Testing

### User Story 1 — Changing a decision updates the keyboard (Priority: P1)

As an author, I go back and change the Windows layout after carve and mechanisms. Carve's
proposals, the rules and the suggested physical and touch keys refresh. My own removals and
AltGr assignments stay.

**Independent Test:** a Playwright walk in `pnpm dev` that changes `windows-layout` after
mechanisms and checks both survivals and refreshes.

**Acceptance Scenarios:**
1. **Given** a downstream decision with `extracted` provenance, **When** an input changes,
   **Then** `extract` re-runs.
2. **Given** a `default` or `derived` decision, **When** an input changes, **Then** it is
   recomputed.
3. **Given** an `asked` decision that still validates, **When** an input changes, **Then** it is
   kept unchanged.
4. **Given** an `asked` decision that no longer fits, **When** an input changes, **Then** it is
   kept, flagged, and re-proposed beside the recomputed value (`reproposalNoticeStore`), never
   overwritten.
5. **Given** a collection value, **When** an input changes, **Then** suggested items recompute,
   hand-set items stay, and orphaned hand-set items are shown, not deleted.
6. **Given** a decision gated off by the change, **Then** its record is kept and inactive, and
   switching back restores it.

### User Story 2 — Drafts hold decisions only (Priority: P1)

As an author, I reload and get exactly the keyboard I had, rebuilt from my decisions.

**Independent Test:** the saved draft has no `workingCopy` slice, and the source rebuilt on load
is byte-identical to the source before the reload.

### User Story 3 — Edits stay fast (Priority: P2)

Replaying from the first changed decision, with a checkpoint of the IR after each decision, keeps
a single edit quick on a large starting point.

### Edge Cases
- **Changing the starting point** is the widest possible closure.
  [RULED 2026-10-06 (owner, adopting km-lead proposals Q6): it is a **recalculation** —
  re-extract everything against the new starting point; `asked` answers are kept under the
  US1 validate/re-propose rule. Prior decision-log entries keep the old keyboard as their
  historical source; superseding entries name the new one.]
- A `RawKmnFragment` is carried through a replay unchanged, never regenerated.
- The rebuild is a write, not a validation. Validation runs once on the rebuilt copy, in the
  existing D3 cycle. No timer is added.

## Requirements
- **FR-001** The working copy MUST be produced only by replaying the decisions' `apply`s over the
  starting point, in dependency order.
- **FR-002** A change MUST trigger recalculation of its downstream closure in the `requires` graph
  (from `orderByDependencies`), following the provenance rule in US1.
- **FR-003** Replay MUST start from the checkpoint before the first changed decision. Checkpoints
  are in-memory only.
- **FR-004** Drafts MUST save the starting point's id and `decisions` only. `DRAFT_VERSION` goes
  to 3, and v2 drafts migrate by dropping their `workingCopy` slice after checking that a rebuild
  reproduces it. A mismatch is logged and the stored slice is used once.
- **FR-005** `steps/repropagate.ts` and `staleSteps` MUST be deleted, replaced by the general
  closure plus the provenance rule.
- **FR-006** A disposable rebuild cache is allowed for resume only if measurements require it. It
  must be discarded whenever it disagrees with the decisions.

## Duplication ledger

| duplicate | after 093 |
|---|---|
| saved `workingCopy` slice | **deleted**; the keyboard is derived |
| touch-only `repropagate` and `staleSteps` | **deleted**; replaced by the general rule |
| identity patch and overlays held as working-copy state | **deleted**; produced by replay |

After 093, the decisions are the only stored state.

**Ledger state at close-out (T024, measured 2026-10-07 @ 9add4260,
packages/studio/src):** the first and third rows are realised for every
surface replay now produces (the rebuilt IR + overlay channels install
over the incremental applies at every completion; the identity patch
and overlays are folded by the replay accumulator). The deletions
themselves are HELD with their tasks (followups.md): `staleSteps` 71
references and `repropagate` 25 references stand while T010/T011 wait
on 090 US3/US4, and the saved `workingCopy` slice (31 references across
lib/persistWorkingCopy.ts + lib/draftPersistence.ts) stands while US2
waits on the same landing — on this tree those slices still carry
author work that is not yet decision-derived, and dropping them would
lose it silently.

## Success Criteria
- **SC-001** The US1 walk passes in `pnpm dev`.
- **SC-002** Determinism: a property test over random decision-edit sequences shows that an
  incremental rebuild equals a full replay, byte for byte.
- **SC-003** A reload reproduces byte-identical source, and the draft has no `workingCopy` slice.
- **SC-004** On `sil_euro_latin`, a single-decision edit rebuilds within the budget set in
  `/speckit-plan` (proposed: under 300 ms, so the preview updates within one debounce cycle), and
  resume within a budget set there too (proposed: under 2 s). Measure before committing to these.
  [Method RULED 2026-10-06 (owner, adopting km-lead proposals Q7): measure-first — figures are
  medians with split protocols (edit = warm median, resume = cold median) recorded in
  `perf-baseline.md`, never an absolute-ms CI pass/fail; the proposed numbers stay proposed
  until T021's re-measurement plus a later ruling, and any hard gate set after T021 is relative
  to the recorded baseline.]
- **SC-005** The golden walk is byte-identical.
