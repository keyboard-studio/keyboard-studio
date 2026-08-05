/**
 * Unit tests for enumerateTouchMethodsForChar.
 *
 * Coverage:
 *   1. Main key (U_ id) — deletable, structured fields.
 *   2. Main key with `output` — deletable.
 *   3. Main key, K_-id + `text` only, no `output`, no `nextlayer` — deletable
 *      (fix: a plain letter key is genuinely deletable; the WRITE side
 *      neutralizes its id unconditionally so the underlying `.kmn` rule can't
 *      leak through).
 *   3b. Main key, K_-id with no `text`/`output` and a non-`U_` id — `host` is
 *       `undefined`, not the raw id (fix: raw-identifier leak).
 *   4. Main key with `nextlayer` — NOT deletable (layer-switch guard).
 *   5. Longpress (sk[]) — always deletable, references the host key.
 *   6. Multitap — always deletable.
 *   7. Flick — always deletable, `direction` field set.
 *   8. NFC/NFD canonical matching.
 *   9. No match anywhere — empty result.
 *   10. Multiple platforms/layers — every producing method is listed.
 */

import { describe, it, expect } from "vitest";
import { enumerateTouchMethodsForChar } from "./enumerateTouchMethodsForChar.js";
import type { TouchLayoutIR, TouchKeyIR } from "@keyboard-studio/contracts";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeKey(id: string, overrides: Partial<TouchKeyIR> = {}): TouchKeyIR {
  return { nodeId: `node_${id}`, id, ...overrides };
}

