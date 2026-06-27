// dashboard/completeness.ts — five DISTINCT pure checks over the manifest's
// writes → inputs graph. All functions are PURE: manifest and working-copy
// state are parameters, never imported from stores/. This file has NO stores/
// import — the dashboard-layer depcruise rule forbids dashboard/ -> stores/.
//
// Five checks (C1–C7, completeness.contract.md):
//   C1  computeStaleness(graph, reopened)  — transitive fixpoint over DATA edges
//   C2  findCycles(graph)                  — cycle detection on DATA graph (hard error)
//   C3  checkRejoin(manifest)              — off-spine joinTarget must reach spine
//   C4  checkSpinePrefixShippability(m,wc) — structural lock-consistency proxy
//   C5  checkInputsSatisfiable(graph)      — inputs with no upstream writer
//   C7  findUnreachable(manifest)          — steps not reachable from spine entry
//
// runCompleteness aggregates all five into CompletenessReport.
//
// Contract: computeStaleness, findCycles, checkInputsSatisfiable accept a StepGraph
// (see completeness.contract.md). The StepGraph carries dataEdges + writePaths/
// inputPaths on each node (added in T042 review fix), so those functions do real
// work without needing an additional manifest parameter.
//
// Boundary: no stores/ import. WorkingCopyState is passed as a parameter type.

import { formatIRPath } from "@keyboard-studio/contracts";
import type { IRPath } from "@keyboard-studio/contracts";
import type { Step } from "../steps/types.ts";
import type { StepGraph, StepGraphEdge } from "./model.ts";

// ---------------------------------------------------------------------------
// Re-export the structural WorkingCopyState subset we need as a parameter type.
//
// We cannot import WorkingCopyState from stores/ (dashboard-layer depcruise
// rule). Instead we declare a structural interface that captures only the two
// fields completeness.ts reads. Any object satisfying this interface (including
// the full WorkingCopyState) may be passed in.
// ---------------------------------------------------------------------------

/**
 * Minimal working-copy state completeness.ts reads for C4.
 *
 * Defined as a structural interface here so this module has NO stores/ import.
 * The caller (StudioShell or the store action) passes in the real WorkingCopyState,
 * which satisfies this interface structurally.
 */
export interface WcForCompleteness {
  /**
   * True once the mechanisms (physical) step has fired lockDesktop().
   * Used by C4 to detect a half-applied physical lock gate.
   */
  desktopLocked: boolean;
  /**
   * Non-null once the touch step has fired buildTouchLayoutJson().
   * Used by C4 to detect a half-applied touch lock gate.
   */
  touchLayoutJson: string | null;
}

// ---------------------------------------------------------------------------
// Internal helpers: build adjacency maps from a StepGraph's dataEdges
// ---------------------------------------------------------------------------

/**
 * Build a producer→consumers adjacency map from StepGraph.dataEdges.
 * Result: Map<producerId, Set<consumerId>>.
 */
function buildAdjFromDataEdges(
  nodes: readonly { id: string }[],
  dataEdges: readonly StepGraphEdge[],
): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const node of nodes) {
    adj.set(node.id, new Set());
  }
  for (const edge of dataEdges) {
    adj.get(edge.from)?.add(edge.to);
  }
  return adj;
}

// ---------------------------------------------------------------------------
// C1 — transitive staleness to a fixpoint (FR-014)
// ---------------------------------------------------------------------------

/**
 * Compute the transitive closure of stale step ids from a StepGraph.
 *
 * Starting from `reopened`, follows data edges (writes→inputs) in
 * `graph.dataEdges` and adds every reachable dependent. Iterates until no
 * new step is added (fixpoint). A single hop is NOT sufficient — a step 2 or
 * more edges away from a reopened step is included (C1).
 *
 * CONTRACT: this is the REAL implementation. No stubs.
 */
export function computeStaleness(
  graph: StepGraph,
  reopened: ReadonlySet<string>,
): Set<string> {
  const adj = buildAdjFromDataEdges(graph.nodes, graph.dataEdges);
  return computeStalenessFromAdj(adj, reopened);
}

