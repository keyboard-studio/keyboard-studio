// galleryModules.coverage — spec 090 FR-002 / T008: every decision a
// gallery step settles has exactly one registered gallery module, and the
// module's declared requires EQUAL its step's declared requires — the
// parity spec 091's derived step membership relies on.
//
// Spec 091 T016 flip: the step table this test once read is deleted, so
// the expected settles set is derived from the derived screens
// themselves — a decision is settled by the screen whose gallery
// (custom-renderer) member provides it — and the step requires it pins
// against are the pre-091 table's, carried below as frozen baseline
// literals (main@18e63aa4 declarations). If a future screen settles a
// new decision without a gallery module, or a module's requires drift
// from the baseline its screen was declared with, this test fails.

import { describe, it, expect } from "vitest";
import {
  decisionIndex,
  decisionModules,
  declaredScreenGates,
  galleryModules,
} from "../survey/questions/registry.ts";
import type { DecisionId } from "./decisionTypes.ts";
import { deriveScreens } from "./deriveScreens.ts";
import { settlesForStep, stepHasSettles } from "./screenSettles.ts";

/** decision id → the screen that settles it, derived from the screens. */
function derivedSettles(): Map<DecisionId, string> {
  const galleryProvided = new Set<DecisionId>(
    galleryModules.flatMap((m) => m.provides ?? []),
  );
  const settles = new Map<DecisionId, string>();
  for (const screen of deriveScreens(decisionModules, declaredScreenGates)) {
    for (const id of screen.decisionIds) {
      if (galleryProvided.has(id)) settles.set(id, screen.id);
    }
  }
  return settles;
}

/**
 * The pre-091 step table's declared requires per gallery step, frozen at
 * the T016 flip. A module's requires must still equal the requires its
 * step was declared with — the ordering contract has not changed, only
 * its source (the module is now the declaration).
 */
const BASELINE_STEP_REQUIRES: Readonly<Record<string, readonly string[]>> = {
  layout: ["language-code"],
  choose_base: ["language-code", "target-script"],
  characters: ["target-script", "authoring-track", "project-keyboard-id"],
  marks: ["character-inventory"],
  punctuation: ["character-inventory"],
  invisibles: ["character-inventory"],
  convenience: ["character-inventory", "base-keyboard"],
  carve: ["base-keyboard", "windows-layout", "marks-treatment", "punctuation-inventory", "invisibles-inventory", "retained-convenience-chars"],
  deadkeys: ["carved-layout"],
  rules: ["deadkeys-defined", "windows-layout"],
  mechanisms: ["carved-layout", "deadkeys-defined", "rule-set", "marks-treatment", "windows-layout"],
  touch_seed_source: ["physical-layout"],
  touch: ["physical-layout", "touch-seed-source"],
  help: ["physical-layout", "touch-layout"],
};

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
      const stepRequires = BASELINE_STEP_REQUIRES[stepId];
      expect(stepRequires, `baseline requires recorded for step ${stepId}`).toBeDefined();
      expect([...(mod?.requires ?? [])]).toEqual([...(stepRequires ?? [])]);
    });

    it("is the decision the recorder's settles source names for its screen", () => {
      // decisions/screenSettles.ts (spec 091) is what the recorder and
      // the draft migration read; it must agree with this derived map.
      expect(settlesForStep(stepId)).toContain(decisionId);
      expect(stepHasSettles(stepId)).toBe(true);
    });
  });

  it("question-only screens settle nothing (the recorder's negative case)", () => {
    for (const id of ["identity", "track", "project_name", "package", "no-such-step"]) {
      expect(settlesForStep(id), id).toEqual([]);
      expect(stepHasSettles(id), id).toBe(false);
    }
  });
});
