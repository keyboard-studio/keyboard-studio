// Spec 022 — reserve-node + reachability assertions for the demoted Phase A
// (FR-001 / FR-003 / SC-001 and FR-009; additive — does NOT repurpose the
// spec-015 buildStepGraph.test.ts or the spec-016 driftGuardrail.test.ts).
//
// The orphaned full non-identity Phase A (15 identity + 15 provenance_*) is
// demoted to the inert library. computeReserveNodes renders a registry module as a
// `library-not-in-flow` reserve node whenever it is in the registry but NOT in a
// flow's live ordering (reserveIds = registryKeys − liveIds). The identity-lite
// flow (the CANONICAL identity experience) lists only the 5 il_* modules, so its
// drill-down already emits every Phase A module as a reserve node via the SAME
// computeReserveNodes mechanism the migration plan reserves for library content
// (§2.2(a)). This locks that:
//   • every demoted Phase A id renders as kind:"library-not-in-flow",
//     region:"not-yet-ordered", isTerminal:true (FR-003);
//   • it is absent from the identity-lite flow's LIVE ordering (FR-001 / SC-001);
//   • it is registered (no-delete) so it is reserve, NOT orphan (FR-009).
//
// Open item (I-2, flagged to the lead): the FULL demotion also requires dropping
// the redundant LIVE `phase_a_identity` flow-source entry from renderedNodeSet.ts
// FLOW_SOURCES, which collides with spec-017's prefill anchor (`primary_script`
// reachability). That FLOW_SOURCES edit is NOT applied here pending that decision;
// this test asserts the reserve RENDERING itself, which is already true today via
// the identity-lite drill-down.
//
// Test-only: no contracts bump, no write routing, no flag flip (FR-010/FR-011).

import { describe, it, expect } from "vitest";

import identityLiteModularRaw from "../../../../content/flows/identity_lite.modular.yaml?raw";
import phaseAModularRaw from "../../../../content/flows/phase_a_identity.modular.yaml?raw";
import { buildModularFlowGraph } from "./buildStepGraph.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import { phaseARegistry } from "../survey/questions/registry.a.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
// The demoted-Phase-A id list is derived ONCE from phase_a_identity.modular.yaml
// (shared with noDeleteGuardrail.test.ts) — single source of truth.
import { DEMOTED_PHASE_A } from "../survey/questions/demotedPhaseA.fixture.ts";

describe("spec 022 — demoted Phase A renders as reserve nodes (FR-001/FR-003/SC-001)", () => {
  const graph = buildModularFlowGraph(
    identityLiteModularRaw,
    "Identity-lite (Phase A head)",
    phaseARegistry,
  );

  const reserveById = new Map(
    graph.nodes
      .filter((n) => n.kind === "library-not-in-flow")
      .map((n) => [n.id, n]),
  );

  it("FR-003: every demoted Phase A id renders as a library-not-in-flow reserve node", () => {
    for (const id of DEMOTED_PHASE_A) {
      const node = reserveById.get(id);
      expect(node, `demoted Phase A id "${id}" not rendered as a reserve node`).toBeDefined();
      expect(node!.kind).toBe("library-not-in-flow");
      expect(node!.region).toBe("not-yet-ordered");
      expect(node!.isTerminal).toBe(true);
    }
  });

  it("FR-001/SC-001: demoted Phase A ids are ABSENT from the identity-lite live ordering", () => {
    const liveIds = new Set(
      graph.nodes.filter((n) => n.kind === "live").map((n) => n.id),
    );
    for (const id of DEMOTED_PHASE_A) {
      expect(liveIds.has(id), `demoted id "${id}" must NOT be a live node`).toBe(false);
    }
  });

  it("FR-009: demoted Phase A ids are RESERVE, not orphan — registered but off the live ordering", () => {
    for (const id of DEMOTED_PHASE_A) {
      // registered (no-delete) ...
      expect(Object.prototype.hasOwnProperty.call(questionRegistry, id)).toBe(true);
      // ... and rendered by the SEPARATE reserve mechanism (so the 016 bijection,
      // which is over the reachable set, excludes it — reserve, not orphan).
      expect(reserveById.has(id)).toBe(true);
    }
  });

  it("the demoted set covers exactly the 30 non-identity Phase A modules in phase_a_identity.modular.yaml", () => {
    const flow = loadModularFlow(phaseAModularRaw);
    const yamlIds = new Set([
      ...flow.questions.map((q) => q.id),
      ...(flow.provenance_questions ?? []).map((q) => q.id),
    ]);
    expect(new Set(DEMOTED_PHASE_A)).toEqual(yamlIds);
    expect(DEMOTED_PHASE_A.length).toBe(30);
  });
});
