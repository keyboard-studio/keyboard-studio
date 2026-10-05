// Tests for the decision-spike topological ordering (km/decisions-spike).

import { describe, it, expect } from "vitest";
import type { FlowQuestion, QuestionModule } from "../survey/types.ts";
import { questionRegistry } from "../survey/questions/registry.ts";
import {
  orderDecisions,
  filterGated,
  gatedByFromNext,
  effectiveGatedBy,
} from "./orderDecisions.ts";
import type { DecisionId } from "./decisionTypes.ts";

function stubModule(
  id: string,
  opts: {
    provides?: DecisionId[];
    requires?: readonly DecisionId[];
    gatedBy?: (decisions: Parameters<NonNullable<QuestionModule["gatedBy"]>>[0]) => boolean;
    next?: FlowQuestion["next"];
  } = {},
): QuestionModule {
  const { next, ...rest } = opts;
  return {
    definition: { id, type: "text", ...(next !== undefined ? { next } : {}) },
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...rest,
  };
}

const ids = (mods: QuestionModule[]) => mods.map((m) => m.definition.id);

describe("orderDecisions", () => {
  it("sorts a dependency chain regardless of input order", () => {
    const a = stubModule("a", { provides: ["language-name"] });
    const b = stubModule("b", { provides: ["language-code"], requires: ["language-name"] });
    const c = stubModule("c", { requires: ["language-code"] });
    expect(ids(orderDecisions([c, b, a]))).toEqual(["a", "b", "c"]);
  });

  it("is stable: unconstrained modules keep input order", () => {
    const a = stubModule("a");
    const b = stubModule("b");
    expect(ids(orderDecisions([b, a]))).toEqual(["b", "a"]);
  });

  it("fans out: several modules may require the same decision", () => {
    const a = stubModule("a", { provides: ["language-name"] });
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
    const a = stubModule("a", { provides: ["language-name"], requires: ["language-code"] });
    const b = stubModule("b", { provides: ["language-code"], requires: ["language-name"] });
    expect(() => orderDecisions([a, b])).toThrow(/dependency cycle: .*a.*b/);
  });

  it("throws on duplicate providers, naming both modules", () => {
    const a = stubModule("a", { provides: ["language-name"] });
    const b = stubModule("b", { provides: ["language-name"] });
    expect(() => orderDecisions([a, b])).toThrow(
      'duplicate provider for decision "language-name": a, b',
    );
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

describe("gatedByFromNext", () => {
  // The real identity-lite routing: il_target_script routes to
  // il_script_not_supported on "value == 'Ethi' or value == 'Hani' or value == 'Hang'"
  // and to il_author_name on the default branch. The derived gates must match
  // the hand-written predicates they replaced, value for value.
  const targetScript = questionRegistry["il_target_script"]!;
  const scriptNotSupported = questionRegistry["il_script_not_supported"]!;
  const authorName = questionRegistry["il_author_name"]!;
  const languageCode = questionRegistry["il_language_code"]!;
  const languageRegion = questionRegistry["il_language_region"]!;
  const modules = [targetScript, scriptNotSupported, authorName, languageCode, languageRegion];

  const withScript = (value: unknown) => ({
    "target-script": { id: "target-script" as const, value, provenance: "asked" as const },
  });

  it("derives the divert-branch gate for il_script_not_supported", () => {
    const gate = gatedByFromNext(scriptNotSupported.definition, modules);
    expect(gate).toBeDefined();
    for (const s of ["Ethi", "Hani", "Hang"]) {
      expect(gate!(withScript(s)), s).toBe(true);
    }
    for (const s of ["Latn", "other", undefined]) {
      expect(gate!(withScript(s)), String(s)).toBe(false);
    }
  });

  it("derives the default-branch gate for il_author_name (negation of earlier conditions)", () => {
    const gate = gatedByFromNext(authorName.definition, modules);
    expect(gate).toBeDefined();
    for (const s of ["Latn", "other", undefined]) {
      expect(gate!(withScript(s)), String(s)).toBe(true);
    }
    for (const s of ["Ethi", "Hani", "Hang"]) {
      expect(gate!(withScript(s)), s).toBe(false);
    }
  });

  it("returns undefined for a module with no conditional next", () => {
    expect(gatedByFromNext(languageCode.definition, modules)).toBeUndefined();
  });

  it("returns undefined when the only conditional inbound uses ctx.*", () => {
    // il_language_region is reached via "ctx.ilRegionAmbiguous == 'true'" —
    // ctx has no DecisionSet equivalent, so derivation fails open.
    expect(gatedByFromNext(languageRegion.definition, modules)).toBeUndefined();
  });

  it("a hand-written gatedBy wins as an explicit override", () => {
    const handWritten = () => true;
    const m = stubModule("x", { provides: ["language-code"], gatedBy: handWritten });
    // x is also the target of a conditional rule — the override still wins.
    const source = stubModule("s", {
      provides: ["target-script"],
      next: [{ condition: "value == 'Ethi'", goto: "x" }],
    });
    expect(effectiveGatedBy(m, [source, m])).toBe(handWritten);
  });

  it("effectiveGatedBy derives when no hand-written gate is present", () => {
    const gate = effectiveGatedBy(scriptNotSupported, modules);
    expect(gate).toBeDefined();
    expect(gate!(withScript("Ethi"))).toBe(true);
    expect(gate!(withScript("Latn"))).toBe(false);
  });
});
