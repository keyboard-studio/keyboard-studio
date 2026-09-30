# Spec 066 IRPath + declared inputs/writes + folder-per-question: as built

**Status:** Retired 2026-09-29. Shipped in PR #702 (squash `e8a8212d`, "P2 - IRPath + declared inputs/writes + folder-per-question opt-in", 2026-06-27; renumbered in #1644). Tasks: 28/28 complete.
**Full docs:** [specs/_archive/066-irpath-inputs-writes/](../_archive/066-irpath-inputs-writes/) (spec, plan, tasks, research R1-R7, data-model, contracts/irpath-contract.md, quickstart, checklists). Not read by default.
**Pinned here:** none

## What shipped
- `IRPath`, a compile-time-checked address type over `KeyboardIR` (an invalid path does not typecheck; a renamed IR field breaks dependent paths).
- `inputs` / `writes` declared on every shipped `QuestionModule` (present, possibly empty arrays).
- The dashboard's input-satisfiability (orphan-input) check consumes those declarations.
- Folder-per-question opt-in (`<id>/index.ts` plus `extras/`) supported by the module harness.

## Public contracts (as the code has them)
- `packages/contracts/src/ir-path.ts`: `type IRPath = PathsInto<KeyboardIR, readonly []>`, `irPath(...segments)`, `formatIRPath(path)`; tests `ir-path.test.ts`, `ir-path.type-assertions.ts`.
- `packages/studio/src/survey/types.ts`: `QuestionModule.inputs?: readonly IRPath[]`, `.writes?: readonly IRPath[]` (lines ~41, ~48); `mutate` takes a patch contained to the module's declared `writes` (line ~164-174).
- Address-space rule: `inputs` and `writes` share one `IRPath` space, so they compare directly.
- Bounds: touch descent stops at `keys[]` (no `sk`/`flick`/`multitap`); `RawKmnFragment` is an atomic leaf (`raw[i]` is terminal).
- Consumers: `studio/src/dashboard/completeness.ts` (`checkInputsSatisfiable`, `OrphanInput`), `buildStepGraph.ts`, `survey/questions/drillDownDeclarations.ts`, `steps/manifest.ts:187` and `survey/invisibles/InvisiblesStep.tsx:34` (empty `inputs`/`writes` by FR-006 for inventory confirmation).
- Harness: `studio/src/test/questionModuleContract.ts` (`describeQuestionModules`) enumerates every module, checks id-from-filename or folder name.

## Key decisions
- `IRPath` derived from `KeyboardIR` types, no codegen, no zod mirror (R1, R2, R4).
- Touch recursion bounded at `keys[]` (R3).
- Breaking contract bump recorded as the pre-1.0 minor (R5); contracts is now 0.18.0.
- CI checks are vitest specs inside `packages/studio`, not new tooling (R6).
- Empty arrays are valid and deliberate; only an absent field is a failure (contract G7).
- Folder form is discovery-driven; flat `<id>.ts` stays the default (R7).

## Gotchas and limits
- Declaring `writes` mutates nothing; it is containment metadata.
- `inputs`/`writes` are typed optional (`?`), so "present" is enforced by tests, not the type.
- The registry has grown to 114 entries (spec said 93 modules).

## Divergences from the spec
- FR-009 (missing-mirrored-test check for `tests/survey/questions/<id>.test.ts`) is gone in effect: per-question test files were collapsed into a registry-wide suite (#1786, `260ebd65`); `questionModules.test.ts` / `registry.test.ts` now carry the checks.
- No module currently uses the folder form (no `index.ts` under `survey/questions/`); only the harness support exists.
- The orphan-input check lives in the dashboard (`completeness.ts`) rather than as a standalone studio vitest spec as R6 planned. Write-surface test (FR-008) location not confirmed.

## Follow-ups and open issues
- Release-management call (0.11.0 vs 1.0.0) is moot: contracts already at 0.18.0.
- Stale citations for km-programmer: none pointing into the folder (only `spec 066 FR-006` comments, which stay valid).
