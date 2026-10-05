// Tests for the decision-spike topological ordering (km/decisions-spike).

import { describe, it, expect } from "vitest";
import type { QuestionModule } from "../survey/types.ts";
import { orderDecisions, filterGated } from "./orderDecisions.ts";
import type { DecisionId } from "./decisionTypes.ts";

function stubModule(
  id: string,
  opts: {
    provides?: DecisionId;
    requires?: readonly DecisionId[];
    gatedBy?: (decisions: Parameters<NonNullable<QuestionModule["gatedBy"]>>[0]) => boolean;
  } = {},
): QuestionModule {
  return {
    definition: { id, type: "text" },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...opts,
  };
}

const ids = (mods: QuestionModule[]) => mods.map((m) => m.definition.id);

describe("orderDecisions", () => {
  it("sorts a dependency chain regardless of input order", () => {
    const a = stubModule("a", { provides: "language-name" });
    const b = stubModule("b", { provides: "language-code", requires: ["language-name"] });
    const c = stubModule("c", { requires: ["language-code"] });
    expect(ids(orderDecisions([c, b, a]))).toEqual(["a", "b", "c"]);
  });

  it("is stable: unconstrained modules keep input order", () => {
    const a = stubModule("a");
    const b = stubModule("b");
    expect(ids(orderDecisions([b, a]))).toEqual(["b", "a"]);
  });

  it("fans out: several modules may require the same decision", () => {
    const a = stubModule("a", { provides: "language-name" });
    const b = stubModule("b", { requires: ["language-name"] });
    const c = stubModule("c", { requires: ["language-name"] });
    expect(ids(orderDecisions([c, b, a]))).toEqual(["a", "c", "b"]);
  });

  it("throws on an unresolved decision, naming the requirement and module", () => {
    const b = stubModule("b", { requires: ["target-script"] });
    expect(() => orderDecisions([b])).toThrow(
      'unresolved decision: "target-script" required by "b"',
    );
  });

  it("throws on a dependency cycle, naming the modules in the cycle", () => {
    const a = stubModule("a", { provides: "language-name", requires: ["language-code"] });
    const b = stubModule("b", { provides: "language-code", requires: ["language-name"] });
    expect(() => orderDecisions([a, b])).toThrow(/dependency cycle: .*a.*b/);
  });
});

describe("filterGated", () => {
  it("drops gated-out modules and keeps the rest", () => {
    const a = stubModule("a");
    const gated = stubModule("g", {
      gatedBy: (decisions) => decisions["target-script"]?.value === "Ethi",
    });
    expect(ids(filterGated([a, gated], {}))).toEqual(["a"]);
    expect(ids(filterGated([a, gated], {
      "target-script": { id: "target-script", value: "Ethi", provenance: "asked" },
    }))).toEqual(["a", "g"]);
  });
});
