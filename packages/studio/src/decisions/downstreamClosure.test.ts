// Tests for the spec 093 downstream closure (FR-002): reverse reachability
// over the provides/requires graph.

import { describe, it, expect } from "vitest";
import type { FlowQuestion, QuestionModule } from "../survey/types.ts";
import { downstreamClosure, decisionDownstreamClosure } from "./downstreamClosure.ts";
import type { DependencyNode } from "./orderDecisions.ts";
import type { DecisionId } from "./decisionTypes.ts";

const node = (
  id: string,
  provides: DecisionId[] = [],
  requires: DecisionId[] = [],
): DependencyNode => ({ id, provides, requires });

const closure = (items: DependencyNode[], changed: string[]) =>
  downstreamClosure(items, (n) => n, new Set(changed as DecisionId[]));

// a → b → c chain (b requires a's decision, c requires b's), plus d off c,
// and an unrelated e.
const chain: DependencyNode[] = [
  node("ma", ["language-name"]),
  node("mb", ["language-code"], ["language-name"]),
  node("mc", ["target-script"], ["language-code"]),
  node("md", ["authoring-track"], ["target-script"]),
  node("me", ["author-name"]),
];

describe("downstreamClosure", () => {
  it("follows transitive dependents and stops at the leaves", () => {
    expect(closure(chain, ["language-name"])).toEqual(
      new Set(["language-code", "target-script", "authoring-track"]),
    );
    expect(closure(chain, ["target-script"])).toEqual(new Set(["authoring-track"]));
    expect(closure(chain, ["authoring-track"])).toEqual(new Set());
  });

  it("excludes the changed decisions themselves and unrelated decisions", () => {
    const out = closure(chain, ["language-code"]);
    expect(out.has("language-code" as DecisionId)).toBe(false);
    expect(out.has("author-name" as DecisionId)).toBe(false);
    expect(out.has("language-name" as DecisionId)).toBe(false);
  });

  it("unions the dependents of several changed decisions", () => {
    expect(closure(chain, ["language-name", "author-name"])).toEqual(
      new Set(["language-code", "target-script", "authoring-track"]),
    );
  });

  it("reaches both branches of a diamond exactly once", () => {
    const diamond: DependencyNode[] = [
      node("ma", ["language-name"]),
      node("mb", ["language-code"], ["language-name"]),
      node("mc", ["target-script"], ["language-name"]),
      node("md", ["authoring-track"], ["language-code", "target-script"]),
    ];
    expect(closure(diamond, ["language-name"])).toEqual(
      new Set(["language-code", "target-script", "authoring-track"]),
    );
  });

  it("an unknown changed decision still contributes the dependents that require it", () => {
    // "language-name" has no provider in this item set; mb requires it anyway.
    const partial: DependencyNode[] = [
      node("mb", ["language-code"], ["language-name"]),
      node("mc", ["target-script"], ["language-code"]),
    ];
    expect(closure(partial, ["language-name"])).toEqual(
      new Set(["language-code", "target-script"]),
    );
    expect(closure(partial, ["project-keyboard-id"])).toEqual(new Set());
  });

  it("empty change set and empty item set both close to empty", () => {
    expect(closure(chain, [])).toEqual(new Set());
    expect(closure([], ["language-name"])).toEqual(new Set());
  });

  it("a dependency cycle makes a changed decision honestly downstream of itself", () => {
    const cyclic: DependencyNode[] = [
      node("ma", ["language-name"], ["language-code"]),
      node("mb", ["language-code"], ["language-name"]),
    ];
    expect(closure(cyclic, ["language-name"])).toEqual(
      new Set(["language-name", "language-code"]),
    );
  });

  it("fails fast on a duplicate provider, like indexProviders", () => {
    const dup: DependencyNode[] = [
      node("ma", ["language-name"]),
      node("mb", ["language-name"]),
    ];
    expect(() => closure(dup, ["language-name"])).toThrow(
      'duplicate provider for decision "language-name": ma, mb',
    );
  });

  it("routing edges do not create closure edges", () => {
    const routed: DependencyNode[] = [
      { id: "ma", provides: ["language-name"], routesTo: [{ to: "mb", loopBack: false }] },
      node("mb", ["language-code"]),
    ];
    expect(closure(routed, ["language-name"])).toEqual(new Set());
  });
});

function stubModule(
  id: string,
  opts: { provides?: DecisionId[]; requires?: readonly DecisionId[] } = {},
): QuestionModule {
  return {
    definition: { id, type: "text" } as FlowQuestion,
    fixtures: { valid: [{ value: "x" }], invalid: [] },
    inputs: [],
    writes: [],
    ...opts,
  };
}

describe("decisionDownstreamClosure (registry modules)", () => {
  it("computes the closure from module provides/requires", () => {
    const mods = [
      stubModule("a", { provides: ["language-name"] }),
      stubModule("b", { provides: ["language-code"], requires: ["language-name"] }),
      stubModule("c", { provides: ["target-script"], requires: ["language-code"] }),
    ];
    expect(decisionDownstreamClosure(mods, new Set(["language-name"] as DecisionId[]))).toEqual(
      new Set(["language-code", "target-script"]),
    );
  });

  it("throws on duplicate providers via indexProviders", () => {
    const mods = [
      stubModule("a", { provides: ["language-name"] }),
      stubModule("b", { provides: ["language-name"] }),
    ];
    expect(() => decisionDownstreamClosure(mods, new Set())).toThrow(/duplicate provider/);
  });
});
