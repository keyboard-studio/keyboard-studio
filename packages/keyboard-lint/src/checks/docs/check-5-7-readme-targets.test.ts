import { describe, it, expect } from "vitest";
import { checkReadmeTargets } from "./check-5-7-readme-targets.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(readmeMd: string | undefined, targets: string[]): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion: "1.0",
    targets,
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members: readmeMd !== undefined ? { "readme-md": readmeMd } : {},
    deletedFilenames: [],
  };
}

const README_WIN_MAC = "# Test\n\ndesc\n\n## Supported Platforms\n- windows\n- mac\n";

describe("checkReadmeTargets (5.7 KM_LINT_README_TARGETS_MISMATCH)", () => {
  it("passes when the README platform list matches targets exactly", () => {
    expect(checkReadmeTargets(makeInput(README_WIN_MAC, ["windows", "mac"]))).toEqual([]);
  });

  it("names a missing platform", () => {
    const findings = checkReadmeTargets(makeInput(README_WIN_MAC, ["windows", "mac", "linux"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_README_TARGETS_MISMATCH");
    expect(findings[0]?.message).toContain("missing: linux");
  });

  it("names an extra platform", () => {
    const readmeMd = "# Test\n\ndesc\n\n## Supported Platforms\n- windows\n- mac\n- linux\n";
    const findings = checkReadmeTargets(makeInput(readmeMd, ["windows", "mac"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("extra: linux");
  });

  it("returns [] when readme-md is absent", () => {
    expect(checkReadmeTargets(makeInput(undefined, ["windows"]))).toEqual([]);
  });
});
