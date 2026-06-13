// Smoke test for the generated barrel (index.ts).
// Verifies that simpleSwapRule and deadkeySingleTapRule are exported and carry
// the required RecognizerRule fields (id, strategyId, match, lift).
import { describe, it, expect } from "vitest";
import { simpleSwapRule, deadkeySingleTapRule } from "./index.js";

describe("generated barrel exports", () => {
  it("simpleSwapRule is exported with id and strategyId", () => {
    expect(simpleSwapRule).toBeDefined();
    expect(typeof simpleSwapRule.id).toBe("string");
    expect(simpleSwapRule.id.length).toBeGreaterThan(0);
    expect(simpleSwapRule.strategyId).toBe("S-01");
  });

  it("simpleSwapRule exposes match() and lift() functions", () => {
    expect(typeof simpleSwapRule.match).toBe("function");
    expect(typeof simpleSwapRule.lift).toBe("function");
  });

  it("deadkeySingleTapRule is exported with id and strategyId", () => {
    expect(deadkeySingleTapRule).toBeDefined();
    expect(typeof deadkeySingleTapRule.id).toBe("string");
    expect(deadkeySingleTapRule.id.length).toBeGreaterThan(0);
    expect(deadkeySingleTapRule.strategyId).toBe("S-02");
  });

  it("deadkeySingleTapRule exposes match() and lift() functions", () => {
    expect(typeof deadkeySingleTapRule.match).toBe("function");
    expect(typeof deadkeySingleTapRule.lift).toBe("function");
  });

  it("the two exported rules have distinct ids", () => {
    expect(simpleSwapRule.id).not.toBe(deadkeySingleTapRule.id);
  });
});
