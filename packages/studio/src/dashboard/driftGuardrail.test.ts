// Spec 016 — qu-drift-guardrail (D1 / D2a).
//
// Replaces the tautological C8/C9 block at buildStepGraph.test.ts:323-356 (which
// asserts buildManifestStepGraph node ids == manifest step ids — manifest vs
// itself, blind to YAML/registry/manifest drift). This file asserts the REAL
// rendered<->runtime BIJECTION:
//
//   RENDERED  = the node ids the Flow Map actually paints
//               (collectRenderedNodeIds: the 015 manifest-spine projection UNION
//                the per-phase drill-down question nodes), via the ONE shared
//                composition DashboardView also consumes (renderedNodeSet.ts).
//   RUNTIME   = the runtime-reachable id set, computed PER GRAPH:
//                 • editor steps via findUnreachable(manifest) (completeness.ts),
//                 • survey questions via the resolveNext / buildGraphFromQuestions
//                   edge set over FLOW_SOURCES (NOT findUnreachable — it is blind
//                   to FlowGotoRule routing, FR-007).
//
// A rendered node with no runtime step, or a runtime-reachable step with no
// rendered node, turns this guardrail RED — the drift the C8/C9 tautology cannot
// catch. Reserve/library ids (registered-but-unreachable) are excluded from both
// sides; the bijection is over the reachable set only.
//
// D1: own co-located file (beside completeness.test.ts), importing
// buildManifestStepGraph DIRECTLY. .dependency-cruiser.cjs excludes *.test.ts
// from analysis, so the direct import creates no boundary/circular-dep risk.
//
// Test-only: no contracts bump, no write routing, no flag flip — behaviour
// byte-identical (FR-011).

import { describe, it, expect } from "vitest";

import {
  buildFlowSources,
  collectRenderedNodeIds,
} from "./renderedNodeSet.ts";
import { flowSources } from "../steps/flowSources.ts";
// Direct import of the manifest-spine builder (D1) — the C8/C9 contrast at
// buildStepGraph.test.ts:323-356 asserts identity against THIS; we assert the
// rendered<->runtime bijection instead.
import { buildManifestStepGraph } from "./buildStepGraph.ts";
import { findUnreachable } from "./completeness.ts";
import { resolveNext } from "../survey/SurveyRunner.tsx";
import { ruleTarget } from "./flowUtils.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import { manifest } from "../steps/manifest.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import type { FlowQuestion } from "../survey/types.ts";

// ---------------------------------------------------------------------------
// Pure bijection check (T008) — feed two id sets, get the two violation lists.
// ---------------------------------------------------------------------------

interface BijectionViolations {
  /** rendered ids with no runtime-reachable step. */
  orphanRendered: string[];
  /** runtime-reachable ids with no rendered node. */
  uncovered: string[];
}

/**
 * Pure set comparison — the single decision point for RED/GREEN. The negative
 * tests (N1/N2) inject divergence into CLONED inputs and assert RED here without
 * ever touching the real manifest/registry.
 */
function bijectionViolations(
  rendered: ReadonlySet<string>,
  runtimeReach: ReadonlySet<string>,
): BijectionViolations {
  return {
    orphanRendered: [...rendered].filter((id) => !runtimeReach.has(id)).sort(),
    uncovered: [...runtimeReach].filter((id) => !rendered.has(id)).sort(),
  };
}

// ---------------------------------------------------------------------------
// Runtime-reach computation (T005 / T006 / T007) — both graphs, both methods.
// ---------------------------------------------------------------------------

/**
 * Editor-step reach (T005, FR-007): manifest ids minus findUnreachable(manifest).
 * Reachability here is the spine-or-transitive-joinTarget rule
 * (completeness.ts:475-499) — blind to FlowGotoRule by design; that is the
 * survey side's job.
 */
function computeEditorReach(): Set<string> {
  const unreachable = new Set(findUnreachable(manifest));
  return new Set(manifest.map((s) => s.id).filter((id) => !unreachable.has(id)));
}

