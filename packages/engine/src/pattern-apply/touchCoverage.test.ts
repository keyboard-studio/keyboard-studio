/**
 * Unit tests for touchCoverage (spec 035, FR-008/SC-003).
 *
 * Locks the pattern behind the contract, not just one instance:
 *   - each producer mechanism (text/output, sk, flick, multitap) counts
 *   - layer reachability (default, nextlayer chain, cycle guard, unreachable)
 *   - NFC/NFD normalization
 *   - star-labels are never producers
 *   - exactly-once reporting + fully-covered empty case
 */

import { describe, it, expect } from "vitest";
import { touchCoverage } from "./touchCoverage.js";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

/** Build a single TouchKeyIR for use in test layouts. */
function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

/** Build a TouchLayoutIR with a single "phone" platform from the given layers. */
function makeLayout(layers: TouchLayoutIR["platforms"][number]["layers"]): TouchLayoutIR {
  return { platforms: [{ id: "phone", layers }], nodeIds: [] };
}

describe("touchCoverage", () => {
  it("reports an orphaned inventory char exactly once", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const result = touchCoverage(layout, ["a", "z", "z"]);

    expect(result.uncovered).toEqual(["z", "z"]);
  });

  it("counts coverage via an sk (longpress) entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                sk: [makeKey("K_A_acute", { text: "á" })],
              }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["á"]);

    expect(result.uncovered).toEqual([]);
  });

  it("counts coverage via a flick[direction] entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                flick: { ne: makeKey("K_A_ne", { text: "â" }) },
              }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["â"]);

    expect(result.uncovered).toEqual([]);
  });

  it("counts coverage via a multitap entry", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [
          {
            keys: [
              makeKey("K_A", {
                text: "a",
                multitap: [makeKey("K_A_mt", { text: "ã" })],
              }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["ã"]);

    expect(result.uncovered).toEqual([]);
  });

  it("marks a char on a layer with no nextlayer chain from default as uncovered", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
      // "shift" is never referenced by any nextlayer from "default".
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = touchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual(["A"]);
  });

  it("counts a nextlayer-reachable layer's chars as covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*", nextlayer: "shift" })] }],
      },
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = touchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not hang on a cycle in nextlayer references", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_TO_SHIFT", { text: "*Shift*", nextlayer: "shift" })] }],
      },
      {
        id: "shift",
        rows: [
          {
            keys: [
              makeKey("K_A_shift", { text: "A" }),
              makeKey("K_TO_DEFAULT", { text: "*Default*", nextlayer: "default" }),
            ],
          },
        ],
      },
    ]);

    const result = touchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("covers an NFC inventory char from an NFD-stored layout string", () => {
    // "e" + combining acute accent (U+0065 U+0301), NFD form of "é".
    const nfdText = "é";
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_E_ACUTE", { text: nfdText })] }] },
    ]);

    const result = touchCoverage(layout, ["é"]);

    expect(result.uncovered).toEqual([]);
  });

  it("returns an empty uncovered list when everything is covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_A", { text: "a" }), makeKey("K_B", { text: "b" })] }],
      },
    ]);

    const result = touchCoverage(layout, ["a", "b"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a star-label as producing its letters", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*" })] }] },
    ]);

    const result = touchCoverage(layout, ["S"]);

    expect(result.uncovered).toEqual(["S"]);
  });

  it("decodes a U_XXXX key id into the char it encodes", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("U_00E7")] }] },
    ]);

    const result = touchCoverage(layout, ["ç"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a spacer key (sp:10) as a producer", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("T_sp", { text: "a", sp: 10 })] }],
      },
    ]);

    const result = touchCoverage(layout, ["a"]);

    expect(result.uncovered).toEqual(["a"]);
  });
});
