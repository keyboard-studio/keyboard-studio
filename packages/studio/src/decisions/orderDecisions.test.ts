// Tests for the decision-spike topological ordering (km/decisions-spike).

import { describe, it, expect } from "vitest";
import type { FlowQuestion, QuestionModule } from "../survey/types.ts";
import { questionRegistry, flowModules } from "../survey/questions/registry.ts";
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

describe("gatedByFromNext - merge points (unconditional inbound edges count)", () => {
  const withDecision = (id: DecisionId, value: unknown) => ({
    [id]: { id, value, provenance: "asked" as const },
  });

  // gate --(value=='yes')--> opt --> join ; gate --(default)--> join
  const gate = stubModule("gate", {
    provides: ["target-script"],
    next: [
      { condition: "value == 'yes'", goto: "opt" },
      { default: true, goto: "join" },
    ],
  });
  const opt = stubModule("opt", { provides: ["language-name"], next: "join" });
  const join = stubModule("join", { provides: ["language-code"] });
  const modules = [gate, opt, join];

  it("keeps a join reachable by both a conditional and an unconditional edge", () => {
    const g = effectiveGatedBy(join, modules);
    // Visible through opt (yes) and through the default edge (no): always.
    expect(g === undefined || (g(withDecision("target-script", "yes")) && g(withDecision("target-script", "no")))).toBe(true);
  });

  it("drops a join only reachable through a hidden predecessor", () => {
    const only = stubModule("opt2", { provides: ["language-name"], next: "tail" });
    const tail = stubModule("tail", { provides: ["language-code"] });
    const g2 = stubModule("g2", {
      provides: ["target-script"],
      next: [{ condition: "value == 'yes'", goto: "opt2" }],
    });
    const gate2 = effectiveGatedBy(tail, [g2, only, tail]);
    expect(gate2).toBeDefined();
    expect(gate2!(withDecision("target-script", "yes"))).toBe(true);
    expect(gate2!(withDecision("target-script", "no"))).toBe(false);
  });

  it("runDecisionFlow-style filtering keeps the join for both answers", () => {
    for (const v of ["yes", "no"]) {
      expect(ids(filterGated(modules, withDecision("target-script", v)))).toContain("join");
    }
  });

  it("real phase F: pf_credits survives both answers of pf_more_detail_gate", () => {
    const f: readonly QuestionModule[] = flowModules.phase_f_helpdocs;
    const credits = f.find((m) => m.definition.id === "pf_credits")!;
    const detail = f.find((m) => m.definition.id === "pf_more_detail_gate")!;
    expect(detail.provides?.length ?? 0).toBeGreaterThan(0);
    const d = detail.provides![0]!;
    const g = effectiveGatedBy(credits, f);
    for (const v of ["true", "false"]) {
      const ds = withDecision(d, v);
      expect(g === undefined || g(ds), v).toBe(true);
    }
  });
});
