import { describe, it, expect } from "vitest";
import { checkPagenameFormat } from "./check-11-7-pagename-format.js";
import type { DocLintInput } from "@keyboard-studio/contracts";
import { CLEAN_DOC_LINT_INPUT } from "./fixtures/clean.js";

function makeInput(helpPhp: string | undefined, displayName: string): DocLintInput {
  const membersWithout = Object.fromEntries(
    Object.entries(CLEAN_DOC_LINT_INPUT.members).filter(([k]) => k !== "help-php"),
  ) as DocLintInput["members"];
  return {
    ...CLEAN_DOC_LINT_INPUT,
    displayName,
    members:
      helpPhp !== undefined
        ? { ...CLEAN_DOC_LINT_INPUT.members, "help-php": helpPhp }
        : membersWithout,
  };
}

describe("checkPagenameFormat (11.7 KM_LINT_PHP_PAGENAME_FORMAT)", () => {
  it("passes when $pagename matches the expected format", () => {
    const helpPhp = "<?php\n  $pagename = 'Test Keyboard Help';\n?>\n";
    expect(checkPagenameFormat(makeInput(helpPhp, "Test"))).toEqual([]);
  });

  it("passes with the 'already ends in Keyboard' form", () => {
    const helpPhp = "<?php\n  $pagename = 'Test Keyboard Help';\n?>\n";
    expect(checkPagenameFormat(makeInput(helpPhp, "Test Keyboard"))).toEqual([]);
  });

  it("fires when $pagename doesn't match the expected format", () => {
    const helpPhp = "<?php\n  $pagename = 'Wrong Name';\n?>\n";
    const findings = checkPagenameFormat(makeInput(helpPhp, "Test"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_PHP_PAGENAME_FORMAT");
    expect(findings[0]?.message).toContain("Wrong Name");
    expect(findings[0]?.message).toContain("Test Keyboard Help");
  });

  it("returns [] when $pagename is absent", () => {
    expect(checkPagenameFormat(makeInput("<html></html>", "Test"))).toEqual([]);
  });

  it("returns [] when help-php is absent", () => {
    expect(checkPagenameFormat(makeInput(undefined, "Test"))).toEqual([]);
  });
});
