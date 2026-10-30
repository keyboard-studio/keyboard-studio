// Spec 106 US3: readers treat both S-02 shapes as a deadkey.

import { describe, expect, it } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { isDeadkeyPatternId } from "./patternIds.ts";
import { sessionDeadkeys } from "./deadkeyPurpose.ts";
import { extractMechanismBaseKey } from "../../lib/extractMechanismBaseKey.ts";

const CARON = "̌";

const nfd: MechanismAssignment = {
  scope: "individual",
  target: "ǎ",
  modality: "physical",
  mechanisms: [
    {
      patternId: "deadkey_single_tap_nfd",
      strategyId: "S-02",
      slotValues: { triggerKey: "K_COLON", deadkeyName: "3000", baseLetters: "ae", markChars: CARON, accentChar: ";" },
    },
  ],
  source: "user",
};

describe("deadkey pattern shapes", () => {
  it("isDeadkeyPatternId accepts both shapes only", () => {
    expect(isDeadkeyPatternId("deadkey_single_tap")).toBe(true);
    expect(isDeadkeyPatternId("deadkey_single_tap_nfd")).toBe(true);
    expect(isDeadkeyPatternId("simple_swap")).toBe(false);
  });

  it("sessionDeadkeys derives a decomposed ref's outputs as base + marks", () => {
    const dk = sessionDeadkeys([nfd]).get("K_COLON");
    expect(dk?.outputsByBase.get("a")).toBe(`a${CARON}`);
    expect(dk?.outputsByBase.get("e")).toBe(`e${CARON}`);
  });

  it("extractMechanismBaseKey reads a decomposed ref's host key", () => {
    expect(extractMechanismBaseKey(nfd.mechanisms[0]!)).toEqual({ kind: "longpress", baseKey: "K_A" });
  });
});
