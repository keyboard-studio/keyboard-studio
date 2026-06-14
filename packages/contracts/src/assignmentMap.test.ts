// see spec.md §7.7 — precedence + coverage semantics for the scoped assignment
// map (issue #368). Strict tsconfig applies (exactOptionalPropertyTypes +
// noUncheckedIndexedAccess).

import { describe, it, expect } from "vitest";
import type { MechanismAssignment } from "./assignmentMap";
import {
  mergeAssignments,
  effectiveMechanisms,
  uncoveredTargets,
} from "./assignmentMap";

const dflt: MechanismAssignment = {
  scope: "keyboard-default",
  target: "",
  modality: "physical",
  mechanisms: [{ patternId: "p_default", strategyId: "S-02" }],
};
const toneClass: MechanismAssignment = {
  scope: "character-class",
  target: "tone-vowels",
  modality: "physical",
  mechanisms: [{ patternId: "p_tone", strategyId: "S-07" }],
};
const individualEng: MechanismAssignment = {
  scope: "individual",
  target: "ŋ",
  modality: "physical",
  mechanisms: [
    { patternId: "p_direct" },
    { patternId: "p_deadkey", strategyId: "S-02" }, // multi-access
  ],
};

describe("mergeAssignments()", () => {
  it("concatenates across phases and is last-wins per modality+scope+target", () => {
    const later: MechanismAssignment = {
      scope: "keyboard-default",
      target: "",
      modality: "physical",
      mechanisms: [{ patternId: "p_default_v2" }],
    };
    const merged = mergeAssignments([[dflt, toneClass], [later]]);
    expect(merged).toHaveLength(2); // default replaced, class kept
    const d = merged.find((a) => a.scope === "keyboard-default");
    expect(d?.mechanisms[0]?.patternId).toBe("p_default_v2");
  });

  it("treats same target in different modalities as distinct", () => {
    const touchDefault: MechanismAssignment = { ...dflt, modality: "touch" };
    const merged = mergeAssignments([[dflt, touchDefault]]);
    expect(merged).toHaveLength(2);
  });

  it("ignores undefined per-phase entries", () => {
    const merged = mergeAssignments([undefined, [dflt], undefined]);
    expect(merged).toHaveLength(1);
  });

  it("returns [] for an empty outer array", () => {
    expect(mergeAssignments([])).toEqual([]);
  });

  it("preserves first-appearance order across phases while taking last value", () => {
    const a1: MechanismAssignment = { ...dflt, mechanisms: [{ patternId: "v1" }] };
    const a2: MechanismAssignment = { ...dflt, mechanisms: [{ patternId: "v2" }] };
    const merged = mergeAssignments([[a1, toneClass], [individualEng], [a2]]);
    // default first (its first appearance), then class, then individual; default has v2.
    expect(merged.map((a) => `${a.scope}:${a.target}`)).toEqual([
      "keyboard-default:",
      "character-class:tone-vowels",
      "individual:ŋ",
    ]);
    expect(merged[0]?.mechanisms[0]?.patternId).toBe("v2");
  });
});

describe("effectiveMechanisms() — precedence individual > class > default", () => {
  const all = [dflt, toneClass, individualEng];

  it("individual assignment wins over class and default", () => {
    const m = effectiveMechanisms(all, "ŋ", "physical", ["tone-vowels"]);
    expect(m.map((r) => r.patternId)).toEqual(["p_direct", "p_deadkey"]);
  });

  it("class assignment wins over default when no individual", () => {
    const m = effectiveMechanisms(all, "á", "physical", ["tone-vowels"]);
    expect(m[0]?.patternId).toBe("p_tone");
  });

  it("falls back to keyboard-default when no class matches", () => {
    const m = effectiveMechanisms(all, "z", "physical", []);
    expect(m[0]?.patternId).toBe("p_default");
  });

  it("first matching class wins when a target is in several classes", () => {
    const m = effectiveMechanisms(all, "à", "physical", ["unknown", "tone-vowels"]);
    expect(m[0]?.patternId).toBe("p_tone");
  });

  it("returns [] when nothing covers the target and there is no default", () => {
    const m = effectiveMechanisms([toneClass], "z", "physical", []);
    expect(m).toEqual([]);
  });

  it("does not cross modalities", () => {
    const m = effectiveMechanisms([dflt], "z", "touch");
    expect(m).toEqual([]); // dflt is physical-only
  });
});

describe("uncoveredTargets() — criterion 18.6 coverage dead-end check", () => {
  it("reports characters that resolve to zero mechanisms", () => {
    const inventory = ["a", "ŋ", "ɛ"];
    // only an individual covers ŋ; no default → a and ɛ are dead-ends
    const gaps = uncoveredTargets([individualEng], inventory, "physical");
    expect(gaps).toEqual(["a", "ɛ"]);
  });

  it("returns [] when a keyboard-default covers the whole inventory", () => {
    const gaps = uncoveredTargets([dflt], ["a", "ŋ", "ɛ"], "physical");
    expect(gaps).toEqual([]);
  });

  it("treats an assignment with empty mechanisms as uncovered (documents behavior)", () => {
    const emptyIndividual: MechanismAssignment = {
      scope: "individual",
      target: "ǂ",
      modality: "physical",
      mechanisms: [],
    };
    // an entry exists but produces no mechanism → still a coverage dead-end (18.6)
    expect(uncoveredTargets([emptyIndividual], ["ǂ"], "physical")).toEqual(["ǂ"]);
  });

  it("uses class membership to cover characters", () => {
    const inventory = ["á", "à", "z"];
    const classesOf = (c: string): string[] =>
      c === "á" || c === "à" ? ["tone-vowels"] : [];
    // tone vowels covered by class; z uncovered (no default in this set)
    const gaps = uncoveredTargets([toneClass], inventory, "physical", classesOf);
    expect(gaps).toEqual(["z"]);
  });
});
