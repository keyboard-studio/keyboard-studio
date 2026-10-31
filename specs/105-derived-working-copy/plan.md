# Implementation Plan: Derived working copy — finish the 088–093 migration

**Branch**: `km/105-derived-working-copy-plan` (this plan + Phase 0);
phase branches follow the repo flow (PR to `dev`, nightly soak gates,
dev promoted to `main`; merges are Matthew's call)
**Date**: 2026-10-19
**Spec**: [spec.md](spec.md) | **Research**: [research.md](research.md) |
**Data model**: [data-model.md](data-model.md) |
**Contract**: [contracts/derived-working-copy.md](contracts/derived-working-copy.md)

## Summary

Matthew ruled Option A (2026-10-19): finish the migration — the working
copy becomes a **pure derived view** of the decision set. Phase 0 (this
PR) lands the programme's evidence base and its gate: the complete
census of the 130 `WorkingCopyState` members, the reconciled per-surface
verdicts (research.md), and the equivalence-gate harness
(`decisions/derivedSurfaceRegistry.ts` + `derivedEquivalence.test.ts`),
green on current `dev` behaviour. Phases 1–9 then migrate one surface at
a time — starting point, deadkeys, carve, physical layout, touch layout,
spec-104 touch identity, docs/identity/raw-KMN, survey residue — each
independently landable behind the gate, and the final phase cuts the v3
envelope: WC slice and answer slice out, `phaseResults`/`recordPhase`
deleted, the answers↔decisions pair deleted, the store reduced to a
derived cache. Perf gate throughout: spec 093's baselines (warm edit
7.20 ms / cold resume 9.58 ms, sil_euro_latin, `rebuildPerf.measure`
procedure), re-measured by any phase touching replay.

## Technical Context

**Language/Version**: TypeScript (repo toolchain), React + Zustand stores
**Primary Dependencies**: `packages/studio` (stores, decisions, steps,
survey, editors), `packages/contracts` (record shapes — spec 104 spine
records unchanged), engine IR via `packages/engine`
**Storage**: DecisionSet (088) + spec-053 decision log in the draft
envelope; envelope `DRAFT_VERSION` 2 → 3 in the final phase only
**Testing**: Vitest per package; the equivalence gate
(`derivedEquivalence.test.ts`) is the programme's standing test; A/B rule
on every gate (FR-011); derivation perf via `rebuildPerf.measure`
**Target Platform**: Studio web app (desktop + mobile host layout)
**Project Type**: Web application (monorepo)
**Performance Goals**: No regression vs the 093 baselines beyond the
`rebuildPerf.measure` noise band; cold resume on a decisions-only draft
within the same band as today's WC-slice resume
**Constraints**: Decisions remain the only stored state (Art. III);
base-derived values presented/confirmed/attributed, never silent
(Art. X, FR-014); base-switch retain + recalculate keeps working through
replay (FR-013); each phase independently landable and reversible
**Scale/Scope**: Store census 130 members (56 fields + 74 actions);
39 grouped editor writes (I2) + 55-row wider sweep (I3); state machinery
≈19,000 prod LOC in scope, of which sync/bridge/replay plumbing
≈3,820 LOC is the deletion target across phases

## Constitution Check

GATE: Must pass before Phase 0 research. Re-check after each phase design.

| Article | Relevance | Verdict |
|---|---|---|
| Art. I (No Silent Failures) | FR-009 migration report names every unconverted field; SC-003 zero silent drops | PASS |
| Art. II (Test-First) | Equivalence arm lands in the same PR as each surface's write removal; Phase 0's harness precedes all migration | PASS |
| Art. III (Decision as the Only Unit) | The spec *is* Art. III enforced: decisions + starting point the only stored state; envelope v3 carries no materialised keyboard | PASS |
| Art. IV (Engine Ownership) | No engine change required; replay installs IR through the existing decisions layer | PASS |
| Art. V (Honest Scoring) | n/a (no scoring surface) | PASS |
| Art. VII (Mobile-First) | Host-layout unaffected; store shape changes are viewport-neutral | PASS |
| Art. VIII (Versioned Data) | Envelope v3 with rebuild migration from v2 (FR-009); `DRAFT_VERSION` bump in the final phase only | PASS |
| Art. IX (Question Integration) | Editor representations are decision records on existing modules; no new question surface except Phase 7's identity path, which records through the identity family | PASS |
| Art. X (Defaults Are Proposals) | FR-014: base-derived seeds (identity seed, doc profile, carve prefills) remain presented/confirmed/attributed decisions through every phase | PASS |
| Art. XI (Done Means Integrated) | Ghost tests resolved, dormant slices deleted, and the programme's own inventory fragments are removed with the final phase's AS-BUILT | PASS |

