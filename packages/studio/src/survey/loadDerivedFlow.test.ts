// loadDerivedFlowDef: derived order, provenance split, fail-fast guards.
// (Frozen per-flow orders live in decisions/orderParity.test.ts.)

import { describe, it, expect } from "vitest";
import { loadDerivedFlowDef } from "./loadDerivedFlow.ts";
import { flowModules } from "./questions/registry.ts";

describe("loadDerivedFlowDef", () => {
  it("builds a FlowDef whose questions are the modules' definitions", () => {
    const flow = loadDerivedFlowDef("project_name", "G", flowModules.project_name);
    expect(flow.flow_id).toBe("project_name");
    expect(flow.phase).toBe("G");
    expect(new Set(flow.questions)).toEqual(
      new Set(flowModules.project_name.map((m) => m.definition)),
    );
    expect(flow.provenance_questions).toBeUndefined();
  });

  it("splits the declared provenance subset into provenance_questions", () => {
    const [first, second] = flowModules.project_name;
    const flow = loadDerivedFlowDef("project_name", "G", [first, second], [second]);
    expect(flow.questions).toEqual([first.definition]);
    expect(flow.provenance_questions).toEqual([second.definition]);
  });

  it("throws on an empty module list", () => {
    expect(() => loadDerivedFlowDef("x", "A", [])).toThrowError(/must not be empty/);
  });

  it("throws when a provenance module is not in the flow's modules", () => {
    expect(() =>
      loadDerivedFlowDef("x", "A", flowModules.track, flowModules.project_name),
    ).toThrowError(/is not in modules/);
  });
});
