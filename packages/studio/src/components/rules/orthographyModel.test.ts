// Tests for deriveOrthographyModel (spec 082 FR-022): the orthography model
// threaded into guard analysis comes from the working copy's confirmed mark
// inventory (character discovery / 071 mark-classes data) — never invented.

import { describe, expect, it } from "vitest";
import type { ConfirmedAlphabet } from "@keyboard-studio/contracts";
import { deriveOrthographyModel } from "./orthographyModel.ts";

const ALPHABET: ConfirmedAlphabet = {
  bases: ["a", "e", "o"],
  marks: ["́", "̧"],
  attestedStacks: [
    { base: "a", marks: ["́"] },
    { base: "e", marks: ["́"] },
    { base: "o", marks: ["̧"] },
  ],
  declaredRoles: {},
};

describe("deriveOrthographyModel", () => {
  it("returns null when the working copy has no confirmed alphabet yet", () => {
    expect(deriveOrthographyModel(undefined)).toBeNull();
  });

  it("carries the full confirmed inventory as alphabet", () => {
    const model = deriveOrthographyModel(ALPHABET);
    expect(model?.alphabet).toEqual(["a", "e", "o", "́", "̧"]);
  });

  it("maps each mark to its attested base chars (markAttachments)", () => {
    const model = deriveOrthographyModel(ALPHABET);
    expect(model?.markAttachments.get("́")).toEqual(["a", "e"]);
    expect(model?.markAttachments.get("̧")).toEqual(["o"]);
  });

  it("gives an empty base list to a mark with no attested stacks", () => {
    const model = deriveOrthographyModel({
      ...ALPHABET,
      marks: ["́", "̧", "̂"],
    });
    expect(model?.markAttachments.get("̂")).toEqual([]);
  });
});
