// Map-projection test (spec 015, §2.5, FR-010).
//
// Asserts the dashboard spine node set equals the buildManifestStepGraph() →
// adapter node set, every projected node carries kind:"stub", and the per-phase
// modular graphs hang as registry-keyed drill-downs whose rendered node union is
// a superset of the live drill-down node set (no live node dropped).
//
// This exercises the NEW adapter (buildManifestProjection), distinct from the
// pre-existing tautology at buildStepGraph.test.ts (manifest ↔ buildManifestStepGraph
// node ids).
//
// P1 fix (spec 024 / ADR-0001): FLOW_SOURCES local array + buildFlows() helper
// have been removed. Drill-downs now derive from buildFlowSources() in
// renderedNodeSet.ts — the EXACT same function DashboardView and driftGuardrail.test.ts
// use — so this test cannot drift into a second, divergent list.

import { describe, it, expect } from "vitest";

import {
  buildManifestProjection,
  attachDrillDowns,
  registryKeyForFlow,
  buildManifestProjectionWithDrillDowns,
  CHARACTERS_STEP_ID,
  MANIFEST_FLOW_ID,
  MANIFEST_NODE_TYPE,
} from "./manifestProjection.ts";
import { buildManifestStepGraph } from "./buildStepGraph.ts";
import { buildFlowSources } from "./renderedNodeSet.ts";
import { manifest } from "../steps/manifest.ts";
import { questionRegistry } from "../survey/questions/registry.ts";

describe("buildManifestProjection — §2.5 map-projection (FR-010)", () => {
  const projection = buildManifestProjection();
  const stepGraph = buildManifestStepGraph();

  // FR-010 / SC-002: the dashboard spine node set == the adapter node set.
  // (The adapter projects exactly the buildManifestStepGraph() node set.)
  it("FR-010 — adapter node set equals buildManifestStepGraph() node set", () => {
    const projectedIds = projection.nodes.map((n) => n.id);
    const stepIds = stepGraph.nodes.map((n) => n.id);
    expect(projectedIds).toEqual(stepIds);
  });

  it("FR-010 — exactly one projected node per manifest step (bijection, no ghost/missing)", () => {
    const manifestIds = new Set(manifest.map((s) => s.id));
    const projectedIds = new Set(projection.nodes.map((n) => n.id));
    expect(projectedIds.size).toBe(manifestIds.size);
    for (const id of projectedIds) {
      expect(manifestIds.has(id), `ghost node "${id}" not in manifest`).toBe(true);
    }
    for (const id of manifestIds) {
      expect(projectedIds.has(id), `manifest step "${id}" has no projected node`).toBe(true);
    }
  });

  it("FR-010 — distinct from the tautology: projection is a FlowGraph of GraphNodes (carry kind/region), not StepGraphNodes", () => {
    // The pre-existing tautology compares StepGraph node ids to manifest ids.
    // This adapter produces GraphNodes — the field that does NOT exist on a
    // StepGraphNode (kind) is present on every projected node.
    for (const node of projection.nodes) {
      expect(node).toHaveProperty("kind");
      expect(node).toHaveProperty("region");
      expect(node.flowId).toBe(MANIFEST_FLOW_ID);
    }
  });

  // US2 / SC-001 / FR-002: every projected node carries kind:"stub".
  it("US2/FR-002 — every projected editor-step node has kind === 'stub' and region === 'not-yet-ordered'", () => {
    expect(projection.nodes.length).toBeGreaterThan(0);
    for (const node of projection.nodes) {
      expect(node.kind, `node "${node.id}" should be kind:stub`).toBe("stub");
      expect(node.region, `node "${node.id}" should be region:not-yet-ordered`).toBe("not-yet-ordered");
    }
  });

  it("FR-002 — benign defaults on projected nodes (type, flags, optionCount)", () => {
    for (const node of projection.nodes) {
      expect(node.type).toBe(MANIFEST_NODE_TYPE);
      expect(node.required).toBe(false);
      expect(node.engineResolved).toBe(false);
      expect(node.advisory).toBe(false);
      expect(node.isGate).toBe(false);
      expect(node.optionCount).toBe(0);
    }
  });

  // FR-003: spine/fork/join order edges projected onto FlowGraph edges.
  it("FR-003 — edges mirror the manifest spine: spine→linear, fork/join→default, none dangling", () => {
    const linearCount = projection.edges.filter((e) => e.kind === "linear").length;
    const defaultCount = projection.edges.filter((e) => e.kind === "default").length;
    const stepSpine = stepGraph.edges.filter((e) => e.kind === "spine").length;
    const stepForkJoin = stepGraph.edges.filter((e) => e.kind === "fork" || e.kind === "join").length;

    expect(projection.edges.length).toBe(stepGraph.edges.length);
    expect(linearCount).toBe(stepSpine);
    expect(defaultCount).toBe(stepForkJoin);
    for (const e of projection.edges) {
      expect(e.dangling).toBe(false);
    }
  });

  it("FR-003 — entry is the first manifest step", () => {
    expect(projection.entryId).toBe(manifest[0]!.id);
  });
});