## Project Structure

### Documentation (this feature)

```text
specs/105-derived-working-copy/
├── spec.md
├── plan.md
├── research.md               # Phase 0 inventory (assembled)
├── data-model.md
├── contracts/
│   └── derived-working-copy.md
├── phase0/
│   └── fragments/            # I1/I2/I3 raw inventories (removed at programme end, Art. XI)
└── tasks.md
```

### Source code touched across phases

```text
packages/studio/src/
├── decisions/
│   ├── derivedSurfaceRegistry.ts   # NEW (Phase 0) — gate registry
│   ├── derivedEquivalence.test.ts  # NEW (Phase 0) — gate arms
│   ├── rebuildWorkingCopy.ts       # replay core; fold promotion (P3), slice installs (P2/P5/P6)
│   ├── replayKeyboard.ts           # foldPatch; carve fold; declared folds
│   ├── recordEditorStep.ts         # RETIRED progressively; gone by final phase
│   └── questions/                  # module applies: physical-layout (P4), touch-layout (P5), deadkeys (P2), carved-layout (P3)
├── stores/
│   ├── workingCopyStore.ts         # shrinks to derived cache; phaseResults slot deleted (P8/final)
│   ├── decisionStore.ts            # unchanged shape; gains spec-104 family (P6)
│   └── surveyAnswerStore.ts        # runtime cache only by final phase
├── lib/
│   ├── draftPersistence.ts         # v3 envelope; dedup pair deleted (final)
│   ├── persistWorkingCopy.ts       # snapshot path removed (final); identity seed kept
│   ├── assignLoopCompletion.ts     # completion writes become derivations (P4/P5)
│   └── galleryHostDeps.ts          # sink composition converges to the fold (P7)
├── editors/                        # direct writes removed per surface (P2–P7)
├── survey/ + steps/                # recordPhase deleted; session derived (P8)
└── components/ (StudioShell, TrackOneIdentityPanel, KmnEditor, TouchGallery, MechanismGallery)
```

**Structure Decision**: No new package or store. The programme deletes
structure (bridges, slices, the snapshot path) and promotes two existing
mechanisms — the patch sink and the carve fold — into the single
declared path (contracts §1/§2).

## Phases

Each phase: its own branch + PR to `dev`, gate evidence in the PR body
(gate suite + targeted suites green under the A/B rule; perf re-measure
where marked), registry status flips in the same PR. A phase that finds
its research premise wrong stops and reports (programme rule).

### Phase 0 — Inventory + equivalence gate (this PR)

The census, the reconciled inventory (research.md), the registry, and
the gate's four arms — census, coverage, replay (survey path proven),
draft-load (bypass form) — plus the planted-violation self-test. No
behaviour change. **Exit**: harness green on `dev` d9e3d63a; inventory
headline in the PR body.

### Phase 1 — Starting point as replay input (resumes 093 T014/T016)

093's deferred v2-capture/v3-envelope groundwork, scoped to the starting
point: starting-point id becomes an explicit envelope field (v2-compatible
carrier), the starting point is produced pre-mount (the 093 US2 boot
restructure, starting-point half), and the base-artifact slices become
pure functions of the bundle (contracts §5.6) — the parallel seeding in
`useKeyboardArtifact` is removed. Base-switch retain + recalculate is
re-proven through replay. **Perf: re-measure.** **Exit**: registry
surface `starting-point-instantiation` = starting-point/derived;
instantiation has no decision-independent author-state writes.

### Phase 2 — Deadkeys (the model surface)

Edit-time recording through the existing commit funnel; rebuild installs
the `deadkeyOverlay` slice from the `deadkeys-defined` record
(contracts §5.1); the live log and the record become one object.
**Exit**: deadkeys surface equivalence-proven (replay + draft-load arms).

### Phase 3 — Carve