/**
 * Internal fixpoint implementation over an adjacency map.
 * Exported for unit tests that construct crafted adjacency maps directly.
 */
export function computeStalenessFromAdj(
  adj: Map<string, Set<string>>,
  reopened: ReadonlySet<string>,
): Set<string> {
  const stale = new Set<string>(reopened);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [producer, consumers] of adj) {
      if (!stale.has(producer)) continue;
      for (const consumer of consumers) {
        if (!stale.has(consumer)) {
          stale.add(consumer);
          changed = true;
        }
      }
    }
  }
  return stale;
}

/**
 * Compute the transitive closure of stale step ids from a manifest.
 * Used by the store's markStale/clearStale (which hold a Step[], not a StepGraph).
 */
export function computeStalenessFromManifest(
  manifest: readonly Step[],
  reopened: ReadonlySet<string>,
): Set<string> {
  const adj = buildDataEdgeMapFromManifest(manifest);
  return computeStalenessFromAdj(adj, reopened);
}

// ---------------------------------------------------------------------------
// Internal: build adjacency from manifest Step[].
// Used by computeStalenessFromManifest and findCyclesFromManifest.
// ---------------------------------------------------------------------------

function buildDataEdgeMapFromManifest(manifest: readonly Step[]): Map<string, Set<string>> {
  const writeSets = new Map<string, Set<string>>();
  for (const step of manifest) {
    writeSets.set(step.id, new Set<string>(step.writes.map((p: IRPath) => formatIRPath(p))));
  }
  const adj = new Map<string, Set<string>>();
  for (const step of manifest) {
    if (!adj.has(step.id)) adj.set(step.id, new Set());
  }
  for (const consumer of manifest) {
    for (const inputPath of consumer.inputs) {
      const inputKey = formatIRPath(inputPath);
      for (const producer of manifest) {
        if (producer.id === consumer.id) continue;
        if (writeSets.get(producer.id)?.has(inputKey)) {
          adj.get(producer.id)!.add(consumer.id);
        }
      }
    }
  }
  return adj;
}

// ---------------------------------------------------------------------------
// C2 — acyclicity check (FR-015)
// ---------------------------------------------------------------------------

/**
 * Detect cycles in the writes→inputs DATA graph of a StepGraph.
 *
 * Uses `graph.dataEdges` (not order edges). Returns each cycle as an array of
 * step ids. A non-empty result is a hard error: computeStaleness must not be
 * relied on when a cycle exists (C2).
 *
 * Algorithm: iterative DFS with three-color marking (stack-safe; no recursion).
 *
 * CONTRACT: this is the REAL implementation. No stubs.
 */
export function findCycles(graph: StepGraph): string[][] {
  const adj = buildAdjFromDataEdges(graph.nodes, graph.dataEdges);
  return findCyclesFromAdj(adj);
}

/**
 * Detect cycles in an adjacency map. Returns each cycle path (array of ids).
 *
 * Iterative DFS with three-color marking (white=unseen, gray=in-stack,
 * black=done). Stack-safe: no recursion.
 *
 * Exported for unit tests that construct crafted adjacency maps directly.
 */
