/**
 * Touch-layout reader/parser unit tests (spec 041 US2, T023).
 */

import { describe, it, expect } from "vitest";

import {
  parseTouchLayout,
  comboMechanismCounts,
  layerIds,
  hasSymbolLayer,
  modifierLayerIds,
  classifyNumberRow,
} from "./touch-layout.js";

/** A compact but representative touch layout for the accessor tests. */
const RICH = JSON.stringify({
  phone: {
    layer: [
      {
        id: "default",
        row: [
          { id: 1, key: [{ id: "K_1", text: "1" }, { id: "K_2", text: "2" }] },
          {
            id: 2,
            key: [
              { id: "K_A", text: "a", sk: [{ id: "U_00e1", text: "á" }] },
              { id: "K_O", text: "o", multitap: [{ id: "U_00f6", text: "ö" }] },
              { id: "K_S", text: "s", flick: { n: { id: "U_0161", text: "š" } } },
            ],
          },
          {
            id: 3,
            key: [
              { id: "K_SHIFT", text: "*Shift*", nextlayer: "shift" },
              { id: "K_NUM", text: "*123*", nextlayer: "symbol" },
              { id: "K_ALT", text: "alt", nextlayer: "alt" },
            ],
          },
        ],
      },
      { id: "shift", row: [{ id: 1, key: [{ id: "K_A", text: "A" }] }] },
      { id: "symbol", row: [{ id: 1, key: [{ id: "K_HY", text: "-" }] }] },
      { id: "alt", row: [{ id: 1, key: [{ id: "U_20ac", text: "€" }] }] },
      { id: "rightalt", row: [{ id: 1, key: [{ id: "U_00a7", text: "§" }] }] },
    ],
  },
});

describe("parseTouchLayout", () => {
  it("returns null for a non-JSON file", () => {
    expect(parseTouchLayout("not json {")).toBeNull();
  });

  it("returns null when no known platform is present", () => {
    expect(parseTouchLayout(JSON.stringify({ nonsense: {} }))).toBeNull();
  });

  it("strips a leading BOM before parsing", () => {
    const model = parseTouchLayout("﻿" + RICH);
    expect(model).not.toBeNull();
    expect(model!.platforms[0]!.id).toBe("phone");
  });

  it("normalizes keys, rows, and layers", () => {
    const model = parseTouchLayout(RICH)!;
    expect(layerIds(model)).toEqual(["alt", "default", "rightalt", "shift", "symbol"]);
  });
});

describe("comboMechanismCounts", () => {
  it("tallies each mechanism a key offers", () => {
    const counts = comboMechanismCounts(parseTouchLayout(RICH)!);
    // K_A → longpress, K_O → multitap, K_S → flick.
    expect(counts.longpress).toBe(1);
    expect(counts.multitap).toBe(1);
    expect(counts.flick).toBe(1);
    // Three nextlayer keys (shift/symbol/alt switches).
    expect(counts.layer).toBe(3);
    // Plain output keys with no other affordance: K_1, K_2, A, -, €, §.
    expect(counts.key).toBe(6);
  });

  it("counts a longpress key as longpress only (not also key)", () => {
    const counts = comboMechanismCounts(
      parseTouchLayout(JSON.stringify({ phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a", sk: [{ text: "á" }] }] }] }] } }))!,
    );
    expect(counts.longpress).toBe(1);
    expect(counts.key).toBeUndefined();
  });
});

describe("hasSymbolLayer", () => {
  it("true when a symbol layer exists", () => {
    expect(hasSymbolLayer(parseTouchLayout(RICH)!)).toBe(true);
  });
  it("false when no symbol layer exists", () => {
    const model = parseTouchLayout(JSON.stringify({ phone: { layer: [{ id: "default", row: [] }, { id: "shift", row: [] }] } }))!;
    expect(hasSymbolLayer(model)).toBe(false);
  });
});

describe("modifierLayerIds", () => {
  it("finds ALT/CTRL-family layers, skips standard layers", () => {
    expect(modifierLayerIds(parseTouchLayout(RICH)!)).toEqual(["alt", "rightalt"]);
  });
});

describe("classifyNumberRow", () => {
  it("digits when the default top row is digits", () => {
    expect(classifyNumberRow(parseTouchLayout(RICH)!)).toBe("digits");
  });

  it("absent when the top row is the normal letter row (3–4 rows)", () => {
    const model = parseTouchLayout(
      JSON.stringify({
        phone: {
          layer: [
            {
              id: "default",
              row: [
                { id: 1, key: [{ id: "K_Q", text: "q" }, { id: "K_W", text: "w" }] },
                { id: 2, key: [{ id: "K_A", text: "a" }] },
                { id: 3, key: [{ id: "K_Z", text: "z" }] },
              ],
            },
          ],
        },
      }),
    )!;
    expect(classifyNumberRow(model)).toBe("absent");
  });

  it("letters when a 5-row layer's top row is letters (extra row present)", () => {
    const model = parseTouchLayout(
      JSON.stringify({
        phone: {
          layer: [
            {
              id: "default",
              row: [
                { id: 1, key: [{ id: "K_X", text: "x" }, { id: "K_Y", text: "y" }] },
                { id: 2, key: [{ id: "K_Q", text: "q" }] },
                { id: 3, key: [{ id: "K_A", text: "a" }] },
                { id: 4, key: [{ id: "K_Z", text: "z" }] },
                { id: 5, key: [{ id: "K_SP", text: "" }] },
              ],
            },
          ],
        },
      }),
    )!;
    expect(classifyNumberRow(model)).toBe("letters");
  });

  it("mixed when one layer's slot is digits and another's is letters", () => {
    const model = parseTouchLayout(
      JSON.stringify({
        phone: {
          layer: [
            { id: "default", row: [{ id: 1, key: [{ id: "K_1", text: "1" }] }] },
            {
              id: "extra",
              row: [
                { id: 1, key: [{ id: "K_X", text: "x" }] },
                { id: 2, key: [{ id: "K_Q", text: "q" }] },
                { id: 3, key: [{ id: "K_A", text: "a" }] },
                { id: 4, key: [{ id: "K_Z", text: "z" }] },
                { id: 5, key: [{ id: "K_M", text: "m" }] },
              ],
            },
          ],
        },
      }),
    )!;
    expect(classifyNumberRow(model)).toBe("mixed");
  });
});
