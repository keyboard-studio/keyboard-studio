// Spec 022 — demoted-Phase-A placement assertions (FR-001 / FR-003 / SC-001 and
// FR-009; additive — does NOT repurpose the spec-015 buildStepGraph.test.ts or the
// spec-016 driftGuardrail.test.ts).
//
// The orphaned full non-identity Phase A (15 identity + 15 provenance_*) is
// physically relocated to the dedicated reserve/ folder and reserveRegistry.
// Originally (spec 022) this rendered as reserve clog INSIDE the identity-lite
// drill-down, because identity_lite shared the full phaseARegistry. That has
// since been moved: identity_lite's phaseARegistry now holds ONLY the il_*
// modules (steps/flowSources.ts), so its drill-down carries NO reserve nodes,
// and the demoted battery surfaces in the Flow Map's dedicated Leftover section
// (buildLeftoverSection, sourced from reserveRegistry) — kept for reference /
// future reuse, never run by the live survey and never clogging a live flow.
//
// This locks:
//   • every demoted Phase A id renders as a Leftover node — kind:"library-not-in-flow",
//     region:"leftover", isTerminal:true (FR-003);
//   • it is ABSENT from the identity-lite drill-down as wired in production —
//     neither live nor reserve (FR-001 / SC-001);
//   • it is registered (no-delete) so it is leftover/reserve, NOT orphan (FR-009).
//
// Test-only: no contracts bump, no write routing, no flag flip (FR-010/FR-011).

import { describe, it, expect } from "vitest";

import phaseAModularRaw from "../../../../content/flows/proposed/phase_a_identity.modular.yaml?raw";
import { buildModularFlowGraph } from "./buildStepGraph.ts";
import { buildLeftoverSection } from "./renderedNodeSet.ts";
import { loadModularFlow } from "../survey/loadModularFlow.ts";
import { flowSources } from "../steps/flowSources.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
// The demoted-Phase-A id list is derived ONCE from phase_a_identity.modular.yaml
// (shared with noDeleteGuardrail.test.ts) — single source of truth.
import { DEMOTED_PHASE_A } from "../survey/questions/demotedPhaseA.fixture.ts";

describe("spec 022 — demoted Phase A is Leftover, not clog (FR-001/FR-003/SC-001)", () => {
  // The identity-lite drill-down as wired in PRODUCTION (its real flowSources
  // registry — now the il_*-only phaseARegistry).
  const identityLite = flowSources["identity_lite"]!;
  const identityGraph = buildModularFlowGraph(
    identityLite.raw,
    identityLite.title,
    identityLite.registry,
  );

  // The dedicated Leftover section: registered questions used by no live flow.
  const leftoverById = new Map(buildLeftoverSection().map((n) => [n.id, n]));

  it("FR-003: every demoted Phase A id renders as a Leftover node (region:'leftover')", () => {
    for (const id of DEMOTED_PHASE_A) {
      const node = leftoverById.get(id);
      expect(node, `demoted Phase A id "${id}" not rendered as a Leftover node`).toBeDefined();
      expect(node!.kind).toBe("library-not-in-flow");
      expect(node!.region).toBe("leftover");
      expect(node!.isTerminal).toBe(true);
    }
  });

  it("FR-001/SC-001: demoted Phase A ids are ABSENT from the production identity-lite drill-down", () => {
    const drillDownIds = new Set(identityGraph.nodes.map((n) => n.id));
    for (const id of DEMOTED_PHASE_A) {
      expect(
        drillDownIds.has(id),
        `demoted id "${id}" must not appear (live OR reserve) in the identity-lite drill-down`,
      ).toBe(false);
    }
  });

  it("the live identity-lite drill-down carries NO reserve clog at all", () => {
    const reserveNodes = identityGraph.nodes.filter((n) => n.kind === "library-not-in-flow");
    expect(reserveNodes).toEqual([]);
  });

  it("FR-009: demoted Phase A ids are LEFTOVER, not orphan — registered but off every live flow", () => {
    for (const id of DEMOTED_PHASE_A) {
      // registered (no-delete) ...
      expect(Object.prototype.hasOwnProperty.call(questionRegistry, id)).toBe(true);
      // ... and rendered by the SEPARATE Leftover mechanism (so the 016 bijection,
      // which is over the reachable set, excludes it — leftover, not orphan).
      expect(leftoverById.has(id)).toBe(true);
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