The fold is promoted into the module contract (a declared carve channel
or named fold); edit-time recording replaces completion snapshotting;
`keepAll`/`restoreAll` cross-surface clears fixed (contracts §5.2);
family toggle records at edit time. Dormant carve members
(`carveTouchKeepInert`, `setCarveDisposition`, `setClosedKeyboardCard`)
resolved — represented or deleted with the surface's sign-off.
**Perf: re-measure** (fold is on the replay path). **Exit**: carve
equivalence-proven.

### Phase 4 — Physical layout / mechanisms

A reproducing representation for assignments + sequence flags
(data-model §1); completion effects (`lockDesktop`, repropagate) become
derivations. MechanismGallery's direct writes removed behind the gate.
**Exit**: physical-layout equivalence-proven.

### Phase 5 — Touch layout (the largest hole)

Key-edit fold installs `keyEditOverlay` + `deletedTouchKeyIds`;
character-mode assignments (today: `touchDraft` only) gain a decision
value arm; `touchLayoutJson` becomes a projection and is deleted as a
field; direct `setWorkingIR` promotions re-expressed as ops/records
(contracts §5.3). **Perf: re-measure.** **Exit**: touch-layout
equivalence-proven; `touchDraft` has no author truth left in it.

### Phase 6 — Spec-104 touch identity

The `touchKeyIdentity` / `keyIdentityDecisions` record families move
into the DecisionSet (shapes unchanged; contracts §5.4); WC slices
become derived caches. **Exit**: touch-identity-104 equivalence-proven.

### Phase 7 — Docs, identity, overlays, raw-KMN

`TrackOneIdentityPanel` records identity decisions (the `setIdentity`
keystroke path); doc-fix proposals become a recorded decision family
(consistent with the #504 confirmable-fix posture); chart preference,
start-holder override, context-tolerance fix, start doc profile get
representations or starting-point derivations; `historyEntryState`'s
mount write becomes a replay derivation; the sink converges to one
composition; the raw-KMN editor gets its §5.5 design decision and
implementation. **Exit**: docs-identity-overlays equivalence-proven.

### Phase 8 — Survey residue

`phaseResults` slot + `recordPhase` deleted; session derived from the
decision set (the `mergePhaseResults` read paths move to decisions);
in-flight residue dispositioned per research §6 (question answers are
already decision-only; the position-slice question is **presented for
ruling** with this phase's plan if not ruled earlier). **Exit**:
survey-residue surface equivalence-proven; zero `recordPhase` call sites.

### Phase 9 (final) — Envelope v3 + store reduction

`DRAFT_VERSION` 3: WC slice + answer slice removed, starting-point id
explicit; v2 fixtures captured + rebuild migration + migration report
(SC-003); boot restructured to replay-only resume (093 T018's remainder);
`persistWorkingCopy` snapshot path removed (OAuth continuity
re-expressed per contracts §4.4); the dedup pair deleted; the dormant
slices and ghost test files (`irStore.test.ts`,
`surveyResultsStore.test.ts`) resolved; registry at zero pending / zero
unclassified; the gate's draft-load arm converted to the real loader;
spec-trace acknowledgement + AS-BUILT + README registration (the spec
104 T024 pattern); phase0 fragments removed. **Perf: re-measure**
(cold resume is this phase's number). **Exit**: SC-001…SC-006 all
evidenced in the final PR body.

## Risks & assumption deltas

From research §4 (carried, not buried):

1. **Gallery "decision records" are completion snapshots with no-op
   applies** — Phases 4/5 are builds, not wiring. Sized accordingly in
   tasks.md.
2. **Nothing editor-side records at edit time today.** Every editor
   phase changes a recording *timing*, which is a behaviour change for
   mid-step reload/crash recovery (it improves: state survives). Phases
   must call it out in their PR bodies and e2e the mid-step reload path.
3. **The raw-KMN editor's state lives in no store** — Phase 7 carries a
   genuine design fork (contracts §5.5); if neither arm is acceptable it
   comes back as a ruling request, not a silent pick.
4. **Position persistence (spec 079 R-01)** conflicts with a slice-free
   envelope; the ruling is requested in Phase 8, before the final phase
   needs it.
5. **Dev moves during the programme.** Each phase rebases onto current
   `dev` and re-runs the gate; the census arm makes silent drift loud by
   construction.
