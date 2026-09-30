# Data Model: Step-model constitutional gates

This feature introduces no runtime types. Its "entities" are the four governance/test artifacts
the requirements gate, each described here as: what it is, its validation rule, and where that
rule is enforced.

## 1. Constitution Principle IX

| Field | Value |
|---|---|
| Location | `.specify/memory/constitution.md`, new `### IX.` under `## Core Principles`, after Article VIII |
| Content | Verbatim FR-001 text — see [contracts/constitution-principle-ix.md](./contracts/constitution-principle-ix.md) |
| Validation | Human review at PR time (prose amendment — spec §18 "single-reviewer approval" tier); no automated check gates prose content. The *structural* consequence (every new survey-content plan must declare a manifest entry) is enforced procedurally by `/speckit-plan`'s Constitution Check reading this file, not by a new script. |
| Related edits | Authoring-workflow section's "Articles I–VIII" → "I–IX"; version footer `Last Amended` date bump (Decision 5). |

## 2. QuestionRegistryInventory

| Field | Value |
|---|---|
| Location | `packages/studio/src/survey/questions/registry.test.ts` |
| Shape | `{ phaseA: 9, phaseB: 49, phaseF: 22, phaseG: 3, reserve: 31, total: 114 }` (re-verified 2026-08-17 — see [research.md](./research.md) Decision 1) |
| Validation rule | `expect(Object.keys(questionRegistry).length).toBe(114)`, replacing the current `toBeGreaterThan(0)` assertion. A comment above the assertion documents the breakdown, mirroring the `criteria.json` (148) gate's comment convention. |
| State transitions | A future PR adding/removing a question module MUST update this literal in the same change (FR-002); the test is the sole source of the expected count — nothing else derives or re-computes it. |

## 3. ManifestStepResolution

| Field | Value |
|---|---|
| Location | `packages/studio/src/steps/manifest.test.ts` (new describe block; existing file, existing pattern) |
| Subject | Every entry in `manifest: readonly Step[]` (`packages/studio/src/steps/manifest.ts`) |
| Validation rule | For each step: if `kind === "editor-step"`, assert `typeof step.component === "function"` (component resolved, not `undefined`/`null`); if `kind === "question-step"` (none exist in the manifest today, but the union supports it — see `steps/types.ts`), assert `questionRegistry[step.questionId]` is defined. Either branch failing is the "build fails on an orphan manifest entry" FR-003 asks for, made explicit rather than relying solely on TypeScript's structural typing of `EditorStep.component` as required. |
| Note | TypeScript already makes an `EditorStep` without a `component` a compile error; this runtime assertion is the *named, independently-runnable* gate SC-003 asks for (`pnpm --filter @keyboard-studio/studio test steps/manifest.test.ts` succeeds/fails distinctly from a typecheck failure), and is the one branch of the check TypeScript's static types cannot cover: a `question-step`'s `questionId` resolving in the registry is a runtime lookup, not a structural type. |

## 4. RendererEditorImportBoundary

| Field | Value |
|---|---|
| Location (enforced) | `.dependency-cruiser.cjs`, new `forbidden` entry `renderer-no-direct-editor-import` |
| Location (fast local signal) | `packages/studio/src/steps/manifest.test.ts` (source-guard, extends the existing SC-004 block) |
| Guarded files | `packages/studio/src/StudioShell.tsx`, `packages/studio/src/components/StepHost.tsx` |
| Forbidden target | `packages/studio/src/editors/` (any import) |
| Validation rule | `pnpm depcruise` fails if either guarded file imports anything under `editors/`; the vitest source-guard fails first (faster feedback) by asserting neither file's source contains an import whose specifier path includes `/editors/`. |
| Current state | Both guarded files already satisfy this rule (verified by grep during Phase 0) — this entity codifies a regression guard, not a migration. |
