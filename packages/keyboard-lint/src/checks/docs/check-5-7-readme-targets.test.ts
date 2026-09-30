import { describe, it, expect } from "vitest";
import { checkReadmeTargets } from "./check-5-7-readme-targets.js";
import { withMembers } from "./fixtures/clean.js";

function makeInput(readmeMd: string | undefined, targets: string[]) {
  return withMembers(
    { "readme-md": readmeMd === undefined ? null : readmeMd },
    { targets },
  );
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

  it("passes a corpus README listing every platform against TARGETS 'any' (sil_cameroon_qwerty)", () => {
    const readmeMd =
      "Cameroon QWERTY keyboard\n=====\n\nSupported Platforms\n-------------------\n" +
      " * Windows\n * Linux\n * MacOS\n * Web\n * Mobile Web\n * iOS\n * Android\n";
    expect(checkReadmeTargets(makeInput(readmeMd, ["any"]))).toEqual([]);
  });

  it("names the concrete platforms a partial README leaves out of TARGETS 'any'", () => {
    const readmeMd = "Supported Platforms\n---\n * Windows\n * Web\n";
    const findings = checkReadmeTargets(makeInput(readmeMd, ["any"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("missing: macosx, linux, iphone, ipad, androidphone, androidtablet");
  });

  it("passes the generated no-description README stub (platforms from an 'any' TARGETS)", () => {
    const stub = "# Test\n\n## Supported Platforms\n- any\n";
    expect(checkReadmeTargets(makeInput(stub, ["any"]))).toEqual([]);
  });

  it("passes the generated no-description README stub with explicit TARGETS", () => {
    const stub = "# Test\n\n## Supported Platforms\n- windows\n- web\n";
    expect(checkReadmeTargets(makeInput(stub, ["windows", "web"]))).toEqual([]);
  });

  it("returns [] when readme-md is absent", () => {
    expect(checkReadmeTargets(makeInput(undefined, ["windows"]))).toEqual([]);
  });

  it("passes the no-description fallback stub against TARGETS 'any' (#1906)", () => {
    // This is the exact shape `renderReadmeMd` now emits for a fresh Track 1
    // copy before the author has written a description: the generator must
    // satisfy its own check.
    const stub = "# Test\n\n## Supported Platforms\n- any\n";
    expect(checkReadmeTargets(makeInput(stub, ["any"]))).toEqual([]);
  });

  it("passes the no-description fallback stub against explicit TARGETS (#1906)", () => {
    const stub = "# Test\n\n## Supported Platforms\n- windows\n- web\n";
    expect(checkReadmeTargets(makeInput(stub, ["windows", "web"]))).toEqual([]);
  });
});
