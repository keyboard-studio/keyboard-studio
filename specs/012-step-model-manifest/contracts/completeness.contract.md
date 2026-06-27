# Contract: Completeness / Staleness (`dashboard/completeness.ts`)

**Feature**: 012-step-model-manifest | **Phase**: P4b

Five **distinct** checks over the manifest's `writes → inputs` graph (§3.5). Each is independently callable and independently testable (SC-006).

```ts
export function computeStaleness(graph: StepGraph, reopened: ReadonlySet<string>): Set<string>;
export function findCycles(graph: StepGraph): string[][];
export function checkRejoin(manifest: readonly Step[]): RejoinViolation[];
export function checkSpinePrefixShippability(manifest: readonly Step[], wc: WorkingCopyState): number[];
export function checkInputsSatisfiable(graph: StepGraph): OrphanInput[];

export function runCompleteness(
  manifest: readonly Step[],
  wc: WorkingCopyState,
  reopened?: ReadonlySet<string>,
): CompletenessReport;   // shape in data-model.md
```

## Guarantees (testable — `completeness.test.ts`)

- **C1 — transitive staleness to a fixpoint.** `computeStaleness` returns **every** step reachable from `reopened` along `writes → inputs`, iterated until no new step is added — **not** just one-hop dependents. *(Test: a 2-edge-distant dependent of a re-opened step is included.)* (FR-014)
- **C2 — acyclicity is a hard error.** `findCycles` returns each cycle in the `writes → inputs` graph; a non-empty result is surfaced as a hard error and `computeStaleness` must not be relied on when a cycle exists. *(Test: a crafted A→B→A graph yields one cycle.)* (FR-015)
- **C3 — side-trail rejoin.** `checkRejoin` flags any `spine: false` chain that lacks a `joinTarget` or whose terminal `next` does not reach a `spine: true` step. *(Test: a side trail dead-ending off-spine is flagged; a rejoining one is not.)* (FR-016)
- **C4 — spine-prefix shippability (structural proxy).** `checkSpinePrefixShippability` returns the indices of spine prefixes that do **not** leave a complete, lock-consistent working copy. It **does not invoke the validator** (Clarifications 2026-06-27). *(Test: a prefix that strands a half-applied lock is flagged; a clean prefix is not.)* (FR-017)
- **C5 — inputs-satisfiability is distinct from C4.** `checkInputsSatisfiable` flags inputs produced by no upstream `writes`. A manifest can pass C4 and fail C5 (and vice versa). *(Test: both directions.)* (FR-018)
- **C6 — clean manifest passes all five.** The real `steps/manifest.ts` passes C1–C5 with no violations and yields an empty stale set when nothing is re-opened. (SC-006, SC-007)
- **C7 — unreachable steps surfaced.** A step not reachable from the spine entry appears in `report.unreachable` (not silently dropped). (Edge case.)

## Dashboard binding (`dashboard/buildStepGraph.ts`, `DashboardView.tsx`)

- **C8 — map == runtime.** `buildStepGraph(manifest).nodes` has exactly one node per manifest step (galleries + panels included); the node/edge set equals the runtime step set (no ghost/missing nodes). (FR-010, SC-004)
- **C9 — single source.** The dashboard reads the **same** `manifest` the runtime reads; there is no second ordering source. (FR-010)
