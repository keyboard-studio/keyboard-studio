# Implementation Plan: Mobile/touch layout derivation

**Branch**: `035-mobile-touch-derivation` | **Date**: 2026-07-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from [specs/035-mobile-touch-derivation/spec.md](spec.md)

## Summary

Replace the touch stage's origin-agnostic seed with a **derivation that carries the
author's locked desktop work forward**, and wire the dead `touch_seed_source` fork so
the author picks between two paths:

- **US1 — import-and-adapt (default, P1):** when the base ships a usable touch layout,
  seed from it and replay the desktop modifications — carve removals and letter
  placements — onto it.
- **US2 — reseed-from-desktop (fallback, P2):** when the base has no usable touch layout
  (or the author rejects it), project the locked desktop layers into a phone touch layout
  and programmatically simplify it, keeping every inventory character reachable.

**Key technical finding (grounds the whole plan — see [research.md](research.md) R1):**
the engine already ships a working physical→touch projection.
[`scaffoldTouchLayout`](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts)
does **not** emit the desktop-shaped full grid the spec's "Reference implementation"
section describes (that describes Keyman Developer's Delphi converter, which we are
explicitly *not* reusing). It already produces a **compact 3-layer `phone` platform**
(default + shift + numeric, ≤10 keys/row) populated from the IR's desktop rules and
augmented with deadkey `sk[]`. So the reseed path (US2) is largely *already the compact
projection*; the missing engineering is smaller and more targeted than the spec framing
implies. This plan is scoped to the true gaps:

1. **Desktop-modification replay** (FR-002/FR-004/FR-005): propagate desktop carve
   removals + letter placements onto **both** paths — critically the Case B
   (import-and-adapt of a shipped base layout) path, which today preserves the base
   verbatim and drops the desktop work.
2. **Seed-source fork wiring** (FR-006): revive `touch_seed_source` in
   [advance.ts](../../packages/studio/src/steps/advance.ts) so the author chooses, instead
   of the current unconditional `mechanisms → touch` hop that skips it.
3. **Coverage guard** (FR-008): a check that no inventory character becomes uncoverable
   after simplification/replay, wired into the existing touch-lint surface.
4. **Seed-comment / fallback correction** (FR-001): remove the stale "fixed minimal
   QWERTY / desktop edits NOT transferred" behavior and its comment in
   [TouchGallery.tsx](../../packages/studio/src/editors/assignLoop/TouchGallery.tsx).

## Technical Context

**Language/Version**: TypeScript 5.x, Node ≥ 20, pnpm 9 workspace.

**Primary Dependencies**: React 18 + Vite (studio); `@keyboard-studio/contracts`
(`TouchLayoutIR`, `TouchKeyIR`, `TouchAssignment`, `KeyboardIR`); `@keyboard-studio/engine`
(`scaffoldTouchLayout`, `applyTouchAssignments`, `applyTouchAssignmentsToRawJson`,
`emitTouchLayout`, `parse-touch`); `@keymanapp/keyboard-lint` (Layer C touch checks
18.1–18.6).

**Storage**: N/A — all authoring in the in-memory VirtualFS (Constitution V). Touch layout
serialized only at output to `source/<id>.keyman-touch-layout`.

**Testing**: vitest (engine unit + studio unit), Playwright E2E (studio). The touch
pipeline already has `parse-touch.test.ts` and `compile.touch-longpress.test.ts`.

**Target Platform**: Browser SPA (studio); the emitted artifact targets Keyman phone +
tablet touch platforms.

**Project Type**: Monorepo — engine (pure TS pipeline) + studio (React SPA). Two-team split
(Constitution VI): this feature is **Engine-owned** (SPA touch stage, scaffolder projection,
touch apply/emit, validator coverage check).

**Performance Goals**: All derivation runs inside the existing single 300 ms debounce cycle
(Constitution IV, decision D3). No new debounce timer; no added network calls.

**Constraints**: Pure, non-mutating engine functions (no store/IR mutation in projection);
VirtualFS-only during authoring; KeyboardIR is the spine (project from IR rules, never from
raw `.kmn` text); emitted `.keyman-touch-layout` must compile via kmcmplib.

