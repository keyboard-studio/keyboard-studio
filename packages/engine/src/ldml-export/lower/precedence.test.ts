import { describe, expect, it } from "vitest";
import { comparePrecedence, sortKmcmplibOrder, type PrecedenceKey } from "./precedence.js";

const k = (triggerKey: string, contextLength: number, sourceLine: number): PrecedenceKey => ({
  triggerKey,
  contextLength,
  sourceLine,
});

describe("kmcmplib rule order (FR-022)", () => {
  it("sorts by trigger key, then longest context first, then source line", () => {
    const rules = [k("K_B|none", 0, 1), k("K_A|none", 1, 5), k("K_A|none", 3, 9), k("K_A|none", 1, 2)];
    const sorted = sortKmcmplibOrder(rules, (r) => r);
    expect(sorted).toEqual([k("K_A|none", 3, 9), k("K_A|none", 1, 2), k("K_A|none", 1, 5), k("K_B|none", 0, 1)]);
  });

  it("keeps equal keys in input order", () => {
    const a = { id: "a", ...k("K_A|none", 1, 4) };
    const b = { id: "b", ...k("K_A|none", 1, 4) };
    expect(sortKmcmplibOrder([a, b], (r) => r).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("orders by code point, not by locale", () => {
    expect(comparePrecedence(k("K_a", 0, 1), k("K_B", 0, 1))).toBeGreaterThan(0);
  });
});
