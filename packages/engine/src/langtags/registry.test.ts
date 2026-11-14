/**
 * registeredLanguage: the IANA language-subtag check behind the typed-code and
 * unlisted-language paths (spec 115 FR-028, FR-031).
 */

import { describe, expect, it } from "vitest";
import { registeredLanguage } from "./index.js";

describe("registeredLanguage", () => {
  it("finds a registered language with its description", () => {
    expect(registeredLanguage("bft")).toMatchObject({ subtag: "bft", description: "Balti" });
  });

  it("is case-insensitive", () => {
    expect(registeredLanguage("BFT")?.description).toBe("Balti");
  });

  it("returns the private-use range entry for any qaa..qtz subtag", () => {
    for (const code of ["qaa", "qkx", "qtz"]) {
      expect(registeredLanguage(code)).toMatchObject({ scope: "private-use" });
    }
  });

  it("returns undefined for a well-formed but unregistered subtag", () => {
    expect(registeredLanguage("zzz")).toBeUndefined();
  });

  it("returns undefined for text that is not a subtag", () => {
    expect(registeredLanguage("")).toBeUndefined();
    expect(registeredLanguage("zzzz")).toBeUndefined();
  });

  it("carries the macrolanguage of an individual language", () => {
    expect(registeredLanguage("aae")?.macrolanguage).toBe("sq");
  });
});