**Scale/Scope**: One touch stage; the alphabetic script set verified in 034 (SC-004). Not a
new package — edits land in existing `packages/engine` and `packages/studio` modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Article | Verdict | Notes |
|---|---|---|
| I. Pattern schema locked | **PASS** | No `Pattern`/`Criterion` field change. Reuses existing `TouchAssignment.mechanisms[]` patternIds (`longpress_alternates`, `flick_gestures`, `multitap`, `touch_key_replace`, `touch_inherited`). No zod/schema edit. |
| II. KeyboardIR is the spine | **PASS** | Projection reads `ir.groups` rules / `ir.touchLayout` (KeyboardIR), never raw `.kmn`. Case B applies onto the shipped `.keyman-touch-layout` JSON (already the accepted verbatim-preserve path); desktop-modification replay is expressed as touch-layout edits, not text munging. No opaque-fragment loss. |
| III. Single working copy | **PASS** | Derivation consumes the post-lockDesktop `baseIr` snapshot + `baseVfs`; touch edits mutate the one working copy; serialized only at output. No second working copy, no intermediate serialize. |
| IV. Validator layering / one debounce | **PASS** | Coverage guard (FR-008) is a Layer C touch check (18.6 coverage) surfaced through the existing `useTouchLint` path — no new debounce timer, no parallel validation path. |
| V. VirtualFS only | **PASS** | Seed import reads base VFS; output writes `source/<id>.keyman-touch-layout` into VFS only. No host-disk writes during authoring. |
| VI. Team boundaries | **PASS** | Engine-owned surface end to end (SPA touch stage, scaffolder, pattern-apply, validator). No content-team asset (pattern library / survey text / gallery ordering) changes. |
| VII. Out of scope for v1 | **PASS** | No mobile-first authoring (Decision 6 respected — touch is a downstream transform of the locked desktop). No LDML, no mobile-app integration. Improving Keyman Developer's own converter is explicitly out of scope (spec Out of Scope). |
| VIII. House conventions | **PASS** | No emoji in console/UI status; markdown links in docs; no issue numbers in shipped code; commit titles `feat(studio)/feat(engine)/…`. |

**Result: PASS — no violations. Complexity Tracking table left empty.**

Post-Phase-1 re-check: **PASS** (design introduces no new package, no schema change, no
second debounce; all new logic is pure engine functions + one advance-policy branch + one
Layer C check). See [research.md](research.md) and [data-model.md](data-model.md).

## Project Structure

### Documentation (this feature)

```text
specs/035-mobile-touch-derivation/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 output — decisions R1–R8
├── data-model.md        # Phase 1 output — entities + derivation flow
├── quickstart.md        # Phase 1 output — validation scenarios (US1/US2)
├── contracts/           # Phase 1 output — function/UI contracts
│   ├── seed-derivation.md
│   ├── simplification.md
│   └── seed-source-fork.md
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

This feature edits existing modules — **no new package, no new top-level directory.**

```text
packages/engine/src/
├── scaffolder/
│   └── scaffoldTouchLayout.ts          # (exists) compact phone projection — reused as the US2 reseed base
├── pattern-apply/
│   ├── applyTouchAssignments.ts        # (exists) folds Phase E assignments into TouchLayoutIR
│   ├── applyTouchAssignmentsToRawJson.ts  # (exists) Case B verbatim-preserve apply
│   ├── applyDesktopModifications.ts    # (NEW) replay carve removals + letter placements onto a touch seed
│   └── touchCoverage.ts                # (NEW) inventory-coverage computation (feeds FR-008 guard)
└── codec/
    └── parse-touch.ts                  # (exists) .keyman-touch-layout → TouchLayoutIR

packages/studio/src/
├── steps/
│   ├── advance.ts                      # (EDIT) route mechanisms → touch_seed_source → touch (FR-006)
│   └── registerEditorSteps.ts          # (EDIT, if needed) seed-source step gets a chooser surface
├── editors/assignLoop/
│   └── TouchGallery.tsx                # (EDIT) drop stale QWERTY seed + comment; consume derived seed (FR-001)
├── editors/
│   └── touchSeedSource/                # (NEW dir) the seed-source chooser panel (usable-vs-reseed)
└── lib/
    └── buildTouchLayoutJson.ts         # (EDIT) route desktop-modification replay into both Case A and Case B

packages/keyboard-lint/src/checks/     # (EDIT) touch coverage check 18.6 (FR-008)
```

**Structure Decision**: Single monorepo, engine-owned. The projection engine already
exists ([`scaffoldTouchLayout`](../../packages/engine/src/scaffolder/scaffoldTouchLayout.ts));
new engine code is two small pure modules (`applyDesktopModifications`, `touchCoverage`).
The only studio structural addition is the seed-source chooser panel; the fork itself is one
branch in the existing pure `advance` policy. No new package is justified (Constitution — a
new package would trip `pnpm -r` and add a dependency-root edge for zero benefit).

## Complexity Tracking

> No Constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
