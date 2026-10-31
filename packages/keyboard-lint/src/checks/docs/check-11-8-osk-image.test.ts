import { describe, it, expect } from "vitest";
import type { DocLintInput } from "@keyboard-studio/contracts";
import { checkOskImageConstrained } from "./check-11-8-osk-image.js";

function input(php: string | undefined, cssTexts?: string[]): DocLintInput {
  return {
    keyboardId: "demo",
    keyboardVersion: "1.0",
    targets: [],
    layerIds: [],
    displayName: "Demo",
    copyrightHolders: {},
    members: php === undefined ? {} : { "help-php": php },
    deletedFilenames: [],
    ...(cssTexts !== undefined ? { cssTexts } : {}),
  };
}

describe("checkOskImageConstrained (11.8)", () => {
  it("is silent when the help page has no member text, and when it has no images (Keyman-generated data-states form)", () => {
    expect(checkOskImageConstrained(input(undefined)).findings).toEqual([]);
    expect(
      checkOskImageConstrained(
        input(`<div id='osk' data-states='default shift'></div>`),
      ).findings,
    ).toEqual([]);
  });

  it("passes images constrained by a width attribute or an inline style", () => {
    expect(
      checkOskImageConstrained(input(`<img src="a.png" width="600" />`)).findings,
    ).toEqual([]);
    expect(
      checkOskImageConstrained(
        input(`<img src="a.png" style="max-width: 100%" />`),
      ).findings,
    ).toEqual([]);
  });

  it("passes an image whose class rule in the bundled CSS sets a width", () => {
    const findings = checkOskImageConstrained(
      input(`<img src="chart.png" class="full" />`, [
        ".full { width: 98%; min-width: 700px; }",
      ]),
    ).findings;    expect(findings).toEqual([]);
  });

  it("passes all images when a global img rule constrains them", () => {
    expect(
      checkOskImageConstrained(
        input(`<img src="a.png" />`, ["img { max-width: 100%; }"]),
      ).findings,
    ).toEqual([]);
  });

  it("flags a bare custom image with no constraint anywhere", () => {
    const findings = checkOskImageConstrained(input(`<img src="globe.png" />`)).findings;    expect(findings).toHaveLength(1);
    expect(findings[0]!.code).toBe("KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED");
    expect(findings[0]!.message).toContain("globe.png");
  });

  it("flags a height-only image: height is not a width constraint", () => {
    const findings = checkOskImageConstrained(
      input(`<img src="keys.png" height="300" />`),
    ).findings;    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("keys.png");
  });

  it("flags only the unconstrained images, naming each", () => {
    const findings = checkOskImageConstrained(
      input(
        `<img src="ok.png" class="full" /><img src="bad.png" class="left" />`,
        [".full { width: 98%; } .left { float: left; }"],
      ),
    ).findings;    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("bad.png");
    expect(findings[0]!.message).not.toContain("ok.png");
  });

  it("a commented-out CSS width does not count", () => {
    const findings = checkOskImageConstrained(
      input(`<img src="a.png" class="full" />`, [
        "/* .full { width: 98%; } */ .full { color: red; }",
      ]),
    ).findings;    expect(findings).toHaveLength(1);
  });
});
