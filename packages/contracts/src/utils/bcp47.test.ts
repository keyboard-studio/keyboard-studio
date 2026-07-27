/**
 * Unit tests for scriptSubtagOf — the single canonical BCP47 script-subtag
 * extractor, previously duplicated (with a narrower, buggy parts[1]-only
 * variant in one caller) across engine and studio.
 */

import { describe, it, expect } from "vitest";
import { scriptSubtagOf } from "./bcp47.js";

describe("scriptSubtagOf", () => {
  it("returns the script subtag when present immediately after the primary", () => {
    expect(scriptSubtagOf("az-Latn")).toBe("Latn");
  });

  it("normalizes casing to title-case", () => {
    expect(scriptSubtagOf("az-latn")).toBe("Latn");
    expect(scriptSubtagOf("az-LATN")).toBe("Latn");
  });

  it("returns undefined for a bare primary-language tag", () => {
    expect(scriptSubtagOf("hi")).toBeUndefined();
  });

  it("returns undefined when the following subtag is a region code, not a script", () => {
    expect(scriptSubtagOf("en-US")).toBeUndefined();
  });

  it("skips a non-4-alpha subtag to find a later 4-alpha script subtag", () => {
    // "x" (a singleton extension marker) is not 4 alpha chars, so the loop
    // must scan past index 1 to find "Deva" — exercises the loop-past-index-1
    // fix over the buggy parts[1]-only variant this helper replaces.
    expect(scriptSubtagOf("lif-x-Deva")).toBe("Deva");
  });
});
