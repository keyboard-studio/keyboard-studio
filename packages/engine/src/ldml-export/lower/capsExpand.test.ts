import { describe, expect, it } from "vitest";
import { analyseModifiers } from "../classify/keystrokes.js";
import { US_BASE } from "../__fixtures__/us-base.js";
import { baseCasedKeys, expandCaps } from "./capsExpand.js";

const cased = new Set(["K_A", "K_E"]);
const show = (l: { components: readonly string[]; caps: boolean }): string =>
  `${l.components.join(" ") || "none"}${l.caps ? "+caps" : ""}`;

describe("caps expansion (row 2.14)", () => {
  it("emits a rule with no caps flag into the X and X caps layers", () => {
    expect(expandCaps(analyseModifiers([]), "K_1", cased).map(show)).toEqual(["none", "none+caps"]);
  });

  it("swaps shift under caps on a cased key", () => {
    expect(expandCaps(analyseModifiers([]), "K_A", cased).map(show)).toEqual(["none", "shift+caps"]);
    expect(expandCaps(analyseModifiers(["SHIFT"]), "K_A", cased).map(show)).toEqual(["shift", "none+caps"]);
  });

  it("keeps an explicit CAPS or NCAPS flag in its one layer", () => {
    expect(expandCaps(analyseModifiers(["CAPS"]), "K_A", cased).map(show)).toEqual(["none+caps"]);
    expect(expandCaps(analyseModifiers(["NCAPS", "SHIFT"]), "K_A", cased).map(show)).toEqual(["shift"]);
  });

  it("derives cased keys from the base keyboard", () => {
    const keys = baseCasedKeys(US_BASE);
    expect(keys.has("K_A")).toBe(true);
    expect(keys.has("K_1")).toBe(false);
  });
});
