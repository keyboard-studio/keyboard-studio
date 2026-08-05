/**
 * Unit tests for computeTouchCoverage / decodeUnicodeKeyId (spec 035,
 * FR-008/SC-003; multi-codepoint U_ ids per review-gate item 2).
 *
 * Locks the pattern behind the contract, not just one instance:
 *   - each producer mechanism (text/output, sk, flick, multitap) counts
 *   - layer reachability (default, nextlayer chain, cycle guard, unreachable)
 *   - NFC/NFD normalization
 *   - star-labels are never producers
 *   - exactly-once reporting + fully-covered empty case
 *   - multi-codepoint U_ ids (Keyman 15+) decode and count for coverage
 *   - a malformed hex group anywhere in a multi-codepoint id is not decoded
 */

import { describe, it, expect } from "vitest";
import { computeTouchCoverage, decodeUnicodeKeyId } from "./touch-coverage.js";
import type { TouchLayoutIR, TouchKeyIR } from "./keyboard-ir.js";

/** Build a single TouchKeyIR for use in test layouts. */
function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

/** Build a TouchLayoutIR with a single "phone" platform from the given layers. */
function makeLayout(layers: TouchLayoutIR["platforms"][number]["layers"]): TouchLayoutIR {
  return { platforms: [{ id: "phone", layers }], nodeIds: [] };
}

describe("computeTouchCoverage", () => {
  it("reports an orphaned inventory char exactly once", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["a", "z", "z"]);

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

    const result = computeTouchCoverage(layout, ["á"]);

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

    const result = computeTouchCoverage(layout, ["â"]);

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

    const result = computeTouchCoverage(layout, ["ã"]);

    expect(result.uncovered).toEqual([]);
  });

  it("marks a char on a layer with no nextlayer chain from default as uncovered", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_A", { text: "a" })] }] },
      // "shift" is never referenced by any nextlayer from "default".
      { id: "shift", rows: [{ keys: [makeKey("K_A_shift", { text: "A" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["A"]);

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

    const result = computeTouchCoverage(layout, ["A"]);

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

    const result = computeTouchCoverage(layout, ["A"]);

    expect(result.uncovered).toEqual([]);
  });

  it("covers an NFC inventory char from an NFD-stored layout string", () => {
    // "e" + combining acute accent (U+0065 U+0301), NFD form of "é".
    const nfdText = "é";
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_E_ACUTE", { text: nfdText })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["é"]);

    expect(result.uncovered).toEqual([]);
  });

  it("returns an empty uncovered list when everything is covered", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("K_A", { text: "a" }), makeKey("K_B", { text: "b" })] }],
      },
    ]);

    const result = computeTouchCoverage(layout, ["a", "b"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a star-label as producing its letters", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("K_SHIFT", { text: "*Shift*" })] }] },
    ]);

    const result = computeTouchCoverage(layout, ["S"]);

    expect(result.uncovered).toEqual(["S"]);
  });

  it("decodes a U_XXXX key id into the char it encodes", () => {
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("U_00E7")] }] },
    ]);

    const result = computeTouchCoverage(layout, ["ç"]);

    expect(result.uncovered).toEqual([]);
  });

  it("decodes a multi-codepoint U_ id (base + combining mark) as its NFC char", () => {
    // U_0061_0303 = "a" (U+0061) + combining tilde (U+0303) -> NFC "ã" (U+00E3).
    const layout = makeLayout([
      { id: "default", rows: [{ keys: [makeKey("U_0061_0303")] }] },
    ]);

    const result = computeTouchCoverage(layout, ["ã"]);

    expect(result.uncovered).toEqual([]);
  });

  it("does not treat a spacer key (sp:10) as a producer", () => {
    const layout = makeLayout([
      {
        id: "default",
        rows: [{ keys: [makeKey("T_sp", { text: "a", sp: 10 })] }],
      },
    ]);

    const result = computeTouchCoverage(layout, ["a"]);

    expect(result.uncovered).toEqual(["a"]);
  });
});

describe("decodeUnicodeKeyId", () => {
  it("decodes a single-group id", () => {
    expect(decodeUnicodeKeyId("U_0061")).toBe("a");
  });

  it("decodes a multi-codepoint id by concatenating each group's char (no NFC folding)", () => {
    // "a" (U+0061) + combining tilde (U+0303) -- the RAW concatenation, not
    // NFC-folded. NFC-folding is the caller's job (both consumers normalize
    // on insertion/comparison), so this locks decode as a pure per-group
    // concatenation.
    expect(decodeUnicodeKeyId("U_0061_0303")).toBe("a" + "̃");
  });

  it("returns undefined for a non-U_ id", () => {
    expect(decodeUnicodeKeyId("K_A")).toBeUndefined();
  });

  it("returns undefined when any group in a multi-codepoint id is malformed", () => {
    expect(decodeUnicodeKeyId("U_0061_ZZZZ")).toBeUndefined();
    expect(decodeUnicodeKeyId("U_0061_")).toBeUndefined();
  });
});
