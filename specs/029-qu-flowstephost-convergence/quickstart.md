# Quickstart: FlowStepHost Convergence

Validation guide for Stage 6. Run from repo root unless noted.

## Prerequisites

- On branch `km/qu-029-flowstephost-convergence` (forked from `main` with spec 028 / Stage 5 merged).
- `pnpm install` clean; baseline green: `pnpm --filter @keyboard-studio/studio test`.

## Parity gate (the release gate)

The Stage-5 golden-walk oracle is the proof of zero behaviour change. It MUST stay unmodified.

```bash
pnpm --filter @keyboard-studio/studio test stepHost.goldenWalk
```

Expected: both fixtures (`copy.json`, `adapt.json`) replay with zero diff after the refactor. If this
diffs, the convergence changed behaviour — stop and reconcile before proceeding.

## Factory unit test

```bash
pnpm --filter @keyboard-studio/studio test makeFlowStepComponent
```

Expected:
- Mounting `makeFlowStepComponent({ flowRef: "track", … })` renders the track questions through
  `SurveyRunner` and, on completing "copy", fires `setSelectedTrack("copy")` then `onComplete({track:"copy"})`.
- Mounting with an unknown `flowRef` throws a descriptive error (no silent empty render).

## Re-pointed behaviour tests

```bash
pnpm --filter @keyboard-studio/studio test PhaseProjectName
```

Expected: the existing `PhaseProjectName.integration.test.tsx` assertions pass unchanged against the
factory output (slug seeding, Back→forward re-derivation). Any `PhaseTrack`/`PhaseF` behaviour specs
likewise pass with assertions unchanged.

## Full gates

```bash
pnpm typecheck
pnpm --filter @keyboard-studio/studio test
pnpm depcruise         # confirms editors → steps/flowSources is acyclic; no forbidden edge
```

Also confirm the Flow Map drift guardrail test is unchanged and green (node sets do not move).

## Verify the maintainer capability (SC-004)

Confirm each of the three converged flows is now exactly: a `flowSources` entry (already present) +
a manifest `flowRefs` (unchanged) + one options record in `editors/adapters/flowStepOptions.tsx` —
with **no** bespoke wrapper component file. `git status` should show `PhaseTrack.tsx`,
`PhaseProjectName.tsx`, `PhaseF.tsx` deleted.

## Expected outcomes

- `survey/` contains `FlowStepHost.tsx`; no `PhaseTrack/PhaseProjectName/PhaseF`.
- `editors/adapters/` contains `makeFlowStepComponent.tsx` + `flowStepOptions.tsx`.
- Golden walk green + unmodified; all gates green; drift guardrail unchanged.
