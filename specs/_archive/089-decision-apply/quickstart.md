# Quickstart: validating spec 089 (question decisions write only through `apply`)

Validation only — implementation detail lives in [plan.md](plan.md),
[research.md](research.md), and [tasks.md](tasks.md). Every criterion is
measured in the live app (`pnpm dev`) or through the real `StepHost`, per the
series rule in [088 spec.md](../088-modular-decisions/spec.md).

## Prerequisites

- This branch restacked onto 088's landed `decisionStore`
  (`packages/studio/src/stores/decisionStore.ts` exists; DRAFT_VERSION is 2).
- Sibling `../keyboards` checkout on the fork's `master` (the walk reads
  `basic_kbdfr` from it).
- `pnpm install` done; studio dev server port 5273 free.

## 1 — Golden walk: baseline capture (do this BEFORE any 089 code change)

```bash
cd packages/studio
# The dev server the walk runs against MUST be the seam-on build (research R9):
VITE_KM_MUTATE_SEAM=1 pnpm dev   # in one shell, or set it in the Playwright webServer env
GOLDEN_WALK_CAPTURE=1 pnpm test:e2e -- e2e/golden-walk.spec.ts
```

Expected: the walk (copy track from `basic_kbdfr`, fixed answers) completes,
the source zip is written as the committed baseline next to the spec, and the
run reports `[OK]` with the baseline's byte size. Commit the script and the
baseline together — this commit must contain no product code.

## 2 — Golden walk: byte-identical after the change (SC-001)

```bash
cd packages/studio
pnpm test:e2e -- e2e/golden-walk.spec.ts
```

Expected: PASS — the downloaded source zip is byte-identical to the baseline
from step 1. Any byte difference is a failure of US1, whichever task introduced
it; do not re-capture the baseline to make it pass.

## 3 — One write path (US1, SC-002)

```bash
grep -rn "onCommit" packages/studio/src/editors/adapters/flowStepOptions.tsx   # expect: no definitions for track / project_name / phase_f
grep -rn "setIdentityResult\|setSurveyContext\|setIdentityPhaseResult\|setScaffoldSpec" packages/studio/src --include='*.ts' --include='*.tsx' | grep -v test   # expect: zero
```

And in `pnpm dev`: complete identity → the decision trail shows the answers
recorded, attribution reaches the output screen's copyright line, and reloading
mid-walk restores every answer from the draft's `decisions` slice (088 SC-001
still holds).

## 4 — Containment (SC-003)

```bash
pnpm --filter @keyboard-studio/studio exec vitest run src/steps/reducer.test.ts src/decisions/
```

Expected: the test module whose `apply` returns an `ir` patch outside its
`writes` is rejected with `MutatePatchContainmentError`, the working copy is
unchanged, and a module returning an unauthorized overlay channel is rejected
with `ApplyChannelError`.

## 5 — The flag is gone (US2, SC-002)

```bash
grep -rn "VITE_KM_MUTATE_SEAM" packages/studio/src packages/studio/e2e   # expect: zero
ls packages/studio/src/flags/mutateFlag.ts                                # expect: absent
```

Expected — **only under the owner's OI-1 ruling for a global deletion**
([plan.md](plan.md) Open Items). Under a runner-only ruling this step is
expected to fail for the four non-question sites, and that partial state is
what gets reported, not silently fixed.

## 6 — Full gates

```bash
pnpm --filter @keyboard-studio/studio run typecheck       # tsc --noEmit
pnpm --filter @keyboard-studio/studio test                # package vitest suite, incl. stepHost.goldenWalk
pnpm lint                                                 # ESLint + depcruise + checkers
```

Expected: all green. The store-level golden-walk fixtures
(`tests/steps/__fixtures__/goldenWalk/`) may differ from their pre-089 form
only where the mutation sequence changed by design (session setters replaced
by decision recording + `apply` effects) — each such diff is named in its
commit message, and step 2 outranks the fixtures if they ever disagree.
