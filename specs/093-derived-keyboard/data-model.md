# Data Model: Derived keyboard (spec 093)

Phase 1 output for [plan.md](plan.md). Entities are in `packages/studio`
only; nothing in `packages/contracts` changes (spec 093 constraint, 088
FR-010 precedent). Shapes marked *(088)* / *(089)* / *(090)* are predecessor
deliverables this spec consumes, restated here only where 093 extends them.

## DecisionRecord *(088, extended)*

One resolved fact, held in `decisionStore` (088 FR-001).

| Field | Type | Notes |
|---|---|---|
| `id` | `DecisionId` | key of the record in the store |
| `value` | module-declared | collections carry per-item provenance (090 FR-006) |
| `provenance` | `asked \| extracted \| default \| derived` | `derived` declared by 088 FR-002 |
| `source?` | string | naming the starting point for extracted values |
| `inputs?` | snapshot of `requires` values | as seen when decided (088 FR-001); the recalculation rule re-validates `asked` values against the *new* inputs |
| `offered?` | extracted value | shown beside an author's override |
| `step` | display metadata only | never a storage key (088) |
| `inactive?` | boolean | **new in 093**: set when a change gates the decision off (US1 scenario 6). The record — value, provenance, history — is kept whole; clearing the gate restores it unchanged. Absent = active. |

State transitions under recalculation (US1): `extracted` → re-extracted
(value may change, provenance stays); `default`/`derived` → recomputed;
`asked` → kept if `validate` passes against new inputs, else kept + flagged
with a re-proposal (see Reproposal); any → `inactive` when gated off, and
back when the gate clears.

## DecisionSet *(087/088)*

`Readonly<Partial<Record<DecisionId, Decision>>>` — the only stored state
after 093. Partial by design: gated-off-but-never-asked and never-reached
decisions have no entry; gated-off-after-answering decisions have an entry
with `inactive: true`.

## Checkpoint

In-memory only (FR-003); never serialised, never saved.

| Field | Type | Notes |
|---|---|---|
| `decisionId` | `DecisionId` | the decision whose `apply` produced this state |
| `ir` | `KeyboardIR` | reference to the IR after that `apply` (patches produce new IRs; a checkpoint is a retained reference, not a copy) |
| `orderIndex` | number | position in the derived order |

The checkpoint list is ordered by `orderByDependencies`; index 0 is the
starting point IR before any `apply`. An edit replays from the checkpoint
before the first changed decision.

## ReplayInput / RebuildResult

Replay is pure (research §3): no store reads inside the engine.

- **ReplayInput**: `{ startingPointId, startingPointIR, decisions:
  DecisionSet, order: DecisionId[] }` — `order` from `orderByDependencies`.
- **RebuildResult**: `{ ir, recomputed: DecisionId[], reproposed:
  DecisionId[], inactivated: DecisionId[], reactivated: DecisionId[] }` —
  the rebuilt working copy plus the audit lists the caller uses to update
  `decisionStore`, fire re-proposal notices, and (on resume) verify
  determinism.

## Reproposal *(existing)*

An `asked` decision whose value no longer validates is kept and a notice is
recorded through the existing `reproposalNoticeStore`
(`packages/studio/src/stores/reproposalNoticeStore.ts`); the recomputed value
is carried as the proposal beside it, mirroring the record's `offered`
pattern. The author accepts or dismisses; replay never overwrites.

## DraftEnvelope v3

Saved by `lib/draftPersistence.ts` at `DRAFT_VERSION = 3` (088 set 2; 093
sets 3, FR-004).

| Field | Notes |
|---|---|
| `version` | `3` |
| `savedAt`, `projectKey`, `displayName`, `languageTag` | envelope metadata, as today |
| `startingPointId` | the id the rebuild starts from |
| `decisions` | the `DecisionSet` slice (088 FR-007 shape), including the decision log keyed by decision id (088 FR-008) |
| ~~`workingCopy`~~ | **deleted** — the keyboard is rebuilt on load, never saved |

**v2 → v3 migration** (FR-004): on loading a v2 draft, rebuild from its
decisions; if the rebuilt source matches the stored `workingCopy` slice
byte-for-byte, drop the slice; on mismatch, log it and use the stored slice
for that one load. There is no v3 → v2 downgrade path.

## PerfMeasurement (US3 evidence, decision (b))

Recorded in `perf-baseline.md` in this spec directory.

| Field | Notes |
|---|---|
| `scenario` | `edit` (single-decision rebuild from checkpoint) or `resume` (full replay on load) |
| `keyboard` | `sil_euro_latin` |
| `medianMs`, `runs` | median over the harness's run count, on the real replay path |
| `threshold` | **proposed only** — <300 ms (edit) / <2 s (resume), pending Matthew's ruling; not a gate until ruled |
