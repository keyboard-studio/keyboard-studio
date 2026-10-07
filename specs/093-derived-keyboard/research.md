# Research: Derived keyboard (spec 093)

Phase 0 output for [plan.md](plan.md). All findings are from the code on the
stacked base (`km/live-extraction` @ 07356c2f lineage) plus the predecessor
specs 088–092, whose deliverables this spec consumes. The two owner
questions (§8, §9) were **ruled on 2026-10-06** (owner adopted the km-lead
proposals); §3, §4 and §6 carry the cross-spec analyze amendments I-1/I-2.

## 1. The precedent being generalised: `steps/repropagate.ts`

- Decision: the general recalculation rule replaces `repropagate`, and its
  contract (spec 014, R1–R6) is the semantic floor the general rule must meet
  for the touch surface.
- Evidence: [repropagate.ts](../../../packages/studio/src/steps/repropagate.ts)
  (153 lines) is touch-only: on a physical change it re-derives the touch
  surface for `base-derived` / `physical-suggested` keys only; `hand-set` keys
  are never overwritten (R2/R4) and orphaned hand-set keys are never
  auto-deleted (R6). Writes go through `applyMutatePatch` with injected deps
  (`RepropagateDeps`) because `steps/` may not import `stores/`.
- Rationale: spec 093 FR-005 deletes `repropagate.ts` and `staleSteps`; the
  HANDOFF ("Recalculation on change") states the general rule "generalises
  `repropagate` R2/R6". The per-item provenance 090 FR-006 puts on collection
  values (`asked` / `derived` / `extracted`) is what lets the general rule
  reproduce R2/R4/R6 for every collection, not just touch keys.
- Alternatives considered: keep `repropagate` as a special case inside the
  replay engine — rejected: FR-005 requires deletion, and a touch-only fast
  path beside the general rule is exactly the duplication the series retires.
- Consumers to migrate before deletion: `steps/reducer.ts` (the `staleSteps`
  slice read via `getStaleSteps`, ~lines 250/399), `StudioShell.tsx`,
  `MechanismGallery` progression tests, `lib/persistWorkingCopy.ts`.

## 2. Closure and order: `orderByDependencies` is the only graph

- Decision: downstream closure = reverse reachability over the
  `provides`/`requires` graph already built by
  [orderDecisions.ts](../../../packages/studio/src/decisions/orderDecisions.ts)
  (`indexProviders`, `orderByDependencies`). Replay order is the derived
  order; the first changed decision is the earliest member of
  {changed} ∪ closure in that order.
- Rationale: FR-002 names `orderByDependencies` as the graph source;
  constitution Article IX makes the derived order the single ordering
  authority. No second graph may be built.
- Alternatives considered: a dedicated dependency graph in the replay module —
  rejected, it would drift from the ordering graph (the 087 seam-fix lesson).

## 3. Replay engine placement and shape

- Decision: a new module in `packages/studio/src/decisions/` (working name
  `replayKeyboard.ts`, with `downstreamClosure.ts` and `recalculate.ts`
  beside it), following the injected-deps pattern of `repropagate.ts` so the
  engine itself reads no live store: inputs are (starting-point IR,
  `DecisionSet`, derived order); output is the rebuilt `KeyboardIR` plus the
  lists of recomputed / re-proposed / inactivated decisions.
- Rationale: `decisions/` is the series' home (087 structure decision);
  089 FR-001 makes every `apply(value, ctx)` pure — a function of (IR, value,
  inputs) that writes no store — and 089 FR-002's runner is the only write
  path a replay step may use. (Runner identity, cross-spec analyze I-4: the
  runner is `applyDecisionEffects` in `steps/reducer.ts`;
  `applyMutatePatch` in `steps/mutateApply.ts` is the declared-`writes`
  containment it calls, not the runner.) Purity is what makes replay
  possible at all.
