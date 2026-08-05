import { describe, it, expect } from "vitest";
import {
  parseTouchKeyAddress,
  touchKeyAddress,
  touchSubKeyAddress,
  touchFlickAddress,
} from "./touchKeyAddress.js";

describe("touchKeyAddress", () => {
  it("builds the main-key address as \"<platform>:<layerId>:<keyId>\"", () => {
    expect(touchKeyAddress("phone", "default", "U_0061")).toBe("phone:default:U_0061");
  });

  it("builds distinct addresses for different platforms/layers/keys", () => {
    expect(touchKeyAddress("tablet", "shift", "K_A")).toBe("tablet:shift:K_A");
    expect(touchKeyAddress("phone", "default", "U_0061")).not.toBe(
      touchKeyAddress("tablet", "default", "U_0061"),
    );
  });

  it("does not validate segments — an empty keyId still builds a (degenerate) address", () => {
    // The builders never validate; an empty segment simply collapses to a
    // double-colon. `parseTouchKeyAddress` is the side that rejects it (see the
    // non-address suite below), so the degenerate string is buildable but not
    // parseable — deliberately asymmetric.
    expect(touchKeyAddress("phone", "default", "")).toBe("phone:default:");
  });
});

describe("touchSubKeyAddress", () => {
  it("builds the longpress (sk) sub-entry address with a :sk: suffix", () => {
    expect(touchSubKeyAddress("phone", "default", "U_0061", "sk", "U_00E1")).toBe(
      "phone:default:U_0061:sk:U_00E1",
    );
  });

  it("builds the multitap sub-entry address with a :multitap: suffix", () => {
    expect(touchSubKeyAddress("phone", "default", "U_0061", "multitap", "U_00E2")).toBe(
      "phone:default:U_0061:multitap:U_00E2",
    );
  });

  it("shares the same main-key prefix as touchKeyAddress for the same platform/layer/key", () => {
    const mainAddress = touchKeyAddress("phone", "default", "U_0061");
    const subAddress = touchSubKeyAddress("phone", "default", "U_0061", "sk", "U_00E1");
    expect(subAddress.startsWith(`${mainAddress}:`)).toBe(true);
  });

  it("sk and multitap sub-entries with the same subId produce distinct addresses (kind disambiguates)", () => {
    const skAddress = touchSubKeyAddress("phone", "default", "U_0061", "sk", "U_00E1");
    const multitapAddress = touchSubKeyAddress("phone", "default", "U_0061", "multitap", "U_00E1");
    expect(skAddress).not.toBe(multitapAddress);
  });

  it("handles an empty subId without throwing", () => {
    expect(touchSubKeyAddress("phone", "default", "U_0061", "sk", "")).toBe(
      "phone:default:U_0061:sk:",
    );
  });
});

describe("touchFlickAddress", () => {
  it("builds the flick sub-entry address with a :flick: suffix", () => {
    expect(touchFlickAddress("phone", "default", "U_0061", "n")).toBe(
      "phone:default:U_0061:flick:n",
    );
  });

  it("shares the same main-key prefix as touchKeyAddress for the same platform/layer/key", () => {
    const mainAddress = touchKeyAddress("phone", "default", "U_0061");
    const flickAddress = touchFlickAddress("phone", "default", "U_0061", "nw");
    expect(flickAddress.startsWith(`${mainAddress}:`)).toBe(true);
  });

  it("distinguishes flick from sk/multitap sub-entries sharing the same key and direction/subId string", () => {
    const flickAddress = touchFlickAddress("phone", "default", "U_0061", "n");
    const skAddress = touchSubKeyAddress("phone", "default", "U_0061", "sk", "n");
    const multitapAddress = touchSubKeyAddress("phone", "default", "U_0061", "multitap", "n");
    expect(flickAddress).not.toBe(skAddress);
    expect(flickAddress).not.toBe(multitapAddress);
  });

  it("handles an empty direction without throwing", () => {
    expect(touchFlickAddress("phone", "default", "U_0061", "")).toBe(
      "phone:default:U_0061:flick:",
    );
  });
});

