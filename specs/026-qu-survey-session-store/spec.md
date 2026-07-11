# Feature Specification: surveySessionStore — wizard-traversal state migration

**Feature branch:** `km/qu-026-survey-session-store`
**Stage:** 3 of the Unified Survey Architecture refactor (master plan, decisions D4 + D5).
**Governing decision:** [docs/adr/0001-flow-map-derived-from-one-source.md](../../docs/adr/0001-flow-map-derived-from-one-source.md)
— one source of truth per concern; no parallel hand-threaded copies to drift.
**Status:** Draft
**Created:** 2026-07-03

> ## Relationship to the surrounding stages
>
> Stage 1 (spec 024) retired `FLOW_SOURCES`; Stage 2 (spec 025) added the proposed-flow
> Library section. **Stage 3 (this spec) is a pure internal state-migration refactor** — it
> introduces a single store as the source of truth for the survey wizard's *traversal*
> state and rewires the survey component to read from it. It **must not** change what the
> user sees or how any step renders.
>
> This stage deliberately does **not** build the CharactersStep component (Stage 4 /
> spec 027), the generic `StepHost` (Stage 5 / spec 028), the `FlowStepHost` factory
> (Stage 6), or the pure `steps/advance.ts` policy (Stage 5). Those consume the store this
> stage creates; they are out of scope here.

---

## 1. Problem

The survey wizard's traversal state — which step is active, what the user chose, and how to
walk back — lives as a scatter of `useState`/`useRef` values inside the survey component
(today embedded in [packages/studio/src/StudioShell.tsx](../../packages/studio/src/StudioShell.tsx),
~line 398+). Two consequences:

1. **Back navigation is per-handler branching.** Each back handler
   (`handlePrefillBack`, `handleProjectNameBack`, `handleBaseBack`, …) hard-codes its
   destination by re-deriving the previous step from `selectedTrack` and manifest order.
   There is no single "where did I come from" record, so every new step adds another
   bespoke back branch.
2. **A ref-mirroring dance leaks state timing.** Because the memoised `onInstantiate`
   callback closes over a stale `selectedTrack`, the code keeps a `selectedTrackRef` synced
   on every render via an effect, purely so the async compile completion can read the
   current track. This is accidental complexity born of state living in component scope.

Later stages (a generic `StepHost`, adapters that read session state directly instead of
receiving hand-threaded props) are impossible while this state is trapped in the component.
A store is the prerequisite.

## 2. Goal

Introduce **`packages/studio/src/stores/surveySessionStore.ts`** (zustand v5, mirroring the
`workingCopyStore` pattern) as the single source of truth for wizard **traversal** state,
and migrate the survey component to read/write it. Replace per-handler back branching with a
**walked-history stack** (`popHistory`), and delete the `selectedTrackRef` mirroring dance
(the callback reads `surveySessionStore.getState()`, which is always current).

**Parity contract:** the component tree and every per-step prop are **unchanged**; the
survey renders and behaves identically. The existing traversal tests pass **unmodified** —
that is the proof.

## 3. Store shape (D4)

`surveySessionStore` holds exactly the **traversal** state that moves out of the component:

| Slot | Type | Meaning |
|------|------|---------|
| `activeStepId` | `ActiveStepId` | Current manifest step id, incl. terminals `"done"` / `"unsupported"`. |
| `history` | `readonly string[]` | Walked-step stack — the back-nav source of truth (D5). |
| `identityResult` | `IdentityLiteResult \| null` | Identity-lite output. |
| `surveyContext` | `SurveyContext` | Derived from `identityResult`; passed down for interpolation/routing. |
| `selectedTrack` | `Track \| null` | `"copy"` \| `"adapt"` chosen at the track step. |
| `scaffoldSpec` | `ScaffoldSpec \| null` | Track-1 project metadata set at project_name. |
| `localBase` | `BaseKeyboard \| null` | Immediate base selection driving the compile pipeline. |

Actions:

- **`advance(stepId)`** — push the **current** `activeStepId` onto `history`, then set
  `activeStepId = stepId`. This is the one inter-step forward primitive; every forward
  transition routes through it so `history` is always the true walked path.
- **`popHistory()`** — pop the last entry off `history` and set it as `activeStepId`
  (generic back). No-op when `history` is empty (guards the identity/first step — back
  disabled there, matching today).
- **`reset()`** — clear every slot back to initial (start-over).
- Plain setters: `setIdentityResult`, `setSurveyContext`, `setSelectedTrack`,
  `setScaffoldSpec`, `setLocalBase`.

The store imports no stores/lib/components beyond its own types (depcruise boundary: a
store may import contracts/types only).

## 4. State that STAYS in the component this stage (do NOT move)

These remain component-local and are explicitly **out of scope for migration** here:

- **`charactersSub`** (prefill/B intra-phase routing) — dies in Stage 4 (spec 027) when
  `CharactersStep` absorbs it. Moving it now would be churn against a component about to be
  deleted.
- **`oskMode`** — OSK preview concern, not wizard traversal.
- **`instantiatedRef`** (double-instantiation guard) — a pipeline concern per D4. It stays a
  `useRef` in the component and is reset **alongside** `session.reset()` in the start-over
  handler.
