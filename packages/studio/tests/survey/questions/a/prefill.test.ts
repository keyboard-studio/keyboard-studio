// Spec 017 — prefill drill-down declaration unit test (US2, FR-005/-006; FR-012).
//
// prefill is a registry-keyed drill-down under the opaque `characters` node, NOT
// a questionRegistry entry and NOT a manifest entry. It is read-only (writes: [])
// with inputs = header.bcp47 (array, session-derived) + the session-level
// ScriptPrefill (a non-IR signal, not an irPath). irPath('header','script') is
// never declared. Its header.bcp47 input is satisfiable per DEC-D1 (the
// charactersStep subsumption write).
//
// Declared-only: nothing executes, flag off (FR-008/FR-015).

import { describe, it, expect } from "vitest";
import { formatIRPath } from "@keyboard-studio/contracts";

import {
  prefillDrillDown,
  drillDownDeclarations,
  CHARACTERS_NODE_ID,
} from "../../../../src/survey/questions/drillDownDeclarations.ts";
import { questionRegistry } from "../../../../src/survey/questions/registry.ts";
import { manifest } from "../../../../src/steps/manifest.ts";
import { FLOW_SOURCES } from "../../../../src/dashboard/renderedNodeSet.ts";
import { ruleTarget } from "../../../../src/dashboard/flowUtils.ts";
import { resolveNext } from "../../../../src/survey/SurveyRunner.tsx";
import { loadModularFlow } from "../../../../src/survey/loadModularFlow.ts";
import type { FlowQuestion } from "../../../../src/survey/types.ts";

// ---------------------------------------------------------------------------
// Survey-question reachability via the REAL resolveNext / FlowGotoRule routing
// (FR-014 §2.2(b), survey-question half of C7 — mirrors the per-graph survey
// reach the spec-016 drift guardrail computes; uses the production resolveNext +
// ruleTarget edge extractors, NOT findUnreachable, which is blind to FlowGotoRule
// routing). BFS from each FLOW_SOURCES flow entry, collecting visited registry ids.
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
  for (const source of FLOW_SOURCES) {
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

describe("spec 017 — prefill drill-down declaration (FR-005, FR-006)", () => {
  it("is a registry-keyed drill-down under the opaque `characters` node", () => {
    expect(prefillDrillDown.underNodeId).toBe(CHARACTERS_NODE_ID);
    expect(drillDownDeclarations[CHARACTERS_NODE_ID]).toContain(prefillDrillDown);
    // registry-keyed: its boundary anchor is a real questionRegistry id.
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, prefillDrillDown.registryKey)).toBe(true);
  });

  it("is NOT promoted to a questionRegistry entry nor a manifest entry (FR-008)", () => {
    expect(Object.prototype.hasOwnProperty.call(questionRegistry, "prefill")).toBe(false);
    expect(manifest.some((s) => s.id === "prefill")).toBe(false);
  });

  it("is read-only: writes is [] (FR-006)", () => {
    expect(prefillDrillDown.writes).toEqual([]);
    expect(prefillDrillDown.output).toEqual({ kind: "none" });
  });

  it("declares inputs = header.bcp47 (array, session-derived) — and the session ScriptPrefill as a non-IR signal", () => {
    expect(prefillDrillDown.inputs.map(formatIRPath)).toEqual(["header.bcp47"]);
    expect(prefillDrillDown.sessionInputs?.some((s) => s.includes("ScriptPrefill"))).toBe(true);
  });

  it("FR-013: does NOT declare irPath('header','script') (it does not exist)", () => {
    for (const p of [...prefillDrillDown.inputs, ...prefillDrillDown.writes]) {
      expect(formatIRPath(p)).not.toBe("header.script");
    }
  });

  // FR-012 — input-satisfiability (per DEC-D1 subsumption): prefill's header.bcp47
  // input has a producer in the single manifest graph (charactersStep.writes).
  it("input header.bcp47 is satisfiable — a manifest step writes it (DEC-D1)", () => {
    const writers = new Set<string>();
    for (const step of manifest) for (const w of step.writes) writers.add(formatIRPath(w));
    for (const input of prefillDrillDown.inputs) {
      expect(
        writers.has(formatIRPath(input)),
        `prefill input ${formatIRPath(input)} has no producer in the manifest graph`,
      ).toBe(true);
    }
  });

  // FR-014 §2.2(b) — C7 per-graph reachability, SURVEY-QUESTION half. The
  // editor-step half (findUnreachable over the manifest) is asserted in
  // f/editorStepContracts.test.ts; this is the survey side. prefill is anchored
  // to a questionRegistry id at its boundary, so the anchor must be reachable via
  // the REAL survey resolveNext / FlowGotoRule routing — otherwise the drill-down
  // hangs off a dead boundary node.
  //
  // Spec 022 re-anchor: the anchor was `primary_script` (a Phase-A module). Spec 022
  // demotes the full non-identity Phase A to the inert library (renderedNodeSet.ts
  // drops phase_a_identity from FLOW_SOURCES), so `primary_script` is no longer
  // reachable. The anchor moved to the LIVE identity-lite equivalent
  // `il_target_script` (the script-capture question on the real StudioShell→
  // IdentityLite path), which IS reachable via the identity-lite flow source. This
  // assertion is kept (pointed at live, reachable content) — NOT deleted.
  it("FR-014 §2.2(b): registry anchor `il_target_script` is reachable via the survey resolveNext path", () => {
    expect(prefillDrillDown.registryKey).toBe("il_target_script");
    const surveyReach = computeSurveyReach();
    expect(
      surveyReach.has(prefillDrillDown.registryKey),
      `prefill anchor "${prefillDrillDown.registryKey}" is not reachable via the survey resolveNext walk`,
    ).toBe(true);
    // And the demoted Phase-A module it replaced is NO LONGER reachable (proving the
    // spec-022 demotion landed) — primary_script is now registry-only reserve.
    expect(
      surveyReach.has("primary_script"),
      "primary_script must be demoted (unreachable) after spec 022",
    ).toBe(false);
  });
});
