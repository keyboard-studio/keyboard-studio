// punctuationInventory module tests (spec 090 T028): the module contract
// and the no-op apply. The value's projection maintenance (D-090-10(d))
// is covered by survey/phaseBDraftOps.test.ts and the hosted step flow
// by survey/punctuation/PunctuationStep.test.tsx.

import { describe, it, expect } from "vitest";
import punctuationInventory from "./punctuationInventory.ts";
import { PunctuationStep } from "../../punctuation/PunctuationStep.tsx";
import type { InventoryDecisionValue } from "../../phaseBDraftOps.ts";

const CTX = { ir: null, writes: [], decisions: {}, currentHistoryEntryState: null } as const;

describe("punctuationInventory module contract", () => {
  it("provides punctuation-inventory, requires character-inventory, writes nothing", () => {
    expect(punctuationInventory.provides).toEqual(["punctuation-inventory"]);
    expect(punctuationInventory.requires).toEqual(["character-inventory"]);
    expect(punctuationInventory.writes).toEqual([]);
    expect(punctuationInventory.renderer).toBe(PunctuationStep);
  });

  it("apply is a deterministic no-op (the value is a projection the draft hook re-records)", () => {
    const value: InventoryDecisionValue = {
      accepted: [{ char: ";", provenance: "asked" }],
      declined: [{ char: ":", provenance: "extracted" }],
    };
    expect(punctuationInventory.apply(value, CTX)).toEqual({});
    expect(punctuationInventory.apply(value, CTX)).toEqual(punctuationInventory.apply(value, CTX));
    expect(punctuationInventory.apply(undefined, CTX)).toEqual({});
  });
});
