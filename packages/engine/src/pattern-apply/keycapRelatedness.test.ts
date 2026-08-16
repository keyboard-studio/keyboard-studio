// Spec 065 US5 T046 — the five relatedness tests, and SC-008's number row.
//
// `isKeycapRelated` gates a HINT, so its failure modes are asymmetric: a false
// "related" costs a hint nobody needed; a false "mismatch" nags an author who
// was right. Every case below that asserts `true` is protecting an author from
// being nagged.

import { describe, it, expect } from "vitest";
import { proposeKeycap, isKeycapRelated, isCombiningMark } from "./keycapRelatedness.js";

const DOTTED_CIRCLE = "◌";
const COMBINING_ACUTE = "́"; // U+0301
const COMBINING_GRAVE = "̀"; // U+0300

describe("proposeKeycap (FR-033, FR-034)", () => {
  it("proposes the character itself for an ordinary character", () => {
    expect(proposeKeycap("ø")).toEqual({ keycap: "ø", form: "character" });
  });

  it("carries a combining mark on a dotted circle, offering the standalone form explicitly", () => {
    const proposal = proposeKeycap(COMBINING_ACUTE);
    expect(proposal.keycap).toBe(`${DOTTED_CIRCLE}${COMBINING_ACUTE}`);
    expect(proposal.form).toBe("dotted-circle-carrier");
    // The standalone form is offered, but never as the silent default — it
    // renders over whatever precedes it in the UI.
    expect(proposal.alternative).toEqual({
      keycap: COMBINING_ACUTE,
      consequence: { kind: "renders-without-carrier" },
    });
  });

  it("treats a multi-codepoint string as a character, not a mark", () => {
    expect(proposeKeycap("ch").form).toBe("character");
    expect(proposeKeycap(`a${COMBINING_ACUTE}`).form).toBe("character");
  });

  it("recognizes a lone combining mark and nothing else", () => {
    expect(isCombiningMark(COMBINING_ACUTE)).toBe(true);
    expect(isCombiningMark("a")).toBe(false);
    expect(isCombiningMark(`a${COMBINING_ACUTE}`)).toBe(false);
    expect(isCombiningMark("")).toBe(false);
  });
});

describe("isKeycapRelated — test 1: identity after NFC", () => {
  it("relates identical strings", () => {
    expect(isKeycapRelated("ø", "ø")).toBe(true);
  });

  it("relates a decomposed keycap to its composed output", () => {
    expect(isKeycapRelated(`e${COMBINING_ACUTE}`, "é")).toBe(true);
    expect(isKeycapRelated("é", `e${COMBINING_ACUTE}`)).toBe(true);
  });

  it("does not relate genuinely different characters", () => {
    expect(isKeycapRelated("q", "ø")).toBe(false);
  });
});

describe("isKeycapRelated — test 2: case variants under BCP47", () => {
  it("relates a capital keycap to a lowercase output", () => {
    expect(isKeycapRelated("E", "e")).toBe(true);
    expect(isKeycapRelated("Ø", "ø")).toBe(true);
  });

  it("folds Turkish dotless i under tr", () => {
    // The reason the fold is locale-sensitive at all: under `tr`, I lowercases
    // to ı, so a keycap of I over an output of ı is right, not a mismatch.
    expect(isKeycapRelated("I", "ı", { bcp47: "tr" })).toBe(true);
  });
});

describe("isKeycapRelated — test 3: normalization variants", () => {
  it("relates compatibility forms via NFKD", () => {
    expect(isKeycapRelated("１", "1")).toBe(true); // fullwidth
    expect(isKeycapRelated("ﬁ", "fi")).toBe(true); // ligature
  });

  it("relates a Western digit keycap to an Arabic-Indic output (SC-008)", () => {
    // NFKD does NOT do this — U+0661 has no compatibility decomposition, which
    // is why the module carries a decimal-digit-value test as well. Without it
    // a localized number row would raise a mismatch on every key.
    expect(isKeycapRelated("1", "١")).toBe(true);
    expect(isKeycapRelated("٩", "9")).toBe(true);
  });

  it("a localized number row raises no mismatch anywhere (US5 AS6)", () => {
    const western = [..."1234567890"];
    const arabicIndic = [..."١٢٣٤٥٦٧٨٩٠"];
    for (let i = 0; i < western.length; i += 1) {
      expect(
        isKeycapRelated(western[i] as string, arabicIndic[i] as string),
        `digit ${western[i]} vs ${arabicIndic[i]}`,
      ).toBe(true);
    }
  });

  it("still separates digits that are genuinely different values", () => {
    expect(isKeycapRelated("1", "٢")).toBe(false);
  });
});

describe("isKeycapRelated — test 4: dotted-circle carrier stripping", () => {
  it("relates a carried keycap to its bare mark", () => {
    expect(isKeycapRelated(`${DOTTED_CIRCLE}${COMBINING_ACUTE}`, COMBINING_ACUTE)).toBe(true);
  });

  it("relates a carried spacing stand-in to the combining output", () => {
    expect(isKeycapRelated(`${DOTTED_CIRCLE}\``, COMBINING_GRAVE)).toBe(true);
  });

  it("does not relate a carrier holding the wrong mark", () => {
    expect(isKeycapRelated(`${DOTTED_CIRCLE}${COMBINING_ACUTE}`, COMBINING_GRAVE)).toBe(false);
  });
});

describe("isKeycapRelated — test 5: spacing-accent stand-ins", () => {
  it("relates ASCII grave to combining grave", () => {
    expect(isKeycapRelated("`", COMBINING_GRAVE)).toBe(true);
  });

  it("relates the accents NFKD leaves alone", () => {
    // These carry no compatibility decomposition, so only the stand-in table
    // relates them — verified against the runtime, not assumed.
    expect(isKeycapRelated("^", "̂")).toBe(true);
    expect(isKeycapRelated("~", "̃")).toBe(true);
    expect(isKeycapRelated("ˆ", "̂")).toBe(true);
    expect(isKeycapRelated("ˇ", "̌")).toBe(true);
  });

  it("relates the accents NFKD already handles", () => {
    expect(isKeycapRelated("´", COMBINING_ACUTE)).toBe(true);
    expect(isKeycapRelated("¨", "̈")).toBe(true);
  });

  it("relates in either direction", () => {
    expect(isKeycapRelated(COMBINING_GRAVE, "`")).toBe(true);
  });

  it("does not relate mismatched accents", () => {
    expect(isKeycapRelated("`", COMBINING_ACUTE)).toBe(false);
  });
});

describe("isKeycapRelated — the mismatch cases the hint exists for", () => {
  it("flags a keycap left over from a previous character", () => {
    expect(isKeycapRelated("q", "ɛ")).toBe(false);
  });

  it("flags an empty keycap against a real output", () => {
    expect(isKeycapRelated("", "ɛ")).toBe(false);
  });
});