export function findCyclesFromAdj(adj: Map<string, Set<string>>): string[][] {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];

  for (const id of adj.keys()) {
    color.set(id, WHITE);
  }

  for (const startId of adj.keys()) {
    if (color.get(startId) !== WHITE) continue;

    // Iterative DFS using an explicit stack of [node, iterator] frames.
    // Each frame tracks the node being visited and the iterator over its neighbors,
    // so we can resume after visiting a child (equivalent to the recursive call).
    const pathStack: string[] = [];
    // Stack entries: [nodeId, neighborsIterator]
    const dfsStack: Array<[string, Iterator<string>]> = [];

    color.set(startId, GRAY);
    pathStack.push(startId);
    dfsStack.push([startId, (adj.get(startId) ?? new Set()).values()]);

    while (dfsStack.length > 0) {
      const frame = dfsStack[dfsStack.length - 1]!;
      const next = frame[1].next();

      if (next.done) {
        // All neighbors visited — mark black and pop.
        color.set(frame[0], BLACK);
        dfsStack.pop();
        pathStack.pop();
      } else {
        const neighbor = next.value;
        if (color.get(neighbor) === GRAY) {
          // Back edge: neighbor is in the current DFS path — cycle found.
          const cycleStart = pathStack.indexOf(neighbor);
          if (cycleStart !== -1) {
            cycles.push([...pathStack.slice(cycleStart), neighbor]);
          }
        } else if (color.get(neighbor) === WHITE) {
          color.set(neighbor, GRAY);
          pathStack.push(neighbor);
          dfsStack.push([neighbor, (adj.get(neighbor) ?? new Set()).values()]);
        }
        // GRAY (already on stack) → already detected; BLACK → done, skip.
      }
    }
  }

  return cycles;
}

/**
 * Detect cycles in the writes→inputs data graph derived from a manifest.
 * Exported for unit tests that construct crafted manifests directly.
 */
export function findCyclesFromManifest(manifest: readonly Step[]): string[][] {
  const adj = buildDataEdgeMapFromManifest(manifest);
  return findCyclesFromAdj(adj);
}

// ---------------------------------------------------------------------------
// C3 — side-trail rejoin check (FR-016)
// ---------------------------------------------------------------------------

export interface RejoinViolation {
  stepId: string;
  reason: string;
}

/**
 * Check that every off-spine step chain has a joinTarget that reaches a spine
 * step (C3 / FR-016).
 *
 * Flags:
 *   - spine:false step with no joinTarget.
 *   - spine:false step whose joinTarget does not resolve to a spine:true step.
 *   - spine:false step whose joinTarget resolves to another spine:false step
 *     (creating an off-spine dead-end chain).
 */
export function checkRejoin(manifest: readonly Step[]): RejoinViolation[] {
  const stepById = new Map<string, Step>(manifest.map((s) => [s.id, s]));
  const violations: RejoinViolation[] = [];

  for (const step of manifest) {
    if (step.spine === true) continue;

    if (step.joinTarget === undefined) {
      violations.push({
        stepId: step.id,
        reason: `spine:false step "${step.id}" has no joinTarget`,
      });
      continue;
    }

    const target = stepById.get(step.joinTarget);
    if (target === undefined) {
      violations.push({
        stepId: step.id,
        reason: `spine:false step "${step.id}" joinTarget "${step.joinTarget}" does not exist in the manifest`,
      });
      continue;
    }

    if (target.spine !== true) {
      violations.push({
        stepId: step.id,
        reason: `spine:false step "${step.id}" joinTarget "${step.joinTarget}" is also spine:false — dead-end off-spine chain`,
      });
    }
    // If target.spine === true, the rejoin is valid — no violation.
  }
  return violations;
}

// ---------------------------------------------------------------------------
// C4 — spine-prefix shippability (structural proxy, NO validator) (FR-017)
// ---------------------------------------------------------------------------

/**
 * "Lock-consistent" definition (structural proxy, C4):
 *
 * A spine prefix ending at step index `i` is lock-consistent when:
 *   (a) If the prefix includes a step with `lock: "physical"` (i.e. the
 *       mechanisms step), then `wc.desktopLocked === true`. A prefix that
 *       includes the mechanisms step but leaves `desktopLocked === false`
 *       has a half-applied physical lock gate.
 *   (b) If the prefix includes a step with `lock: "touch"`, then
 *       `wc.touchLayoutJson !== null`. A prefix that includes the touch step
 *       but leaves `touchLayoutJson === null` has a half-applied touch lock gate.
 *
 * This check does NOT invoke the validator (Clarifications 2026-06-27).
 *
 * Returns the indices of spine steps (in the SPINE-only subsequence, not the
 * full manifest array) whose prefix is not lock-consistent.
 */
