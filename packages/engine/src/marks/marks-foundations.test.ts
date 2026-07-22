import { describe, expect, it } from "vitest";
import { makeConfirmedAlphabet } from "@keyboard-studio/contracts";
import { groupMarkClasses, attestedBasesOf } from "./mark-classes.js";
import { proposeAttachments, deriveCaseCounterparts } from "./attachment-proposals.js";

const ACUTE = "́"; // U+0301 (above)
const GRAVE = "̀"; // U+0300 (above)
const UNDERDOT = "̣"; // U+0323 (below)

describe("attestedBasesOf", () => {
  it("collects each mark's attested bases from the stacks", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
      ],
    });
    expect([...(attestedBasesOf(a).get(ACUTE) ?? [])]).toEqual(["a", "e"]);
  });
});

describe("groupMarkClasses (FR-010)", () => {
  it("groups similarly-attaching above-marks into one class", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "i"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
        { base: "e", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(a);
    expect(classes).toHaveLength(1);
    expect(classes[0]?.marks).toEqual([ACUTE, GRAVE]);
  });

  it("separates an above-mark from a below-mark (function bucket)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, UNDERDOT],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [UNDERDOT] },
      ],
    });
    const classes = groupMarkClasses(a);
    expect(classes).toHaveLength(2);
  });

  it("splits same-bucket marks with disjoint attachment sets", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "n", "o"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "n", marks: [GRAVE] },
        { base: "o", marks: [GRAVE] },
      ],
    });
    expect(groupMarkClasses(a)).toHaveLength(2);
  });

  it("is deterministic (stable ids and order)", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a"],
      marks: [ACUTE, UNDERDOT],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "a", marks: [UNDERDOT] },
      ],
    });
    expect(groupMarkClasses(a)).toEqual(groupMarkClasses(a));
  });

  // Pins the documented v1 gap (see bucketOf): marks outside the Combining
  // Diacritical Marks blocks all land in the "other" bucket, so functionally
  // distinct Arabic harakat with the same attested consonants merge into one
  // class. When ccc-based bucketing lands, this test should start failing —
  // update it to assert the per-mark fixed-position split instead.
  it("v1 gap: same-base non-Latin marks merge into a single 'other' class", () => {
    const FATHA = "َ";
    const KASRA = "ِ";
    const SHADDA = "ّ";
    const a = makeConfirmedAlphabet({
      bases: ["ب", "ت"], // beh, teh
      marks: [FATHA, KASRA, SHADDA],
      attestedStacks: [
        { base: "ب", marks: [FATHA] },
        { base: "ب", marks: [KASRA] },
        { base: "ب", marks: [SHADDA] },
        { base: "ت", marks: [FATHA] },
        { base: "ت", marks: [KASRA] },
        { base: "ت", marks: [SHADDA] },
      ],
    });
    const classes = groupMarkClasses(a);
    expect(classes).toHaveLength(1);
    expect(classes[0]?.id).toBe("other-1");
    expect(classes[0]?.marks).toEqual([FATHA, KASRA, SHADDA]);
  });
});

describe("proposeAttachments (FR-006/FR-007/FR-008)", () => {
  it("pre-checks attested, proposes class-sibling bases as plausible, blocks the rest", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e", "k"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
      ],
    });
    const classes = groupMarkClasses(a);
    const proposals = proposeAttachments(a, classes);
    const grave = proposals.find((p) => p.mark === GRAVE);
    expect(grave?.states["a"]).toBe("attested");
    expect(grave?.states["e"]).toBe("plausible"); // acute (same class) attests on e
    expect(grave?.states["k"]).toBe("blocked"); // never attested for the class
  });

  it("auto-confirms a single-attested-base mark with no plausible additions (FR-008)", () => {
    const CEDILLA = "̧";
    const a = makeConfirmedAlphabet({
      bases: ["c", "k"],
      marks: [CEDILLA],
      attestedStacks: [{ base: "c", marks: [CEDILLA] }],
    });
    const [proposal] = proposeAttachments(a, groupMarkClasses(a));
    expect(proposal?.autoConfirmed).toBe(true);
    expect(proposal?.states["k"]).toBe("blocked");
  });

  it("does not auto-confirm when a plausible addition exists", () => {
    const a = makeConfirmedAlphabet({
      bases: ["a", "e"],
      marks: [ACUTE, GRAVE],
      attestedStacks: [
        { base: "a", marks: [ACUTE] },
        { base: "e", marks: [ACUTE] },
        { base: "a", marks: [GRAVE] },
      ],
    });
    const proposals = proposeAttachments(a, groupMarkClasses(a));
    const grave = proposals.find((p) => p.mark === GRAVE);
    expect(grave?.autoConfirmed).toBe(false);
  });
});

describe("deriveCaseCounterparts (FR-009)", () => {
  it("finds the uppercase counterpart pair when both cases are confirmed", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e", "E"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    const pairs = deriveCaseCounterparts(a);
    expect(pairs.get(`e ${ACUTE}`)).toBe("E");
  });

  it("derives nothing when the counterpart base is not in the alphabet", () => {
    const a = makeConfirmedAlphabet({
      bases: ["e"],
      marks: [ACUTE],
      attestedStacks: [{ base: "e", marks: [ACUTE] }],
    });
    expect(deriveCaseCounterparts(a).size).toBe(0);
  });
});
