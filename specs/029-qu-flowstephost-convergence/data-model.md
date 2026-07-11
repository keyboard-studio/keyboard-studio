# Data Model: FlowStepHost Convergence

No persisted data. The "entities" here are the component prop shapes + the options record — the
runtime contract between the pure host, the factory, and `SurveyRunner`. Types are illustrative
(the code is canonical); no `@keyboard-studio/contracts` type changes.

## FlowStepHost props (pure, `survey/FlowStepHost.tsx`)

```ts
export interface FlowStepHostProps {
  /** Pre-loaded modular flow (factory calls loadModularFlow(source.raw)). */
  flow: FlowDef;
  /** Header text (from options.title / flowSource.title). */
  title: string;
  /** Survey context passed to SurveyRunner (from options.buildContext). */
  context: SurveyContext;
  /** Runner completion — the factory wraps this to run onCommit + extract first. */
  onComplete: (result: SurveyPhaseResult) => void;
  /** Back — host forwards to SurveyRunner (StepHost pop when the runner stack bottoms out). */
  onBack?: () => void;
  /** Optional seeding (project_name slug). Forwarded to SurveyRunner. */
  getSeedValue?: (questionId: string) => string | string[] | undefined;
  onAnswerCommit?: (questionId: string, value: string | string[] | undefined) => void;
  /** Optional per-question lint findings (phase_f). Forwarded to SurveyRunner. */
  findingsByQuestionId?: Record<string, LintFinding[]>;
}
```

**Invariants**:
- Renders exactly the shell all three wrappers share today: a styled `<div>` + `<h2>{title}</h2>` +
  `<SurveyRunner key={flow.flow_id} …/>`. No store access, no `steps/` runtime import.
- Passes optional props through with the same `{...(x !== undefined ? {x} : {})}` guarding the
  wrappers use, so `SurveyRunner`'s optional-prop contract is untouched.

## FlowStepOptions (the per-flow record, `editors/adapters/flowStepOptions.tsx`)

```ts
export interface FlowStepOptions<Extracted = unknown> {
  /** flowSources key — resolved to { raw, title, registry, status }. */
  flowRef: string;
  /** Header title (defaults to flowSource.title if omitted). */
  title?: string;
  /** Build the SurveyContext from live store/hook deps. */
  buildContext: (deps: FlowStepDeps) => SurveyContext;
  /** Shape the runner result into the step payload; return undefined to stay on step. */
  extract: (result: SurveyPhaseResult) => Extracted | undefined;
  /** Fire step-specific store effects BEFORE onComplete (R7 ordering). Optional. */
  onCommit?: (extracted: Extracted, deps: FlowStepDeps) => void;
  /** Optional seeding (project_name). */
  seeds?: {
    getSeedValue: (questionId: string, deps: FlowStepDeps) => string | string[] | undefined;
    onAnswerCommit?: (questionId: string, value: string | string[] | undefined) => void;
  };
  /** Whether the flow needs the findings bridge (phase_f). Optional. */
  usesFindings?: boolean;
}
```

`FlowStepDeps` is the bag of live values the factory reads from stores/hooks (e.g.
`localBase`, `identityResult`, `surveyContext`, `setSelectedTrack`, `setScaffoldSpec`, `setIdentity`,
`findingsByQuestionId`). Its exact membership is an implementation detail; the point is that all
store access is confined to the factory component (`editors/adapters/`), never the host.

## makeFlowStepComponent (factory, `editors/adapters/makeFlowStepComponent.tsx`)

```ts
export function makeFlowStepComponent(
  options: FlowStepOptions,
): React.ComponentType<EditorStepProps>;
```

**Behaviour**:
1. Resolve `source = flowSources[options.flowRef]`; **throw loudly** if absent (FR-010).
2. `const flow = useMemo(() => loadModularFlow(source.raw), [])`.
3. Read `deps` via store hooks (subscribing only to what `buildContext`/`onCommit`/`seeds` need).
4. Wrap `onComplete`: `(result) => { const x = extract(result); if (x === undefined) return;
   onCommit?.(x, deps); props.onComplete(x as SurveyPhaseResult-shaped | payload) }` — reproducing
   each wrapper's "no-op on empty, effects before complete" behaviour exactly.
5. Render `<FlowStepHost flow={flow} title={options.title ?? source.title} context={buildContext(deps)}
   onComplete={wrapped} onBack={props.onBack} …seeds/findings… />`.

**Note**: the factory returns a component satisfying `EditorStepProps` (FR-002), so it drops directly
into `manifest`/`registerEditorSteps` component fields, or a one-line adapter can wrap it.

## The three options records (replacing the three wrappers)

| flowRef | title | buildContext | extract | onCommit | seeds |
|---|---|---|---|---|---|
| `track` | "Authoring Track" | `{ base_name: localBase.displayName }` | `track_choice` → `{track}` | copy: `setSelectedTrack`; adapt: `setSelectedTrack`+`setScaffoldSpec(null)` | — |
| `project_name` | "Name your keyboard" | `{}` | display+id → `{displayName,keyboardId}` | `setScaffoldSpec`+`setIdentity` | slugify (getSeedValue/onAnswerCommit) |
| `phase_f_helpdocs` | "Phase F — Help documentation" | `surveyContext` | identity (raw result) | — | — (usesFindings: true) |

## Deletions

- `survey/PhaseTrack.tsx`, `survey/PhaseProjectName.tsx`, `survey/PhaseF.tsx` and their
  `survey/index.ts` exports.
- The bespoke bodies of `TrackStepAdapter`/`ProjectNameStepAdapter`/`PhaseFAdapter` (they become
  factory calls, or are replaced entirely by the factory output referenced from the manifest).

## Unchanged (consumed as-is)

`SurveyRunner`, `loadModularFlow`, `steps/flowSources.ts` shape, `advance.ts`, `StepHost`,
`slugifyKeyboardId`, `buildFindingsByQuestionId`, both stores, all `content/flows/*.yaml`, the
golden-walk fixtures.