- All pipeline hooks — `useKeyboardArtifact`, `useValidator` (single call site, spec-014 V3
  invariant), panes/OSK preview, the pattern-map effect, `reducerDeps` construction — stay
  in the component. This stage moves traversal state only.

## 5. Component rewiring (D4 + D5)

- Replace the `useState` for the seven migrated slots with store reads (selectors).
- **Delete `selectedTrackRef` and its sync effect.** The memoised `onInstantiate` reads
  `surveySessionStore.getState().selectedTrack` — always current, no closure staleness.
- **Forward transitions call `advance(nextId)`** instead of `setActiveStepId(nextId)`, so
  `history` records the walked path.
- **Back handlers call `popHistory()`** wherever that reproduces today's destination
  exactly:
  - `handlePrefillBack` — copy → `project_name`, adapt → `track` (falls out of the walked
    history for free; both paths pushed their true predecessor).
  - `handleProjectNameBack` → `track`.
  - `handleBaseBack` → `identity`.
- **Intra-step back that also sets `charactersSub`** keeps its `charactersSub` adjustment
  locally, in addition to any history pop:
  - `handleCarveBack` → `characters` **and** `setCharactersSub("B")`.
  - `handlePhaseBBack` → `setCharactersSub("prefill")` (pure intra-step; no history pop —
    SurveyRunner's internal answer stack owns this until it bottoms out to `onBack`).
- **`handleStartOver`** delegates to `session.reset()`, then resets
  `instantiatedRef.current = false` locally (ordering: reset the store, then the ref).

## 6. Risks (call out, mitigate)

- **localBase-sync-effect vs store timing.** `localBase` currently drives the compile
  pipeline eagerly and is decoupled from `workingCopyStore.baseKeyboard`. Moving it into the
  session store must not change *when* the pipeline sees it. Mitigation: keep the existing
  effect wiring; only the storage location changes. Verify the compile still fires on base
  selection.
- **instantiatedRef reset ordering on start-over.** The guard must be `false` before the
  next instantiation can fire. Mitigation: keep the ref in the component; reset it in the
  same handler, after `session.reset()`.
- **History fidelity vs the routing oracles.** The walked-history back must reproduce
  `trackRouting`/`prefillRouting` destinations exactly. Mitigation: those oracle tests run
  unmodified as the acceptance gate (§8 SC-002).

## Functional requirements

- **FR-001** A new `surveySessionStore` (zustand v5, `workingCopyStore` pattern) holds
  `activeStepId`, `history`, `identityResult`, `surveyContext`, `selectedTrack`,
  `scaffoldSpec`, `localBase`, with actions `advance`, `popHistory`, `reset`, and plain
  setters for the value slots.
- **FR-002** `advance(stepId)` pushes the current `activeStepId` onto `history` then sets
  the new active step; `popHistory()` pops to the previous walked step (no-op on empty
  history).
- **FR-003** The survey component reads the seven migrated slots from the store; no
  component-scope `useState` for them remains.
- **FR-004** `selectedTrackRef` and its sync effect are deleted; `onInstantiate` reads the
  track via `surveySessionStore.getState()`.
- **FR-005** Back handlers use `popHistory()` where it reproduces today's destination
  exactly; intra-step `charactersSub` adjustments remain component-local.
- **FR-006** `handleStartOver` calls `session.reset()` and then resets
  `instantiatedRef.current = false`.
- **FR-007** `charactersSub`, `oskMode`, `instantiatedRef`, and all pipeline hooks stay in
  the component — unchanged this stage.
- **FR-008** The component tree and every per-step prop are unchanged; zero user-visible
  render or behavior change.

## Success criteria

- **SC-001** `stores/surveySessionStore.test.ts` (new) covers: copy-track back-walk vs
  adapt-track back-walk produce the correct `activeStepId` sequence; `reset()` clears all
  slots including `history`; `advance()` to the same step id twice does not corrupt the
  history stack (double-advance idempotence per traversal semantics).
- **SC-002** These existing tests pass **UNMODIFIED** (the parity proof):
  `packages/studio/src/StudioShell.test.tsx`,
  `packages/studio/src/dashboard/trackRouting.test.ts` (spec-018 copy/adapt oracle),
  `packages/studio/src/dashboard/prefillRouting.test.ts` (spec-019 prefill/back oracle).
- **SC-003** `pnpm --filter @keyboard-studio/studio typecheck`,
  `pnpm --filter @keyboard-studio/studio test` (baseline 4 pre-existing failures only —
  3× `projectWorkingCopyVfs.flagParity.test.ts` CRLF golden + 1× `articleIVProbe.test.ts`),
  and `pnpm depcruise` are green.

## Assumptions

- The survey component remains embedded in `StudioShell.tsx` this stage (no file split);
  Stage 5 shrinks it. This spec migrates state, not file boundaries.
- `zustand@^5` is already a direct dependency of `@keyboard-studio/studio` (confirmed).
- The manifest step-id union and `nextSpineStepAfter` helper are reused unchanged; the store
  stores the resulting id, it does not re-implement step ordering.

## Out of scope

`CharactersStep` component / `charactersSub` removal (Stage 4, spec 027); generic
`StepHost` and `steps/advance.ts` pure advance policy (Stage 5, spec 028); `FlowStepHost` +
`makeFlowStepComponent` (Stage 6); any change to the live survey render path, the component
tree, per-step props, or the Flow Map.
