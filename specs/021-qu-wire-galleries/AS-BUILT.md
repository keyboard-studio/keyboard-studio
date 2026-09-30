# Spec 021 qu-wire-galleries: as built

**Status:** Retired 2026-09-29. Shipped in PR #887 (squash `29ba76f8`, 2026-06-30, together with spec 023); task checkboxes completed by retroactive verification PR #1677 (`d9439b98`, 2026-08-24). Tasks: 26/26 complete.
**Full docs:** [specs/_archive/021-qu-wire-galleries/](../_archive/021-qu-wire-galleries/) (spec, plan, tasks). Not read by default.
**Pinned here:** none (code mentions "spec 021" only in comments).

## What shipped
- Question Unification Phase 1, spec #7: the `carve`, `mechanisms` (physical) and `touch` gallery steps appear as first-class Flow Map nodes with the spec-017 contract declared on them.
- Each gallery's existing write mechanism is preserved unchanged. Physical (R1) and touch (R2) are the known-good reference flows and were not re-architected.
- Covered by the drift guardrail and per-surface emit-byte oracles.

## Public contracts
- Step declarations in `packages/studio/src/steps/registerEditorSteps.ts`: `id:"carve"`, `id:"mechanisms"` (`surface:"physical"`), `id:"touch"` (no `surface`; it is a bespoke chooser panel, not the surface-parameterized shell). Locks live in `steps/manifest.ts`.
- R1 in `packages/studio/src/steps/reducer.ts`: `case MECHANISMS_STEP_ID` calls `deps.lockDesktop()` unconditionally. The touch re-propagation (`repropagate`) is gated behind `isMutateSeamEnabled()`.
- R2 in `reducer.ts`: `case TOUCH_STEP_ID` builds the touch layout via injected `deps.buildTouchLayoutJson` and `setTouchLayoutJson` (bails when `baseIr === null`).

## Key decisions
- "First-class node" means the node and its contract exist; render stays hand-placed by the shell (`manifest[].component` is not used to render the galleries).
- Routing galleries through `mutate()` is Phase 2, deferred, so the reference flows are never destabilised to unblock another flow.

## Gotchas and limits
- The reducer may not import `stores/` (depcruise); dependencies are injected.
- Since R11 (spec 035) the "assignments empty" decision sits inside `deps.buildTouchLayoutJson`, not the reducer.
- Manifest now also has `touch_seed_source` (off-spine) between `mechanisms` and `touch`.

## Divergences from the spec
- Line citations (`reducer.ts:222/249-277`, `StudioShell.tsx:765-797`) have drifted; behaviour matches. The spec's own status note records the 2026-08-20 re-verification.

## Follow-ups and open issues
- Phase 2: route the galleries through `mutate()`.
