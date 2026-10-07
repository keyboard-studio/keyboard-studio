// Tests for the carve-overlay fold (spec 093 owned delta, 090 ruling
// D-090-24): the carved-layout decision value partitions back into the
// working copy's carve overlay slice — the inverse of
// `carvedLayoutValueFromOverlay`, whose reconstructibility condition
// (D-090-30 (i)) this fold discharges.

import { describe, it, expect } from "vitest";
import type { CarvedLayoutValue } from "../survey/carve/carveValue.ts";
import { carvedLayoutValueFromOverlay } from "../survey/carve/carveValue.ts";
import { carveOverlayFromValue } from "./carveOverlay.ts";

const value: CarvedLayoutValue = {
  // Canonical order (the value builder sorts by kind then id — the form
  // the live flow records).
  removals: [
    { kind: "node", id: "n1", provenance: "asked" },
    { kind: "node", id: "n2", provenance: "asked" },
    { kind: "item", id: "i1", provenance: "asked" },
    { kind: "family", id: "fam1", provenance: "asked" },
    { kind: "char", id: "é", provenance: "asked" },
  ],
  dispositions: [
    { comboId: "n1#0", disposition: "block", provenance: "author-override" },
  ],
  closedKeyboardCard: "declined",
};

describe("carveOverlayFromValue", () => {
  it("partitions removal items back into the four id sets by kind", () => {
    const slice = carveOverlayFromValue(value);
    expect([...slice.deletedNodeIds].sort()).toEqual(["n1", "n2"]);
    expect([...slice.deletedItemIds]).toEqual(["i1"]);
    expect([...slice.disabledFamilyIds]).toEqual(["fam1"]);
    expect([...slice.carveChars]).toEqual(["é"]);
    expect(slice.carveDispositions).toEqual(value.dispositions);
    expect(slice.closedKeyboardCard).toBe("declined");
  });

  it("round-trips through the value builder (D-090-30 reconstructibility)", () => {
    // The live builder re-stamps per-item provenance as `asked` (the
    // only producible provenance today), so a canonically recorded
    // value rebuilds byte-identical removals from the folded slice.
    const rebuilt = carvedLayoutValueFromOverlay(carveOverlayFromValue(value));
    expect(rebuilt).toEqual(value);
  });

  it("folds structurally partial values leniently", () => {
    expect(carveOverlayFromValue(undefined)).toEqual({
      deletedNodeIds: new Set(),
      deletedItemIds: new Set(),
      disabledFamilyIds: new Set(),
      carveChars: new Set(),
      carveDispositions: [],
      closedKeyboardCard: null,
    });
    const partial = carveOverlayFromValue({
      removals: [{ kind: "node", id: "n9", provenance: "asked" }],
      closedKeyboardCard: "maybe" as never,
    });
    expect([...partial.deletedNodeIds]).toEqual(["n9"]);
    expect(partial.closedKeyboardCard).toBeNull();
  });
});
