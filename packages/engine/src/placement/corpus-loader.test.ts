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

// ---------------------------------------------------------------------------
// Class-retention policy (P0 fix): a mechanism class that lost ALL its
// candidates to MIN_PRIOR_COUNT (2) keeps its single best candidate, so a
// well-attested S-02 deadkey candidate doesn't silently erase a sibling S-08
// RALT candidate for the same codepoint (or vice versa).
// ---------------------------------------------------------------------------

describe("corpusPriorsToPlacementMap — mechanism class-retention policy", () => {
  it("retains a below-threshold RALT (direct) candidate whose class would otherwise vanish", () => {
    const priors = makeV2Priors({
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
            {
              vkey: "K_F",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 1,
              confidence: 1,
            },
          ],
          bcp47Context: [],
          baseLayoutFamily: "QWERTY",
        },
      },
    });

    const map = corpusPriorsToPlacementMap(priors);
    const entry = map.entries.find((e) => e.codepoint === "U+0192");
    expect(entry?.candidates).toHaveLength(2);
    const direct = entry?.candidates.find((c) => c.mechanism === "direct");
    const deadkeyFamily = entry?.candidates.find((c) => c.mechanism === "store-index");
    expect(direct).toBeDefined();
    expect(deadkeyFamily).toBeDefined();
  });

  it("does not fire when the class already has a MIN_PRIOR_COUNT survivor", () => {
    const priors = makeV2Priors({
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
            // Second direct candidate below MIN_PRIOR_COUNT — but K_G/RALT
            // ALSO already-qualifying direct candidate exists below, so the
            // "direct" class has a survivor and this one must NOT be rescued.
            {
              vkey: "K_G",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 1,
              confidence: 1,
            },
            {
              vkey: "K_F",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 2,
              confidence: 1,
            },
          ],
          bcp47Context: [],
          baseLayoutFamily: "QWERTY",
        },
      },
    });

    const map = corpusPriorsToPlacementMap(priors);
    const entry = map.entries.find((e) => e.codepoint === "U+0192");
    // Only the qualifying direct (K_F/RALT, priorCount 2) survives — the
    // priorCount-1 K_G/RALT candidate is NOT rescued because its class
    // already has a MIN_PRIOR_COUNT survivor.
    expect(entry?.candidates).toHaveLength(2);
    expect(entry?.candidates.some((c) => c.vkey === "K_G")).toBe(false);
  });

  it("orders confidence so a retained priorCount-1 candidate scores below a qualified priorCount-3 one", () => {
    const priors = makeV2Priors({
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
            {
              vkey: "K_F",
              modifiers: ["RALT"],
              mechanism: "direct",
              priorSource: "corpus",
              priorCount: 1,
              confidence: 1,
            },
          ],
          bcp47Context: [],
          baseLayoutFamily: "QWERTY",
        },
      },
    });

    const map = corpusPriorsToPlacementMap(priors);
    const entry = map.entries.find((e) => e.codepoint === "U+0192");
    const qualifiedCandidate = entry?.candidates.find((c) => c.mechanism === "store-index");
    const retainedCandidate = entry?.candidates.find((c) => c.mechanism === "direct");

    expect(qualifiedCandidate?.confidence).toBe(1);
    expect(retainedCandidate?.confidence).toBe(0.5);
    expect(retainedCandidate?.confidence).toBeLessThan(qualifiedCandidate?.confidence ?? 0);
    // Both clear the gallery's 0.5 suggestion threshold (the dual S-02/S-08
    // suggestion must actually fire — see MechanismGallery's usage).
    expect(qualifiedCandidate?.confidence).toBeGreaterThanOrEqual(0.5);
    expect(retainedCandidate?.confidence).toBeGreaterThanOrEqual(0.5);
  });
});
