// spec 025 (D6) — proposed-flow Library section tests.
//
// Covers:
//   • buildProposedFlowGraph — ordered graph, kind:"proposed" / region:"library",
//     preserves YAML ordering/routing (FR-001).
//   • status completeness — YAML `status` == flowSources status for EVERY entry
//     (FR-003; the binding that keeps the two representations from drifting).
//   • buildLibrarySection — flat reserve = in-no-flow-at-all (FR-004); only-in-proposed
//     questions render inside the proposed graph, not as flat reserve.
//   • dual-reference "also live" flag (FR-005) — WARN, computed + badged, never a fail.
//   • proposed exclusion from the rendered<->runtime bijection (FR-006).
//   • hard failure iff a manifest flowRef targets a status:"proposed" entry (FR-007).
//
// Additive; does NOT modify the spec-016 driftGuardrail or spec-022 guardrails.

import { describe, it, expect } from "vitest";

import { flowSources } from "../steps/flowSources.ts";
import { manifest } from "../steps/manifest.ts";
import { parseThinYaml } from "../survey/loadModularFlow.ts";
import { buildProposedFlowGraph } from "./buildStepGraph.ts";
import {
  buildFlowSources,
  buildLibrarySection,
  collectRenderedNodeIds,
} from "./renderedNodeSet.ts";
import { DEMOTED_PHASE_A } from "../survey/questions/demotedPhaseA.fixture.ts";

// ---------------------------------------------------------------------------
// FR-001 — proposed flows build as ordered graphs (kind:"proposed"/region:"library").
// ---------------------------------------------------------------------------

