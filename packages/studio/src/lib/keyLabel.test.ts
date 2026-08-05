// Unit tests for lib/keyLabel.ts — the desktop physical-key display
// convention behind the key-naming-ambiguity fix: an ordinary letter key is
// named by its unshifted, LOWERCASE glyph ("q"), never the bare uppercase
// vkey letter (which reads as the capital CHARACTER, not the physical key).
// Digits/symbols/named keys keep vkeyLabel's existing resolution unchanged.

import { describe, it, expect } from "vitest";
import { physicalKeyLabel, stripVkeyPrefix } from "./keyLabel.ts";

describe("physicalKeyLabel", () => {
  it("lowercases an ordinary letter key (K_Q -> 'q')", () => {
    expect(physicalKeyLabel("K_Q")).toBe("q");
  });

  it("leaves a digit key unchanged (K_0 -> '0')", () => {
    expect(physicalKeyLabel("K_0")).toBe("0");
  });

  it("leaves a symbol key unchanged (K_LBRKT -> '[')", () => {
    expect(physicalKeyLabel("K_LBRKT")).toBe("[");
  });

  it("leaves a named key unchanged (K_BKSP -> 'Backspace')", () => {
    expect(physicalKeyLabel("K_BKSP")).toBe("Backspace");
  });

  it("returns undefined for an empty vkey name (delegated to vkeyLabel's own blank-input floor)", () => {
    expect(physicalKeyLabel("")).toBeUndefined();
  });
});

describe("stripVkeyPrefix", () => {
  it("strips the K_ namespace prefix", () => {
    expect(stripVkeyPrefix("K_Q")).toBe("Q");
  });

  it("returns a name unchanged when it carries no K_ prefix", () => {
    expect(stripVkeyPrefix("Q")).toBe("Q");
  });

  it("returns an empty string unchanged", () => {
    expect(stripVkeyPrefix("")).toBe("");
  });
});
