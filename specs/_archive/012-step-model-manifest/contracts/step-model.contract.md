# Contract: Step Model (`steps/types.ts`)

**Feature**: 012-step-model-manifest | **Phase**: P4a

The studio-internal type contract every step and editor adapter satisfies. Consumed by the manifest, the reducer, the register adapters, and the dashboard. This is an **internal** package contract (not `@keyboard-studio/contracts`), but it is the seam P4b and P5 build against, so its shape is specified here.

## Types

```ts
import type { IRPath } from "@keyboard-studio/contracts";

export type StepKind = "question-step" | "editor-step";

export interface StepBase {
  id: string;                       // unique across the whole flow
  kind: StepKind;
  title: string;
  spine?: boolean;                  // default false → side trail (needs joinTarget)
  lock?: "physical" | "touch";      // lock gate after this step; spine steps only
  joinTarget?: string;              // required iff spine === false
  inputs: readonly IRPath[];        // reused from the P2 QuestionModule contract
  writes: readonly IRPath[];
}

export interface QuestionStep extends StepBase {
  kind: "question-step";
  questionId: string;               // resolved via registry by definition.id
}

export interface EditorStep extends StepBase {
  kind: "editor-step";
  component: React.ComponentType<EditorStepProps>;
  surface?: "physical" | "touch";   // carve/add editors
}

export type Step = QuestionStep | EditorStep;

export interface EditorStepProps {
  onComplete: (result: unknown) => void;  // result → manifest reducer; NO side effects in component
  onBack?: () => void;  // optional — entry-point panels (TrackOneIdentityPanel, ScaffoldForm) have no back affordance
  ctx?: SurveyContext;
}
```

## Guarantees (testable)

- **G1 — discriminated union.** `Step.kind` narrows to exactly `QuestionStep` or `EditorStep`; no third kind.
- **G2 — editor purity.** An `EditorStep.component` calls only `onComplete`/`onBack` for flow control; it does **not** call store mutators that perform survey-level transitions (lock, touch-layout build, instantiate). *(Enforced by review + the reducer owning those calls; see completeness/reducer contract.)*
- **G3 — adapter conformance.** Every moved gallery/panel has an adapter in `editors/adapters/` whose exported component is assignable to `React.ComponentType<EditorStepProps>`. *(Compile-checked.)*
- **G4 — id uniqueness precondition.** Consumers may assume `Step.id` is unique; the manifest contract enforces it.
- **G5 — `IRPath` reuse.** `inputs`/`writes` use the P2 `IRPath` type verbatim; an invalid path is a compile error (inherited from P2).

## Non-goals

- This contract does **not** define `mutate` (stays a stub, P5).
- It does not prescribe each editor's internal props — those are narrowed by adapters.
