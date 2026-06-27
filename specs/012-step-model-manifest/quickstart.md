# Quickstart / Validation Guide: Unified Step Model + Manifest-Driven Ordering

**Feature**: 012-step-model-manifest | **Date**: 2026-06-27

Runnable validation scenarios proving Phase 4 works end-to-end. Detail lives in [data-model.md](data-model.md), [contracts/](contracts/), and [spec.md](spec.md); this guide is the run/verify recipe. Two sequential PRs (Clarifications 2026-06-27): validate **P4a** before merging, then **P4b**.

## Prerequisites

- Node ≥ 20, pnpm 9; from repo root: `pnpm install` (a clean checkout also needs `pnpm build`'s `prebuild` — see [CLAUDE.md](../../CLAUDE.md)).
- P0/P1/P2 landed (they are, on `main`): dashboard-honest flow map, `ui/` primitives, `IRPath` + declared `inputs`/`writes`.

## Commands

```bash
# Typecheck (catches IRPath / EditorStepProps conformance, manifest typing)
pnpm typecheck

# Studio unit tests (steps/, editors/, dashboard/, reducer, completeness)
pnpm --filter @keyboard-studio/studio test

# A single suite while iterating
pnpm --filter @keyboard-studio/studio test src/dashboard/completeness.test.ts
pnpm --filter @keyboard-studio/studio test src/steps/reducer.test.ts

# Architecture boundaries (the net-new editors/steps/dashboard rules)
pnpm depcruise

# Lint/format
pnpm lint
```

---

## P4a validation — adapters behind the unchanged `SurveyStage` machine

**Goal**: every gallery/panel renders through an editor-step adapter with byte-identical behavior; new editor edges are allowed; `SurveyStage` still drives ordering.

1. **Adapters compile to the contract** — `pnpm typecheck` passes; each adapter in `editors/adapters/` is assignable to `React.ComponentType<EditorStepProps>` (contracts/step-model G3).
2. **Byte-identical behavior** — `pnpm --filter @keyboard-studio/studio test`: the existing gallery/panel suites (`CarveGallery`, `MechanismGallery.test`, `TouchGallery.test`, `BaseResolution.test`, `TrackOneIdentityPanel.test`, `GalleryIntroSplash.test`) pass **unchanged** against the moved+adapted components (SC-002).
3. **Boundaries** — `pnpm depcruise`: `editors/ → stores/` and `editors/ → lib/` pass (allowed); `ui/` leaf still green; a temporary probe `editors/ → dashboard/` import goes **red** then green when removed (contracts/boundaries B1–B3).
4. **Reserved seams declared, inert** — `editors/assignLoop/provenance.ts` exposes the three provenance values (default `hand-set`); `editors/touchSuggest/defaults.ts` exposes the overridable policy; no propagation code path executes (FR-020/021; SC-010).
5. **Still union-driven** — `SurveyStage` union still present in `StudioShell.tsx`; the full survey runs exactly as before. (P4a is revertible by repointing imports.)

**Expected**: all suites green, depcruise green, survey behaves identically. Merge P4a.

---

## P4b validation — manifest-driven ordering + completeness

**Goal**: ordering comes only from the manifest; side effects fire from the reducer; map == runtime; the five §3.5 checks hold.

1. **No `SurveyStage` union remains** — `grep -n "SurveyStage" packages/studio/src/StudioShell.tsx` returns nothing; ordering derives from `steps/manifest.ts` (contracts/manifest-reducer M1; SC-003).
2. **Manifest shape** — `manifest.test.ts`: spine order matches FR-012; exactly two locks (physical then touch); `touch_seed_source` is `spine:false` with a resolving `joinTarget`; ids unique; no A–G vocabulary (M2–M6).
3. **Reducer parity** — `reducer.test.ts`: completing Mechanisms calls `lockDesktop()` once; completing touch runs `buildTouchLayoutJson` + `setTouchLayoutJson` with Case-A/B + graceful degradation; instantiate routes Track1/Track2 correctly; no editor performs these (R1–R6; SC-005).
4. **Map == runtime** — `buildStepGraph(manifest).nodes` has one node per manifest step (galleries + panels included); dashboard node/edge set equals the runtime step set, zero ghost/missing (C8; SC-004). Reorder two manifest steps → both runtime and dashboard reflect it with no other edit (US2 independent test).
5. **Completeness — five distinct checks** (`completeness.test.ts`, SC-006), each on a crafted-violation fixture:
   - transitive staleness includes a 2-edge-distant dependent (C1);
   - a cyclic `writes→inputs` graph is a hard error (C2);
   - a side trail dead-ending off-spine is flagged (C3);
   - a prefix stranding a half-applied lock is flagged; clean prefix is not — **no validator invoked** (C4);
   - an orphan input is flagged, distinct from C4 (C5);
   - the real manifest passes all five (C6).
6. **Staleness slice** — breaking a lock populates `workingCopyStore.staleSteps` with the closure; re-answering clears it; default is empty/"fresh" (FR-019; D5).
7. **End-to-end spine** — a full run through the manifest spine order completes; every spine prefix passes the structural shippability proxy (SC-007).
8. **Revert safety** — reverting the P4b commit restores the union-driven flow without touching `editors/` (SC-009).

**Expected**: all suites green, depcruise green, dashboard mirrors runtime, completeness fixtures behave per contract. Merge P4b.

---

## What this does NOT validate (out of scope — P5)

- `mutate()` execution / actual IR writes (stays a stub).
- Touch propagation/merge using provenance (reserved only).
- Per-prefix validator invocation (shippability is a structural proxy here).
- The dev-only interactive flow-map editor ([specs/009-flow-map-editor](../009-flow-map-editor/spec.md)).
- Legacy YAML loader deletion (P3, separate branch).
