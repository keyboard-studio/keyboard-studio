// Tests for script → axis derivation (base-derived prefill). refs #369.

import { describe, it, expect } from "vitest";
import {
  normalizeTargetScript,
  scriptClassOf,
  routingGroupOf,
  deriveScriptPrefill,
  EXPLICITLY_CLASSIFIED_SCRIPTS,
} from "./scriptAxes";
import { VALID_SCRIPT_VALUES } from "../survey/questions/a/primary_script";

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
  it("classifies Mandaic and Samaritan as abjads (added in RTL-script expansion)", () => {
    // PR #870 added Mand and Samr to the ABJAD set alongside Syrc/Nkoo.
    expect(scriptClassOf("Mand")).toBe("abjad");
    expect(scriptClassOf("Samr")).toBe("abjad");
  });
  it("classifies Thaana, Adlam, and Hanifi Rohingya as alphabetic (RTL alphabets, not abjads)", () => {
    // These are RTL scripts added to primary_script in PR #870.
    // They are true alphabets (vowels written), so they fall through to the
    // "alphabetic" default — NOT the ABJAD set.
    expect(scriptClassOf("Thaa")).toBe("alphabetic");
    expect(scriptClassOf("Adlm")).toBe("alphabetic");
    expect(scriptClassOf("Rohg")).toBe("alphabetic");
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

// Regression guard: the Mand/Samr misclassification could recur silently.
// The survey's primary_script question and scriptAxes maintain two INDEPENDENT
// script enumerations: VALID_SCRIPT_VALUES (what the user may pick) and the
// explicit class sets (LATIN_ALPHABETIC/ABUGIDA/ABJAD/SYLLABARY/LOGOGRAPHIC,
// unioned as EXPLICITLY_CLASSIFIED_SCRIPTS). Because scriptClassOf DEFAULTS to
// "alphabetic", a brand-new selectable script that nobody classified is silently
// treated as a Latin-style alphabet — exactly the prior Mand/Samr bug. A naive
// "is it classified?" check can't catch that (everything "classifies" via the
// default), so this guard instead asserts every selectable code is EITHER in an
// explicit class set OR in an EXPLICIT allowlist of codes intentionally left to
// the alphabetic default. Adding a code to VALID_SCRIPT_VALUES without doing one
// of those two things FAILS this test loudly.
describe("primary_script ↔ scriptAxes classification guard", () => {
  // Codes intentionally NOT in any explicit class set — they ride the
  // "alphabetic" default in scriptClassOf on purpose. Each must be justified
  // here; do NOT add a code just to silence the test without understanding it.
  const ALPHABETIC_DEFAULT_ALLOWLIST = new Set<string>([
    // RTL alphabets (vowels written) — true alphabets, so alphabetic is correct.
    // These are exactly the scripts #870 added; keeping them OUT of ABJAD is the
    // fix from that PR, so they are allowlisted rather than classified.
    "Thaa", // Thaana (Maldivian / Dhivehi)
    "Adlm", // Adlam (Fulani / Pular)
    "Rohg", // Hanifi Rohingya
    // Phase A out-of-scope gate (D5): Ethiopic and Hangul are routed to the
    // script-not-supported stub before any A2 class matters, so they are left to
    // the alphabetic default. Han/Hani (the third gated script) IS explicitly
    // LOGOGRAPHIC and is covered by EXPLICITLY_CLASSIFIED_SCRIPTS, not this allowlist.
    "Ethi", // Ethiopic
    "Hang", // Hangul (Korean)
    // The catch-all "A different writing system not listed here".
    "Other",
  ]);

  it("every VALID_SCRIPT_VALUES code is explicitly classified or allowlisted", () => {
    const unaccounted = [...VALID_SCRIPT_VALUES].filter(
      (code) =>
        !EXPLICITLY_CLASSIFIED_SCRIPTS.has(code) &&
        !ALPHABETIC_DEFAULT_ALLOWLIST.has(code),
    );
    // A non-empty list means a selectable script silently falls through to the
    // alphabetic default with nobody having signed off on it — classify it in
    // scriptAxes, or add it to the allowlist above with a justification.
    expect(unaccounted).toEqual([]);
  });

  it("the allowlist contains no stale entries (every allowlisted code is still selectable and still unclassified)", () => {
    for (const code of ALPHABETIC_DEFAULT_ALLOWLIST) {
      expect(VALID_SCRIPT_VALUES.has(code)).toBe(true);
      expect(EXPLICITLY_CLASSIFIED_SCRIPTS.has(code)).toBe(false);
    }
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
