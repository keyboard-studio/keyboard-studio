import { describe, it, expect } from "vitest";
import { checkStyleParity } from "./check-11-10-style-parity.js";
import type { DocLintInput } from "@keyboard-studio/contracts";

function makeInput(members: DocLintInput["members"]): DocLintInput {
  return {
    keyboardId: "test_kbd",
    keyboardVersion: "1.0",
    targets: [],
    layerIds: [],
    displayName: "Test",
    copyrightHolders: {},
    members,
    deletedFilenames: [],
  };
}

describe("checkStyleParity (11.10 KM_LINT_PHP_HTM_STYLE_MISMATCH)", () => {
  it("passes when there is no inline CSS anywhere", () => {
    const members = {
      "welcome-htm": "<p>Welcome to Test</p>",
      "help-php": "<p>Welcome to Test</p>",
    };
    expect(checkStyleParity(makeInput(members))).toEqual([]);
  });

  it("passes when styles are identical modulo whitespace", () => {
    const members = {
      "welcome-htm": '<p style="color:red">Welcome</p>',
      "help-php": '<p style="color:  red">Welcome</p>',
    };
    expect(checkStyleParity(makeInput(members))).toEqual([]);
  });

  it("fires when the help page adds a style not present on welcome", () => {
    const members = {
      "welcome-htm": "<p>Welcome to Test</p>",
      "help-php": '<p style="color:red">Welcome to Test</p>',
    };
    const findings = checkStyleParity(makeInput(members));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_PHP_HTM_STYLE_MISMATCH");
    expect(findings[0]?.location?.file).toBe("source/help/test_kbd.php");
  });

  it("returns [] when either member is absent", () => {
    expect(checkStyleParity(makeInput({ "welcome-htm": "<p>Hi</p>" }))).toEqual([]);
    expect(checkStyleParity(makeInput({ "help-php": "<p>Hi</p>" }))).toEqual([]);
  });
});
