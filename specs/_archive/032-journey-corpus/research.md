# Phase 0 Research: Journey corpus

## R1 — The spec's routing-engine citation has architecturally drifted; the real harness needs two layers

**Decision**: `replayJourney()` drives `packages/studio/src/steps/advance.ts`'s `advance()`/`nextSpineStepAfter()`/`manifestIndexOf()` for inter-step (manifest spine) transitions, and falls back to `SurveyRunner.tsx`'s `evalCondition`/`resolveNext`/`advanceThrough` only for intra-step question routing (e.g. inside the `characters` step's Phase A/B battery, which is a single opaque manifest node subsuming a whole modular-flow sub-graph).

**Rationale**: All three `SurveyRunner.tsx` functions the spec names still exist exactly as it describes them (confirmed by direct read: `evalCondition` line 60, `resolveNext` line 104, `advanceThrough` line 196) — but they only ever operated at the intra-flow level. `steps/advance.ts` did not exist (or was not referenced) when this spec was written (2026-07-06); it is the manifest-level pure step-advance policy that shipped later (confirmed as part of this session's spec 033 closure). A journey spanning the full spine — as `bafut-end-to-end` and `minimal-defaults` require — cannot be built from the `SurveyRunner` trio alone.

**Alternatives considered**: Driving the full replay through `SurveyRunner.tsx` functions only, treating the whole manifest as one flattened flow — rejected: this would require flattening the manifest's step graph into a single `FlowQuestion` sequence, duplicating `steps/advance.ts`'s own routing logic rather than reusing it, and risking exactly the kind of "two divergent implementations" this repo's Constitution warns against elsewhere (FR-008-style concerns).

## R2 — `buildStepGraph`/`renderedNodeSet` names have drifted slightly; the real functions are close cousins

**Decision**: The coverage-report function calls `buildManifestStepGraph(): StepGraph` (`packages/studio/src/dashboard/buildStepGraph.ts`, confirmed export) for the full manifest edge set, and `collectRenderedNodeIds(flows: BuiltFlowSource[]): Set<string>` plus `buildFlowSources(): BuiltFlowSource[]` (`packages/studio/src/dashboard/renderedNodeSet.ts`, confirmed exports) to compute which nodes render for a given fixture's answer set.

**Rationale**: The spec's Key Entities section names `buildStepGraph`/`renderedNodeSet` as if they were the literal function names; direct read confirms the actual exports are `buildManifestStepGraph` and `collectRenderedNodeIds`/`buildFlowSources` respectively — same purpose, drifted names (both files are otherwise exactly where the spec says). This is cosmetic, not a capability gap: both real functions do what the spec's Key Entities section describes.

**Alternatives considered**: Writing new coverage-computation logic from scratch — rejected: the existing functions already compute exactly what's needed (spine graph + per-answer-set rendered nodes); this would duplicate live, tested code for no reason.

## R3 — Corpus/replay pattern: genuinely new to this repo

**Decision**: No existing precedent to mirror structurally for the fixture format itself — `journey-runner.ts` and the YAML schema are new. The idiomatic *test-execution* pattern to mirror is `SurveyRunner.test.ts`, which already drives `advanceThrough`/`resolveNext` directly, DOM-free, plain vitest — confirming a headless, no-React-Testing-Library, no-Playwright harness is both possible and already the house style for routing-logic tests.

**Rationale**: A broad case-insensitive grep for "corpus"/"replay"/"journey" across `packages/studio/src` and `content/` returned no real hits — this is genuinely new harness shape, not a rename or extension of something existing.

## R4 — Fixture data reuse: three of four fixtures have real source data; one is fully synthetic

**Decision**:
- `bafut-end-to-end`: assembled from `content/flows/_examples/{phase_a_bafut,phase_b_bafut,phase_f_bafut}.yaml` (confirmed present, completed-instance format).
- `bj-cree-woods-track2`: uses the real, indexed `bj_cree_woods` keyboard (`docs/keyboard-index.md`, path `../keyboards/release/bj/bj_cree_woods`).
- `backtrack-journey` and `minimal-defaults`: authored fresh — no existing fixture data to reuse (both are synthetic scenarios by the spec's own design: a `layout_family` flip and an all-defaults pass, respectively).

**Rationale**: Confirms the spec's own FR-009 fixture list is buildable without additional fixture-sourcing work for 3 of 4; the remaining 2 are hand-authored scenarios by design, not blocked on missing data.

## R5 — Coverage-guardrail reference resolved: it's the spec 012 completeness checks, not a `specs/016-*` directory

**Decision**: The spec's Assumptions section reference to "spec 016 drift guardrail" does not correspond to a `specs/016-*` directory (none exists) — it is shorthand for the completeness/staleness checks (C1–C7: staleness fixpoint, cycle detection, rejoin, spine-prefix shippability, inputs-satisfiability) that actually live in `specs/012-step-model-manifest/spec.md` (FR-014 through FR-019), landed via the P4b work already confirmed shipped this session (specs 026/028/033).

**Rationale**: This is a citation-drift correction only — the actual completeness/staleness machinery this spec's coverage gate should sit beside is real, shipped, and exactly where `specs/012-step-model-manifest/spec.md` describes it.

## R6 — Coverage gate mode: report-only for the first increment

**Decision**: Implement FR-007's "report-only" mode (list uncovered edges, exit 0) for this feature's scope; defer the "ratchet" (ci-failing) mode to a follow-up once a coverage baseline exists to ratchet against.

**Rationale**: The spec explicitly defers this choice to planning ("Both modes are valid; the spec names both; planning will choose"). A ratchet needs a committed baseline to compare against — generating that baseline is what the report-only mode's first run produces. Shipping report-only first is the only order that makes a later ratchet meaningful; shipping ratchet-first with no real baseline would either be vacuous (compares against nothing) or need the baseline fabricated ahead of the actual coverage run.

**Alternatives considered**: Shipping the ratchet immediately with a hand-authored zero-baseline — rejected: a fabricated baseline defeats the purpose of the gate (it should reflect this feature's own first honest measurement, not a guess).
