import { describe, it, expect } from "vitest";
import { checkHtmlWellFormed } from "./check-11-5-html-wellformed.js";
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

describe("checkHtmlWellFormed (11.5 KM_LINT_HTML_NOT_WELL_FORMED)", () => {
  it("passes for well-formed welcome and help bodies", () => {
    const members = {
      "welcome-htm": "<html><body><p>Welcome to Test</p></body></html>",
      "help-php": "<html><body><p>Welcome to Test</p></body></html>",
    };
    expect(checkHtmlWellFormed(makeInput(members))).toEqual([]);
  });

  it("fires for an unclosed element in welcome.htm", () => {
    const members = { "welcome-htm": "<html><body><p>Hi</body></html>" };
    const findings = checkHtmlWellFormed(makeInput(members));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_HTML_NOT_WELL_FORMED");
    expect(findings[0]?.location?.file).toBe("source/welcome/welcome.htm");
  });

  it("fires for an unclosed element in the help page", () => {
    const members = { "help-php": "<html><body><p>Hi</body></html>" };
    const findings = checkHtmlWellFormed(makeInput(members));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.location?.file).toBe("source/help/test_kbd.php");
  });

  it("returns [] when neither member is present", () => {
    expect(checkHtmlWellFormed(makeInput({}))).toEqual([]);
  });
});
