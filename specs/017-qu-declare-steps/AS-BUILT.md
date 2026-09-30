# Spec 017 Declare steps (Question Unification Phase 1c): as built

**Status:** Retired 2026-09-29. Shipped in PR #866 (squash `7528d297`, 2026-06-29; spec authored in #837 `f45d0db4`). Tasks: 31/31 complete.
**Full docs:** [specs/_archive/017-qu-declare-steps/](../_archive/017-qu-declare-steps/) (spec, plan, tasks). Not read by default.
**Pinned here:** none

## What shipped
- Declared `inputs`/`writes` on existing editor-steps (`track`, `project_name`, `carve`, `mechanisms`, `touch`) using only existing `KeyboardIR` locations via `irPath()`.
- New declared-only drill-down descriptors for `prefill` and `pb_build_list` under the opaque `characters` node (not manifest entries, not registry ids).
- `charactersStep` declares the write `header.bcp47` (subsumption) so manifest-level C5 finds a producer for prefill's session-derived input.
- Declared-only: no `mutate()` executed, flag off, no contracts bump, behavior byte-identical.

## Public contracts (packages/studio/src)
- `steps/registerEditorSteps.ts`: `trackStep` inputs `header.bcp47` + `header.name`, `writes: []` (D2: branch selection only); `projectNameStep` inputs `header.bcp47`, writes `header.name` + `header.keyboardId`; `carveStep` `writes: CARVE_WRITES`; `mechanismsStep` `ADD_GALLERY_WRITES`; `touchStep` `TOUCH_WRITES` (constants from `steps/editorMutate.ts`).
- `steps/manifest.ts` `charactersStep`: `writes: [irPath("header","bcp47")]` (D1 option a, subsumption). Manifest-level C5 stays one check; no cross-graph exemption.
- `survey/questions/drillDownDeclarations.ts`: `CHARACTERS_NODE_ID`, `DrillDownOutput = {kind:"none"} | {kind:"phase-result-field"; field}`, `DrillDownDeclaration`, `prefillDrillDown` (inputs `header.bcp47`, writes `[]`, registryKey `il_target_script`), `pbBuildListDrillDown` (inputs `header.bcp47`, writes `[]`, output field `confirmedInventory` on `SurveyPhaseResult`, registryKey `pb_discovery_intro`), `drillDownDeclarations` record.
- Tests: `survey/questions/drillDownDeclarations.test.ts`, `tests/survey/questions/f/editorStepContracts.test.ts`.

## Key decisions
- D1 -- subsumption: the opaque `characters` step declares the `header.bcp47` write, rather than a per-question C5 or exemption.
- D2 -- `track` writes `[]` (declared marker rejected).
- Drill-down descriptors live in a separate table: putting them in `questionRegistry` would trip the "no non-manifested registry modules" lint, and a modular-YAML node would need a runtime-reach edge or the spec-016 bijection goes RED.
- `pb_build_list` output is a phase-result field, not an IR write.
- `irPath('header','script')` does not exist in `KeyboardIR` and is declared nowhere (asserted by test).
- Writes-before-inputs sequencing so C5 never transiently reds.

## Gotchas and limits
- `pb_build_list` is NOT a `questionRegistry` id; the registry id at that boundary is `pb_discovery_intro`.
- Declarations are inert until decomposition (Phase 2); nothing resolves a component through them.
- The session-level `ScriptPrefill` is a non-IR signal and carries no C5 obligation.

## Divergences from the spec
- Spec FR-001/FR-002 and tasks T011-T013 say `carve`/`mechanisms`/`touch` inputs are populated. Code at `steps/registerEditorSteps.ts` (carve ~140, mechanisms ~182, touch ~228) declares `writes` only; comments say "inputs stays [] to avoid C2 data cycle with mechanisms/touch". The code wins; the spec's inputs were dropped after the fact. Documented in code, not a bug.
- `prefill` spec inputs list `header.bcp47` plus session `ScriptPrefill`; code splits the latter into `sessionInputs` strings (non-IR).

## Follow-ups and open issues
- Phase 2 (per migration plan, `docs/design-notes/question-unification-migration-plan.md`) is meant to make the declared writes real by decomposing the `characters` step.
- Stale link: none outside `specs/016`, `specs/015` (both retired to stubs).
- `docs/spec-trace.json` entry `specs/017-qu-declare-steps` orphaned.