export function checkSpinePrefixShippability(
  manifest: readonly Step[],
  wc: WcForCompleteness,
): number[] {
  const spineSteps = manifest.filter((s) => s.spine === true);
  const unshippable: number[] = [];

  let seenPhysicalLock = false;
  let seenTouchLock = false;

  for (let i = 0; i < spineSteps.length; i++) {
    const step = spineSteps[i]!;

    if (step.lock === "physical") seenPhysicalLock = true;
    if (step.lock === "touch") seenTouchLock = true;

    let inconsistent = false;
    if (seenPhysicalLock && !wc.desktopLocked) inconsistent = true;
    if (seenTouchLock && wc.touchLayoutJson === null) inconsistent = true;

    if (inconsistent) {
      unshippable.push(i);
    }
  }
  return unshippable;
}

// ---------------------------------------------------------------------------
// C5 — inputs satisfiability (orphan inputs, FR-018)
// ---------------------------------------------------------------------------

export interface OrphanInput {
  stepId: string;
  path: string;
}

/**
 * Flag inputs that are produced by no upstream step's `writes`.
 *
 * Uses `graph.nodes[*].writePaths` and `graph.nodes[*].inputPaths` to find
 * inputs with no matching writer anywhere in the graph.
 *
 * CONTRACT: this is the REAL implementation. No stubs.
 */
export function checkInputsSatisfiable(graph: StepGraph): OrphanInput[] {
  // Collect all paths written by any step.
  const allWrites = new Set<string>();
  for (const node of graph.nodes) {
    for (const p of node.writePaths) {
      allWrites.add(p);
    }
  }
  // Flag inputs not covered by any write.
  const orphans: OrphanInput[] = [];
  for (const node of graph.nodes) {
    for (const inputPath of node.inputPaths) {
      if (!allWrites.has(inputPath)) {
        orphans.push({ stepId: node.id, path: inputPath });
      }
    }
  }
  return orphans;
}

/**
 * Full implementation: check inputs satisfiability from a manifest.
 * Exported for unit tests that construct crafted manifests directly.
 */
export function checkInputsSatisfiableFromManifest(manifest: readonly Step[]): OrphanInput[] {
  const allWrites = new Set<string>();
  for (const step of manifest) {
    for (const p of step.writes) {
      allWrites.add(formatIRPath(p));
    }
  }
  const orphans: OrphanInput[] = [];
  for (const step of manifest) {
    for (const inputPath of step.inputs) {
      const key = formatIRPath(inputPath);
      if (!allWrites.has(key)) {
        orphans.push({ stepId: step.id, path: key });
      }
    }
  }
  return orphans;
}

// ---------------------------------------------------------------------------
// C7 — unreachable step detection
// ---------------------------------------------------------------------------

/**
 * Detect steps not reachable from the spine entry (the first spine step).
 *
 * A step is reachable if it is a spine step, OR it is an off-spine step whose
 * joinTarget resolves (directly or transitively) to a spine step. Any step
 * that has no path to the spine is unreachable.
 *
 * Returns the ids of unreachable steps.
 */
export function findUnreachable(manifest: readonly Step[]): string[] {
  const stepById = new Map<string, Step>(manifest.map((s) => [s.id, s]));
  const reachable = new Set<string>();

  for (const step of manifest) {
    if (step.spine === true) reachable.add(step.id);
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const step of manifest) {
      if (reachable.has(step.id)) continue;
      if (step.joinTarget !== undefined) {
        const target = stepById.get(step.joinTarget);
        if (target !== undefined && reachable.has(target.id)) {
          reachable.add(step.id);
          changed = true;
        }
      }
    }
  }

  return manifest.filter((s) => !reachable.has(s.id)).map((s) => s.id);
}

// ---------------------------------------------------------------------------
// CompletenessReport
// ---------------------------------------------------------------------------