describe("parseTouchKeyAddress — round-trip against all three builders", () => {
  it("round-trips a main-key address", () => {
    expect(parseTouchKeyAddress(touchKeyAddress("phone", "default", "T_0300"))).toEqual({
      platform: "phone",
      layerId: "default",
      keyId: "T_0300",
    });
  });

  it("round-trips an sk (longpress) sub-key address", () => {
    const built = touchSubKeyAddress("phone", "shift", "T_0021", "sk", "U_00A1");
    expect(parseTouchKeyAddress(built)).toEqual({
      platform: "phone",
      layerId: "shift",
      keyId: "T_0021",
      sub: { kind: "sk", id: "U_00A1" },
    });
  });

  it("round-trips a multitap sub-key address", () => {
    const built = touchSubKeyAddress("tablet", "rightalt-caps", "T_E", "multitap", "U_00E9");
    expect(parseTouchKeyAddress(built)).toEqual({
      platform: "tablet",
      layerId: "rightalt-caps",
      keyId: "T_E",
      sub: { kind: "multitap", id: "U_00E9" },
    });
  });

  it("round-trips a flick address", () => {
    const built = touchFlickAddress("phone", "symbol", "T_A", "nw");
    expect(parseTouchKeyAddress(built)).toEqual({
      platform: "phone",
      layerId: "symbol",
      keyId: "T_A",
      sub: { kind: "flick", id: "nw" },
    });
  });

  it("round-trips the main and sk builders across the standard layer-id vocabulary", () => {
    for (const layerId of [
      "default",
      "shift",
      "caps",
      "rightalt",
      "rightalt-shift",
      "symbol-caps",
    ]) {
      expect(parseTouchKeyAddress(touchKeyAddress("phone", layerId, "K_A"))).toEqual({
        platform: "phone",
        layerId,
        keyId: "K_A",
      });
      expect(
        parseTouchKeyAddress(touchSubKeyAddress("phone", layerId, "K_A", "sk", "U_0041")),
      ).toEqual({
        platform: "phone",
        layerId,
        keyId: "K_A",
        sub: { kind: "sk", id: "U_0041" },
      });
    }
  });
});

describe("parseTouchKeyAddress — non-addresses return undefined, never throw", () => {
  it.each([
    ["empty string", ""],
    ["single field", "phone"],
    ["two fields only", "phone:default"],
    ["empty platform", ":default:T_A"],
    ["empty layer", "phone::T_A"],
    ["empty key id", "phone:default:"],
    ["empty sub id", "phone:default:T_A:sk:"],
  ])("returns undefined for %s", (_label, input) => {
    expect(parseTouchKeyAddress(input)).toBeUndefined();
  });

  it("does not throw on a non-string input", () => {
    // Overlay replay reads addresses out of a persisted draft, which is
    // `unknown` at the boundary — a malformed entry must be reportable as an
    // orphaned operation, not fatal.
    expect(() => parseTouchKeyAddress(undefined as unknown as string)).not.toThrow();
    expect(parseTouchKeyAddress(undefined as unknown as string)).toBeUndefined();
  });
});

describe("parseTouchKeyAddress — the colon-bearing-id case, pinned", () => {
  // The `T_*` id grammar accepts any run of non-whitespace, so a colon inside a
  // key id is legal. Platform and layer ids come from fixed vocabularies and
  // never contain one, so the parse anchors from both ends.
  it("keeps interior colons in the key id of a main-key address", () => {
    expect(parseTouchKeyAddress("phone:default:T_A:B")).toEqual({
      platform: "phone",
      layerId: "default",
      keyId: "T_A:B",
    });
  });

  it("keeps interior colons in the key id of a sub-key address", () => {
    const built = touchSubKeyAddress("phone", "default", "T_A:B", "sk", "U_0041");
    expect(built).toBe("phone:default:T_A:B:sk:U_0041");
    expect(parseTouchKeyAddress(built)).toEqual({
      platform: "phone",
      layerId: "default",
      keyId: "T_A:B",
      sub: { kind: "sk", id: "U_0041" },
    });
  });

  it("does not treat an unrecognized field as a sub-kind", () => {
    expect(parseTouchKeyAddress("phone:default:T_A:frob:X")).toEqual({
      platform: "phone",
      layerId: "default",
      keyId: "T_A:frob:X",
    });
  });

  it("PINNED AMBIGUITY: a key id literally ending in `:sk:<id>` reads as a sub-entry", () => {
    // The two builders produce the SAME string here, so no parser can separate
    // them. The sub-entry reading is pinned because it is what both the
    // deletion overlay and the key-edit overlay mean by that address.
    const asMain = touchKeyAddress("phone", "default", "T_A:sk:U_0041");
    const asSub = touchSubKeyAddress("phone", "default", "T_A", "sk", "U_0041");
    expect(asMain).toBe(asSub);
    expect(parseTouchKeyAddress(asMain)).toEqual({
      platform: "phone",
      layerId: "default",
      keyId: "T_A",
      sub: { kind: "sk", id: "U_0041" },
    });
  });
});
