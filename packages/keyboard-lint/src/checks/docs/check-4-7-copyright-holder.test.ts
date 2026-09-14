import { describe, it, expect } from "vitest";
import { checkCopyrightHolder } from "./check-4-7-copyright-holder.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(copyrightHolders: DocLintInput["copyrightHolders"]): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion: "1.0",
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders,
    members: {},
    deletedFilenames: [],
  };
}

describe("checkCopyrightHolder (4.7 KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT)", () => {
  it("passes when all present holders match", () => {
    const input = makeInput({ license: "Jane Doe", kmn: "Jane Doe", readme: "Jane Doe" });
    expect(checkCopyrightHolder(input)).toEqual([]);
  });

  it("fires when a present holder differs", () => {
    const input = makeInput({ license: "Jane Doe", kmn: "Jane Doe", readme: "John Smith" });
    const findings = checkCopyrightHolder(input);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_COPYRIGHT_HOLDER_INCONSISTENT");
    expect(findings[0]?.message).toContain("Jane Doe");
    expect(findings[0]?.message).toContain("John Smith");
    expect(findings[0]?.location?.file).toBe("LICENSE.md");
  });

  it("skips absent files (fewer than two present holders is never inconsistent)", () => {
    expect(checkCopyrightHolder(makeInput({ license: "Jane Doe" }))).toEqual([]);
    expect(checkCopyrightHolder(makeInput({}))).toEqual([]);
  });
});
