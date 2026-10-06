# Spec 016 Drift guardrail (Question Unification Phase 1b): as built

**Status:** Retired 2026-09-29. Shipped in PR #865 (squash `5286b1bb`, 2026-06-29; spec authored in #837 `f45d0db4`). Tasks: 20/20 complete.
**Full docs:** [specs/_archive/016-qu-drift-guardrail/](../_archive/016-qu-drift-guardrail/) (spec, plan, tasks). Not read by default.
**Pinned here:** none

## What shipped
- A CI test asserting a real bijection between the node ids the Flow Map actually renders and the runtime-reachable ids (manifest editor-steps plus survey questions).
- A shared, store-free composition (`collectRenderedNodeIds`) that both `DashboardView` and the guardrail consume, so the test cannot re-derive a set that itself drifts.
- Negative tests: N1 (runtime step with no rendered node turns RED), N2 (rendered node with no runtime step turns RED), both injected on local clones; removal returns GREEN against real data.
- Test-only: no contracts bump, no write routing, no flag flip.

## Public contracts (packages/studio/src/dashboard)
- `renderedNodeSet.ts`: `buildFlowSources(): BuiltFlowSource[]` (iterates `manifest` steps' `flowRefs` into `steps/flowSources.ts`; live entries only; unresolved ref yields an error entry), `collectRenderedNodeIds(flows): Set<string>` (manifest-spine projection UNION drill-down nodes; reserve/library and proposed-flow nodes excluded), plus later `buildLibrarySection`, `buildLeftoverSection`.
- `driftGuardrail.test.ts`: RENDERED vs RUNTIME. RUNTIME = editor steps via `findUnreachable(manifest)` plus survey questions via `resolveNext` / `buildGraphFromQuestions` edges over `flowSources` (findUnreachable is blind to `FlowGotoRule` routing, so both computations run).
- Cases: SC-001 bijection, reserve excluded, distinct from the C8/C9 tautology, both reachability computations contribute, `pb_discovery_intro` covered in the question graph not the manifest graph, baseline GREEN, N1, N2.

## Key decisions
- D1: own co-located file (`dashboard/driftGuardrail.test.ts`) importing `buildManifestStepGraph` directly; `.dependency-cruiser.cjs` excludes `*.test.ts`, so no boundary risk.
- D2a: re-run the exact builders `DashboardView` composes (shared helper), not a parallel derivation.
- Reserve/library ids excluded from both sides: the bijection is over the reachable set only.
- Must not duplicate the tautological C8/C9 block (`buildStepGraph.test.ts`, "buildManifestStepGraph -- C8/C9"), which still exists.

## Gotchas and limits
- Adding a manifest step with `flowRefs` or a `flowSources` entry is checked by this test; an unresolved `flowRefs` id shows as an error entry and logs in DEV.
- Proposed flows (status "proposed", spec 025) are excluded by construction because `buildFlowSources` skips them.
- Does not require C5 (inputs-satisfiable) to be green; declaration sequencing belongs to spec 017.

## Divergences from the spec
- Spec/plan name drill-down inputs as `FLOW_SOURCES` in `DashboardView.tsx`; code derives them from step `flowRefs` and `steps/flowSources.ts` (spec 024, ADR-0001). Guardrail follows the new source.
- Otherwise none found.

## Follow-ups and open issues
- `specs/032-journey-corpus/research.md:36-38` says "spec 016 drift guardrail" has no `specs/016-*` directory; the stub folder resolves that citation now. Stale wording for km-doc.
- `specs/017-qu-declare-steps/spec.md` links this spec; still resolves.
- `docs/spec-trace.json` entry `specs/016-qu-drift-guardrail` orphaned.
