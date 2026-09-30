# Spec 069 Step-model constitutional gates: as built

**Status:** Retired 2026-09-29. Shipped in PR #1651 (squash `05aa49d0`, "step-model constitutional gates (spec 069)", 2026-08-18). Tasks: 9/9 complete.
**Full docs:** [specs/_archive/069-step-model-gates/](../_archive/069-step-model-gates/) (spec, plan, tasks, research Decisions 1-5, data-model, contracts/gates.md, contracts/constitution-principle-ix.md). Not read by default.
**Pinned here:** none

## What shipped
- Constitution Article IX: no user-facing survey surface outside the step manifest.
- An exact-count gate on the question registry.
- A test that every manifest step resolves to a real component or registered question.
- Two guards, one test and one depcruiser rule, that keep the SPA renderer from importing editor components directly.
- No runtime behaviour change; governance and enforcement only (no contracts bump, no schema change).

## Public contracts (as the code has them)
- `.specify/memory/constitution.md:73` `### IX. No user-facing survey surface outside the manifest`; the plan-step cross-reference reads "Articles I-IX" (line 87); version footer `Last Amended: 2026-08-17`, `Version` unchanged at 1.1.0.
- `packages/studio/src/survey/questions/registry.test.ts:20` `has exactly the verified inventory of 114 entries` (breakdown comment above it: 9 A + 47 B + 24 F + 3 G + 31 Reserve, re-verified 2026-09-21).
- `packages/studio/src/steps/manifest.test.ts:60` `describe("FR-003 - every manifest step id resolves to a registered component")`: editor-step needs a function `component`; question-step needs `questionRegistry[questionId]`.
- `manifest.test.ts:457,462-465` source-guard tests: `StudioShell.tsx` and `components/StepHost.tsx` contain no import from an `editors/` path.
- `.dependency-cruiser.cjs:135` rule `renderer-no-direct-editor-import` (error; from `StudioShell.tsx` and `components/StepHost.tsx`, to `packages/studio/src/editors/`).

## Key decisions
- Re-verify the registry count instead of trusting the spec's stale 101 (Decision 1).
- Scope the depcruiser rule to `StudioShell.tsx` + `StepHost.tsx`, not all of `components/` (Decision 2).
- The source guard checks the `editors/` import path, not a `Gallery|Panel` name grep (Decision 3).
- Reuse `StepHost.tsx` as the mediating layer; build no new registry runtime (Decision 4, FR-006).
- Constitution edit kept to Article IX text, one cross-reference bump and the date footer (Decision 5).

## Gotchas and limits
- The count assertion must be updated in the same change that adds or removes a `questionRegistry` entry; it has already moved since landing.
- FR-005/FR-007: gallery steps (carve, mechanisms, touch) were not decomposed and the manifest/`Step` types were not amended.
- The `Step` type lives in `steps/types.ts`, not in `@keyboard-studio/contracts`.

## Divergences from the spec
- Spec FR-002/SC-002 assert 101 entries (35 A + 55 B + 8 F + 3 G); code asserts 114 (9 A + 47 B + 24 F + 3 G + 31 Reserve). The contract text itself used 114; the spec prose was never updated.

## Follow-ups and open issues
- SC-007 (a tracking doc for the module inventory) is satisfied by the test comment only; no separate issue or doc was confirmed.
- Stale citations for km-programmer: `.dependency-cruiser.cjs` and `registry.test.ts` cite "spec 069 FR-00x" (still valid via this stub); none link into archived files.