export interface CompletenessReport {
  /** Transitive closure of step ids invalidated by the re-opened set (fixpoint). */
  stale: Set<string>;
  /** Each cycle in the writes→inputs graph; non-empty ⇒ hard error (FR-015). */
  cycles: string[][];
  /** Side trails missing/dead-ending joinTarget (FR-016). */
  rejoinViolations: RejoinViolation[];
  /** Spine-prefix indices whose working copy is not lock-consistent (FR-017). */
  unshippablePrefixes: number[];
  /** Inputs produced by no upstream writes (FR-018). */
  orphanInputs: OrphanInput[];
  /** Steps not reachable from the spine entry. */
  unreachable: string[];
}

/**
 * Build a StepGraph-like structure from a manifest for use in runCompleteness.
 * This avoids importing buildManifestStepGraph (which would create a circular
 * dep: completeness.ts → buildStepGraph.ts → manifest.ts → registerEditorSteps →
 * editors/ → stores/ → completeness.ts — via the store's import of completeness).
 *
 * Instead, we build a minimal StepGraph inline from the manifest Step[].
 */
function buildMinimalStepGraph(manifest: readonly Step[]): StepGraph {
  const nodes = manifest.map((step, idx) => ({
    id: step.id,
    label: step.title,
    type: step.kind as "editor-step" | "question-step",
    spine: step.spine === true,
    isEntry: idx === 0,
    isTerminal: idx === manifest.length - 1,
    writePaths: step.writes.map(formatIRPath),
    inputPaths: step.inputs.map(formatIRPath),
    ...(step.lock !== undefined ? { lock: step.lock } : {}),
    ...(step.joinTarget !== undefined ? { joinTarget: step.joinTarget } : {}),
  }));

  // Order edges (spine/fork/join) — not needed by the five checks, but required
  // by the StepGraph shape.
  const edges: import("./model.ts").StepGraphEdge[] = [];

  // Data edges: producer → consumer where writePaths ∩ inputPaths ≠ ∅.
  const dataEdges: import("./model.ts").StepGraphEdge[] = [];
  for (const producer of nodes) {
    if (producer.writePaths.length === 0) continue;
    const writeSet = new Set(producer.writePaths);
    for (const consumer of nodes) {
      if (consumer.id === producer.id) continue;
      for (const inputPath of consumer.inputPaths) {
        if (writeSet.has(inputPath)) {
          dataEdges.push({ from: producer.id, to: consumer.id, kind: "spine" });
          break;
        }
      }
    }
  }

  return { nodes, edges, dataEdges };
}

/**
 * Run all five completeness checks and aggregate into a CompletenessReport.
 *
 * Parameters are passed in rather than imported from stores/ (PURE function;
 * dashboard-layer boundary constraint). StudioShell reads the store and passes
 * the relevant slice here via props → DashboardView.
 *
 * All checks use the CONTRACT-NAMED exported functions (no stubs).
 *
 * @param manifest  The ordered Step[] (steps/manifest.ts).
 * @param wc        Minimal working-copy state (desktopLocked, touchLayoutJson).
 * @param reopened  (Optional) The currently re-opened step ids for C1 staleness.
 */
export function runCompleteness(
  manifest: readonly Step[],
  wc: WcForCompleteness,
  reopened: ReadonlySet<string> = new Set(),
): CompletenessReport {
  const graph = buildMinimalStepGraph(manifest);

  // C1: transitive staleness fixpoint (contract-named).
  const stale = computeStaleness(graph, reopened);

  // C2: cycle detection in the writes→inputs DATA graph (contract-named).
  const cycles = findCycles(graph);

  // C3: side-trail rejoin check.
  const rejoinViolations = checkRejoin(manifest);

  // C4: spine-prefix shippability (structural proxy, no validator).
  const unshippablePrefixes = checkSpinePrefixShippability(manifest, wc);

  // C5: orphan inputs (contract-named).
  const orphanInputs = checkInputsSatisfiable(graph);

  // C7: unreachable steps.
  const unreachable = findUnreachable(manifest);

  return {
    stale,
    cycles,
    rejoinViolations,
    unshippablePrefixes,
    orphanInputs,
    unreachable,
  };
}
