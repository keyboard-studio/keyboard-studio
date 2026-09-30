# Contract — `CharactersStep` component + `surveySessionStore` slot delta

## Component: `packages/studio/src/survey/CharactersStep.tsx`

`CharactersStep` satisfies the shared `EditorStepProps` contract
(`packages/studio/src/steps/types.ts`). It is the **first step driven through a manifest
`component`**; the prop shape is unchanged.

```ts
// Signature (conforms to EditorStepProps)
const CharactersStep: React.ComponentType<EditorStepProps>;

// EditorStepProps (existing, unchanged):
interface EditorStepProps {
  onComplete: (result: unknown) => void; // host casts to SurveyPhaseResult
  onBack?: () => void;                    // supplied by the host for this step
  ctx?: SurveyContext;                    // optional; component reads context from the store
}
```

### Behavioural contract

- **Renders** `Prefill` then `PhaseB` — the **same components, same props, same order** as
  the survey component does today. Selection is driven by the store slot
  `charactersSubStage`, not component state.
- **`Prefill`** props (unchanged from today): `identity={identityResult}`,
  `base={localBase}`, `onConfirm`, `onBack`.
  - `onConfirm` → `setCharactersSubStage("B")`.
  - `onBack` → `props.onBack?.()` (substage bottom; host pops walked history).
- **`PhaseB`** props (unchanged from today): `context={surveyContext}`, `onComplete`,
  `onBack`, `findingsByQuestionId` (derived internally). `placementMap` intentionally omitted
  (v1 D-INT-2).
  - `onComplete(result)` → `props.onComplete(result)`.
  - `onBack` → `setCharactersSubStage("prefill")` (intra-step; SurveyRunner's own answer
    stack owns navigation until it bottoms out to this `onBack`).
- **Store reads**: `identityResult`, `localBase`, `surveyContext`, `charactersSubStage` from
  `surveySessionStore`; `validatorFindings` from `workingCopyStore` → memoised
  `buildFindingsByQuestionId`.
- **No survey-level side effects** in the component (Article-IV / G2): it does **not** call
  `applyStepCompletion`, `recordPhase`, `routeAnswersThroughMutate`, `advance`, `popHistory`,
  or any lock/instantiate mutator. It reports completion/back via props; the host runs the
  reducer path. (Reading `validatorFindings` and setting its own `charactersSubStage` are the
  only store touches, both non-transitional.)
- **Guard**: renders `null` when in `prefill` with `identityResult`/`localBase` null.

### Parity guarantees

- Same `Prefill`/`PhaseB` instances and order → identical copy-track and adapt-track screen
  sequences; `findingsByQuestionId` equals today's threaded value for the same store state.
- The manifest `charactersStep` declared `writes` (`[irPath("header","bcp47")]`), DEC-D1
  subsumption, `spine:true`, `flowRefs:["phase_b_characters"]`, `layout` default, and manifest
  position are **unchanged** — the Flow Map bijection node set is unmodified.

## Store delta: `surveySessionStore` (additive to spec 026)

```ts
// packages/studio/src/stores/surveySessionStore.ts  (delta only)

export type CharactersSubStage = "prefill" | "B";

export interface SurveySessionState {
  // …all spec-026 slots + actions unchanged…
  charactersSubStage: CharactersSubStage;              // NEW — initial "prefill"
  setCharactersSubStage: (s: CharactersSubStage) => void; // NEW
  // reset() additionally sets charactersSubStage = "prefill"
}
```

- **Additive-only**: no spec-026 slot, action, initial value, or its parity proof changes.
- `advance` / `popHistory` are untouched; the substage is orthogonal to the walked-history
  stack.
- Consumption: `CharactersStep` reads via a selector and mutates via `setCharactersSubStage`;
  the host sets `"prefill"` at fresh characters entry and calls neither on carve-back (the
  slot already holds `"B"`).

## Manifest delta: `packages/studio/src/steps/manifest.ts`

```ts
// charactersStep — delta only
- component: () => null,      // temporary stub
+ component: CharactersStep,  // survey/CharactersStep
```

All other `charactersStep` fields unchanged.
