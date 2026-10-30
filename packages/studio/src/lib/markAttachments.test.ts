import { describe, expect, it } from "vitest";
import { markAttachmentsFromWorklist } from "./markAttachments.ts";

const CARON = "̌";
const ACUTE = "́";

describe("markAttachmentsFromWorklist", () => {
  it("keeps bare bases, drops precomposed units, minus the blocked pairs per mark", () => {
    const result = markAttachmentsFromWorklist({
      ownLetterUnits: ["a", "e", "k", "é"],
      markUnits: [
        { mark: CARON, inputOrder: "postfix" },
        { mark: ACUTE, inputOrder: "postfix" },
      ],
      blockedCombinations: [
        { base: "k", mark: CARON },
        { base: "e", mark: ACUTE },
      ],
    });
    expect(result).toEqual({ [CARON]: ["a", "e"], [ACUTE]: ["a", "k"] });
  });

  it("is empty when there are no mark units", () => {
    expect(
      markAttachmentsFromWorklist({ ownLetterUnits: ["a"], markUnits: [], blockedCombinations: [] }),
    ).toEqual({});
  });
});