describe("attachDrillDowns — registry-keyed drill-downs (FR-004 / SC-003)", () => {
  // P1 fix: derive from buildFlowSources() — the same function DashboardView and
  // driftGuardrail.test.ts consume. No independent copy.
  const flows = buildFlowSources();
  const drillDowns = attachDrillDowns(flows);

  // Production layout after Stage 1 re-homes:
  //   identity_lite   -> "identity" step    (1 drill-down)
  //   phase_b_chars   -> "characters" step  (1 drill-down)
  //   phase_f_helpdocs -> "help" step       (1 drill-down)
  //   track           -> "track" step       (1 drill-down)
  //   project_name    -> "project_name" step (1 drill-down)
  //   phase_a_identity -> status:"proposed" — excluded from live drill-downs
  it("FR-004 — modular graphs hang under their manifest step id (identity/characters/help/track/project_name)", () => {
    expect(Object.keys(drillDowns).sort()).toEqual(
      ["identity", CHARACTERS_STEP_ID, "help", "project_name", "track"].sort(),
    );
    // Each step now has exactly one drill-down flow.
    expect(drillDowns["identity"]!.length).toBe(1);
    expect(drillDowns[CHARACTERS_STEP_ID]!.length).toBe(1);
    expect(drillDowns["help"]!.length).toBe(1);
    expect(drillDowns["track"]!.length).toBe(1);
    expect(drillDowns["project_name"]!.length).toBe(1);
    // Every live flow is accounted for across the buckets — none dropped.
    const total = Object.values(drillDowns).reduce((n, list) => n + list.length, 0);
    expect(total).toBe(flows.length);
  });

  it("FR-004 — each drill-down key is a questionRegistry id (divergence is observable)", () => {
    for (const list of Object.values(drillDowns)) {
      for (const dd of list) {
        // Built (non-null) graphs key off a real registry id.
        if (dd.graph !== null) {
          expect(
            Object.prototype.hasOwnProperty.call(questionRegistry, dd.registryKey),
            `drill-down key "${dd.registryKey}" (${dd.title}) is not a questionRegistry id`,
          ).toBe(true);
          expect(registryKeyForFlow(dd.graph)).toBe(dd.registryKey);
        }
      }
    }
  });

  // SC-003: the rendered node union is a superset of the live drill-down node set.
  // Note: phase_a_identity is status:"proposed" and is NOT part of the live
  // drill-down set. Its modules appear only as reserve/library nodes in the
  // identity_lite drill-down graph — they are excluded from both sides of the
  // live-node superset assertion (they are not "today's live nodes").
  it("SC-003 — rendered node union (spine + drill-downs) is a superset of the live drill-down node set (no live node dropped)", () => {
    const projection = buildManifestProjectionWithDrillDowns(flows);

    // Live drill-down node set: the union of all live flow graph node ids.
    // (Derived from buildFlowSources(), which excludes proposed flows.)
    const liveNodeIds = new Set<string>();
    for (const f of flows) {
      if (f.graph !== null) for (const n of f.graph.nodes) liveNodeIds.add(n.id);
    }

    // The rendered union under the projection: every node still rendered as a
    // drill-down, plus the projected manifest spine nodes.
    const renderedIds = new Set<string>();
    for (const n of projection.spine.nodes) renderedIds.add(n.id);
    for (const list of Object.values(projection.drillDowns)) {
      for (const dd of list) {
        if (dd.graph !== null) for (const n of dd.graph.nodes) renderedIds.add(n.id);
      }
    }

    for (const id of liveNodeIds) {
      expect(renderedIds.has(id), `live node "${id}" is dropped under the projection`).toBe(true);
    }
  });

  it("SC-003 — every modular graph is retained across the step buckets (drop none)", () => {
    // Flows spread across identity / characters / help / track / project_name;
    // the union of all buckets must retain every flow title, in flows order.
    const titles = Object.values(drillDowns).flatMap((list) => list.map((d) => d.title));
    expect(titles.sort()).toEqual(flows.map((f) => f.title).sort());
  });
});
