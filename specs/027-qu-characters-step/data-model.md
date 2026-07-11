# Phase 1 — Data model: CharactersStep

This is a client-state / component feature. "Data model" = the store-slot delta and the
component's internal state machine. No persisted entities, no schema.

## 1. `surveySessionStore` slot delta (additive to spec 026)

| Slot | Type | Initial | `reset()` | Mutated by |
|------|------|---------|-----------|------------|
| `charactersSubStage` | `"prefill" \| "B"` | `"prefill"` | → `"prefill"` | `setCharactersSubStage(s)` |

- **Action**: `setCharactersSubStage: (s: CharactersSubStage) => void`.
- **Invariant**: additive only — every spec-026 slot, action, and its parity proof are
  unchanged. The `reset()` implementation gains one field; `advance`/`popHistory` are
  untouched (the substage is orthogonal to the walked-history stack).
- **Type home**: `CharactersSubStage = "prefill" | "B"` (today at `StudioShell.tsx:237`)
  relocates to a module the store and component can both import (candidate `steps/types.ts`).

## 2. `CharactersStep` internal state machine

`CharactersStep` has **no `useState`** — its "state" is the store slot `charactersSubStage`.
It is a pure function of store reads.

```text
              props.onBack()                 setCharactersSubStage("prefill")
        ┌───────────────────────────┐   ┌───────────────────────────────────┐
        │                           │   │                                   │
        ▼                           │   ▼                                   │
   (host: popHistory)          [ prefill ] ──Prefill.onConfirm──▶ [ B ] ────┘
                                    ▲   │                          │
                                    │   └──setCharactersSubStage("B")        │
                                    │                                        │
        remount reads slot="B" ─────┘         PhaseB.onComplete(result)      │
        (carve-back re-entry)                        │                       │
                                                     ▼                       │
                                             props.onComplete(result)  ◀─────┘
                                             (host: record → mutate →
                                              applyStepCompletion →
                                              advance to carve)
```

### Reads (selectors)

| Source | Value | Use |
|--------|-------|-----|
| `surveySessionStore` | `identityResult` | `Prefill` `identity` prop; null-guard |
| `surveySessionStore` | `localBase` | `Prefill` `base` prop; null-guard |
| `surveySessionStore` | `surveyContext` | `PhaseB` `context` prop |
| `surveySessionStore` | `charactersSubStage` | which sub-screen to render |
| `workingCopyStore` | `validatorFindings` | `useMemo(buildFindingsByQuestionId)` → `PhaseB` `findingsByQuestionId` |

### Transitions (must equal today — spec §4 table)

| From | Trigger | Store/prop effect |
|------|---------|-------------------|
| `prefill` | `Prefill.onConfirm` | `setCharactersSubStage("B")` |
| `prefill` | `Prefill.onBack` | `props.onBack()` (substage bottom → host `popHistory`) |
| `B` | `PhaseB.onBack` | `setCharactersSubStage("prefill")` (intra-step; no host `onBack`) |
| `B` | `PhaseB.onComplete(result)` | `props.onComplete(result)` |
| (mount) | slot pre-set `"B"` (carve-back) | render PhaseB directly |

### Guards

- If `charactersSubStage === "prefill"` but `identityResult === null || localBase === null`
  → render `null` (matches today's `null` fallback; unreachable once the step is entered).
- `placementMap` is **not** passed to `PhaseB` (v1 D-INT-2), matching today.

## 3. Host (survey-component) delta

- **Deleted state**: `const [charactersSub, setCharactersSub] = useState(...)`.
- **Deleted handlers**: `handlePrefillConfirm`, `handlePrefillBack`, `handlePhaseBComplete`,
  `handlePhaseBBack`, and the `setCharactersSub(...)` lines in `handleTrackSelected`,
  `handleProjectNameNext`, `handleStartOver`, `handleCarveBack`.
- **New mount** (replaces the `stepId === "characters"` inline branch):
  ```tsx
  <CharactersStep
    onComplete={(result) => {
      const r = result as SurveyPhaseResult;
      recordPhase(r);
      routeAnswersThroughMutate(r, reducerDeps);
      applyStepCompletion("characters", r, reducerDeps);
      sessionAdvance(nextSpineStepAfter("characters"));
    }}
    onBack={() => sessionPopHistory()}
  />
  ```
  (This is the same body as today's `handlePhaseBComplete` + `handlePrefillBack`.)
- **Fresh-entry substage reset**: advance-to-characters sites call
  `setCharactersSubStage("prefill")` (or rely on `reset()`/initial) so a new visit starts at
  prefill; `handleCarveBack` keeps `popHistory()` only.
- **Findings thread**: characters no longer receives `findingsByQuestionId` as a prop; the
  help/`PhaseF` thread is unchanged.
