# Contract: step nav channel and footer nav cluster

Internal studio UI contract (Engine team). The types are in [../data-model.md](../data-model.md),
and the rationale for each rule is in [../research.md](../research.md).

## 1. Modules

| Module | Exports |
|---|---|
| `packages/studio/src/stores/stepNavStore.ts` | `useStepNavStore` (`entries`, `publish`, `clear`, `reset`), types `NavAction`, `StepNavSpec`, `STANDALONE_STEP_ID` |
| `packages/studio/src/hooks/usePublishStepNav.ts` | `usePublishStepNav(spec: StepNavSpec): void`, `StepNavContext` |
| `packages/studio/src/components/StepNavCluster.tsx` | `StepNavCluster({ stepId })` |
| `packages/studio/src/ui/Button.tsx` | adds `size?: "default" \| "compact"` |
| `packages/studio/src/test/renderWithI18n.tsx` | `render(ui, { withStepNav?: boolean, ...RenderOptions })` |

## 2. Publisher rules

1. **Call it once per mounted step, from the walk owner.** Appendix A names the owner for each
   row. The wrappers (`FlowStepHost`, `CharactersStep`, `IdentityLite`, `PhaseA`, and the PhaseB
   manual path) MUST NOT call it.
2. **Call it unconditionally at the top level of the component**, with the spec built for the
   current render state. That includes loading, error and empty early returns, so the hook must
   be called *before* any early `return` (FR-015).
3. **Back is the step's own back.** For a step with an internal walk, `back.onClick` is the local
   walk handler (`handleBack`, `handleStationBack`, the gallery `handleBack`, and so on), which
   falls through to the `onBack` prop at the walk's start.
4. **Omit Back when there is nowhere to go.** If neither a local walk position nor `onBack`
   exists, leave out `back` (FR-015, A-3).
5. **Remove the body button in the same change.** A step never renders a nav button both in the
   body and in the footer (FR-001, US3).
6. **Warnings and hints stay in the body.** Pass their ids through `ariaDescribedBy` only while
   they are mounted (FR-016, FR-033).

## 3. Hook semantics

- On every render, the hook stores the latest spec in a ref and publishes from a
  `useLayoutEffect`: after DOM mutation and before paint, so the footer never paints a frame
  without the new step's buttons.
- It publishes stable wrappers whose `onClick` calls `ref.current.<slot>.onClick()`.
- On unmount it calls `clear(stepId, owner)`.
- `stepId` is `useContext(StepNavContext) ?? STANDALONE_STEP_ID`.

## 4. Store semantics

These follow the transitions table in [../data-model.md](../data-model.md#transitions).
`sameSpec` compares slot presence and `label`, `disabled`, `testId`, `ariaLabel` and
`ariaDescribedBy`. Updates use the object form of `set({ ... })`, never a bare function
argument (see the `startOverStore` note).

## 5. Footer render contract

```
<footer aria-label="Project and progress" class="ks-studio-footer">
  <div role="group" aria-label="Step navigation" data-testid="step-nav"
       key={activeStepId}>                      <!-- absent when there are no slots -->
    [back] [secondary] [forward]                <!-- Button size="compact"; only present slots -->
  </div>
  <span>Project: …</span>                        <!-- flex-shrink 1; ellipsis, then hidden (FR-022) -->
  <div data-testid="progress-dot-row">…dots…</div>   <!-- flex 1, margin-left auto, overflow-x auto -->
  <span role="status" aria-live="polite">…</span>    <!-- unchanged, single instance (FR-030) -->
</footer>
```

- The nav group is `flexShrink: 0`, and its buttons are `whiteSpace: nowrap` (FR-022).
- The dot row gets a stable `data-testid="progress-dot-row"`, so that e2e selectors can be
  scoped to it (Appendix B, FR-053).
- `.ks-studio-footer` is 40 px tall, or 52 px under `(pointer: coarse)` (FR-020/FR-020a).
- The narrow-width degrade order is the project label first, then the dot row down to its
  minimum width. The group never shrinks.

## 6. Test harness contract

- `render(ui, { withStepNav: true })` renders `ui`, then `<StepNavCluster
  stepId={STANDALONE_STEP_ID} />`, inside the i18n wrapper.
- `src/test-setup.ts` runs `useStepNavStore.getState().reset()` in `afterEach`.
- Tests that mount StepHost render the real `StudioFooter` (or `StepNavCluster` keyed on the
  active step) next to it.
