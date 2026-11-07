// firedRuleMapping.test.ts — compiled-ordinal → source-line → IR rule mapping
// (spec 082, FR-002; workstream 1 follow-up).
//
// The critical property: `ruleIndex` is the COMPILED ordinal (kmc reorders
// rules), so the mapping goes through `// Line N` → `IRRule.sourceLine` and
// is ORDER-INDEPENDENT. Positional indexing into `ir.groups[].rules[]` is
// wrong and must never return.

import { describe, expect, it } from "vitest";
import { parseKmn } from "@keyboard-studio/engine";
import type { IRRule, KeyboardIR } from "@keyboard-studio/contracts";
import {
  buildFiredRuleResolver,
  enumerateGroupRuleSrcLines,
} from "./firedRuleMapping.ts";
import type { FiredRuleTrace } from "./demoSimulation.ts";

// Minimal compiled-JS fixture: two groups, with a reordered rule (the
// deadkey-match marker hoisted above its setter — the verified kmc case).
const COMPILED_JS = `
function K() {
  this.g_main_0=function(t,e) {
    var k=KeymanWeb,r=0,m=0;
    // Line 10 — deadkey MATCH (hoisted above its setter by kmc)
    if(k.KM(t,e)&&1){r=m=1;} // Line 10
    // Line 8 — deadkey SET
    if(k.K(t,e)&&1){r=m=1;} // Line 8
    // Line 12 — plain rule
    if(1){r=m=1;} // Line 12
    return r;
  };
  this.g_second_1=function(t,e) {
    var k=KeymanWeb,r=0,m=0;
    if(k.KM(t,e)&&0){r=1;} // Line 20 — nomatch marker
    if(1){r=m=1;} // Line 21
    return r;
  };
}
`;

function makeRule(sourceLine: number, output: IRRule["output"]): IRRule {
  return {
    nodeId: `rule-${sourceLine}`,
    sourceLine,
    context: [{ kind: "char", value: "x" }],
    output,
  } as IRRule;
}

function makeIr(): KeyboardIR {
  return {
    groups: [
      {
        name: "main",
        // IR order is SOURCE order (10, 8, 12) — deliberately different
        // from compiled order. A positional lookup would misattribute.
        rules: [
          makeRule(10, [{ kind: "deadkey", id: 3 }]),
          makeRule(8, [{ kind: "deadkey", id: 3 }]),
          makeRule(12, [{ kind: "char", value: "y" }]),
        ],
      },
      {
        name: "second",
        rules: [
          // `> nul` compiles to an empty output list ("no output").
          makeRule(20, []),
          makeRule(21, [{ kind: "char", value: "z" }]),
        ],
      },
    ],
  } as unknown as KeyboardIR;
}

function fired(group: string, ruleIndex: number, emittedOutput?: string): FiredRuleTrace {
  return { group, ruleIndex, matchedContext: "x", emittedOutput };
}

describe("enumerateGroupRuleSrcLines", () => {
  it("enumerates markers per group with their // Line N source lines", () => {
    const groups = enumerateGroupRuleSrcLines(COMPILED_JS);
    expect(groups.map((g) => g.groupName)).toEqual(["main", "second"]);
    expect(groups[0]!.srcLines).toEqual([10, 8, 12]);
    expect(groups[1]!.srcLines).toEqual([20, 21]);
  });

  it("counts nomatch r=1 markers as ordinals", () => {
    const groups = enumerateGroupRuleSrcLines(COMPILED_JS);
    // The nomatch marker on Line 20 is ordinal 0 of group "second".
    expect(groups[1]!.srcLines[0]).toBe(20);
  });

  it("yields null for markers without a // Line comment", () => {
    const js = `this.g_main_0=function(t,e){var r=0;if(1){r=m=1;}return r;};`;
    const groups = enumerateGroupRuleSrcLines(js);
    expect(groups[0]!.srcLines).toEqual([null]);
  });
});

