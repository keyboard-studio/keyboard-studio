import { describe, expect, it } from "vitest";
import type { PosturePair } from "./nfc-posture-of-inventory.js";
import { hasDecidablePairs, resolveOutputFormProposal } from "./output-form-policy.js";

const ACUTE = "́";

function pair(hasReadyMadeForm: boolean): PosturePair {
  return { stack: { base: "e", marks: [ACUTE] }, hasReadyMadeForm };
}

describe("resolveOutputFormProposal (FR-013..FR-016)", () => {
  it("FR-014: any never-composing pair → base-plus-mark as a NOTICE", () => {
    const proposal = resolveOutputFormProposal([pair(true), pair(false)], false);
    expect(proposal.form).toBe("base-plus-mark");
    expect(proposal.presentedAs).toBe("notice");
  });

  it("FR-014 wins even when a letter-plus-mark class exists (row order)", () => {
    const proposal = resolveOutputFormProposal([pair(false)], true);
    expect(proposal.form).toBe("base-plus-mark");
    expect(proposal.presentedAs).toBe("notice");
  });

  it("FR-015: all pairs compose + no letter-plus-mark class → ready-made as a NOTICE", () => {
    const proposal = resolveOutputFormProposal([pair(true)], false);
    expect(proposal.form).toBe("ready-made");
    expect(proposal.presentedAs).toBe("notice");
  });

  it("FR-016: all pairs compose + a letter-plus-mark class → OPEN CHOICE, base-plus-mark recommended", () => {
    const proposal = resolveOutputFormProposal([pair(true)], true);
    expect(proposal.presentedAs).toBe("open-choice");
    expect(proposal.form).toBe("base-plus-mark");
  });

  it("SC-005: no explanation contains 'Unicode' or 'normalization' (any case)", () => {
    const cases = [
      resolveOutputFormProposal([pair(false)], false),
      resolveOutputFormProposal([pair(true)], false),
      resolveOutputFormProposal([pair(true)], true),
    ];
    for (const c of cases) {
      expect(c.explanation).not.toMatch(/unicode/i);
      expect(c.explanation).not.toMatch(/normali[sz]/i);
    }
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
