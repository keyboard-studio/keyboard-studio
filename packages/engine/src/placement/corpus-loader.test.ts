/**
 * Unit tests for corpus-loader.ts — placement-priors v2 version gate +
 * baseLetter / touch passthrough.
 */

import { describe, it, expect } from "vitest";
import { corpusPriorsToPlacementMap } from "./corpus-loader.js";
import type { PlacementPriorsJSON } from "./model.js";

function makeV2Priors(overrides: Partial<PlacementPriorsJSON> = {}): PlacementPriorsJSON {
  return {
    version: "2.0.0",
    generatedFrom: "keymanapp/keyboards@deadbeef",
    priorCount: 10,
    entries: {
      "0192": {
        codepoint: "0192",
        placements: [
          {
            vkey: "K_F",
            modifiers: [],
            mechanism: "store-index",
            priorSource: "corpus",
            priorCount: 3,
            confidence: 1,
            baseLetter: "f",
          },
        ],
        bcp47Context: [],
        baseLayoutFamily: "QWERTY",
      },
    },
    ...overrides,
  };
}

describe("corpusPriorsToPlacementMap — version gate (placement-priors v2)", () => {
  it("accepts a 2.x.x snapshot", () => {
    expect(() => corpusPriorsToPlacementMap(makeV2Priors())).not.toThrow();
  });

  it("fails closed on a 1.x.x (v1) snapshot", () => {
    expect(() => corpusPriorsToPlacementMap(makeV2Priors({ version: "1.0.0" }))).toThrow(
      /major version mismatch/,
    );
  });

  it("fails closed on a hypothetical future 3.x.x snapshot", () => {
    expect(() => corpusPriorsToPlacementMap(makeV2Priors({ version: "3.0.0" }))).toThrow(
      /major version mismatch/,
    );
  });

  it("fails closed on an unparseable version string", () => {
    expect(() => corpusPriorsToPlacementMap(makeV2Priors({ version: "not-a-version" }))).toThrow(
      /major version mismatch/,
    );
  });

  it("carries baseLetter through on a qualifying store-index candidate", () => {
    const map = corpusPriorsToPlacementMap(
      makeV2Priors({ priorCount: 3 }),
    );
    const entry = map.entries.find((e) => e.codepoint === "U+0192");
    expect(entry?.candidates[0]?.baseLetter).toBe("f");
  });

  it("passes touch through onto the returned PlacementMap when present", () => {
    const map = corpusPriorsToPlacementMap(
      makeV2Priors({
        touch: [{ codepoint: "U+025B", hosts: [{ vkey: "K_E", layerClass: "default", priorCount: 2 }] }],
      }),
    );
    expect(map.touch).toEqual([
      { codepoint: "U+025B", hosts: [{ vkey: "K_E", layerClass: "default", priorCount: 2 }] },
    ]);
  });

  it("omits touch entirely from the returned PlacementMap when absent", () => {
    const map = corpusPriorsToPlacementMap(makeV2Priors());
    expect("touch" in map).toBe(false);
  });
});
