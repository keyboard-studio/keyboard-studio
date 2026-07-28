import { describe, it, expect } from "vitest";
import {
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

  it("does not validate segments — an empty keyId still round-trips into the naive format", () => {
    // No `:` splitting/parsing is exported by this module (see the module doc:
    // only builders exist), so an empty segment simply collapses to a
    // double-colon rather than being rejected.
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