describe("spec 025 — buildProposedFlowGraph (FR-001)", () => {
  const source = flowSources["phase_a_identity"]!;
  const graph = buildProposedFlowGraph(source.raw, source.title);

  it("builds one node per demoted Phase A question (15 + 15 provenance = 30)", () => {
    // Literal count was fragile; derived from the source collection instead.
    expect(graph.nodes.length).toBe(DEMOTED_PHASE_A.length);
    const ids = new Set(graph.nodes.map((n) => n.id));
    for (const id of DEMOTED_PHASE_A) {
      expect(ids.has(id), `proposed graph missing "${id}"`).toBe(true);
    }
  });

  it("every question node is kind:'proposed' / region:'library'", () => {
    for (const n of graph.nodes) {
      expect(n.kind, `node "${n.id}" kind`).toBe("proposed");
      expect(n.region, `node "${n.id}" region`).toBe("library");
    }
  });

  it("preserves the YAML ordering (first node is the flow entry) and has edges", () => {
    expect(graph.entryId).toBe("desktop_first_notice");
    expect(graph.nodes[0]!.id).toBe("desktop_first_notice");
    expect(graph.nodes[0]!.isEntry).toBe(true);
    // Ordered routing preserved visually — the battery is not a flat list.
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  it("FR-005: marks node.alsoLive when a question id is also in a live flow", () => {
    // Synthetic live-id set forces the dual-reference path (real data has none).
    const withDual = buildProposedFlowGraph(source.raw, source.title, new Set(["iso_code"]));
    const iso = withDual.nodes.find((n) => n.id === "iso_code");
    expect(iso?.alsoLive).toBe(true);
    const other = withDual.nodes.find((n) => n.id === "region");
    expect(other?.alsoLive).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// FR-003 — status completeness: YAML status == flowSources status for EVERY entry.
// ---------------------------------------------------------------------------

describe("spec 025 — YAML status matches flowSources status for every entry (FR-003)", () => {
  for (const [id, source] of Object.entries(flowSources)) {
    it(`"${id}": parseThinYaml(status) === flowSources status ("${source.status}")`, () => {
      const yamlStatus = parseThinYaml(source.raw).status; // default "live"
      expect(yamlStatus).toBe(source.status);
    });
  }

  it("phase_a_identity YAML carries status: proposed", () => {
    expect(parseThinYaml(flowSources["phase_a_identity"]!.raw).status).toBe("proposed");
  });

  it("a live flow YAML omits status and defaults to 'live'", () => {
    expect(parseThinYaml(flowSources["identity_lite"]!.raw).status).toBe("live");
  });
});

// ---------------------------------------------------------------------------
// FR-004 — flat reserve = in no flow at all; only-in-proposed render in the graph.
// ---------------------------------------------------------------------------

describe("spec 025 — buildLibrarySection reserve + dual-reference (FR-004/FR-005)", () => {
  const lib = buildLibrarySection();

  it("renders phase_a_identity as one ordered proposed graph (SC-001)", () => {
    expect(lib.proposed.length).toBeGreaterThanOrEqual(1);
    const pa = lib.proposed.find((p) => p.id === "phase_a_identity");
    expect(pa, "phase_a_identity must be a Library proposed flow").toBeDefined();
    expect(pa!.error).toBeNull();
    // Literal count was fragile; derived from the source collection instead.
    expect(pa!.graph!.nodes.length).toBe(DEMOTED_PHASE_A.length);
  });

  it("demoted Phase A ids are NOT flat reserve (they render inside the proposed graph)", () => {
    const reserveIds = new Set(lib.reserve.map((n) => n.id));
    for (const id of DEMOTED_PHASE_A) {
      expect(reserveIds.has(id), `"${id}" is in a proposed flow — must not be flat reserve`).toBe(false);
    }
  });

  it("every flat-reserve node is kind:'library-not-in-flow' / region:'library'", () => {
    for (const n of lib.reserve) {
      expect(n.kind).toBe("library-not-in-flow");
      expect(n.region).toBe("library");
    }
  });

  it("FR-005: real data has no dual-reference (phase_a is disjoint from the live il_* head)", () => {
    // The demoted battery uses unprefixed ids; the live identity flow uses il_* — disjoint.
    expect(lib.dualReferenced).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FR-006 — proposed-flow node ids are excluded from the rendered<->runtime bijection.
// ---------------------------------------------------------------------------

describe("spec 025 — proposed node ids excluded from the bijection (FR-006)", () => {
  const rendered = collectRenderedNodeIds(buildFlowSources());

  it("a proposed-only question id is NOT in the rendered (bijection) set", () => {
    // desktop_first_notice lives only in the proposed phase_a flow (not any live flow).
    expect(rendered.has("desktop_first_notice")).toBe(false);
    // provenance_* ids are likewise proposed-only.
    expect(rendered.has("provenance_opt_in")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// FR-007 — hard failure iff a manifest flowRef targets a status:"proposed" entry.
// ---------------------------------------------------------------------------

describe("spec 025 — no manifest flowRef targets a proposed flow (FR-007, hard)", () => {
  // Pure detector — the single RED/GREEN decision point.
  function refsToProposed(
    steps: typeof manifest,
    sources: Readonly<Record<string, { status: string }>>,
  ): string[] {
    const violations: string[] = [];
    for (const step of steps) {
      for (const ref of step.flowRefs ?? []) {
        if (sources[ref]?.status === "proposed") violations.push(`${step.id} -> ${ref}`);
      }
    }
    return violations;
  }

  it("baseline: the REAL manifest references no proposed flow (GREEN)", () => {
    expect(refsToProposed(manifest, flowSources)).toEqual([]);
  });

  it("injecting a manifest flowRef to a proposed flow turns the detector RED", () => {
    const injected = [
      ...manifest,
      { id: "__synthetic_promoter__", flowRefs: ["phase_a_identity"] } as unknown as (typeof manifest)[number],
    ];
    expect(refsToProposed(injected, flowSources)).toContain("__synthetic_promoter__ -> phase_a_identity");
    // Real manifest untouched → GREEN.
    expect(refsToProposed(manifest, flowSources)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// FR-008 — parity: the live composition is unchanged; the Library section is
// purely additive. (The byte-identical live-map contract is also enforced by the
// unchanged spec-016 driftGuardrail + spec-022 phaseADemoteReserve guardrails,
// which stay green; this block pins the live catalogue shape here directly.)
// ---------------------------------------------------------------------------

describe("spec 025 — live composition is unchanged; Library is additive (FR-008)", () => {
  it("exactly one proposed flow (phase_a_identity); all others are live", () => {
    const proposed = Object.values(flowSources).filter((s) => s.status === "proposed").map((s) => s.id);
    expect(proposed).toEqual(["phase_a_identity"]);
    const live = Object.values(flowSources).filter((s) => s.status === "live").map((s) => s.id).sort();
    expect(live).toEqual(
      ["identity_lite", "phase_b_characters", "phase_f_helpdocs", "project_name", "track"],
    );
  });

  it("buildFlowSources (the live drill-down composition) excludes the proposed flow", () => {
    const ids = new Set(buildFlowSources().map((f) => f.graph?.flowId).filter(Boolean));
    expect(ids.has("phase_a_identity")).toBe(false);
  });
});
