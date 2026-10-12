// retainedConvenienceChars module tests (spec 090 T024): the module
// contract. The hosted step flow end to end is covered by
// survey/convenience/ConvenienceCharsStep.test.tsx.

import { describe, it, expect } from "vitest";
import retainedConvenienceChars from "./retainedConvenienceChars.ts";
import { ConvenienceCharsStep } from "../../convenience/ConvenienceCharsStep.tsx";

describe("retainedConvenienceChars module contract", () => {
  it("provides retained-convenience-chars, requires character-inventory + base-keyboard, writes nothing", () => {
    expect(retainedConvenienceChars.provides).toEqual(["retained-convenience-chars"]);
    expect(retainedConvenienceChars.requires).toEqual(["character-inventory", "base-keyboard"]);
    expect(retainedConvenienceChars.writes).toEqual([]);
    expect(retainedConvenienceChars.renderer).toBe(ConvenienceCharsStep);
  });

  it("apply is a no-op (D-090-12: the session mirror is a value-sourced result, not an apply channel)", () => {
    expect(
      retainedConvenienceChars.apply(
        { retained: [{ char: "q", provenance: "asked" }], rejected: [] },
        { ir: null, writes: [], decisions: {}, currentHistoryEntryState: null },
      ),
    ).toEqual({});
    expect(
      retainedConvenienceChars.apply(undefined, {
        ir: null,
        writes: [],
        decisions: {},
        currentHistoryEntryState: null,
      }),
    ).toEqual({});
  });
});
