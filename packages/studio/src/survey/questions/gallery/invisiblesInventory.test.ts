// invisiblesInventory module tests (spec 090 T028): the module contract
// and the no-op apply. The accept/decline ops over this value are
// covered by survey/phaseBDraftOps.test.ts and the hosted step flow by
// survey/invisibles/InvisiblesStep.test.tsx.

import { describe, it, expect } from "vitest";
import invisiblesInventory from "./invisiblesInventory.ts";
import { InvisiblesStep } from "../../invisibles/InvisiblesStep.tsx";
import type { InventoryDecisionValue } from "../../phaseBDraftOps.ts";

const CTX = { ir: null, writes: [], decisions: {}, currentHistoryEntryState: null } as const;

describe("invisiblesInventory module contract", () => {
  it("provides invisibles-inventory, requires character-inventory, writes nothing", () => {
    expect(invisiblesInventory.provides).toEqual(["invisibles-inventory"]);
    expect(invisiblesInventory.requires).toEqual(["character-inventory"]);
    expect(invisiblesInventory.writes).toEqual([]);
    expect(invisiblesInventory.renderer).toBe(InvisiblesStep);
  });

  it("apply is a deterministic no-op (items are recorded through the gallery host's decide core)", () => {
    // Items are keyed by U+XXXX notation — the char identity for format
    // characters, which have no glyph (see the module header).
    const value: InventoryDecisionValue = {
      accepted: [{ char: "U+200D", provenance: "asked" }],
      declined: [{ char: "U+2060", provenance: "derived" }],
    };
    expect(invisiblesInventory.apply(value, CTX)).toEqual({});
    expect(invisiblesInventory.apply(value, CTX)).toEqual(invisiblesInventory.apply(value, CTX));
    expect(invisiblesInventory.apply(undefined, CTX)).toEqual({});
  });
});
