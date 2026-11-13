import { describe, expect, it } from "vitest";
import { resolveStoreItems } from "./resolveStoreItems";
import type { IRStore, KeyboardIR, StoreItem } from "../keyboard-ir";

function irOf(stores: Record<string, StoreItem[]>): KeyboardIR {
  const list: IRStore[] = Object.entries(stores).map(([name, items], i) => ({
    nodeId: `store-${i}`,
    name,
    items,
    isSystem: false,
  }));
  return { origin: "imported", stores: list, groups: [], raw: [], comments: [] } as unknown as KeyboardIR;
}

const ch = (value: string): StoreItem => ({ kind: "char", value });

describe("resolveStoreItems", () => {
  it("returns a plain store unchanged", () => {
    expect(resolveStoreItems(irOf({ a: [ch("x"), ch("y")] }), "a")).toEqual([ch("x"), ch("y")]);
  });

  it("expands outs recursively, keeping item order", () => {
    const ir = irOf({
      low: [ch("a"), ch("b")],
      both: [{ kind: "outs", storeRef: "low" }, ch("C")],
      all: [ch("0"), { kind: "outs", storeRef: "both" }],
    });
    expect(resolveStoreItems(ir, "all")).toEqual([ch("0"), ch("a"), ch("b"), ch("C")]);
  });

  it("matches store names case-insensitively", () => {
    const ir = irOf({ Low: [ch("a")], all: [{ kind: "outs", storeRef: "LOW" }] });
    expect(resolveStoreItems(ir, "ALL")).toEqual([ch("a")]);
  });

  it("marks a cycle with a raw item instead of recursing forever", () => {
    const ir = irOf({
      a: [ch("1"), { kind: "outs", storeRef: "b" }],
      b: [ch("2"), { kind: "outs", storeRef: "a" }],
    });
    expect(resolveStoreItems(ir, "a")).toEqual([ch("1"), ch("2"), { kind: "raw", text: "outs(a)" }]);
  });

  it("marks a self-reference and an unknown store with a raw item", () => {
    const ir = irOf({ a: [{ kind: "outs", storeRef: "a" }, { kind: "outs", storeRef: "gone" }] });
    expect(resolveStoreItems(ir, "a")).toEqual([
      { kind: "raw", text: "outs(a)" },
      { kind: "raw", text: "outs(gone)" },
    ]);
  });

  it("returns an empty list for an unknown store", () => {
    expect(resolveStoreItems(irOf({}), "nope")).toEqual([]);
  });
});
