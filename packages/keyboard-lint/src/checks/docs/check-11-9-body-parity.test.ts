import { describe, it, expect } from "vitest";
import { checkBodyParity } from "./check-11-9-body-parity.js";
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

describe("checkBodyParity (11.9 KM_LINT_PHP_HTM_BODY_MISMATCH)", () => {
  it("passes when bodies are identical", () => {
    const members = {
      "welcome-htm": "<html><body><p>Welcome to Test</p></body></html>",
      "help-php": "<?php\n  $pagename = 'Test Help';\n?>\n<html><body><p>Welcome to Test</p></body></html>",
    };
    expect(checkBodyParity(makeInput(members))).toEqual([]);
  });

  it("passes when the welcome page's Keyboard Layout section is the only difference", () => {
    const members = {
      "welcome-htm":
        '<html><body><p>Welcome to Test</p><h2>Keyboard Layout</h2><p><img src="a.svg"></p></body></html>',
      "help-php": "<html><body><p>Welcome to Test</p></body></html>",
    };
    expect(checkBodyParity(makeInput(members))).toEqual([]);
  });

  it("fires when the bodies genuinely differ", () => {
    const members = {
      "welcome-htm": "<html><body><p>Welcome to Test</p></body></html>",
      "help-php": "<html><body><p>Something totally different.</p></body></html>",
    };
    const findings = checkBodyParity(makeInput(members));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_PHP_HTM_BODY_MISMATCH");
    expect(findings[0]?.location?.file).toBe("source/help/test_kbd.php");
  });

  it("returns [] when either member is absent", () => {
    expect(checkBodyParity(makeInput({ "welcome-htm": "<p>Hi</p>" }))).toEqual([]);
    expect(checkBodyParity(makeInput({ "help-php": "<p>Hi</p>" }))).toEqual([]);
  });
});
