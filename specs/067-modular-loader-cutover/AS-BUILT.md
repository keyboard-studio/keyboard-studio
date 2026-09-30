# Spec 067 Modular-loader cutover + legacy YAML retirement: as built

**Status:** Retired 2026-09-29. Shipped as PR #739 (squash `e4d3665a`, P3a cutover, 2026-06-27) and PR #781 (`01a6da23`, P3b legacy retirement, 2026-06-28), E2E lane 1 in #906 (`948ca388`); all merged. The spec folder was authored later (#1644 renumber) and closed out by #1656 (`3d7fb39c`), which verified the work had already shipped under spec 013-retire-legacy-flow-loader. Tasks: 30/30 complete.
**Full docs:** [specs/_archive/067-modular-loader-cutover/](../_archive/067-modular-loader-cutover/) (spec, plan, tasks, research R1-R7, data-model, contracts/flow-output-parity.md, quickstart, checklists). Not read by default.
**Pinned here:** none

## What shipped
- Phase A, Phase F and identity-lite resolve through `loadModularFlow` only; the legacy full-YAML loader is gone.
- A new thin manifest `content/flows/identity_lite.modular.yaml` backed by five new `il_*` question modules.
- The four legacy full-flow YAMLs (phase_a_identity, phase_b_characters, phase_f_helpdocs, identity_lite) and `survey/loadFlow.ts` are deleted.
- Playwright lane 1 (copy-edit, Track 1) unskipped; lane 2 (import-improve) was left documented-blocked on Track 2.
- Author-visible question order and routing preserved (golden compare ran before deletion).

## Public contracts (as the code has them)
- `packages/studio/src/survey/loadModularFlow.ts`: `loadModularFlow(raw)` is the sole flow loader; used by `editors/adapters/makeFlowStepComponent.tsx:231` (memoised per step, via the `FlowStepHost` factory, spec 029).
- Manifests: `content/flows/{identity_lite,phase_b_characters,phase_f_helpdocs,project_name,track}.modular.yaml`; examples under `content/flows/_examples/`; the Phase A manifest now lives in `content/flows/proposed/phase_a_identity.modular.yaml`.
- Parity contract (author-visible fields id, prompt, help_text, type, options, required, next): after deletion it is pinned by `packages/studio/tests/survey/flow-parity.test.ts` (Phase A and F, questions and provenance_questions).

## Key decisions
- Cut A/F over by swapping loader and import (R1); identity-lite needs 5 new modules, the real work (R2).
- Golden comparison must pass before any legacy deletion; afterwards replaced by snapshot pinning (R4, contract).
- Cutover and deletion as separate, independently revertable changes (R6, FR-013).
- Deletion removes delivery forms only; question modules stay (library/reserve, inert but compiled and tested); non-Roman-script research is never deleted (R7, FR-011/012).
- Explicit `.ts`/`.tsx` import extensions preserved (FR-014); Phase B untouched (FR-015).

## Gotchas and limits
- A registered module no manifest references stays in the registry (reserve); do not "clean it up".
- Registry-size gates were bumped in the cutover (93 to 98); the registry has since grown (114 entries at last count in `registry.test.ts`), so do not trust the numbers in the spec.

## Divergences from the spec
- The spec says the Phase A modular manifest is `content/flows/phase_a_identity.modular.yaml`; it is now under `content/flows/proposed/` (Phase A was demoted).
- Lane 2 `packages/studio/e2e/import-improve.spec.ts` does not exist on main; only `copy-edit.spec.ts` remains.
- The spec folder claims work under number 067, but the code and PRs are the spec 013 / issue-410 lineage; `specs/013-retire-legacy-flow-loader` is the earlier record.

## Follow-ups and open issues
- Lane 2 (Track 2 import E2E) was never activated under this spec; re-check whether it exists elsewhere.
- No inbound citations into this folder outside `docs/spec-trace.json` (orphaned unit entry).
