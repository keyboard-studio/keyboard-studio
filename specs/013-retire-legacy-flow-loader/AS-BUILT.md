# Spec 013 Retire the legacy full-YAML flow loader: as built

**Status:** Retired 2026-09-29. Shipped in PR #781 (squash `01a6da23`, 2026-06-27; three independently revertible commits inside). Tasks: 29/29 complete.
**Full docs:** [specs/_archive/013-retire-legacy-flow-loader/](../_archive/013-retire-legacy-flow-loader/) (spec, plan, tasks, research, data-model, contracts, checklists, HANDOFF). Not read by default.
**Pinned here:** none

## What shipped
- The Flow Map's Phase A / Phase F / identity-lite graphs now come from modular manifests (`content/flows/*.modular.yaml`) through `buildModularFlowGraph`, like Phase B.
- `buildScriptRouting` sources identity-lite through `loadModularFlow` with output element-wise equal to the pre-change output.
- `survey/loadFlow.ts`, `loadFlow.test.ts` and the four full-flow YAMLs (`phase_a_identity.yaml`, `phase_b_characters.yaml`, `phase_f_helpdocs.yaml`, `identity_lite.yaml`) were deleted.
- Commit split: repoint, loader deletion, YAML deletion (revert order 3, 2, 1).

## Public contracts
- `loadModularFlow(raw: string): FlowDef` and `parseThinYaml` in `packages/studio/src/survey/loadModularFlow.ts` are the sole flow loader; a header comment records that `parseFlow` / `loadFlow.ts` are gone.
- `buildModularFlowGraph(raw, title, registry)` in `packages/studio/src/dashboard/buildStepGraph.ts`: uses the SUPPLIED registry for reserve nodes; throws on empty, unparseable or unknown-id manifests; never falls back to legacy YAML.
- `buildScriptRouting(raw: string): ScriptRoutingRow[]` in `packages/studio/src/dashboard/buildScriptRouting.ts` (signature unchanged; `Ethi`/`Hani`/`Hang` rows `gated: true`).
- Surviving flow files: `content/flows/` holds `identity_lite`, `phase_b_characters`, `phase_f_helpdocs`, `project_name`, `track` `.modular.yaml`, plus `_examples/` and `proposed/`.

## Key decisions
- Delete only redundant delivery forms (loader + four YAMLs); never touch `survey/questions/**` research content.
- Three independently revertible commits so the tree is green after each.
- Failure is visible, not silent fallback to legacy.

## Gotchas and limits
- Spec paths are stale: `flowmap/FlowMapView.tsx`, `flowmap/buildFlowGraph.ts` are now `dashboard/DashboardView.tsx`, `dashboard/buildStepGraph.ts` (spec 012 P4b).
- The spec's manifest table lists `phase_a_identity.modular.yaml`; that file no longer exists at `content/flows/`. Phase A was later demoted to reserve (references remain in `dashboard/buildStepGraph.test.ts`, `driftGuardrail.test.ts`, `packages/contracts/src/keyboardIdentity.ts`).
- The retired-loader guarantee (no `parseFlow`/`loadFlow` in shipped code) is a comment-only mention today (`loadModularFlow.ts:17`).

## Divergences from the spec
- File locations changed as above (`flowmap/` to `dashboard/`). Not a bug.
- `phase_a_identity.modular.yaml` absent from `content/flows/` at origin/main; FR-001 text no longer matches, consistent with the later Phase A demotion to reserve (`dashboard/phaseADemoteReserve.test.ts`). Not a bug.

## Follow-ups and open issues
- The spec said this feature does not by itself close #410 (beyond-#410 follow-up).
- Spec 067 (`specs/067-modular-loader-cutover/.spec-context.json`) cites PR #781 evidence; still resolves.
- `docs/spec-trace.json` entry `specs/013-retire-legacy-flow-loader` orphaned.
