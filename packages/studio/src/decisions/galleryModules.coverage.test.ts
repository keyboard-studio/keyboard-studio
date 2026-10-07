// galleryModules.coverage — spec 090 FR-002 / T008: every decision a
// gallery step settles has exactly one registered gallery module, and the
// module's declared requires EQUAL its step's declared requires — the
// parity spec 091's derived step membership will rely on.
//
// The expected settles set is DERIVED, not listed: for each declared step,
// its `provides` minus the decisions its flows' question modules provide
// is exactly the step's `settles` (steps/stepDependencies.ts). If a future
// step settles a new decision without a gallery module, this test fails.

import { describe, it, expect } from "vitest";
import {
  DECLARED_STEP_IDS,
  stepDependencies,
} from "../steps/stepDependencies.ts";
import {
  decisionIndex,
  flowModules,
  galleryModules,
} from "../survey/questions/registry.ts";
import type { DecisionId } from "./decisionTypes.ts";

/** decision id → the step that settles it, derived from stepDependencies. */
function derivedSettles(): Map<DecisionId, string> {
  const flowProvided = new Set<DecisionId>();
  for (const modules of Object.values(flowModules)) {
    for (const mod of modules) {
      for (const id of mod.provides ?? []) flowProvided.add(id);
    }
  }
  const settles = new Map<DecisionId, string>();
  for (const stepId of DECLARED_STEP_IDS) {
    const deps = stepDependencies(stepId);
    for (const id of deps.provides) {
      if (!flowProvided.has(id)) settles.set(id, stepId);
    }
  }
  return settles;
}

const SETTLES = derivedSettles();

describe("gallery module coverage (FR-002)", () => {
  it("the derived settles set is exactly the fourteen gallery decisions", () => {
    expect(SETTLES.size).toBe(14);
    expect([...SETTLES.keys()].sort()).toEqual([
      "base-keyboard",
      "carved-layout",
      "character-inventory",
      "deadkeys-defined",
      "help-docs",
      "invisibles-inventory",
      "marks-treatment",
      "physical-layout",
      "punctuation-inventory",
      "retained-convenience-chars",
      "rule-set",
      "touch-layout",
      "touch-seed-source",
      "windows-layout",
    ]);
  });

  it("registers exactly one gallery module per settles id, and no others", () => {
    expect(galleryModules).toHaveLength(SETTLES.size);
    const provided = galleryModules.map((m) => m.provides?.[0]);
    expect(new Set(provided).size).toBe(galleryModules.length);
    for (const id of SETTLES.keys()) {
      expect(provided, `a gallery module provides ${id}`).toContain(id);
    }
  });

  describe.each([...SETTLES.entries()])("decision %s (step %s)", (decisionId, stepId) => {
    const mod = galleryModules.find((m) => m.provides?.[0] === decisionId);

    it("has exactly one registered provider, resolvable through decisionIndex", () => {
      expect(mod).toBeDefined();
      expect(decisionIndex[decisionId]).toBe(mod);
    });

    it("declares provides / requires / apply / renderer", () => {
      expect(mod?.provides).toEqual([decisionId]);
      expect(Array.isArray(mod?.requires)).toBe(true);
      expect(typeof mod?.apply).toBe("function");
      expect(typeof mod?.renderer).toBe("function");
    });

    it("declares requires EQUAL to its step's declared requires (the 091 parity)", () => {
      const stepRequires = stepDependencies(stepId as never).requires;
      expect([...(mod?.requires ?? [])]).toEqual([...stepRequires]);
    });
  });
});
