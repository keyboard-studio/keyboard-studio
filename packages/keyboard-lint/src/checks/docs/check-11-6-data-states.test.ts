import { describe, it, expect } from "vitest";
import { checkDataStatesComplete } from "./check-11-6-data-states.js";
import { withMembers } from "./fixtures/clean.js";

function makeInput(helpPhp: string | undefined, layerIds: string[]) {
  return withMembers(
    { "help-php": helpPhp === undefined ? null : helpPhp },
    { layerIds },
  );
}

describe("checkDataStatesComplete (11.6 KM_LINT_PHP_DATA_STATES_INCOMPLETE)", () => {
  it("passes when data-states names only real layers", () => {
    const helpPhp = '<span data-states="default,shift"></span>';
    expect(checkDataStatesComplete(makeInput(helpPhp, ["default", "shift"]))).toEqual([]);
  });

  it("passes when data-states is absent entirely", () => {
    expect(checkDataStatesComplete(makeInput("<html></html>", ["default"]))).toEqual([]);
  });

  it("fires when data-states names a phantom layer", () => {
    const helpPhp = '<span data-states="default,phantom"></span>';
    const findings = checkDataStatesComplete(makeInput(helpPhp, ["default"]));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_PHP_DATA_STATES_INCOMPLETE");
    expect(findings[0]?.message).toContain("phantom");
  });

  it("returns [] when help-php is absent", () => {
    expect(checkDataStatesComplete(makeInput(undefined, ["default"]))).toEqual([]);
  });
});
