# Contract — `surveySessionStore` public API

The store's public surface consumed by `StudioShell.tsx` (and, in later stages, `StepHost`
and step adapters). Mirrors the `workingCopyStore` idiom: a zustand `create<T>()` hook
plus a `.getState()` escape hatch for imperative reads inside memoised callbacks.

```ts
// packages/studio/src/stores/surveySessionStore.ts

export type ActiveStepId =
  | "identity" | "choose_base" | "track" | "project_name" | "characters"
  | "carve" | "mechanisms" | "touch" | "help" | "done" | "unsupported";
// (authority = the union at StudioShell.tsx:237, copied verbatim; no "package" member)

export interface SurveySessionState {
  // --- traversal slots ---
  activeStepId: ActiveStepId;
  history: readonly ActiveStepId[];
  identityResult: IdentityLiteResult | null;
  surveyContext: SurveyContext;
  selectedTrack: Track | null;
  scaffoldSpec: ScaffoldSpec | null;
  localBase: BaseKeyboard | null;

  // --- actions ---
  advance: (stepId: ActiveStepId) => void;
  popHistory: () => void;
  reset: () => void;
  setIdentityResult: (r: IdentityLiteResult | null) => void;
  setSurveyContext: (c: SurveyContext) => void;
  setSelectedTrack: (t: Track | null) => void;
  setScaffoldSpec: (s: ScaffoldSpec | null) => void;
  setLocalBase: (b: BaseKeyboard | null) => void;
}

export const useSurveySessionStore: UseBoundStore<StoreApi<SurveySessionState>>;
```

## Consumption contract (how `StudioShell.tsx` uses it)

- **Reads** via selectors: `const activeStepId = useSurveySessionStore((s) => s.activeStepId)`
  (one selector per slot, matching the `workingCopyStore` call style already in the file).
- **Imperative read** inside the memoised `onInstantiate`:
  `useSurveySessionStore.getState().selectedTrack` — replaces the deleted `selectedTrackRef`.
- **Forward** transitions call `advance(nextId)` (was `setActiveStepId(nextId)`).
- **Back** calls `popHistory()` where it reproduces today's destination (see spec §5).
- **Start-over** calls `reset()`, then the component resets its local
  `instantiatedRef.current = false`.

## Backwards-compatibility / parity guarantees

- No change to `workingCopyStore`; `setIdentity(...)` continues to flow identity into the
  working copy exactly as today (this store is additive).
- No change to the component tree, per-step props, or render output.
- The three traversal oracle tests pass **unmodified** — this is the contract's acceptance
  test.