function makeLayout(
  phoneDefaultKeys: TouchKeyIR[],
  options: { tabletPlatform?: TouchKeyIR[]; extraPhoneLayer?: { id: string; keys: TouchKeyIR[] } } = {},
): TouchLayoutIR {
  const phoneLayers: TouchLayoutIR["platforms"][number]["layers"] = [
    { id: "default", rows: [{ keys: phoneDefaultKeys }] },
  ];
  if (options.extraPhoneLayer) {
    phoneLayers.push({ id: options.extraPhoneLayer.id, rows: [{ keys: options.extraPhoneLayer.keys }] });
  }

  const platforms: TouchLayoutIR["platforms"] = [{ id: "phone", layers: phoneLayers }];

  if (options.tabletPlatform) {
    platforms.push({
      id: "tablet",
      layers: [{ id: "default", rows: [{ keys: options.tabletPlatform }] }],
    });
  }

  return { platforms, nodeIds: [] };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("enumerateTouchMethodsForChar", () => {
  it("finds a U_-id main key and marks it deletable with structured fields", () => {
    const layout = makeLayout([makeKey("U_0061", { text: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toEqual([
      {
        id: "phone:default:U_0061",
        kind: "tap",
        host: "a",
        producedChar: "a",
        platform: "phone",
        layer: "default",
        deletable: true,
      },
    ]);
  });

  it("finds a main key whose char comes from `output` and marks it deletable", () => {
    const layout = makeLayout([makeKey("K_X", { text: "a", output: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result[0]).toMatchObject({ id: "phone:default:K_X", kind: "tap", deletable: true });
  });

  it("marks a K_-id, text-only main key (plain letter key) as deletable (fix: was falsely non-deletable)", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("phone:default:K_A");
    expect(result[0]!.deletable).toBe(true);
    expect(result[0]!.reasonCode).toBeUndefined();
  });

  it("omits `host` (rather than leaking the raw id) for a host key with no text/output and a non-U_ id", () => {
    const layout = makeLayout([
      makeKey("K_A", {
        sk: [makeKey("U_00E1", { text: "á" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toHaveLength(1);
    expect(result[0]!.host).toBeUndefined();
    expect(Object.hasOwn(result[0]!, "host")).toBe(false);
  });

  it("marks a main key with `nextlayer` as NOT deletable (layer-switch guard)", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a", nextlayer: "shift" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toHaveLength(1);
    expect(result[0]!.deletable).toBe(false);
    expect(result[0]!.reasonCode).toBe("layer-switch");
  });

  it("finds a longpress (sk[]) entry and sets host to the host key's display", () => {
    const layout = makeLayout([
      makeKey("U_0061", {
        text: "a",
        sk: [makeKey("U_00E1", { text: "á" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toEqual([
      {
        id: "phone:default:U_0061:sk:U_00E1",
        kind: "longpress",
        host: "a",
        producedChar: "á",
        platform: "phone",
        layer: "default",
        deletable: true,
      },
    ]);
  });

  it("surfaces the sk sub-entry's own layerAnnotation when present (placement-priors v2)", () => {
    const layout = makeLayout([
      makeKey("U_0065", {
        text: "e",
        sk: [makeKey("U_025B", { text: "ɛ", layerAnnotation: "rightalt" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "ɛ");

    expect(result).toEqual([
      {
        id: "phone:default:U_0065:sk:U_025B",
        kind: "longpress",
        host: "e",
        producedChar: "ɛ",
        platform: "phone",
        layer: "default",
        skLayerAnnotation: "rightalt",
        deletable: true,
      },
    ]);
  });

  it("omits skLayerAnnotation when the sk sub-entry carries no layer annotation", () => {
    const layout = makeLayout([
      makeKey("U_0061", {
        text: "a",
        sk: [makeKey("U_00E1", { text: "á" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result[0]).not.toHaveProperty("skLayerAnnotation");
  });

  it("finds a multitap entry", () => {
    const layout = makeLayout([
      makeKey("U_0065", {
        text: "e",
        multitap: [makeKey("U_00E9", { text: "é" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "é");

    expect(result).toEqual([
      {
        id: "phone:default:U_0065:multitap:U_00E9",
        kind: "multitap",
        host: "e",
        producedChar: "é",
        platform: "phone",
        layer: "default",
        deletable: true,
      },
    ]);
  });

  it("finds a flick entry and sets the `direction` field", () => {
    const layout = makeLayout([
      makeKey("U_006E", {
        text: "n",
        flick: { ne: makeKey("U_00F1", { text: "ñ" }) },
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "ñ");

    expect(result).toEqual([
      {
        id: "phone:default:U_006E:flick:ne",
        kind: "flick",
        host: "n",
        producedChar: "ñ",
        platform: "phone",
        layer: "default",
        direction: "ne",
        deletable: true,
      },
    ]);
  });

  it("matches canonically — an NFD-stored key text matches an NFC query char", () => {
    const nfdA = "á"; // "á" as base + combining acute
    const layout = makeLayout([makeKey("U_00E1", { text: nfdA })]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("phone:default:U_00E1");
    expect(result[0]!.deletable).toBe(true);
  });

  it("skips a main key whose id is K_BKSP even if it happens to match (defensive backspace filter)", () => {
    const layout = makeLayout([makeKey("K_BKSP", { text: "a" })]);

    expect(enumerateTouchMethodsForChar(layout, "a")).toEqual([]);
  });

  it("skips a longpress/multitap/flick sub-entry whose id is K_BKSP (defensive backspace filter)", () => {
    const layout = makeLayout([
      makeKey("U_0061", {
        text: "a",
        sk: [makeKey("K_BKSP", { text: "b" })],
        multitap: [makeKey("K_BKSP", { text: "c" })],
        flick: { ne: makeKey("K_BKSP", { text: "d" }) },
      }),
    ]);

    expect(enumerateTouchMethodsForChar(layout, "b")).toEqual([]);
    expect(enumerateTouchMethodsForChar(layout, "c")).toEqual([]);
    expect(enumerateTouchMethodsForChar(layout, "d")).toEqual([]);
  });

  it("returns an empty list when nothing produces the character", () => {
    const layout = makeLayout([makeKey("U_0061", { text: "a" })]);

    expect(enumerateTouchMethodsForChar(layout, "z")).toEqual([]);
  });

  it("lists every producing method across multiple platforms/layers", () => {
    const layout = makeLayout(
      [makeKey("U_0061", { text: "a" })],
      {
        tabletPlatform: [makeKey("U_0061", { text: "a" })],
        extraPhoneLayer: { id: "shift", keys: [makeKey("U_0061", { text: "a" })] },
      },
    );

    const result = enumerateTouchMethodsForChar(layout, "a");
    const ids = result.map((r) => r.id).sort();

    expect(ids).toEqual([
      "phone:default:U_0061",
      "phone:shift:U_0061",
      "tablet:default:U_0061",
    ]);
  });
});