describe("buildFiredRuleResolver", () => {
  it("resolves through sourceLine, not position (kmc-reordered rules)", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    // Compiled ordinal 0 is the Line-10 deadkey match; ordinal 1 is Line 8.
    // IR source order is [10, 8, 12] — positional indexing would return the
    // wrong rule for ordinal 1.
    expect(resolve(fired("main", 0))?.sourceLine).toBe(10);
    expect(resolve(fired("main", 1))?.sourceLine).toBe(8);
    expect(resolve(fired("main", 2))?.sourceLine).toBe(12);
  });

  it("resolves the nomatch ordinal to its IR rule", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    expect(resolve(fired("second", 0, ""))?.sourceLine).toBe(20);
  });

  it("returns undefined when the compiled source is absent", () => {
    const resolve = buildFiredRuleResolver(makeIr(), null);
    expect(resolve(fired("main", 0))).toBeUndefined();
  });

  it("returns undefined when the IR is absent", () => {
    const resolve = buildFiredRuleResolver(null, COMPILED_JS);
    expect(resolve(fired("main", 0))).toBeUndefined();
  });

  it("returns undefined for an out-of-range ordinal", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    expect(resolve(fired("main", 99))).toBeUndefined();
    expect(resolve(fired("main", -1))).toBeUndefined();
  });

  it("returns undefined for an unknown group", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    expect(resolve(fired("nope", 0))).toBeUndefined();
  });

  it("returns undefined when no IR rule carries the marker's source line", () => {
    const ir = makeIr();
    // Remove the Line-8 rule from the IR (e.g. carved away after compile).
    ir.groups[0]!.rules = ir.groups[0]!.rules.filter((r) => r.sourceLine !== 8);
    const resolve = buildFiredRuleResolver(ir, COMPILED_JS);
    expect(resolve(fired("main", 1))).toBeUndefined();
  });

  it("rejects a stale mapping whose emit profile contradicts the trace", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    // Ordinal 2 is the Line-12 text rule; claiming it emitted nothing is
    // the stale-sourceLine signature — reject, don't misname.
    expect(resolve(fired("main", 2, ""))).toBeUndefined();
    // And the reverse: the Line-20 > nul rule claiming text output.
    expect(resolve(fired("second", 0, "q"))).toBeUndefined();
  });

  it("accepts a consistent emit profile", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    expect(resolve(fired("main", 2, "y"))?.sourceLine).toBe(12);
    expect(resolve(fired("second", 0, ""))?.sourceLine).toBe(20);
  });

  it("skips the emit check when emittedOutput is absent", () => {
    const resolve = buildFiredRuleResolver(makeIr(), COMPILED_JS);
    expect(resolve(fired("main", 2, undefined))?.sourceLine).toBe(12);
  });
});

// The compiled .kmn is the projection of the working copy, not the text the working IR was
// parsed from: the projection adds lines (target stamp, header stores), so a `// Line N` from
// the compiled keyboard names a different line of the starting point's source. Matching N
// against the working IR's `sourceLine` named the neighbouring rule (key Q's Shift rule for
// key Q), and the Layout tab demoted two keys in every three as changed by a later group.
describe("buildFiredRuleResolver with the compiled .kmn", () => {
  const SOURCE = [
    "store(&VERSION) '10.0'",
    "begin Unicode > use(main)",
    "",
    "group(main) using keys",
    "",
    "+ [K_Q] > 'q'",
    "+ [SHIFT K_Q] > 'Q'",
    "",
    "+ [K_W] > 'w'",
    "+ [SHIFT K_W] > 'W'",
    "",
  ].join("\n");
  // What the preview compiled: one line added above everything, so every rule moves down one.
  const COMPILED_KMN = `store(&TARGETS) 'any'\n${SOURCE}`;
  const JS = `
  this.g_main_0=function(t,e) {
    var k=KeymanWeb,r=0,m=0;
    if(k.KKM(e,16384,81)){r=m=1;} // Line 7
    else if(k.KKM(e,16400,81)){r=m=1;} // Line 8
    else if(k.KKM(e,16384,87)){r=m=1;} // Line 10
    else if(k.KKM(e,16400,87)){r=m=1;} // Line 11
    return r;
  };
`;
  const working = () => parseKmn(SOURCE, "t").ir;
  const keyOf = (rule: IRRule | undefined) => {
    const last = rule?.context[rule.context.length - 1];
    return last?.kind === "vkey" ? `${last.modifiers.join(" ")} ${last.name}`.trim() : undefined;
  };

  it("names the working copy's own rule for every compiled ordinal", () => {
    const resolve = buildFiredRuleResolver(working(), JS, COMPILED_KMN);
    expect(keyOf(resolve(fired("main", 0, "q")))).toBe("K_Q");
    expect(keyOf(resolve(fired("main", 1, "Q")))).toBe("SHIFT K_Q");
    expect(keyOf(resolve(fired("main", 2, "w")))).toBe("K_W");
    expect(keyOf(resolve(fired("main", 3, "W")))).toBe("SHIFT K_W");
  });

  it("returns the working IR's node, so a node-id comparison holds", () => {
    const ir = working();
    const resolve = buildFiredRuleResolver(ir, JS, COMPILED_KMN);
    expect(resolve(fired("main", 0, "q"))?.nodeId).toBe(ir.groups[0]!.rules[0]!.nodeId);
  });

  it("returns undefined for a compiled rule the working copy does not have", () => {
    const ir = working();
    ir.groups[0]!.rules = ir.groups[0]!.rules.filter((r) => keyOf(r) !== "K_W");
    const resolve = buildFiredRuleResolver(ir, JS, COMPILED_KMN);
    expect(resolve(fired("main", 2, "w"))).toBeUndefined();
  });

  it("returns undefined when the compiled .kmn does not parse to that line", () => {
    const resolve = buildFiredRuleResolver(working(), JS, "store(&VERSION) '10.0'\n");
    expect(resolve(fired("main", 0, "q"))).toBeUndefined();
  });
});
