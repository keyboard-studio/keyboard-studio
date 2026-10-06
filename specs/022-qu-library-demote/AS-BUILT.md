# Spec 022 qu-library-demote: as built

**Status:** Retired 2026-09-29. Shipped in PR #928 (squash `ab9505f5`, 2026-07-02); tasks finalised by PR #1677 (`d9439b98`). Tasks: 27/27 complete.
**Full docs:** [specs/_archive/022-qu-library-demote/](../_archive/022-qu-library-demote/) (spec, plan, tasks). Not read by default.
**Pinned here:** none. Living docs `content/flows/README.md` (no-delete guardrail mention), `docs/adr/0001-flow-map-derived-from-one-source.md` and `content/flows/proposed/phase_a_identity.modular.yaml` cite "spec 022" as prose only.

## What shipped
- The orphaned non-identity Phase A (identity plus `provenance_*` modules) is demoted to the inert reserve library: absent from the active flow ordering, rendered on the Flow Map as reserve (leftover) nodes.
- No-delete guardrail: demoted modules stay registered, on disk and test-covered.
- Default-path behaviour is byte-identical; `selectStrategy` output unchanged (unelicited axes default-fill from the script-class prior, recorded as `axisFills`).

## Public contracts
- `packages/studio/src/survey/questions/registry.reserve.ts` exports `reserveRegistry`, merged into `questionRegistry` in `registry.ts`. Modules live in `survey/questions/reserve/<id>.ts`. Key must equal `definition.id`.
- `computeReserveNodes` in `packages/studio/src/dashboard/buildStepGraph.ts` (reserve = registry minus flow membership); `dashboard/renderedNodeSet.ts` imports `reserveRegistry`.
- Guardrail: `survey/questions/noDeleteGuardrail.test.ts`; coverage via the parametric suite `packages/studio/tests/survey/questions/reserve/reserveModules.test.ts`.
- Revival: re-add the id to a flow YAML; no re-registration.

## Key decisions
- The `pb_*` battery was REMOVED from demotion scope (Amendment 2026-06-29): "reachable via the gate" and "reserve" are contradictory in the `computeReserveNodes` model. `pb_*` stays a live, non-default branch. `pb_mark_input_order` was relocated to reserve by spec 046.
- Amendment 2026-09-23: "test-covered" now means run by the parametric reserve suite plus at least one valid fixture, not one mirror test per module.
- The five marks modules retired by spec 071 were deleted with owner approval, outside this guardrail.

## Gotchas and limits
- Non-Latin precondition: do not flip a non-Latin default to a path that drops the script-specific mark/joining/order sub-series until the Phase 2 per-element loop subsumes them.
- Some per-module reserve test files remain (`iso_code`, `primary_script`, ...) for modules with their own behaviour.

## Divergences from the spec
- FR-002 (pb_* demotion) struck; FR-008 (`orthographyUrl` capture in `identity_lite`) deferred. `orthographyUrl` is still handled in `survey/PhaseA.tsx` only.

## Follow-ups and open issues
- D2: per-character feedback into the section 7 axis vector (default-fill gap) undecided.
- `orthographyUrl` capture revival pending question-revival work.
