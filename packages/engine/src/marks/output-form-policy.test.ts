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

  it("FR-014 wins even when an own-key mark exists (row order)", () => {
    const proposal = resolveOutputFormProposal([pair(false)], true);
    expect(proposal.form).toBe("base-plus-mark");
    expect(proposal.presentedAs).toBe("notice");
  });

  it("FR-015: all pairs compose + no own-key mark → ready-made as a NOTICE", () => {
    const proposal = resolveOutputFormProposal([pair(true)], false);
    expect(proposal.form).toBe("ready-made");
    expect(proposal.presentedAs).toBe("notice");
  });

  it("FR-016: all pairs compose + an own-key mark → OPEN CHOICE, base-plus-mark recommended", () => {
    const proposal = resolveOutputFormProposal([pair(true)], true);
    expect(proposal.presentedAs).toBe("open-choice");
    expect(proposal.form).toBe("base-plus-mark");
  });

  it("readyMadeUnavailable is SET on row 1 (some pair has no ready-made form)", () => {
    // Row 1 fires precisely on `anyPairLacksReadyMade`, so the station must be
    // able to see that "ready-made" is not a selectable answer at all.
    expect(resolveOutputFormProposal([pair(true), pair(false)], false).readyMadeUnavailable).toBe(
      true,
    );
    expect(resolveOutputFormProposal([pair(false)], true).readyMadeUnavailable).toBe(true);
  });

  it("readyMadeUnavailable is CLEAR on rows 2 and 3 (every pair composes)", () => {
    // Row 2 (open choice) and row 3 (ready-made default) both only run when
    // every pair has a ready-made form, so the override stays available.
    expect(resolveOutputFormProposal([pair(true)], true).readyMadeUnavailable).toBe(false);
    expect(resolveOutputFormProposal([pair(true)], false).readyMadeUnavailable).toBe(false);
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