/**
 * Structural goto targets of a question (T006): every FlowGotoRule target is a
 * potentially-reachable next, so we enumerate the whole rule set rather than
 * evaluating live conditions (we have no runtime value/ctx). resolveNext is the
 * semantic basis and is exercised directly for the linear/string-next case.
 *
 * Rule-target extraction reuses the PRODUCTION ruleTarget() from flowUtils.ts —
 * the exact precedence buildGraphFromQuestions uses — rather than re-deriving it,
 * so the runtime-reach walk tracks production routing even if that precedence
 * changes (km-testing/km-verification hardening). ruleTarget returns null for
 * terminal branches (FlowGotoRule.default is the boolean default-branch marker,
 * not a string id; only rule.goto carries a target id).
 */
function structuralTargets(q: FlowQuestion): string[] {
  const next = q.next;
  if (next === undefined || next === null) return [];
  if (typeof next === "string") {
    // Linear next — exercise resolveNext as the semantic basis (FR-007).
    const t = resolveNext(q, undefined, {});
    return t !== null ? [t] : [];
  }
  // Conditional list — collect every rule target via the production extractor.
  const targets: string[] = [];
  for (const rule of next) {
    const goto = ruleTarget(rule);
    if (goto !== null) targets.push(goto);
  }
  return targets;
}

/**
 * Survey-question reach (T006, FR-007): for each status:"live" flow in
 * flowSources, BFS from the flow entry following the structural edge set
 * (resolveNext / buildGraphFromQuestions over next / FlowGotoRule[]),
 * collecting the questionRegistry ids visited. Does NOT reuse findUnreachable.
 *
 * Spec 024 / ADR-0001: derives from flowSources (status:"live" entries only),
 * which is the same set buildFlowSources() uses. Proposed entries (e.g.
 * phase_a_identity) are excluded from both sides of the bijection — their
 * modules are registered-but-unreachable (reserve nodes) and are not part of
 * the reachable rendered set.
 */
function computeSurveyReach(): Set<string> {
  const reach = new Set<string>();
  // Iterate only status:"live" entries — same filter as buildFlowSources().
  const liveSources = Object.values(flowSources).filter((s) => s.status === "live");
  for (const source of liveSources) {
    let flow;
    try {
      flow = loadModularFlow(source.raw);
    } catch {
      continue; // a parse failure surfaces in the rendered-side error path
    }
    const all = [...flow.questions, ...(flow.provenance_questions ?? [])];
    const byId = new Map(all.map((q) => [q.id, q]));
    const entry = flow.questions[0]?.id;
    if (entry === undefined) continue;

    const visited = new Set<string>();
    const stack = [entry];
    while (stack.length > 0) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      const q = byId.get(id);
      if (q === undefined) continue; // dangling goto target — not a registry node
      for (const target of structuralTargets(q)) stack.push(target);
    }
    for (const id of visited) {
      if (Object.prototype.hasOwnProperty.call(questionRegistry, id)) reach.add(id);
    }
  }
  return reach;
}

// ---------------------------------------------------------------------------
// The guardrail.
// ---------------------------------------------------------------------------