- Amendment (cross-spec analyze I-1): the patch being folded is 089's
  five-channel `WorkingCopyPatch` (`ir`, `identity`, `attribution`,
  `helpDocs`, `historyEntryState`), not an IR patch. Replay's output is
  therefore (IR, overlay accumulator) — see data-model.md OverlayState —
  and `ApplyContext.currentHistoryEntryState` is supplied from the
  accumulator folded so far. An IR-only output was the original §3 shape;
  it cannot reproduce the emitted source (identity/attribution land in the
  source header, helpDocs in output files), so SC-003 would fail on it.
- Alternatives considered: extending `decisions/decisionFlow.ts` — rejected:
  that runner is extraction/adapt-time; folding rebuild into it would couple
  two lifecycles. Putting replay in `steps/` — rejected: the store-wiring
  belongs at the `StepHost`/`StudioShell` seam, the engine stays pure.

## 4. Checkpoints

- Decision: in-memory ordered checkpoints — the `KeyboardIR` reference **and
  the overlay accumulator** (I-1) after each decision's `apply` — held beside
  the replay engine, never persisted (FR-003). Replay for an edit starts
  from the checkpoint before the first changed decision.
- Rationale: `applyMutatePatch` produces a new IR per patch, so a checkpoint
  is a retained reference, not a copy. Memory cost on a large starting point
  is a measured quantity in the US3 perf work, not an assumption.
- Alternatives considered: serialised checkpoints — rejected by FR-003
  ("in-memory only") and by Article V's spirit (no intermediate
  serialisation).

## 5. The provenance rule (US1) and re-proposal

- Decision: implement the HANDOFF rule verbatim, per decision in the closure:
  `extracted` → re-run `extract`; `default` / `derived` → recompute;
  `asked` → keep, run `validate` against the new inputs; if it no longer
  fits, keep it, flag it, and re-propose beside the recomputed value via the
  existing `reproposalNoticeStore`
  ([stores/reproposalNoticeStore.ts](../../../packages/studio/src/stores/reproposalNoticeStore.ts),
  [decisions/reproposalNotice.ts](../../../packages/studio/src/decisions/reproposalNotice.ts)) —
  never overwrite. Collections follow the same rule per item (090 FR-006).
  A decision gated off by the change keeps its record, marked inactive;
  switching back restores it.
- Rationale: this is spec US1 scenarios 1–6, one-to-one. The `derived`
  provenance the rule needs is declared by 088 FR-002 and first written by
  090; the record's `inputs` field (088 FR-001) is what `validate` is run
  against.
- Open design note (not an owner decision): the inactive marker is an
  addition to the 088 decision record shape; it lives in `packages/studio`
  only, per 088 FR-002's scoping.

## 6. Drafts: DRAFT_VERSION 2 → 3

- Evidence: on the current base,
  [draftPersistence.ts](../../../packages/studio/src/lib/draftPersistence.ts)
  has `DRAFT_VERSION = 1` (line 93) and the envelope (line ~777) saves five
  slices, including `workingCopy: snapshotWorkingCopyData()`. Spec 088 takes
  the version to 2 and adds the `decisions` slice; 089–092 retire the other
  stored copies per their ledgers.
- Decision: 093 sets `DRAFT_VERSION = 3`; the v3 envelope's payload is the
  starting point's id and the `decisions` slice only (FR-004). The v2→v3
  migration rebuilds from the v2 draft's decisions, compares the rebuilt
  source byte-for-byte with the stored `workingCopy` slice, drops the slice
  on a match; on a mismatch it logs and uses the stored slice once.
- Rationale: FR-004, verbatim. Resume after migration is a full replay, which
  is also the SC-003 test (reload reproduces byte-identical source, no
  `workingCopy` slice in the saved draft).
