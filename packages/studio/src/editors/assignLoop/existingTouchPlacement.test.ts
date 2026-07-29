import { describe, it, expect } from "vitest";
import type { TouchLayoutIR } from "@keyboard-studio/contracts";
import { describeExistingTouchPlacement } from "./existingTouchPlacement.ts";

/** Minimal single-platform/single-layer layout fixture builder. */
function layoutWithKeys(
  keys: TouchLayoutIR["platforms"][number]["layers"][number]["rows"][number]["keys"],
  layerId = "default",
): TouchLayoutIR {
  return {
    platforms: [
      {
        id: "phone",
        layers: [{ id: layerId, rows: [{ keys }] }],
      },
    ],
    nodeIds: [],
  };
}

describe("describeExistingTouchPlacement", () => {
  it("finds a char produced as a key's base text", () => {
    const layout = layoutWithKeys([{ nodeId: "n1", id: "K_U", text: "u" }]);
    expect(describeExistingTouchPlacement(layout, "u")).toEqual({
      hostKey: "K_U",
      role: "base",
      layerId: "default",
    });
  });

  it("finds a char produced as a key's output (distinct from its label text)", () => {
    const layout = layoutWithKeys([
      { nodeId: "n1", id: "T_shipped", text: "*", output: "€" },
    ]);
    expect(describeExistingTouchPlacement(layout, "€")).toEqual({
      hostKey: "T_shipped",
      role: "base",
      layerId: "default",
    });
  });

  it("finds a char decoded from a U_ key id with no text/output", () => {
    const layout = layoutWithKeys([{ nodeId: "n1", id: "U_00E9" }]);
    expect(describeExistingTouchPlacement(layout, "é")).toEqual({
      hostKey: "U_00E9",
      role: "base",
      layerId: "default",
    });
  });

  it("finds a char reachable only via a long-press sub-key", () => {
    const layout = layoutWithKeys([
      {
        nodeId: "n1",
        id: "K_U",
        text: "u",
        sk: [{ nodeId: "n2", id: "K_U_sk0", text: "ù" }],
      },
    ]);
    expect(describeExistingTouchPlacement(layout, "ù")).toEqual({
      hostKey: "K_U",
      role: "longpress",
      layerId: "default",
    });
  });

  it("finds a char reachable only via a flick gesture", () => {
    const layout = layoutWithKeys([
      {
        nodeId: "n1",
        id: "K_U",
        text: "u",
        flick: { n: { nodeId: "n2", id: "K_U_flick_n", text: "ú" } },
      },
    ]);
    expect(describeExistingTouchPlacement(layout, "ú")).toEqual({
      hostKey: "K_U",
      role: "flick",
      layerId: "default",
    });
  });

  it("finds a char reachable only via a multitap step", () => {
    const layout = layoutWithKeys([
      {
        nodeId: "n1",
        id: "K_U",
        text: "u",
        multitap: [{ nodeId: "n2", id: "K_U_mt0", text: "û" }],
      },
    ]);
    expect(describeExistingTouchPlacement(layout, "û")).toEqual({
      hostKey: "K_U",
      role: "multitap",
      layerId: "default",
    });
  });

  it("reports the layer the key was found on", () => {
    const layout: TouchLayoutIR = {
      platforms: [
        {
          id: "phone",
          layers: [
            { id: "default", rows: [{ keys: [{ nodeId: "n1", id: "K_U", text: "u" }] }] },
            { id: "shift", rows: [{ keys: [{ nodeId: "n2", id: "K_U", text: "U" }] }] },
          ],
        },
      ],
      nodeIds: [],
    };
    expect(describeExistingTouchPlacement(layout, "U")).toEqual({
      hostKey: "K_U",
      role: "base",
      layerId: "shift",
    });
  });

  it("ignores a spacer key even if its text happens to match", () => {
    const layout = layoutWithKeys([{ nodeId: "n1", id: "T_spacer", text: "u", sp: 8 }]);
    expect(describeExistingTouchPlacement(layout, "u")).toBeNull();
  });

  it("ignores a star-label key (menu indicator, not a real placement)", () => {
    const layout = layoutWithKeys([{ nodeId: "n1", id: "K_U", text: "*" }]);
    expect(describeExistingTouchPlacement(layout, "*")).toBeNull();
  });

  it("returns null when the char is not found anywhere in the layout", () => {
    const layout = layoutWithKeys([{ nodeId: "n1", id: "K_A", text: "a" }]);
    expect(describeExistingTouchPlacement(layout, "z")).toBeNull();
  });
});
