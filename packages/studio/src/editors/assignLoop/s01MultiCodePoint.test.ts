// Spec 106 T033: every S-01 write site writes the whole target, never its
// first code point. A multi-code-point target (base + combining mark) must
// come out as `U+025B U+030C` in kmnRules.

import { describe, expect, it } from "vitest";
import { buildCasePairRuleLines, buildShiftRuleLines, buildStartRuleLines } from "@keyboard-studio/engine";
import { toUPlusSequence } from "@keyboard-studio/contracts";

const OPEN_E_CARON = "ɛ̌";
const SEQ = "U+025B U+030C";

describe("S-01 builders write every code point", () => {
  it("toUPlusSequence", () => {
    expect(toUPlusSequence(OPEN_E_CARON)).toBe(SEQ);
  });

  it("base layer, with and without CAPS handling", () => {
    expect(buildStartRuleLines("K_Q", OPEN_E_CARON, { capsHandling: false })).toEqual([`+ [K_Q] > ${SEQ}`]);
    expect(buildStartRuleLines("K_Q", OPEN_E_CARON, { capsHandling: true })).toEqual([
      `+ [NCAPS K_Q] > ${SEQ}`,
      `+ [CAPS K_Q] > ${SEQ}`,
    ]);
  });

  it("shift layer", () => {
    expect(buildShiftRuleLines("K_Q", OPEN_E_CARON, { capsHandling: false })).toEqual([`+ [SHIFT K_Q] > ${SEQ}`]);
  });

  it("case pair", () => {
    const lines = buildCasePairRuleLines("K_Q", OPEN_E_CARON, OPEN_E_CARON, { capsHandling: false });
    expect(lines).toEqual([`+ [K_Q] > ${SEQ}`, `+ [SHIFT K_Q] > ${SEQ}`]);
  });
});
