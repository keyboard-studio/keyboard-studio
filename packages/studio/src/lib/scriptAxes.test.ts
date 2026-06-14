// Tests for script → axis derivation (base-derived prefill). refs #369.

import { describe, it, expect } from "vitest";
import {
  normalizeTargetScript,
  scriptClassOf,
  routingGroupOf,
  deriveScriptPrefill,
} from "./scriptAxes";

describe("normalizeTargetScript", () => {
  it("passes plain script subtags through", () => {
    expect(normalizeTargetScript("Latn")).toEqual({ script: "Latn" });
    expect(normalizeTargetScript("Deva")).toEqual({ script: "Deva" });
  });
  it("resolves romanization to Latin", () => {
    expect(normalizeTargetScript("romanization-Latn")).toEqual({ script: "Latn" });
  });
  it("resolves IPA to Latin with the fonipa variant", () => {
    expect(normalizeTargetScript("fonipa")).toEqual({ script: "Latn", variant: "fonipa" });
  });
});

describe("scriptClassOf (A2)", () => {
  it("classifies the major scripts", () => {
    expect(scriptClassOf("Latn")).toBe("alphabetic");
    expect(scriptClassOf("Cyrl")).toBe("alphabetic");
    expect(scriptClassOf("Deva")).toBe("abugida");
    expect(scriptClassOf("Arab")).toBe("abjad");
    expect(scriptClassOf("Cans")).toBe("syllabary");
    expect(scriptClassOf("Hani")).toBe("logographic");
  });
  it("classifies Cherokee and Yi as syllabaries (not alphabetic)", () => {
    expect(scriptClassOf("Cher")).toBe("syllabary");
    expect(scriptClassOf("Yiii")).toBe("syllabary");
  });
  it("classifies Syriac and N'Ko as abjads (not the alphabetic default)", () => {
    expect(scriptClassOf("Syrc")).toBe("abjad");
    expect(scriptClassOf("Nkoo")).toBe("abjad");
  });
  it("defaults unknown subtags to alphabetic", () => {
    expect(scriptClassOf("Zxxx")).toBe("alphabetic");
  });
});

describe("routingGroupOf (§9)", () => {
  it("routes Latin-family alphabetic scripts to qwerty-qwertz", () => {
    expect(routingGroupOf("Latn")).toBe("qwerty-qwertz");
    expect(routingGroupOf("Cyrl")).toBe("qwerty-qwertz");
  });
  it("routes everything else to non-roman", () => {
    expect(routingGroupOf("Deva")).toBe("non-roman");
    expect(routingGroupOf("Arab")).toBe("non-roman");
    // Cherokee (syllabary) and Syriac (RTL abjad) must not land in qwerty-qwertz.
    expect(routingGroupOf("Cher")).toBe("non-roman");
    expect(routingGroupOf("Syrc")).toBe("non-roman");
  });
});

describe("deriveScriptPrefill — decoupling", () => {
  it("a romanization routes alphabetic/qwerty even for a non-Latin language", () => {
    expect(deriveScriptPrefill("romanization-Latn")).toEqual({
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    });
  });
  it("IPA carries the fonipa variant and routes alphabetic/qwerty", () => {
    expect(deriveScriptPrefill("fonipa")).toEqual({
      script: "Latn",
      variant: "fonipa",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    });
  });
  it("Devanagari routes abugida/non-roman", () => {
    expect(deriveScriptPrefill("Deva")).toEqual({
      script: "Deva",
      scriptClass: "abugida",
      routingGroup: "non-roman",
    });
  });

  // Cherokee is the canonical decoupling case: the SAME language has both a
  // native-syllabary keyboard and (potentially) a Latin romanization. The chosen
  // TARGET script — not the language — decides A2 + routing, so the two diverge.
  it("decouples romanized vs native Cherokee by the chosen target script", () => {
    // Romanized Cherokee — produces Latin letters, so alphabetic/qwerty.
    expect(deriveScriptPrefill("romanization-Latn")).toMatchObject({
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    });
    // Native Cherokee syllabary (chr-Cher) — syllabary mechanisms, non-roman.
    expect(deriveScriptPrefill("Cher")).toEqual({
      script: "Cher",
      scriptClass: "syllabary",
      routingGroup: "non-roman",
    });
  });
});
