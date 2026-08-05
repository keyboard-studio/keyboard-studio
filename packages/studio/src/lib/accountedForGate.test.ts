// Unit tests for accountedForGate.ts — the mark-aware relaxation of
// InventoryCoverageGate (mechanism-gallery-progression).
//
// CRITICAL INVARIANT under test throughout this file: this function is a
// SEPARATE derivation layered on top of InventoryCoverageGate. It must never
// mutate or feed back into the implemented-only fields
// (unimplementedDesktop/unimplementedTouch/blockedOnDesktop/blockedOnTouch/
// blocked) that steps/advance.ts's Phase F gate and the export/download gate
// read via useInventoryCoverageGate() — see lib/unimplementedInventory.test.ts
// and steps/advance.test.ts for those gates' own coverage.

import { describe, it, expect } from "vitest";
import { accountedForGate, subtractMarked } from "./accountedForGate.ts";
import type { InventoryCoverageGate } from "./unimplementedInventory.ts";

function makeGate(overrides: Partial<InventoryCoverageGate> = {}): InventoryCoverageGate {
  return {
    unimplementedDesktop: [],
    unimplementedTouch: [],
    blockedOnDesktop: false,
    blockedOnTouch: false,
    touchLayoutCorrupted: false,
    blocked: false,
    ...overrides,
  };
}

describe("accountedForGate", () => {
  it("passes through an already-fully-implemented gate unchanged (no marks needed)", () => {
    const gate = makeGate();
    const result = accountedForGate(gate, new Set(), new Set());
    expect(result).toEqual({
      unaccountedDesktop: [],
      unaccountedTouch: [],
      blockedOnDesktop: false,
      blockedOnTouch: false,
      blocked: false,
    });
  });

  it("excludes a marked desktop character from unaccountedDesktop and clears blockedOnDesktop once all are marked", () => {
    const gate = makeGate({
      unimplementedDesktop: ["á", "é"],
      blockedOnDesktop: true,
      blocked: true,
    });

    const partiallyMarked = accountedForGate(gate, new Set(["á"]), new Set());
    expect(partiallyMarked.unaccountedDesktop).toEqual(["é"]);
    expect(partiallyMarked.blockedOnDesktop).toBe(true);
    expect(partiallyMarked.blocked).toBe(true);

    const fullyMarked = accountedForGate(gate, new Set(["á", "é"]), new Set());
    expect(fullyMarked.unaccountedDesktop).toEqual([]);
    expect(fullyMarked.blockedOnDesktop).toBe(false);
    expect(fullyMarked.blocked).toBe(false);
  });

  it("excludes a marked touch character from unaccountedTouch independently of desktop marks", () => {
    const gate = makeGate({
      unimplementedTouch: ["中"],
      blockedOnTouch: true,
      blocked: true,
    });

    // Marking on the DESKTOP set does not relax the touch side.
    const wrongSurface = accountedForGate(gate, new Set(["中"]), new Set());
    expect(wrongSurface.unaccountedTouch).toEqual(["中"]);
    expect(wrongSurface.blockedOnTouch).toBe(true);

    const rightSurface = accountedForGate(gate, new Set(), new Set(["中"]));
    expect(rightSurface.unaccountedTouch).toEqual([]);
    expect(rightSurface.blockedOnTouch).toBe(false);
    expect(rightSurface.blocked).toBe(false);
  });

  it("does NOT relax a corrupted touch layout via marks — fails closed regardless of marked set", () => {
    const gate = makeGate({
      unimplementedTouch: ["a", "b", "c"],
      blockedOnTouch: true,
      touchLayoutCorrupted: true,
      blocked: true,
    });

    const result = accountedForGate(gate, new Set(), new Set(["a", "b", "c"]));

    // The full corrupted-layout set passes through unchanged — marks are
    // deliberately ignored (see the module doc comment).
    expect(result.unaccountedTouch).toEqual(["a", "b", "c"]);
    expect(result.blockedOnTouch).toBe(true);
    expect(result.blocked).toBe(true);
  });

  it("never mutates the input gate object", () => {
    const gate = makeGate({ unimplementedDesktop: ["á"], blockedOnDesktop: true, blocked: true });
    const snapshot = JSON.parse(JSON.stringify(gate)) as InventoryCoverageGate;
    accountedForGate(gate, new Set(["á"]), new Set());
    expect(gate).toEqual(snapshot);
  });

  it("blocked is true while EITHER surface still has an unaccounted character", () => {
    const gate = makeGate({
      unimplementedDesktop: ["á"],
      unimplementedTouch: ["中"],
      blockedOnDesktop: true,
      blockedOnTouch: true,
      blocked: true,
    });

    // Only desktop marked — touch still blocks the combined flag.
    const result = accountedForGate(gate, new Set(["á"]), new Set());
    expect(result.blockedOnDesktop).toBe(false);
    expect(result.blockedOnTouch).toBe(true);
    expect(result.blocked).toBe(true);
  });
});

describe("subtractMarked", () => {
  it("returns the input unchanged when nothing is marked", () => {
    expect(subtractMarked(["á", "é"], new Set())).toEqual(["á", "é"]);
  });

  it("removes only the marked characters, preserving order", () => {
    expect(subtractMarked(["á", "é", "í"], new Set(["é"]))).toEqual(["á", "í"]);
  });

  it("returns an empty array when every character is marked", () => {
    expect(subtractMarked(["á", "é"], new Set(["á", "é"]))).toEqual([]);
  });

  it("ignores marks for characters not present in the input", () => {
    expect(subtractMarked(["á"], new Set(["中"]))).toEqual(["á"]);
  });
});
