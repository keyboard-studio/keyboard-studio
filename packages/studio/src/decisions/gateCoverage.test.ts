// Tests for gate→decision coverage (spec 087 T051, SC-005).

import { describe, it, expect } from "vitest";
import { buildGateCoverage } from "./gateCoverage.ts";

describe("buildGateCoverage", () => {
  it("traces every gate to decisions or the explicit gap list", () => {
    const { traces, gapList, coverage } = buildGateCoverage();
    expect(traces.length).toBeGreaterThan(0);
    // Every trace is either mapped or on the gap list — no silent unmapped.
    for (const t of traces) {
      const onGapList = gapList.includes(t);
      expect(t.decisions.length > 0 || onGapList).toBe(true);
    }
    expect(coverage).toBeGreaterThanOrEqual(0);
    expect(coverage).toBeLessThanOrEqual(1);
  });

  it("the inventory gates trace to the character-inventory decision", () => {
    const { traces } = buildGateCoverage();
    const inventory = traces.find((t) => t.gate.id === "18.6-inventory-coverage")!;
    expect(inventory.decisions).toEqual(["character-inventory"]);
    const touch = traces.find((t) => t.gate.id === "18.6-touch-coverage")!;
    expect(touch.decisions).toEqual(["character-inventory"]);
  });

  it("the gap list names the uncovered gates with rationale", () => {
    const { gapList } = buildGateCoverage();
    expect(gapList.length).toBeGreaterThan(0);
    for (const g of gapList) {
      expect(g.decisions).toEqual([]);
      expect(g.rationale.length).toBeGreaterThan(0);
    }
    // Layout geometry gates are known gaps (no DecisionId for touch geometry).
    expect(gapList.map((g) => g.gate.id)).toContain("18.2-touch-rows");
  });
});
