# Contract: Step Manifest + onComplete Reducer (`steps/manifest.ts`, `steps/reducer.ts`)

**Feature**: 012-step-model-manifest | **Phase**: P4b

## Manifest (`steps/manifest.ts`)

```ts
export const manifest: readonly Step[];   // order in array = survey order
```

### Guarantees (testable — `manifest.test.ts`)

- **M1 — single ordering source.** After P4b, no `SurveyStage` union exists in `StudioShell.tsx`; survey order, branching, spine/side-trail membership, and lock placement all derive from `manifest` (FR-009, SC-003). *(Test: grep asserts no `SurveyStage`; runtime order matches manifest order.)*
- **M2 — spine order.** The `spine: true` steps appear in the functional order: Identity → choose base → Characters → Carve → Mechanisms → (lock physical) → touch carve+add → (lock touch) → Help → Package(reserved) (FR-012).
- **M3 — exactly two locks.** Exactly one `lock: "physical"` and one `lock: "touch"`, in that order, on spine steps.
- **M4 — touch_seed_source fork.** A `spine: false` step `touch_seed_source` exists at touch entry with a `joinTarget` resolving to the touch carve/add spine step (FR-013).
- **M5 — unique ids.** All `Step.id` unique (G4).
- **M6 — no A–G vocabulary.** No step id/title reintroduces the retired sequential phase letters.

## Reducer (`steps/reducer.ts`)

```ts
export function applyStepCompletion(
  stepId: string,
  result: unknown,
  store: WorkingCopyStore,            // existing zustand store
): void;
```

A single dispatcher keyed by `stepId`. It owns every side-effecting transition that `SurveyView` performs inline today.

### Guarantees (testable — `reducer.test.ts`)

- **R1 — lock routing.** Completing the **Mechanisms** step calls `lockDesktop()` exactly once (today: `StudioShell.tsx:377`). (FR-011)
- **R2 — touch-layout build routing.** Completing the **touch** step runs the `buildTouchLayoutJson` logic (today: `StudioShell.tsx:388–410`) and persists via `setTouchLayoutJson`, with the same Case-A/Case-B behavior and the same graceful-degradation-on-error (sets `null`, advances regardless). (FR-011)
- **R3 — copy/adapt routing.** The instantiate transition routes Track 2 → `instantiateFromExisting` and Track 1/default → `instantiateFromBaseIfConfirmed`, identical to today's `onInstantiate` (`StudioShell.tsx:240–253`). (FR-011, Constitution Art. III)
- **R4 — editor purity.** No editor component performs R1–R3; the reducer is the sole caller. (FR-003, SC-005)
- **R5 — unknown step id is a no-op** (steps with no side effect, e.g. most question-steps, pass through harmlessly).
- **R6 — behavior parity.** For the same completion inputs, observable store state after the reducer equals the pre-refactor inline path (golden parity). (SC-002 spirit, applied to side effects.)
