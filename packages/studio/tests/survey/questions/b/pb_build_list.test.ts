// Spec 017 — pb_build_list drill-down declaration unit test (US2, FR-005/-007; FR-012).
//
// pb_build_list is the hand-built BuildListView (PhaseB.tsx), reached behind the
// mandatory IntroChooser discovery-method gate (registry id `pb_discovery_intro`).
// It is a registry-keyed drill-down under the opaque `characters` node, NOT a
// questionRegistry entry and NOT a manifest entry. Its confirmed-inventory OUTPUT
// rides on SurveyPhaseResult.confirmedInventory — a phase-result field, NOT a
// KeyboardIR write (so writes is []). Its CLDR-suggestions input is an async,
// in-component session signal (a non-IR signal); its IR seed is header.bcp47.
//
// Declared-only: nothing executes, flag off (FR-008/FR-015).

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";

import {
  pbBuildListDrillDown,
  drillDownDeclarations,
  CHARACTERS_NODE_ID,
} from "../../../../src/survey/questions/drillDownDeclarations.ts";
import { questionRegistry } from "../../../../src/survey/questions/registry.ts";
import { manifest } from "../../../../src/steps/manifest.ts";
import { flowSources } from "../../../../src/steps/flowSources.ts";
import { ruleTarget } from "../../../../src/dashboard/flowUtils.ts";
import { resolveNext } from "../../../../src/survey/SurveyRunner.tsx";
import { loadModularFlow } from "../../../../src/survey/loadModularFlow.ts";
import type { FlowQuestion } from "../../../../src/survey/types.ts";

// ---------------------------------------------------------------------------
// Survey-question reachability via the REAL resolveNext / FlowGotoRule routing
// (FR-014 §2.2(b), survey-question half of C7 — mirrors the per-graph survey
// reach the spec-016 drift guardrail computes; uses the production resolveNext +
// ruleTarget edge extractors, NOT findUnreachable, which is blind to FlowGotoRule
// routing). BFS from each status:"live" flowSources entry, collecting visited ids.
// ---------------------------------------------------------------------------

function structuralTargets(q: FlowQuestion): string[] {
  const next = q.next;
  if (next === undefined || next === null) return [];
  if (typeof next === "string") {
    // Linear next — resolveNext is the semantic basis for the edge.
    const t = resolveNext(q, undefined, {});
    return t !== null ? [t] : [];
  }
  // Conditional list — every FlowGotoRule target is a potentially-reachable next.
  const targets: string[] = [];
  for (const rule of next) {
    const goto = ruleTarget(rule);
    if (goto !== null) targets.push(goto);
  }
  return targets;
}

function computeSurveyReach(): Set<string> {
  const reach = new Set<string>();
  const liveSources = Object.values(flowSources).filter((s) => s.status === "live");
  for (const source of liveSources) {
    let flow;
    try {
      flow = loadModularFlow(source.raw);
    } catch {
      continue;
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
      if (q === undefined) continue;
      for (const target of structuralTargets(q)) stack.push(target);
    }
    for (const id of visited) {
      if (Object.prototype.hasOwnProperty.call(questionRegistry, id)) reach.add(id);
    }
  }
  return reach;
}

describe("spec 017 — pb_build_list drill-down declaration (FR-005, FR-007)", () => {
  it("is a registry-keyed drill-down under the opaque `characters` node, keyed off the IntroChooser gate", () => {
    expect(pbBuildListDrillDown.underNodeId).toBe(CHARACTERS_NODE_ID);
    expect(drillDownDeclarations[CHARACTERS_NODE_ID]).toContain(pbBuildListDrillDown);
    // The discovery gate the build-list sits behind is a real questionRegistry id.
    expect(pbBuildListDrillDown.registryKey).toBe("pb_discovery_intro");
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, "pb_discovery_intro")).toBe(true);
  });

  it("is NOT promoted to a questionRegistry entry nor a manifest entry (FR-008)", () => {
    // The spec-016 guardrail ratified pb_build_list is NOT a questionRegistry id.
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, "pb_build_list")).toBe(false);
    expect(manifest.some((s) => s.id === "pb_build_list")).toBe(false);
  });

  it("output rides on SurveyPhaseResult.confirmedInventory — NOT a KeyboardIR write (FR-007)", () => {
    expect(pbBuildListDrillDown.writes).toEqual([]);
    expect(pbBuildListDrillDown.output).toEqual({
      kind: "phase-result-field",
      field: "confirmedInventory",
    });
  });

  it("declares inputs = base IR seed (header.bcp47) + CLDR suggestions (non-IR session signal)", () => {
    expect(pbBuildListDrillDown.inputs.map(formatIRPath)).toEqual(["header.bcp47"]);
    expect(pbBuildListDrillDown.sessionInputs?.some((s) => s.includes("CLDR"))).toBe(true);
  });

  it("FR-013: does NOT declare irPath('header','script')", () => {
    for (const p of [...pbBuildListDrillDown.inputs, ...pbBuildListDrillDown.writes]) {
      expect(formatIRPath(p)).not.toBe("header.script");
    }
  });

  // FR-012 — input-satisfiability parity with a/prefill.test.ts (~L54): the IR seed
  // header.bcp47 has a producer in the single manifest graph (charactersStep.writes,
  // the same DEC-D1 subsumption write — charactersStep subsumes the iso_code producer).
  it("input header.bcp47 is satisfiable — a manifest step writes it (DEC-D1)", () => {
    const writers = new Set<string>();
    for (const step of manifest) for (const w of step.writes) writers.add(formatIRPath(w));
    for (const input of pbBuildListDrillDown.inputs) {
      expect(
        writers.has(formatIRPath(input)),
        `pb_build_list input ${formatIRPath(input)} has no producer in the manifest graph`,
      ).toBe(true);
    }
  });

  // FR-014 §2.2(b) — C7 per-graph reachability, SURVEY-QUESTION half. The
  // editor-step half (findUnreachable over the manifest) is asserted in
  // f/editorStepContracts.test.ts; this is the survey side. pb_build_list is
  // anchored to the questionRegistry id `pb_discovery_intro` (the IntroChooser
  // discovery gate) at its boundary, so the anchor must be reachable via the REAL
  // survey resolveNext / FlowGotoRule routing — otherwise the drill-down hangs off
  // a dead boundary node.
  it("FR-014 §2.2(b): registry anchor `pb_discovery_intro` is reachable via the survey resolveNext path", () => {
    expect(pbBuildListDrillDown.registryKey).toBe("pb_discovery_intro");
    const surveyReach = computeSurveyReach();
    expect(
      surveyReach.has(pbBuildListDrillDown.registryKey),
      `pb_build_list anchor "${pbBuildListDrillDown.registryKey}" is not reachable via the survey resolveNext walk`,
    ).toBe(true);
  });
});
