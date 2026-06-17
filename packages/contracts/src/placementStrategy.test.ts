// see spec.md §7.3 — strategyForCandidate derivation utility tests.
// Strict tsconfig applies (exactOptionalPropertyTypes + noUncheckedIndexedAccess).

import { describe, it, expect } from "vitest";
import type { PlacementCandidate } from "./placementMap";
import { strategyForCandidate } from "./placementStrategy";

// ---------------------------------------------------------------------------
// Shared base candidate fixture — mechanism 'direct', no modifiers
// ---------------------------------------------------------------------------

const baseDirect: PlacementCandidate = {
  vkey: "K_B",
  modifiers: [],
  mechanism: "direct",
  priorSource: "unicode-decomp",
  priorCount: 0,
  confidence: 0.9,
};

// ---------------------------------------------------------------------------
// strategyForCandidate()
// ---------------------------------------------------------------------------

describe("strategyForCandidate()", () => {
  it("direct + RALT modifier → 'S-08' (RALT-layer extension)", () => {
    const candidate: PlacementCandidate = {
      ...baseDirect,
      modifiers: ["RALT"],
    };
    expect(strategyForCandidate(candidate)).toBe("S-08");
  });

  it("direct + no modifiers → 'S-01' (key substitution)", () => {
    const candidate: PlacementCandidate = {
      ...baseDirect,
      modifiers: [],
    };
    expect(strategyForCandidate(candidate)).toBe("S-01");
  });

  it("direct + SHIFT (no RALT) → 'S-01'", () => {
    const candidate: PlacementCandidate = {
      ...baseDirect,
      modifiers: ["SHIFT"],
    };
    expect(strategyForCandidate(candidate)).toBe("S-01");
  });

  it("direct + SHIFT + RALT → 'S-08' (RALT present, even with SHIFT)", () => {
    const candidate: PlacementCandidate = {
      ...baseDirect,
      modifiers: ["SHIFT", "RALT"],
    };
    expect(strategyForCandidate(candidate)).toBe("S-08");
  });
});