describe("drift guardrail — rendered <-> runtime bijection (spec 016)", () => {
  // RENDERED: the exact composition DashboardView paints (shared helper, D2a).
  const flows = buildFlowSources();
  const rendered = collectRenderedNodeIds(flows);

  // RUNTIME: per-graph reach, both methods run and contribute.
  const editorReach = computeEditorReach();
  const surveyReach = computeSurveyReach();
  const runtimeReach = new Set<string>([...editorReach, ...surveyReach]);

  // Asymmetry note (correct as-is, non-obvious): the RENDERED live set includes
  // every question DECLARED in each YAML's `questions:` list (buildModularFlowGraph
  // maps over flow.questions), whereas computeSurveyReach includes only questions
  // edge-reachable by BFS from the entry. The bijection below therefore ALSO
  // silently asserts "every declared question is edge-reachable from its entry" —
  // a real, useful invariant: a declared-but-edge-orphaned YAML question would go
  // RED here as orphanRendered. It holds on real data (109==109).
  it("SC-001 / FR-001: rendered node set is bijective with runtime-reachable ids", () => {
    const { orphanRendered, uncovered } = bijectionViolations(rendered, runtimeReach);
    expect(
      orphanRendered,
      `rendered nodes with no runtime-reachable step (drift): ${orphanRendered.join(", ")}`,
    ).toEqual([]);
    expect(
      uncovered,
      `runtime-reachable ids with no rendered node (drift): ${uncovered.join(", ")}`,
    ).toEqual([]);
    // Belt-and-suspenders: exact set equality.
    expect(rendered).toEqual(runtimeReach);
  });

  it("FR-002 / FR-003: rendered set is non-empty and the reserve/library set is excluded", () => {
    // The manifest spine alone guarantees a non-trivial rendered set; an empty
    // set would make the bijection vacuous.
    expect(rendered.size).toBeGreaterThan(manifest.length);

    // collectRenderedNodeIds excludes kind:"library-not-in-flow" nodes. Note an
    // id can be a reserve node in one flow's drill-down yet a LIVE node in
    // another (e.g. a Phase A entry question appears as reserve in the
    // identity-lite drill-down). The exclusion is of the reserve SET — ids that
    // are reserve in EVERY drill-down they appear in and live in none — so we
    // compute "live anywhere" and assert exactly those (plus the spine) are rendered.
    const liveAnywhere = new Set<string>();
    const reserveSomewhere = new Set<string>();
    for (const dd of flows) {
      if (dd.graph === null) continue;
      for (const node of dd.graph.nodes) {
        if (node.kind === "library-not-in-flow") reserveSomewhere.add(node.id);
        else liveAnywhere.add(node.id);
      }
    }
    // An id that is reserve in some flow but live in another stays rendered.
    for (const id of reserveSomewhere) {
      if (liveAnywhere.has(id)) {
        expect(rendered.has(id), `"${id}" is live elsewhere; must stay rendered`).toBe(true);
      } else {
        expect(rendered.has(id), `pure-reserve id "${id}" must be excluded`).toBe(false);
      }
    }
    // Every live-anywhere question id IS rendered.
    for (const id of liveAnywhere) {
      expect(rendered.has(id), `live question "${id}" must be rendered`).toBe(true);
    }
  });

  it("D1 / FR-009: distinct from the C8/C9 tautology (buildStepGraph.test.ts:323-356)", () => {
    // C8/C9 there assert buildManifestStepGraph node ids == manifest step ids
    // (manifest vs itself). We import buildManifestStepGraph DIRECTLY (D1) only to
    // anchor the contrast: this guardrail does NOT re-assert that identity — it
    // asserts the rendered<->RUNTIME bijection above. The manifest spine is one
    // arm of the rendered set (every step graph node projects to a rendered node),
    // not the assertion itself.
    const stepGraph = buildManifestStepGraph();
    for (const node of stepGraph.nodes) {
      expect(
        rendered.has(node.id),
        `manifest step "${node.id}" must project to a rendered spine node`,
      ).toBe(true);
    }
    // The bijection (SC-001) — not this projection identity — is what catches drift.
  });

  it("FR-007 / T011: BOTH reachability computations run and contribute", () => {
    // findUnreachable side (editor steps) contributed.
    expect(editorReach.size).toBeGreaterThan(0);
    // resolveNext / edge-walk side (survey questions) contributed.
    expect(surveyReach.size).toBeGreaterThan(0);
    // The two sides are disjoint in this codebase (manifest ids vs registry ids),
    // so the union strictly grows — proving neither side is a no-op subset.
    expect(runtimeReach.size).toBe(editorReach.size + surveyReach.size);
  });

  it("FR-008 / T012 / SC-005: the build-list/discovery branch is in the QUESTION graph, not the manifest graph", () => {
    // Ratified reconciliation (spec.md FR-008, 2026-06-29 km archivist): the spec
    // originally named `pb_build_list`, but that is the BuildListView React branch
    // (survey/PhaseB.tsx:535), NOT a questionRegistry id — no `pb_build_list` id
    // exists. The reachable registry id at that boundary is `pb_discovery_intro`
    // (the IntroChooser/discovery gate, registry.b.ts:74, reached as a string-next
    // target from pb_co_installed_keyboards.ts:17). FR-008/SC-005 were amended to
    // name it. It MUST be found via the survey/resolveNext reach (the QUESTION
    // graph), and MUST NOT appear in the manifest/findUnreachable reach (the
    // editor-step graph), since the manifest collapses the whole Phase A/B/F
    // battery into the opaque "characters" placeholder.
    expect(questionRegistry).toHaveProperty("pb_discovery_intro");
    expect(surveyReach.has("pb_discovery_intro"), "discovery branch must be reachable in the question graph").toBe(true);
    expect(editorReach.has("pb_discovery_intro"), "discovery branch must NOT be a manifest editor-step").toBe(false);
    // And it is rendered (drill-down node) — closing the bijection for it.
    expect(rendered.has("pb_discovery_intro")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Negative tests (N1/N2, FR-004/-005/-006, T013/T014/T015).
//
// Divergence is injected into CLONES of the real id sets passed to the pure
// bijectionViolations helper — the real manifest/registry are never mutated.
// Removing the injection returns the helper to empty-violations against the real
// data (proving the guardrail is a genuine detector, not always-red).
// ---------------------------------------------------------------------------

describe("drift guardrail — negative tests (injection RED, removal GREEN)", () => {
  const flows = buildFlowSources();
  const rendered = collectRenderedNodeIds(flows);
  const runtimeReach = new Set<string>([
    ...computeEditorReach(),
    ...computeSurveyReach(),
  ]);

  it("baseline (T015): real sets produce NO violations (GREEN)", () => {
    expect(bijectionViolations(rendered, runtimeReach)).toEqual({
      orphanRendered: [],
      uncovered: [],
    });
  });

  it("N1 (FR-004 / T013): a runtime step with no rendered node turns it RED", () => {
    // A synthetic manifest step that is reachable (in the runtime set) but has no
    // registry/YAML coverage and no rendered drill-down -> uncovered.
    const SYNTH = "__synthetic_uncovered_manifest_step__";
    const injectedRuntime = new Set(runtimeReach);
    injectedRuntime.add(SYNTH);

    const { orphanRendered, uncovered } = bijectionViolations(rendered, injectedRuntime);
    expect(uncovered).toContain(SYNTH);
    expect(orphanRendered).toEqual([]);

    // Real manifest/registry untouched; removing the injection is GREEN (FR-006).
    expect(runtimeReach.has(SYNTH)).toBe(false);
    expect(bijectionViolations(rendered, runtimeReach)).toEqual({
      orphanRendered: [],
      uncovered: [],
    });
  });

  it("N2 (FR-005 / T014): a rendered node with no runtime step turns it RED", () => {
    // A synthetic orphan registry/rendered id with no runtime-reachable step.
    const ORPHAN = "__synthetic_orphan_registry_id__";
    const injectedRendered = new Set(rendered);
    injectedRendered.add(ORPHAN);

    const { orphanRendered, uncovered } = bijectionViolations(injectedRendered, runtimeReach);
    expect(orphanRendered).toContain(ORPHAN);
    expect(uncovered).toEqual([]);

    // Real rendered set untouched; removing the injection is GREEN (FR-006).
    expect(rendered.has(ORPHAN)).toBe(false);
    expect(bijectionViolations(rendered, runtimeReach)).toEqual({
      orphanRendered: [],
      uncovered: [],
    });
  });
});
