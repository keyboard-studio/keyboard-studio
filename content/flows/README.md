# Survey flows

There are no flow files in this directory. A survey flow is **derived**, not listed:

- **Membership** is one table, `flowModules` in
  [`packages/studio/src/survey/questions/registry.ts`](../../packages/studio/src/survey/questions/registry.ts):
  flow id -> its question modules, in walk order. The same file builds `questionRegistry`
  (id-keyed) and `decisionIndex` (DecisionId-keyed, via `indexProviders`, so a duplicate
  provider throws).
- **Order** is derived from each module's `provides` / `requires` (`orderDecisions`); the
  `flowModules` list order is the tie-break where the graph is silent. Routing stays in each
  module's `definition.next`.
- **Per-flow metadata** (title, phase letter, `status`) lives in
  [`packages/studio/src/steps/flowSources.ts`](../../packages/studio/src/steps/flowSources.ts).
  Each flow's `status` is `"live"` (referenced by a manifest step's `flowRefs`) or `"proposed"`.

Frozen legacy orders are pinned in `packages/studio/src/decisions/orderParity.test.ts`.

## Adding a question

1. Add `questions/<dir>/<id>.ts` (with `provides` / `requires` where it has dependencies).
2. Import it in `registry.ts` and list it under its flow in `flowModules`.

## Proposed flows and the Library section

A **proposed** flow is not run by the live survey; it renders as an ordered graph in the Flow
Map's Library section (`phase_a_identity`, the demoted Phase A battery, is the current one).
Its `flowSources` entry carries `status: "proposed"` and no manifest step references it. Proposed
nodes are excluded from the rendered<->runtime bijection; a manifest `flowRef` that targets a
proposed flow is a hard failure — promotion must be explicit.

**Promote** (proposed -> live): flip `status` to `"live"`, add `flowRefs: ["<flow_id>"]` to a
manifest step (a new step also needs a component), and the completeness checks and drift
guardrail then enforce it. **Demotion** is the reverse. Either way the no-delete guardrail keeps
every module registered, on disk and test-covered.

## Leftover section

Modules physically under `questions/reserve/` are the Leftover set (`reserveModules` in
`registry.ts`); the Flow Map lists them directly, labelled *kept for reference / possible reuse,
never run by the live survey*. To reuse one, move its file into a live phase folder, update its
import in `registry.ts`, and list it in that flow's `flowModules` entry. The demoted Phase F tips
(`demotedPhaseFModules`) are registered the same way but sit outside the flow list.
