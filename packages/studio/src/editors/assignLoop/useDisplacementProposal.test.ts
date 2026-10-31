// The displacement hook's pure pieces (spec 107 FR-040): the propose decision
// and the "leave it" recording the hook now delegates to.

import { beforeEach, describe, expect, it } from "vitest";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import {
  acceptDisplacementProposal,
  declineDisplacementProposal,
  displacementDismissalKey,
  type DisplacementProposal,
  type DisplacementProposalInput,
} from "./useDisplacementProposal.ts";

const base: MechanismAssignment = {
  scope: "individual",
  target: "ŋ",
  modality: "physical",
  mechanisms: [],
  source: "user",
};

const proposal: DisplacementProposal = {
  displacedChar: "x",
  incomingChar: "ŋ",
  vkey: "K_X",
  modifiers: [],
  demotionMethod: "ralt",
  direction: "demote-incumbent",
  baseAssignment: base,
};

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
});

describe("displacementDismissalKey", () => {
  it("names the displaced glyph, the slot and the incoming character, modifiers sorted", () => {
    expect(displacementDismissalKey(proposal)).toBe("x|K_X||ŋ");
    expect(displacementDismissalKey({ ...proposal, modifiers: ["SHIFT", "RALT"] })).toBe("x|K_X|RALT,SHIFT|ŋ");
  });
});

describe("acceptDisplacementProposal", () => {
  it("returns the proposal and strips the caller predicate", () => {
    const input: DisplacementProposalInput = { ...proposal, alreadyDemoted: () => false };
    expect(acceptDisplacementProposal(input, [])).toEqual(proposal);
  });

  it("raises nothing when the glyph is already demoted", () => {
    expect(acceptDisplacementProposal({ ...proposal, alreadyDemoted: () => true }, [])).toBeNull();
  });

  it("raises nothing for a displacement the author already declined, but a different incoming character is new", () => {
    const declined = [displacementDismissalKey(proposal)];
    expect(acceptDisplacementProposal(proposal, declined)).toBeNull();
    expect(acceptDisplacementProposal({ ...proposal, incomingChar: "ɛ" }, declined)).not.toBeNull();
  });
});

describe("declineDisplacementProposal", () => {
  it("records the dismissal in the working copy, so the same proposal is not raised again", () => {
    declineDisplacementProposal(proposal);
    const declined = useWorkingCopyStore.getState().displacedDeclined;
    expect(declined).toEqual([displacementDismissalKey(proposal)]);
    expect(acceptDisplacementProposal(proposal, declined)).toBeNull();
  });
});
