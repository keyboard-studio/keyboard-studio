// Unit tests for parseSlotId.
//
// Covers:
//   1. Valid id → correct storeNodeId + itemsIndex.
//   2. No `#` separator → null.
//   3. Non-numeric index (`#abc`) → null.
//   4. Greedy-last-`#` case: storeNodeId itself contains `#` (e.g. "store#dkt#0").

import { describe, it, expect } from "vitest";
import { parseSlotId, makeSlotId } from "./slotId.js";

describe("parseSlotId", () => {
  it("parses a simple slot id", () => {
    const result = parseSlotId("myStore#3");
    expect(result).toEqual({ storeNodeId: "myStore", itemsIndex: 3 });
  });

  it("parses index 0", () => {
    const result = parseSlotId("store#dkt#0");
    // greedy: last '#' is the separator — storeNodeId is "store#dkt"
    expect(result).toEqual({ storeNodeId: "store#dkt", itemsIndex: 0 });
  });

  it("handles storeNodeId containing '#' (greedy-last-# case)", () => {
    const result = parseSlotId("store#dkt#7");
    expect(result).toEqual({ storeNodeId: "store#dkt", itemsIndex: 7 });
  });

  it("returns null when there is no '#'", () => {
    expect(parseSlotId("storeWithoutHash")).toBeNull();
  });

  it("returns null when the index is non-numeric (#abc)", () => {
    expect(parseSlotId("store#dkt#abc")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseSlotId("")).toBeNull();
  });

  it("parses a large index correctly", () => {
    const result = parseSlotId("outputStore#82");
    expect(result).toEqual({ storeNodeId: "outputStore", itemsIndex: 82 });
  });
});

describe("makeSlotId", () => {
  it("builds a slot id from a storeNodeId and itemsIndex", () => {
    expect(makeSlotId("myStore", 3)).toBe("myStore#3");
  });

  it("round-trips through parseSlotId even when storeNodeId ends in #<digits>", () => {
    const id = makeSlotId("store#5", 0);
    expect(parseSlotId(id)).toEqual({ storeNodeId: "store#5", itemsIndex: 0 });
  });
});
