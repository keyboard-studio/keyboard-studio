import { describe, it, expect } from "vitest";
import { checkOskLayersListed } from "./check-11-2-osk-layers.js";
import { checkDataStatesComplete } from "./check-11-6-data-states.js";
import { withMembers } from "./fixtures/clean.js";

function makeInput(helpPhp: string | undefined, layerIds: string[]) {
  return withMembers(
    { "help-php": helpPhp === undefined ? null : helpPhp },
    { layerIds },
  );
}

describe("checkOskLayersListed (11.2 KM_LINT_PHP_OSK_LAYERS_INCOMPLETE)", () => {
  it("passes when data-states lists every real layer", () => {
    const helpPhp = '<span data-states="default,shift"></span>';
    expect(
      checkOskLayersListed(makeInput(helpPhp, ["default", "shift"])).findings,
    ).toEqual([]);
  });

  it("fires when a real layer is missing from data-states (11.2's direction)", () => {
    const helpPhp = '<span data-states="default"></span>';
    const findings = checkOskLayersListed(
      makeInput(helpPhp, ["default", "shift"]),
    ).findings;    expect(findings).toHaveLength(1);
    expect(findings[0]?.code).toBe("KM_LINT_PHP_OSK_LAYERS_INCOMPLETE");
    expect(findings[0]?.message).toContain("shift");
  });

  it("is the exact complement of 11.6: a phantom name fires 11.6 only, a missing layer fires 11.2 only", () => {
    const phantom = makeInput('<span data-states="default,phantom"></span>', [
      "default",
    ]);
    expect(checkOskLayersListed(phantom).findings).toEqual([]);
    expect(checkDataStatesComplete(phantom).findings).toHaveLength(1);

    const missing = makeInput('<span data-states="default"></span>', [
      "default",
      "shift",
    ]);
    expect(checkDataStatesComplete(missing).findings).toEqual([]);
    expect(checkOskLayersListed(missing).findings).toHaveLength(1);
  });

  it("passes when the page does not use OSK syntax (no data-states)", () => {
    expect(
      checkOskLayersListed(makeInput("<html></html>", ["default"])).findings,
    ).toEqual([]);
  });

  it("returns [] when help-php is absent", () => {
    expect(checkOskLayersListed(makeInput(undefined, ["default"])).findings).toEqual([]);
  });
});
