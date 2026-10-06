# Data Model: Generic StepHost — Stage 5

This stage introduces no persisted data and no contract types. It defines a few **studio-local**
shapes for the advance policy and the host. All existing types (`Step`, `EditorStep`,
`EditorStepProps`, `ActiveStepId`, `SurveyPhaseResult`, `Track`, `ReducerDeps`) are reused
unchanged.

## New types

### `AdvanceContext` (steps/advance.ts)

A pure snapshot of the session values the advance policy branches on. Passed *in* by the host
(which reads the store); the policy never reads a store.

| Field | Type | Meaning |
|-------|------|---------|
| `selectedTrack` | `Track \| null` | copy vs adapt fork input at the `track` step |
| `identitySupported` | `boolean` | supported-script vs `unsupported` terminal at `identity` |

### `AdvanceOutcome` (steps/advance.ts)

| Field | Type | Meaning |
|-------|------|---------|
| `next` | `ActiveStepId` | the next active step id (incl. `done`/`unsupported`) |
| `navigate?` | `"output"` | set only when reaching `done`, so the host reproduces `navigateTo("output")` |
| `setCharactersSubStage?` | `"prefill"` | set on the adapt-track (`track`→`characters`) and copy-track side-trail (`project_name`→`characters`) transitions; signals the host to call `session.setCharactersSubStage("prefill")` after `session.advance(next)` and before any `navigateTo`. Belt-and-suspenders reset ensuring characters always starts at the prefill sub-stage. |

### `advance` (steps/advance.ts)

```
advance(completedStepId: ActiveStepId, result: unknown, ctx: AdvanceContext): AdvanceOutcome
```

Pure. Encodes R3's mapping. Reuses/moves `manifestIndexOf` + `nextSpineStepAfter` from
`StudioShell.tsx` into this module (same behaviour).

## Reused types (unchanged)

- **`Step` / `EditorStep`** (`steps/types.ts`): the manifest entries the host resolves.
  `component` and `layout` are the load-bearing fields this stage newly *consumes*.
- **`EditorStepProps`** (`steps/types.ts`): `{ onComplete: (result: unknown) => void; onBack?: () => void; ctx?: SurveyContext }`.
  Every mounted component satisfies this. No change.
- **`ActiveStepId`** (`stores/surveySessionStore.ts`): the manifest step ids + `done` +
  `unsupported`. No change.
- **`SurveyPhaseResult`** (survey types): the shape `recordPhase` / `routeAnswersThroughMutate`
  consume. The host's completion path guards on this shape before recording/routing.
- **`ReducerDeps`** (`steps/reducer.ts`): built in the survey component and passed to the host;
  `applyStepCompletion` signature unchanged.

## State transitions (survey traversal — unchanged behaviour, relocated owner)

The state machine is identical to Stage 4; only its *driver* changes (from per-step handlers to
`advance` + the host completion path). Terminals are `done` / `unsupported`.

```
identity ──supported──▶ choose_base ──▶ track ──copy──▶ project_name ──▶ characters ──▶ carve
   │                                       │                                   ▲
   └─unsupported─▶ [unsupported]           └─adapt───────────────────────────┘
                                                                                │
characters ──▶ carve ──▶ mechanisms ─[lock physical]─▶ touch ─[lock touch]─▶ help ──▶ [done] ──▶ (navigate output)
```

Back navigation: walked-history pop (`popHistory`), delegated to intra-step back first
(unchanged from Stage 3/4). `identity` = `history[0]`, back disabled.

## Owner boundaries

| Concern | Owner after Stage 5 |
|---------|---------------------|
| which component renders + chrome | `components/StepHost.tsx` (reads manifest + `layout`) |
| next-step / fork / terminal decision | `steps/advance.ts` (pure) |
| record / route / `applyStepCompletion` / advance / `setCharactersSubStage` signal | host completion path (generic) |
| identity result → session store write | `IdentityLiteAdapter` (step-specific data) |
| pane shell, OSK preview, `useValidator`, `oskMode`, `instantiatedRef` | survey component (`StudioShell.tsx`) |
| `ReducerDeps` construction | survey component (passed to host) |
