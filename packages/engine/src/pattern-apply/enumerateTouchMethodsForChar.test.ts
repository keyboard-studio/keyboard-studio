/**
 * Unit tests for enumerateTouchMethodsForChar.
 *
 * Coverage:
 *   1. Main key (U_ id) — deletable, correct address + label.
 *   2. Main key with `output` — deletable (output overrides desktop passthrough).
 *   3. Main key, K_-id + `text` only, no `output` — NOT deletable (desktop-backed).
 *   4. Longpress (sk[]) — always deletable, label references the host key.
 *   5. Multitap — always deletable.
 *   6. Flick — always deletable, address encodes the direction.
 *   7. NFC/NFD canonical matching.
 *   8. No match anywhere — empty result.
 *   9. Multiple platforms/layers — every producing method is listed.
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
  it("finds a U_-id main key and marks it deletable", () => {
    const layout = makeLayout([makeKey("U_0061", { text: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toEqual([
      { id: "phone:default:U_0061", label: "key on phone default layer", deletable: true },
    ]);
  });

  it("finds a main key whose char comes from `output` and marks it deletable", () => {
    const layout = makeLayout([makeKey("K_X", { text: "a", output: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toEqual([
      { id: "phone:default:K_X", label: "key on phone default layer", deletable: true },
    ]);
  });

  it("marks a K_-id, text-only main key (desktop passthrough) as NOT deletable", () => {
    const layout = makeLayout([makeKey("K_A", { text: "a" })]);

    const result = enumerateTouchMethodsForChar(layout, "a");

    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("phone:default:K_A");
    expect(result[0]!.deletable).toBe(false);
    expect(result[0]!.reason).toBeDefined();
  });

  it("finds a longpress (sk[]) entry and labels it against the host key", () => {
    const layout = makeLayout([
      makeKey("U_0061", {
        text: "a",
        sk: [makeKey("U_00E1", { text: "á" })],
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toEqual([
      { id: "phone:default:U_0061:sk:U_00E1", label: "long-press on a", deletable: true },
    ]);
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
      { id: "phone:default:U_0065:multitap:U_00E9", label: "multitap on e", deletable: true },
    ]);
  });

  it("finds a flick entry and encodes the direction in the address", () => {
    const layout = makeLayout([
      makeKey("U_006E", {
        text: "n",
        flick: { ne: makeKey("U_00F1", { text: "ñ" }) },
      }),
    ]);

    const result = enumerateTouchMethodsForChar(layout, "ñ");

    expect(result).toEqual([
      { id: "phone:default:U_006E:flick:ne", label: "flick ne on n", deletable: true },
    ]);
  });

  it("matches canonically — an NFD-stored key text matches an NFC query char", () => {
    const nfdA = "á"; // "á" as base + combining acute
    const layout = makeLayout([makeKey("U_00E1", { text: nfdA })]);

    const result = enumerateTouchMethodsForChar(layout, "á");

    expect(result).toEqual([
      { id: "phone:default:U_00E1", label: "key on phone default layer", deletable: true },
    ]);
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
