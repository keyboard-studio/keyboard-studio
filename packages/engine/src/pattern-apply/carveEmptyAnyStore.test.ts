// Carving every slot of an any()-consumed store removes the store and every
// rule that references it, under every fallback policy. Compile-backed: the
// emitted KMN must build with the real kmcmplib oracle and raise no
// unreachable-rule hint.

import { describe, it, expect } from "vitest";
import { deriveCarvedIr } from "./carvePipeline.js";
import { emit } from "../codec/emit.js";
import { validateWithOracle } from "../validator/oracle.js";
import { makeTestIR, irGroup, charRule, charStore } from "@keyboard-studio/contracts/fixtures";
import type { FallbackPolicy, IRRule, KeyboardIR } from "@keyboard-studio/contracts";

function consumerIr(ctx: IRRule["context"]): KeyboardIR {
  return makeTestIR(
    [
      irGroup({
        nodeId: "group#main",
        name: "main",
        rules: [
          charRule({
            nodeId: "consumer",
            context: [...ctx, { kind: "raw", text: "+" }, { kind: "any", storeRef: "ka" }],
            output: [{ kind: "index", storeRef: "kb", offset: ctx.length + 1 }],
          }),
        ],
      }),
    ],
    [
      charStore({ nodeId: "store#ka", name: "ka", chars: ["x", "y"] }),
      charStore({ nodeId: "store#kb", name: "kb", chars: ["X", "Y"] }),
    ],
  );
}

const ALL = new Set(["store#ka#0", "store#ka#1", "store#kb#0", "store#kb#1"]);
const POLICIES: FallbackPolicy[] = ["pass-through", "swallow"];

async function compileProblems(kmn: string): Promise<string[]> {
  const findings = await validateWithOracle(kmn);
  expect(findings.some((f) => f.code === "KM_WARN_ORACLE_UNAVAILABLE")).toBe(false);
  return findings
    .filter(
      (f) =>
        f.severity === "fatal" || f.severity === "error" || f.code === "KM_HINT_UNREACHABLE_RULE",
    )
    .map((f) => `${f.code}: ${f.message}`);
}

describe("carve: every slot of an any() store", () => {
  const CTXS: [string, IRRule["context"]][] = [
    ["bare key", []],
    ["deadkey context", [{ kind: "deadkey", id: 3 }]],
  ];

  describe.each(POLICIES)("%s", (policy) => {
    it.each(CTXS)(
      "%s: store and rule gone, no refusing warning, compiles clean",
      async (_label, ctx) => {
        const { ir: carved, warnings } = deriveCarvedIr(consumerIr(ctx), {
          deletedNodeIds: new Set(),
          deletedItemIds: ALL,
          fallbackPolicy: policy,
        });
        expect(warnings.filter((w) => w.includes("refusing"))).toEqual([]);
        expect(carved.stores.map((s) => s.name)).toEqual([]);
        const kmn = emit(carved);
        expect(kmn).not.toMatch(/any\(ka\)/);
        expect(kmn).not.toMatch(/index\(kb/);
        if (policy === "swallow") {
          // Guards for the carved keys are still emitted.
          expect(kmn).toMatch(/U\+0078 > context|U\+0078 > nul/);
          expect(kmn).toMatch(/U\+0079 > context|U\+0079 > nul/);
        }
        expect(await compileProblems(kmn)).toEqual([]);
      },
      60_000,
    );
  });

  it("pass-through: the only recorded trace is a notice naming the removed rule", () => {
    const { warnings, notices } = deriveCarvedIr(consumerIr([]), {
      deletedNodeIds: new Set(),
      deletedItemIds: ALL,
      fallbackPolicy: "pass-through",
    });
    expect(warnings).toEqual([]);
    expect(notices.some((n) => n.includes("consumer"))).toBe(true);
  });

  it.each(POLICIES)("%s: a partial carve keeps the survivors and the rule", (policy) => {
    const { ir: carved } = deriveCarvedIr(consumerIr([]), {
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(["store#ka#0", "store#kb#0"]),
      fallbackPolicy: policy,
    });
    expect(carved.stores.find((s) => s.name === "ka")?.items).toEqual([{ kind: "char", value: "y" }]);
    expect(carved.groups[0]?.rules.some((r) => r.nodeId === "consumer")).toBe(true);
  });

  it.each(POLICIES)(
    "%s: un-carving re-derives the original store and rules from the start IR",
    (policy) => {
      const start = consumerIr([{ kind: "deadkey", id: 3 }]);
      const snapshot = structuredClone(start);
      const carved = deriveCarvedIr(start, {
        deletedNodeIds: new Set(),
        deletedItemIds: ALL,
        fallbackPolicy: policy,
      }).ir;
      expect(carved.stores).toEqual([]);
      // Un-carve = derive with the slots no longer carved. startIr was never mutated.
      expect(start).toEqual(snapshot);
      const restored = deriveCarvedIr(start, {
        deletedNodeIds: new Set(),
        deletedItemIds: new Set(),
        fallbackPolicy: policy,
      }).ir;
      expect(restored.stores.map((s) => s.name)).toEqual(["ka", "kb"]);
      expect(restored.groups[0]?.rules.map((r) => r.nodeId)).toEqual(["consumer"]);
      expect(restored.stores.find((s) => s.name === "ka")?.items).toHaveLength(2);
    },
  );
});
