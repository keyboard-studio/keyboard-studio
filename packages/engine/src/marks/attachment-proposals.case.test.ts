// proposeAttachments with caseFold — case-symmetric attestation, so a mark
// seen only on a capital still pre-ticks the lowercase row the station shows
// (spec 049 US1 display fold, spec 071 FR-006/FR-007/FR-008).

import { describe, it, expect } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses } from "./mark-classes.js";
import { proposeAttachments } from "./attachment-proposals.js";

const ACUTE = "́";
const GRAVE = "̀";

function rowFor(alphabet: ConfirmedAlphabet, mark: string, options: Parameters<typeof proposeAttachments>[2]) {
  const row = proposeAttachments(alphabet, groupMarkClasses(alphabet), options).find((p) => p.mark === mark);
  expect(row).toBeDefined();
  return row!;
}

describe("proposeAttachments — caseFold", () => {
  it("proposes the lowercase base as attested when the mark was seen only on the capital", () => {
    const a = makeConfirmedAlphabet({
      bases: ["n", "N", "m", "M"],
      marks: [GRAVE],
      attestedStacks: [{ base: "N", marks: [GRAVE] }],
    });
    const row = rowFor(a, GRAVE, { caseFold: true });
    expect(row.states["n"]).toBe("attested");
    expect(row.states["N"]).toBe("attested");
    expect(row.states["m"]).toBe("blocked");
    // `n` and `N` are one letter: still exactly one attested base (FR-008).
    expect(row.autoConfirmed).toBe(true);
  });

  it("keeps the unfolded behaviour when caseFold is off (caseless / not cased or mixed)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["n", "N"],
      marks: [GRAVE],
      attestedStacks: [{ base: "N", marks: [GRAVE] }],
    });
    expect(rowFor(a, GRAVE, {}).states["n"]).toBe("blocked");
  });

  it("lowercase-only attestation: the lowercase row is unchanged and still auto-confirms", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E", "k"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const row = rowFor(a, ACUTE, { caseFold: true });
    expect(row.states["e"]).toBe("attested");
    expect(row.states["k"]).toBe("blocked");
    expect(row.autoConfirmed).toBe(true);
  });

  it("both cases attested counts once, not twice", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "e", marks: [ACUTE] },
        { base: "E", marks: [ACUTE] },
      ],
    });
    const row = rowFor(a, ACUTE, { caseFold: true });
    expect(row.states).toEqual({ e: "attested", E: "attested" });
    expect(row.autoConfirmed).toBe(true);
  });

  it("does not invent a counterpart that is not in the confirmed alphabet (spec 049 FR-003)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["N"],
      marks: [GRAVE],
      attestedStacks: [{ base: "N", marks: [GRAVE] }],
    });
    const row = rowFor(a, GRAVE, { caseFold: true });
    expect(Object.keys(row.states)).toEqual(["N"]);
  });

  it("leaves caseless bases alone", () => {
    const KA = "क";
    const NUKTA = "़";
    const a = makeConfirmedAlphabet({
      bases: [KA, "ख"],
      marks: [NUKTA],
      attestedStacks: [{ base: KA, marks: [NUKTA] }],
    });
    const row = rowFor(a, NUKTA, { caseFold: true });
    expect(row.states[KA]).toBe("attested");
    expect(row.states["ख"]).toBe("blocked");
  });

  it("pairs Turkic dotted/dotless I by locale", () => {
    // Turkish: İ pairs with i, I pairs with ı. A mark seen only on İ must
    // reach i, never ı.
    const a = makeConfirmedAlphabet({
      bases: ["i", "İ", "ı", "I"],
      marks: [ACUTE],
      attestedStacks: [{ base: "İ", marks: [ACUTE] }],
    });
    const tr = rowFor(a, ACUTE, { caseFold: true, bcp47: "tr" });
    expect(tr.states["i"]).toBe("attested");
    expect(tr.states["ı"]).toBe("blocked");
    expect(tr.states["I"]).toBe("blocked");

    const b = makeConfirmedAlphabet({
      bases: ["i", "İ", "ı", "I"],
      marks: [ACUTE],
      attestedStacks: [{ base: "I", marks: [ACUTE] }],
    });
    const az = rowFor(b, ACUTE, { caseFold: true, bcp47: "az" });
    expect(az.states["ı"]).toBe("attested");
    expect(az.states["i"]).toBe("blocked");
  });

  it("feeds the folded attestation into class-sibling plausibility", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "A", "e", "E"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "A", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "e", marks: [GRAVE] },
      ],
    });
    const acute = rowFor(a, ACUTE, { caseFold: true });
    expect(acute.states["a"]).toBe("attested");
  });
});
