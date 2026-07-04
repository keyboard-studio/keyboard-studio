# Contract: Advance policy + StepHost

Studio-internal contracts (no external/public API surface; no `packages/contracts` change).
These are the seams the KM crew implements and tests against.

## 1. `steps/advance.ts` — pure advance policy

```ts
import type { ActiveStepId } from "../stores/surveySessionStore.ts"; // type-only
import type { Track } from "...";                                    // type-only

export interface AdvanceContext {
  readonly selectedTrack: Track | null;
  readonly identitySupported: boolean;
}

export interface AdvanceOutcome {
  readonly next: ActiveStepId;
  readonly navigate?: "output";
  readonly setCharactersSubStage?: "prefill";
}

export function advance(
  completedStepId: ActiveStepId,
  result: unknown,
  ctx: AdvanceContext,
): AdvanceOutcome;
```

**Contract guarantees**
- **Pure**: same inputs → same output; no store reads, no I/O, no imports from `stores/` /
  `lib/` / `components/` (dependency-cruiser enforced). `result` is currently unused by the
  branch logic but is part of the signature for forward-compatibility and symmetry with the
  reducer.
- **Total over `ActiveStepId`**: defined for every manifest step id. For `done`/`unsupported`
  (terminals) the policy is not called (the host does not advance past a terminal); if called it
  returns `{ next: <same terminal> }`.
- **Fork correctness** (the load-bearing cases):
  - `advance("track", _, { selectedTrack: "copy" })` → `{ next: "project_name" }`
  - `advance("track", _, { selectedTrack: "adapt" })` → `{ next: "characters", setCharactersSubStage: "prefill" }`
  - `advance("project_name", _, _)` → `{ next: "characters", setCharactersSubStage: "prefill" }`
  - `advance("identity", _, { identitySupported: false })` → `{ next: "unsupported" }`
  - `advance("identity", _, { identitySupported: true })` → `{ next: "choose_base" }`
  - `advance("help", _, _)` → `{ next: "done", navigate: "output" }`
  - spine hops (`choose_base→track`, `characters→carve`, `carve→mechanisms`,
    `mechanisms→touch`, `touch→help`) match `nextSpineStepAfter` exactly (skips `spine:false`).
- **`setCharactersSubStage` semantics**: when present and equal to `"prefill"`, the host calls
  `setCharactersSubStage("prefill")` on the store immediately after `session.advance(next)` and
  before any `navigateTo` call. This is a belt-and-suspenders reset ensuring the characters step
  always starts at the prefill sub-stage — matching the pre-Stage-5 handler ordering asserted by
  the golden-walk oracle. The policy returns this as a declarative signal (pure); the host
  performs the store mutation (same pattern as `navigate?: "output"`).

## 2. `components/StepHost.tsx` — generic host

```ts
export interface StepHostProps {
  /** Built by the survey component and injected (boundary: reducer imports no stores). */
  reducerDeps: ReducerDeps;
  /** Start-over affordance target for the terminal panels. */
  onStartOver: () => void;
  /** Optional: shared survey context to pass as EditorStepProps.ctx. */
  ctx?: SurveyContext;
}

export function StepHost(props: StepHostProps): ReactNode;
```

**Contract guarantees**
- Reads `activeStepId` from `surveySessionStore`.
- **Terminals first**: `done` → survey-complete panel (+ `onStartOver`); `unsupported` →
  `UnsupportedScriptStub` (+ `onStartOver`).
- **Otherwise**: resolves `manifest.find(s => s.id === activeStepId)`; renders `step.component`
  with `EditorStepProps`:
  - `onComplete(result)` → generic completion path:
    1. if `result` is `SurveyPhaseResult`-shaped: `recordPhase(result)` + `routeAnswersThroughMutate(result, deps)`;
    2. `applyStepCompletion(step.id, result, deps)`;
    3. `const { next, navigate, setCharactersSubStage } = advance(step.id, result, { selectedTrack, identitySupported })`; `session.advance(next)`;
    4. if `setCharactersSubStage === "prefill"`: `session.setCharactersSubStage("prefill")`;
    5. if `navigate === "output"`: `navigateTo("output")`.
  - `onBack()` → `session.popHistory()` (the component calls this only when its internal back
    stack bottoms out).
  - `ctx` → `props.ctx`.
- **Chrome by layout**: `step.layout === "full"` → full-screen container; else → left survey pane
  content (the survey component wraps the pane/OSK shell around it).
- **Unknown id** (neither terminal nor manifest step): visible error panel (exhaustiveness guard
  preserved), never a blank pane.
- **No per-step conditional** for manifest steps: the only branches are the two terminals + the
  unknown-id guard. All step differences come from the manifest entry, not the host.

## 3. Manifest / adapter changes

- `identityStep.component` = `IdentityLiteAdapter` (real; replaces `TrackOneIdentityPanelAdapter`).
- `helpStep.component` = `PhaseFAdapter` (real; replaces `TrackOneIdentityPanelAdapter`).
- Mechanisms adapter reads `usePlacementPriors()` internally (no `placementMap` prop).
- Every `manifest` step's declared `component` equals the component the host mounts (SC-005).

## 4. Parity oracle

`stepHost.goldenWalk.test.tsx` records, for copy-track and adapt-track:

```
Array<{ stepId: ActiveStepId; applyStepCompletion: string[]; storeMutations: string[]; navigateTo: string[] }>
```

Committed as fixtures from the pre-refactor tree; asserted identical post-refactor (zero diff).
