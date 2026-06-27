# Implementation Plan: Unified Step Model + Manifest-Driven Survey Ordering

**Branch**: `claude/survey-modularity-cyoa-phase-4-q9ey3o` | **Date**: 2026-06-27 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/012-step-model-manifest/spec.md`

## Summary

Phase 4 (P4a + P4b) of the Survey Modularity + CYOA Refactor ([docs/survey-modularity-cyoa-plan.md](../../docs/survey-modularity-cyoa-plan.md)) collapses the three incompatible "forms" that advance the survey — registered question modules, the carve/add galleries, and the five hand-built wizard panels — into **one ordered step model**, then makes a single `steps/manifest.ts` the **sole source of survey ordering**, read by both the runtime and the dashboard so **map == runtime by construction**.

Technical approach, in two sequential PRs (Clarifications 2026-06-27):

- **P4a** — introduce `steps/types.ts` (the `QuestionStep` / `EditorStep` / `EditorStepProps` model) and move the galleries into `editors/assignLoop/` (shared add-shell + separate physical/touch behaviors) and `editors/carve/` (carve keeps its own remove-mode identity), and the five panels into `editors/panels/`. Each gallery/panel gets a thin per-step **adapter** that normalizes its current non-uniform props (`onNext`/`onResolved`/`onSubmit`/`onComplete`) to the one `EditorStepProps` contract. All of this lands **behind the unchanged `SurveyStage` machine** in `StudioShell.tsx` so behavior stays byte-identical and the change is revertible by repointing imports. Reserve (declare, do not execute) the per-key touch **provenance** tag and the `touchSuggest` defaults-as-data policy.
- **P4b** — author `steps/manifest.ts` (the ordered list with spine/side-trail/lock metadata + the `touch_seed_source` fork), add `steps/registerQuestionSteps.ts` / `registerEditorSteps.ts`, and **rewrite `SurveyView`** (~517 LOC) to read order from the manifest and route its three inline side effects (`lockDesktop()` at mechanisms-complete, the `buildTouchLayoutJson` block at touch-complete, the copy/adapt branch at instantiate) through a **single step-id-keyed `onComplete` reducer**. Rename `flowmap/` → `dashboard/`, repoint it at the manifest, and ship `dashboard/completeness.ts` with the five distinct §3.5 checks. Add a `staleness` slice to `workingCopyStore`.

No `Pattern` schema, KeyboardIR-spine, validator-layering, or VirtualFS contract changes — the P2 contract additions (`IRPath`, `inputs`/`writes`) already landed and are consumed as-is.

## Technical Context

**Language/Version**: TypeScript 5.x (strict; Bundler module resolution with **explicit `.ts`/`.tsx` import extensions**), React 18, Vite. Node ≥ 20, pnpm 9.

**Primary Dependencies**: `@keyboard-studio/contracts` (`IRPath`, `irPath()`, `formatIRPath()`, `KeyboardIR`, `FlowQuestion`), the existing studio `ui/` primitive library (P1), `zustand` working-copy store, dependency-cruiser (architecture fitness functions), vitest + Playwright.

**Storage**: N/A — in-memory VirtualFS + zustand working copy only; nothing persisted to host disk during authoring (Constitution Art. V). No new persistence introduced.

**Testing**: vitest (`pnpm --filter @keyboard-studio/studio test`), per-question mirrored test tree at `packages/studio/tests/survey/questions/`, Playwright E2E (`packages/studio/e2e/`, currently `.skip`-ped), `pnpm depcruise` for boundary rules.

**Target Platform**: Browser SPA (studio), authored desktop-first; output is `.kmn` / touch-layout JSON via VirtualFS.

**Project Type**: Front-end refactor within the `@keyboard-studio/studio` package of a pnpm monorepo (Engine-team-owned SPA; Content owns survey text/gallery ordering — see Constitution Art. VI / Team Boundaries note below).

**Performance Goals**: No new runtime cost. The completeness/dashboard checks run at author/dev time over a bounded manifest (~tens of steps), not on the survey hot path. The single 300 ms debounce cycle (D3) is untouched.

**Constraints**:
- Strict-TS explicit-extension imports — every move/rename must update specifiers including the extension; `<id>/index.ts` imported as `…/index.ts` (§8).
- P4a must be byte-identical behavior under the unchanged `SurveyStage` machine.
- P4b must remain revertible to the union-driven flow without touching editors (SC-009).
- Spine-prefix shippability is a **structural proxy** this phase (no validator invocation) — Clarifications 2026-06-27.
- `mutate()` stays a stub; no IR is written by this feature (P5 / #5b / #232).

**Scale/Scope**: ~12 `SurveyStage` members today → manifest of ~14–16 steps (10 spine + the `touch_seed_source` fork + the wizard/base steps). 3 galleries + the carve subtree + 5 wizard panels moved/adapted. `SurveyView` ~517-LOC rewrite. ~5 new dependency-cruiser rules. 1 new store slice. 1 new completeness module with 5 checks.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Gate | Verdict |
|---|---|---|
| **I. Pattern schema is a locked contract** | Does this rename/retype/remove any `Pattern` field or its zod mirror? | **PASS** — untouched. This feature consumes `IRPath`/`inputs`/`writes` (P2, already landed); it adds no contract field. The reserved touch-provenance tag and `touchSuggest` policy live in the **studio editor layer**, not in `packages/contracts`; if a future phase moves provenance into `TouchKeyIR`, that is the already-ratified P5 major bump, out of scope here. |
| **II. KeyboardIR is the engine spine** | Does any code operate on raw `.kmn` instead of the IR, or drop opaque fragments? | **PASS** — no codec/IR changes. `mutate()` stays a stub; no IR writes occur. Editors continue to read IR via the existing `irToCarveNodes`/`buildTouchLayoutJson` helpers. |
| **III. Single persistent working copy** | Does it add a second working copy or intermediate serialization? | **PASS** — the copy/adapt branch (`instantiateFromBase`/`instantiateFromExisting`) is **moved into the reducer unchanged**, still one working copy, still serialized only at output. The new `staleness` slice is derived UI state over that one copy, not a second copy. |
| **IV. Validator layering is fixed (one 300 ms debounce)** | Does it add a second debounce or a parallel validation path? | **PASS** — no validator or debounce change. The spine-prefix shippability check is a **structural proxy** (lock-consistent working copy), explicitly **not** a validator invocation (Clarifications 2026-06-27), so it introduces no second validation path. |
| **V. VirtualFS only during authoring** | Does it write to host disk during authoring? | **PASS** — no new I/O; all state stays in-memory. |
| **VI. Team boundaries** | Which team owns this, and does it stay in bounds? | **PASS (with note)** — Engine owns the SPA shell/ordering/dashboard machinery (steps model, `SurveyView` rewrite, completeness, depcruise rules). Content owns survey text and **gallery ordering**; the manifest's *step order* is the encoding of that ordering, so the manifest's spine order is authored to match the Content-owned sequence and any reordering remains a Content-reviewable edit. No survey *text* changes here. |
| **VII. Out of scope for v1** | Does it implement any §16 forbidden item? | **PASS** — no CJK/Ethiopic reorder, no LDML, no touch-first authoring (touch is seeded from the locked physical layout via `touch_seed_source`, never the reverse), no multi-source merge. The CJK/Ethiopic "not yet supported" stub (`unsupported` stage) is preserved as a step. |
| **VIII. House conventions** | Emoji in console? backticked file refs in user text? issue numbers in code? commit style? | **PASS** — no console emoji (the 🔒 lock markers are spec/doc prose, not console output; manifest lock metadata is a typed field, not an emoji); commits follow `<prefix>(<area>): …`; no issue numbers in shipped code (cross-linked via commit/PR). |

**Initial Constitution Check: PASS.** No violations; Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/012-step-model-manifest/
├── plan.md              # This file (/speckit-plan)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (step-model.contract.md, manifest.contract.md, completeness.contract.md)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Target layout after Phase 4 (names **decided** per Clarifications 2026-06-27 — plan's proposed names adopted as-is). **(NEW)** marks net-new areas; **(MOVE)** marks relocations.

```text
packages/studio/src/
  StudioShell.tsx                 # P4b: SurveyView reads order from steps/manifest.ts; no SurveyStage union
  StudioShell.test.tsx

  steps/                          # (NEW) unified ordered step model
    types.ts                      # StepKind, StepBase, QuestionStep, EditorStep, EditorStepProps
    manifest.ts                   # (P4b) single ordered list: spine/side-trail/lock/joinTarget
    manifest.test.ts
    reducer.ts                    # (P4b) step-id-keyed onComplete reducer (lock, touch-build, copy/adapt)
    reducer.test.ts
    registerQuestionSteps.ts      # (P4b) adapts QuestionModules -> question-step (by definition.id)
    registerEditorSteps.ts        # (P4b) adapts editors -> editor-step

  editors/                        # (NEW) editor-step components
    assignLoop/                   # (MOVE) shared add-shell (§3.6 piece 1) + separate behaviors (piece 2)
      AssignLoopShell.tsx         # from MechanismGallery/TouchGallery (surface-parameterized)
      physicalBehavior.ts         # keys / AltGr / dead keys
      touchBehavior.ts            # layers / long-press / flick / multitap
      provenance.ts               # (NEW, reserved) base-derived | physical-suggested | hand-set
      parts/                      # (MOVE) former components/carve/* shared chrome
      IntroSplash.tsx PreviewPane.tsx   # (MOVE) from GalleryIntroSplash/GalleryPreviewPane
      *.test.tsx
    carve/                        # (MOVE) carve stays its OWN remove-mode component (shares ui/ only)
      CarveGallery.tsx (+ .test)
    touchSuggest/                 # (NEW, reserved) §3.6 piece 3
      touchSuggest.ts defaults.ts touchSuggest.test.ts
    panels/                       # (MOVE) former Form-3 wizard steps
      TrackStep.tsx ProjectNameStep.tsx ScaffoldForm.tsx
      TrackOneIdentityPanel.tsx (+ .test) BaseResolution.tsx (+ .test)
    adapters/                     # (NEW) per-editor prop-normalizing adapters -> EditorStepProps

  dashboard/                      # (MOVE; was flowmap/) the index/dashboard
    DashboardView.tsx             # was FlowMapView.tsx; reads steps/manifest.ts
    buildStepGraph.ts             # was buildFlowGraph.ts; consumes manifest (+ keeps modular-registry path)
    completeness.ts               # (NEW) the 5 §3.5 checks
    completeness.test.ts
    FlowGraphView.tsx ScriptRoutingView.tsx StrategyTreeView.tsx
    buildScriptRouting.ts flowUtils.ts layout.ts model.ts tokens.ts
    *.test.ts(x)

  survey/                         # (mostly unchanged) types.ts already carries inputs/writes (P2)
  stores/workingCopyStore.ts      # (EDIT) + staleness slice (§3.5); desktopLocked already exists
  lib/                            # buildTouchLayoutJson.ts, irToCarveNodes.ts stay (editor deps)
  ui/                             # unchanged (P1 leaf)

.dependency-cruiser.cjs           # (EDIT) + steps/editors/dashboard layering rules (§8)
```

**Structure Decision**: Front-end refactor confined to `packages/studio/src` plus the repo-root `.dependency-cruiser.cjs`. Net-new top-level folders under `studio/src`: `steps/`, `editors/`, `dashboard/` (the last replacing `flowmap/`). The `editors/ → stores/` and `editors/ → lib/` edges are intentional and will be **explicitly allowed** in depcruise; `ui/` stays a leaf (P1). Per-question tests remain in the mirrored `packages/studio/tests/` tree (P2); new step/editor/dashboard tests colocate with their subject.

## Complexity Tracking

> No Constitution Check violations — table intentionally empty.
