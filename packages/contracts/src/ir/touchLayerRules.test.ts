import { describe, expect, it } from "vitest";
import {
  isTouchOneShotKey,
  keymanModifierLayerId,
  TOUCH_CAPS_FROM_SHIFT,
  touchDoubleTapTarget,
  touchModifierKeyPatch,
  unshiftedTouchLayerId,
} from "./touchLayerRules";

const ids = (...l: string[]) => new Set(l);

describe("unshiftedTouchLayerId", () => {
  it("maps shift and caps layers to the layer Shift returns to", () => {
    const all = ids("default", "shift", "caps", "rightalt", "rightalt-shift", "rightalt-caps", "ctrl", "shift-ctrl", "ctrl-caps");
    expect(unshiftedTouchLayerId("shift", all)).toBe("default");
    expect(unshiftedTouchLayerId("caps", all)).toBe("default");
    expect(unshiftedTouchLayerId("rightalt-shift", all)).toBe("rightalt");
    expect(unshiftedTouchLayerId("rightalt-caps", all)).toBe("rightalt");
    expect(unshiftedTouchLayerId("shift-ctrl", all)).toBe("ctrl");
  });

  it("is undefined for other layers and for a target that does not exist", () => {
    expect(unshiftedTouchLayerId("default", ids("default"))).toBeUndefined();
    expect(unshiftedTouchLayerId("shift-ralt", ids("shift-ralt"))).toBeUndefined();
  });
});

describe("touchDoubleTapTarget", () => {
  it("names the caps layer only when it exists", () => {
    expect(touchDoubleTapTarget("rightalt", ids("rightalt", "rightalt-caps"))).toBe("rightalt-caps");
    expect(touchDoubleTapTarget("rightalt", ids("rightalt"))).toBeUndefined();
    expect(touchDoubleTapTarget("symbol", ids("symbol", "caps"))).toBeUndefined();
  });
});

describe("isTouchOneShotKey", () => {
  it("excludes special, active, deadkey, blank and spacer keys, wire or IR form", () => {
    for (const sp of [1, 2, 8, 9, 10, "1", "2", "8", "9", "10"]) expect(isTouchOneShotKey(sp)).toBe(false);
    for (const sp of [undefined, 0, "0"]) expect(isTouchOneShotKey(sp)).toBe(true);
  });
});

describe("touchModifierKeyPatch", () => {
  const layers = ids("default", "shift", "caps", "rightalt", "rightalt-shift", "ctrl");

  it("is empty for keys that are not Ctrl/RAlt keys, blank keys, and consistent keys", () => {
    expect(touchModifierKeyPatch("default", { id: "K_Q", text: "ctrl" }, layers)).toEqual({});
    expect(touchModifierKeyPatch("default", { id: "K_LCONTROL", text: "ctrl", sp: "9" }, layers)).toEqual({});
    expect(
      touchModifierKeyPatch("default", { id: "K_RALT", text: "*RAlt*", sp: 1, nextlayer: "rightalt" }, layers),
    ).toEqual({});
  });

  it("repairs legacy labels, ids, style and target layer", () => {
    expect(touchModifierKeyPatch("default", { id: "K_LCONTROL", text: "RALT", nextlayer: "rightalt" }, layers)).toEqual({
      id: "K_RALT",
      text: "*RAlt*",
    });
    expect(touchModifierKeyPatch("shift", { id: "K_RALT", text: "RALT", nextlayer: "rightalt" }, layers)).toEqual({
      text: "*RAlt*",
      nextlayer: "rightalt-shift",
    });
    expect(touchModifierKeyPatch("rightalt", { id: "K_LCONTROL", text: "default", sp: "1" }, layers)).toEqual({
      id: "K_RALT",
      text: "*RAlt*",
      sp: 2,
    });
    expect(touchModifierKeyPatch("default", { id: "K_LCONTROL", text: "ctrl" }, layers)).toEqual({
      text: "*Ctrl*",
      nextlayer: "ctrl",
    });
  });
});

describe("Keyman layer ids", () => {
  it("names modifier layers in Keyman's order", () => {
    expect(keymanModifierLayerId([])).toBe("default");
    expect(keymanModifierLayerId(["ctrl", "shift"])).toBe("shift-ctrl");
    expect(keymanModifierLayerId(["caps", "rightalt"])).toBe("rightalt-caps");
  });

  it("pairs each standard shift layer with its caps layer", () => {
    const pairs = new Map(TOUCH_CAPS_FROM_SHIFT);
    expect(pairs.get("shift")).toBe("caps");
    expect(pairs.get("rightalt-shift")).toBe("rightalt-caps");
    expect(pairs.get("shift-ctrl")).toBe("ctrl-caps");
    expect(pairs.has("ctrl-shift")).toBe(false);
  });

  it("double-tap from ctrl reaches ctrl-caps", () => {
    expect(touchDoubleTapTarget("ctrl", new Set(["ctrl", "ctrl-caps"]))).toBe("ctrl-caps");
  });
});
