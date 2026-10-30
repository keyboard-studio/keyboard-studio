// A deadkey the carve leaves unconsumed is pruned: stripped from every
// output, with an emptied rule removed (pass-through) or rewritten to nul
// (swallow). Iterates to a fixed point; un-carve re-derives everything.

import { describe, it, expect } from "vitest";
import { deriveCarvedIr } from "./carvePipeline.js";
import { emit } from "../codec/emit.js";
import { validateWithOracle } from "../validator/oracle.js";
import { makeTestIR, irGroup, charStore } from "@keyboard-studio/contracts/fixtures";
import type { ContextElement, FallbackPolicy, IRRule, KeyboardIR, OutputElement } from "@keyboard-studio/contracts";

const K = (name: string): ContextElement => ({ kind: "vkey", name, modifiers: [] });
const PLUS: ContextElement = { kind: "raw", text: "+" };
const dk = (id: number): { kind: "deadkey"; id: number } => ({ kind: "deadkey", id });
const ch = (value: string): OutputElement => ({ kind: "char", value });
const rule = (nodeId: string, context: ContextElement[], output: OutputElement[]): IRRule => ({
  nodeId,
  context,
  output,
});

const consumer = (id: number | string, nodeId = "consumer"): IRRule =>
  rule(
    nodeId,
    [
      typeof id === "number" ? dk(id) : { kind: "namedDeadkey", name: id },
      PLUS,
      { kind: "any", storeRef: "ka" },
    ],
    [{ kind: "index", storeRef: "kb", offset: 2 }],
  );

function ir(rules: IRRule[]): KeyboardIR {
  return makeTestIR(
    [irGroup({ nodeId: "group#main", name: "main", rules })],
    [
      charStore({ nodeId: "store#ka", name: "ka", chars: ["x", "y"] }),
      charStore({ nodeId: "store#kb", name: "kb", chars: ["X", "Y"] }),
    ],
  );
}

const ALL = new Set(["store#ka#0", "store#ka#1", "store#kb#0", "store#kb#1"]);
const POLICIES: FallbackPolicy[] = ["pass-through", "swallow"];
const carve = (start: KeyboardIR, policy: FallbackPolicy, ids: ReadonlySet<string> = ALL) =>
  deriveCarvedIr(start, { deletedNodeIds: new Set(), deletedItemIds: ids, fallbackPolicy: policy });
const ids = (x: KeyboardIR) => x.groups[0]!.rules.map((r) => r.nodeId);

describe("carve: unused deadkey prune", () => {
  it("pass-through: arming rule gone, compiles with 0 errors and 0 unreachable hints", async () => {
    const start = ir([rule("arm", [PLUS, K("K_Y")], [dk(3)]), consumer(3)]);
    const { ir: carved, notices } = carve(start, "pass-through");
    expect(ids(carved)).toEqual([]);
    expect(notices.some((n) => n.includes("dk(3)") && n.includes("arm"))).toBe(true);
    const findings = await validateWithOracle(emit(carved));
    expect(findings.some((f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE")).toBe(false);
    expect(
      findings.filter((f) => f.severity === "fatal" || f.severity === "error" || f.code === "KM_HINT_UNREACHABLE_RULE"),
    ).toEqual([]);
  }, 60_000);

  it("swallow: arming rule becomes an owned `> nul`", () => {
    const start = ir([rule("arm", [PLUS, K("K_Y")], [dk(3)]), consumer(3)]);
    const swallowed = carve(start, "swallow").ir;
    // The synthesized guards keyed on the pruned deadkey go with it.
    expect(ids(swallowed)).toEqual(["arm"]);
    const arm = swallowed.groups[0]!.rules.find((r) => r.nodeId === "arm");
    expect(arm?.output).toEqual([{ kind: "nul" }]);
    expect(arm?.ownedByBehaviour).toBe("carve-suppression");
  });

  it.each(POLICIES)("%s: mixed output keeps the other elements", (policy) => {
    const start = ir([rule("arm", [PLUS, K("K_Y")], [ch("x"), dk(3)]), consumer(3)]);
    const arm = carve(start, policy).ir.groups[0]!.rules.find((r) => r.nodeId === "arm");
    expect(arm?.output).toEqual([ch("x")]);
    expect(arm?.ownedByBehaviour).toBeUndefined();
  });

  it.each(POLICIES)("%s: a deadkey still consumed by another rule is kept", (policy) => {
    const other = rule("other", [dk(3), PLUS, K("K_Q")], [ch("q")]);
    const start = ir([rule("arm", [PLUS, K("K_Y")], [dk(3)]), consumer(3), other]);
    const carved = carve(start, policy).ir;
    expect(carved.groups[0]!.rules.find((r) => r.nodeId === "arm")?.output).toEqual([dk(3)]);
    expect(ids(carved)).toContain("other");
  });

  it.each(POLICIES)("%s: a deadkey already unused in the start IR is untouched (scaffold owns that)", (policy) => {
    const start = ir([rule("arm", [PLUS, K("K_Y")], [dk(3)]), rule("ghost", [PLUS, K("K_G")], [dk(9)]), consumer(3)]);
    const carved = carve(start, policy).ir;
    expect(carved.groups[0]!.rules.find((r) => r.nodeId === "ghost")?.output).toEqual([dk(9)]);
  });

  it.each(POLICIES)("%s: named deadkeys are pruned the same way", (policy) => {
    const start = ir([rule("arm", [PLUS, K("K_Y")], [{ kind: "namedDeadkey", name: "tone" }]), consumer("tone")]);
    const carved = carve(start, policy).ir;
    const arm = carved.groups[0]!.rules.find((r) => r.nodeId === "arm");
    if (policy === "swallow") expect(arm?.output).toEqual([{ kind: "nul" }]);
    else expect(arm).toBeUndefined();
    expect(ids(carved)).not.toContain("consumer");
  });

  it("pass-through: fixed point across two deadkeys", () => {
    // consumer reads dk(4); B turns dk(3) into dk(4); A arms dk(3).
    const start = ir([
      rule("A", [PLUS, K("K_Y")], [dk(3)]),
      rule("B", [dk(3), PLUS, K("K_W")], [dk(4)]),
      consumer(4),
    ]);
    expect(ids(carve(start, "pass-through").ir)).toEqual([]);
  });

  it.each(POLICIES)("%s: un-carving re-derives the deadkey rules", (policy) => {
    const start = ir([rule("arm", [PLUS, K("K_Y")], [dk(3)]), consumer(3)]);
    const snapshot = structuredClone(start);
    expect(carve(start, policy).ir).not.toEqual(start);
    const restored = carve(start, policy, new Set()).ir;
    expect(start).toEqual(snapshot);
    expect(ids(restored)).toEqual(["arm", "consumer"]);
    expect(restored.groups[0]!.rules[0]!.output).toEqual([dk(3)]);
    expect(restored.stores.map((s) => s.name)).toEqual(["ka", "kb"]);
  });
});