- Key suffix and boot scan (cross-spec analyze I-2): `DRAFT_VERSION` is not
  just a field — it is embedded in the localStorage key
  (`ks.draft.<projectKey>.v<N>`), and the boot scan filters keys by the
  current version's suffix. 088 documented this trap and its T010 rewired
  the scan to also find `.v1` keys, running `migrateDraftEnvelope` before
  every version gate. 093 must extend the same pattern: the v3 build's scan
  finds `.v2` keys (and `.v1` keys never opened under v2) and migrates
  before version gates, chaining v1→v2→v3 inside one load when needed.
  Without this, the v2→v3 migration above is unreachable for real stored
  drafts — a fixture-file test would pass while production drafts vanish
  from the scan.
- The starting point's id is available from the setup decision 092 FR-004
  creates (working-copy setup as the `apply` of a decision requiring
  `authoring-track`; `base-keyboard` names the starting point).

## 7. Determinism (SC-002)

- Decision: the property test compares incremental rebuild (from checkpoint)
  against full replay over random decision-edit sequences, byte for byte.
  This test doubles as the disagreement check for the FR-006 disposable
  cache: a cache entry that disagrees with a full replay is discarded.
- Rationale: replay is a pure function of (starting point, decisions, order)
  — §3 — so the property must hold universally, not on fixtures only.

## 8. OWNER DECISION (a) — changing the starting point — RULED: RECALCULATION

Verbatim from [spec.md](spec.md), Edge Cases (the clarification as asked):

> **Changing the starting point** is the widest possible closure.
> [NEEDS CLARIFICATION: is it a recalculation (re-extract everything, keep
> asked answers), or a new project that carries the answers over?]

**Ruling (owner, 2026-10-06, adopting km-lead proposals Q6): recalculation.**
A starting-point change is the widest closure through the US1 machinery:
everything is re-extracted against the new starting point, and `asked`
answers are kept under the §5 validate/re-propose rule. The decision log
stays one history — prior entries keep the old keyboard as their historical
`source`; superseding entries name the new keyboard. (Impact mapping from
the pre-ruling analysis stands: the replay engine, closure, provenance rule,
checkpointing, draft v3 format, and measurement work were identical under
either ruling; only T017 depended on it, and it now proceeds — tasks.md
T013/T017.)

## 9. OWNER DECISION (b) — SC-004 perf budgets — METHOD RULED: MEASURE-FIRST

Verbatim from [spec.md](spec.md), SC-004:

> On `sil_euro_latin`, a single-decision edit rebuilds within the budget set
> in `/speckit-plan` (proposed: under 300 ms, so the preview updates within
> one debounce cycle), and resume within a budget set there too (proposed:
> under 2 s). Measure before committing to these.

**Ruling (owner, 2026-10-06, adopting km-lead proposals Q7): measure-first
is adopted as SC-004's method.**

- Measurement comes FIRST (tasks T002 — landed, commit `744b6636` — and
  T021). The harness drives the real replay path against `sil_euro_latin`
  (already used as a large starting point in studio tests, e.g.
  `lib/rankBases.test.ts`, `lib/suggestBase.test.ts`) and records latencies
  in `perf-baseline.md` in this spec directory.
- Figures are **medians with split protocols**: edit = warm median, resume =
  cold median. They are **never an absolute-ms CI pass/fail**.
- The numbers **<300 ms (edit)** and **<2 s (resume)** remain **PROPOSED** —
  not committed thresholds — until T021's re-measurement plus a later owner
  ruling. If a hard gate is wanted after T021, it is set **relative to the
  recorded baseline**.
- FR-006's disposable rebuild cache is conditional on those measurements
  ("allowed for resume only if measurements require it").

## 10. RawKmnFragment carry-through

- Decision: replay never regenerates opaque fragments. `apply` patches are
  contained to declared `writes` (089 FR-002), so a `RawKmnFragment` outside
  every decision's writes passes through replay untouched; a fragment-bearing
  fixture test pins this (precedent:
  `lib/serializeWorkingCopy.fragmentBearing.carve.test.ts`).
- Rationale: constitution Articles II/VII — opaque constructs are preserved,
  never silently dropped, and survey-editing them is out of scope.
