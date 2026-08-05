import { describe, expect, it } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import {
  aggregateInventoryPosture,
  nfcPostureOfInventory,
} from "./nfc-posture-of-inventory.js";

const ACUTE = "́";
const TILDE = "̃";
const CIRCUMFLEX = "̂";
const UNDERDOT = "̣";
// U+0259 LATIN SMALL LETTER SCHWA — no precomposed accented forms exist.
const SCHWA = "ə";

describe("nfcPostureOfInventory", () => {
  it("marks a composable pair as ready-made with its composed form", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(nfcPostureOfInventory(a)).toEqual([
      { stack: { base: "e", marks: [ACUTE] }, hasReadyMadeForm: true, readyMadeForm: "é" },
    ]);
  });

  it("marks a never-composing pair (schwa + acute) as not ready-made", () => {
    const a = makeConfirmedAlphabet({
      bases: [SCHWA],
      marks: [ACUTE],
      attestedStacks: [{ base: SCHWA, marks: [ACUTE] }],
    });
    const [pair] = nfcPostureOfInventory(a);
    expect(pair?.hasReadyMadeForm).toBe(false);
    expect(pair !== undefined && "readyMadeForm" in pair).toBe(false);
  });

  it("handles multi-mark stacks (circumflex + underdot composes to one code point)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [UNDERDOT, CIRCUMFLEX],
      attestedStacks: [{ base: "e", marks: [UNDERDOT, CIRCUMFLEX] }],
    });
    const [pair] = nfcPostureOfInventory(a);
    expect(pair?.hasReadyMadeForm).toBe(true);
    expect(pair?.readyMadeForm).toBe("ệ");
  });

  it("dedupes stacks with the same ordered shape; distinct orders stay distinct rows", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, TILDE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [ACUTE, TILDE] },
        { base: "a", marks: [TILDE, ACUTE] },
      ],
    });
    expect(nfcPostureOfInventory(a)).toHaveLength(3);
  });

  it("returns an empty table for an alphabet with no stacks", () => {
    expect(nfcPostureOfInventory(makeConfirmedAlphabet({ bases: ["k"] }))).toEqual([]);
  });
});

describe("aggregateInventoryPosture", () => {
  const pair = (hasReadyMadeForm: boolean) => ({
    stack: { base: "x", marks: [ACUTE] },
    hasReadyMadeForm,
  });

  it("is precomposed when every pair composes", () => {
    expect(aggregateInventoryPosture([pair(true), pair(true)])).toBe("precomposed");
  });

  it("is combining when no pair composes", () => {
    expect(aggregateInventoryPosture([pair(false)])).toBe("combining");
  });

  it("is mixed when some do and some do not", () => {
    expect(aggregateInventoryPosture([pair(true), pair(false)])).toBe("mixed");
  });

  it("is undefined on an empty table", () => {
    expect(aggregateInventoryPosture([])).toBeUndefined();
  });
});
