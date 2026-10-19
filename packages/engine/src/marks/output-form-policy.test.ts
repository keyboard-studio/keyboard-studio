import { describe, expect, it } from "vitest";
import type { PosturePair } from "./nfc-posture-of-inventory.js";
import {
  hasDecidablePairs,
  outputStringForStack,
  resolveOutputFormProposal,
} from "./output-form-policy.js";

const ACUTE = "́";
const GRAVE = "̀";
const SCHWA = "ə";

function pair(hasReadyMadeForm: boolean): PosturePair {
  return { stack: { base: "e", marks: [ACUTE] }, hasReadyMadeForm };
}

describe("resolveOutputFormProposal (#2297: suggestion from input order alone)", () => {
  it("postfix (letter, then mark) → suggests base-plus-mark (NFD)", () => {
    expect(resolveOutputFormProposal([pair(true)], "postfix").form).toBe("base-plus-mark");
  });

  it("prefix (mark, then letter — incl. a waiting mark key) → suggests ready-made (NFC)", () => {
    expect(resolveOutputFormProposal([pair(true)], "prefix").form).toBe("ready-made");
  });

  it("the suggestion does NOT follow the posture table: a never-composing pair does not force base-plus-mark", () => {
    // The retired FR-014 row forced the whole keyboard to base-plus-mark
    // here and made ready-made unchoosable. Under #2297 the suggestion
    // still comes from the order alone, and the pair's lack of a ready-made
    // form is reported as the automatic-fallback fact only.
    const proposal = resolveOutputFormProposal([pair(true), pair(false)], "prefix");
    expect(proposal.form).toBe("ready-made");
    expect(proposal.anyPairLacksReadyMade).toBe(true);
  });

  it("anyPairLacksReadyMade is clear when every pair composes", () => {
    expect(resolveOutputFormProposal([pair(true)], "prefix").anyPairLacksReadyMade).toBe(false);
    expect(resolveOutputFormProposal([pair(true)], "postfix").anyPairLacksReadyMade).toBe(false);
  });

  it("SC-005: no explanation contains 'Unicode' or 'normalization' (any case)", () => {
    for (const order of ["prefix", "postfix"] as const) {
      const proposal = resolveOutputFormProposal([pair(false)], order);
      expect(proposal.explanation).not.toMatch(/unicode/i);
      expect(proposal.explanation).not.toMatch(/normali[sz]/i);
    }
  });
});

describe("outputStringForStack (the emission seam under the global policy)", () => {
  it("(a) global NFC: a combination with a ready-made form emits the single precomposed code point", () => {
    const out = outputStringForStack({ base: "a", marks: [GRAVE] }, "ready-made");
    expect(out).toBe("à");
    expect([...out]).toHaveLength(1);
  });

  it("(a) global NFC: a combination with NO ready-made form falls back to base + mark — automatically, only there", () => {
    // Bafut-shaped: schwa + grave has no precomposed code point (one of the
    // 9-of-22 in the #2293 repro). No policy can emit a single character
    // for it; the fallback is Unicode necessity, not an author-chosen mix.
    const out = outputStringForStack({ base: SCHWA, marks: [GRAVE] }, "ready-made");
    expect(out).toBe(SCHWA + GRAVE);
    expect([...out]).toHaveLength(2);
  });

  it("(a) global NFC over a Bafut-shaped set: composable pairs compose, the rest fall back", () => {
    const stacks = [
      { base: "a", marks: [GRAVE] }, // à exists
      { base: "i", marks: [GRAVE] }, // ì exists
      { base: SCHWA, marks: [GRAVE] }, // no precomposed form
      { base: SCHWA, marks: ["̂"] }, // no precomposed form
      { base: "m", marks: [GRAVE] }, // no precomposed form
    ];
    const outs = stacks.map((s) => outputStringForStack(s, "ready-made"));
    expect(outs[0]).toBe("à");
    expect(outs[1]).toBe("ì");
    expect(outs.slice(2).every((o) => [...o].length === 2)).toBe(true);
  });

  it("(b) global NFD: emits base + mark even where a precomposed form exists", () => {
    const out = outputStringForStack({ base: "a", marks: [GRAVE] }, "base-plus-mark");
    expect(out).toBe("a" + GRAVE);
    expect([...out]).toHaveLength(2);
  });

  it("(b) global NFD holds however the combination is called up — the seam takes no input-order or mechanism input", () => {
    // The same stack reached by a postfix mark key, by a mark key pressed
    // first (a waiting/dead key), or by a dedicated key for the composed
    // character itself all emit identically: outputStringForStack's only
    // inputs are the stack and the global policy.
    const stack = { base: "e", marks: [ACUTE] };
    expect(outputStringForStack(stack, "base-plus-mark")).toBe("e" + ACUTE);
    expect(outputStringForStack(stack, "ready-made")).toBe("é");
  });

  it("multi-mark stacks compose as far as single characters exist under NFC", () => {
    // e + circumflex + acute composes fully to one character; under NFD it
    // stays the literal sequence.
    const stack = { base: "e", marks: ["̂", ACUTE] };
    expect([...outputStringForStack(stack, "ready-made")]).toHaveLength(1);
    expect(outputStringForStack(stack, "base-plus-mark")).toBe("e" + "̂" + ACUTE);
  });

  it("an unset policy degrades to the ready-made (NFC) default", () => {
    expect(outputStringForStack({ base: "a", marks: [GRAVE] }, undefined)).toBe("à");
  });
});

describe("hasDecidablePairs (station render gate)", () => {
  it("false on an empty posture table — the station must not render", () => {
    expect(hasDecidablePairs([])).toBe(false);
  });

  it("true when at least one pair exists", () => {
    expect(hasDecidablePairs([pair(true)])).toBe(true);
  });
});
