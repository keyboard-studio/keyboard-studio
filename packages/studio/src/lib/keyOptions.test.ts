// Unit tests for keyOptions.ts's charToVkey/CHAR_TO_VKEY — the map is
// derived from KEY_OPTIONS labels (not re-typed by hand), so these tests
// exercise the derivation as well as the lookup.

import { describe, it, expect } from "vitest";
import { charToVkey, CHAR_TO_VKEY, KEY_OPTIONS, CUSTOM_KEY_OPTION_VALUE } from "./keyOptions.ts";

describe("charToVkey", () => {
  it("maps a lowercase letter to its key", () => {
    expect(charToVkey("a")).toBe("K_A");
  });

  it("maps the uppercase counterpart to the same key", () => {
    expect(charToVkey("A")).toBe("K_A");
  });

  it("maps a digit to its key", () => {
    expect(charToVkey("7")).toBe("K_7");
  });

  it("maps punctuation to its key", () => {
    expect(charToVkey(";")).toBe("K_SEMI");
    expect(charToVkey("[")).toBe("K_LBRKT");
    expect(charToVkey("]")).toBe("K_RBRKT");
    expect(charToVkey("\\")).toBe("K_BKSLASH");
    expect(charToVkey("'")).toBe("K_QUOTE");
    expect(charToVkey(",")).toBe("K_COMMA");
    expect(charToVkey(".")).toBe("K_PERIOD");
    expect(charToVkey("/")).toBe("K_SLASH");
    expect(charToVkey("`")).toBe("K_BKQUOTE");
  });

  it("returns null for an unmappable character", () => {
    expect(charToVkey("é")).toBeNull();
    expect(charToVkey("!")).toBeNull();
  });

  it("never maps the custom-option sentinel value", () => {
    expect(charToVkey(CUSTOM_KEY_OPTION_VALUE)).toBeNull();
  });

  it("CHAR_TO_VKEY has no entry derived from the empty '-- choose a key --' option", () => {
    const emptyOption = KEY_OPTIONS.find((o) => o.value === "");
    expect(emptyOption).toBeDefined();
    // The empty option's value is excluded by construction; its label
    // ("-- choose a key --") has no trailing "(X)" to match anyway.
    for (const [, vkey] of CHAR_TO_VKEY) {
      expect(vkey).not.toBe("");
    }
  });

  it("every non-empty KEY_OPTIONS entry is reachable via some char", () => {
    const reachable = new Set(CHAR_TO_VKEY.values());
    for (const option of KEY_OPTIONS) {
      if (option.value === "") continue;
      expect(reachable.has(option.value)).toBe(true);
    }
  });
});
