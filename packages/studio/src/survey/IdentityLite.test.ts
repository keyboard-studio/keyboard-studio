// Extraction tests for the identity-lite step. refs #369.

import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { extractIdentityLite, buildTargetBcp47 } from "./IdentityLite.tsx";
import { advance } from "../steps/advance.ts";

function result(
  targetScript: string,
  langCode = "",
): SurveyPhaseResult {
  return {
    phase: "A",
    answers: [
      { questionId: "il_language_autonym", answerType: "text", value: "Fà'" },
      { questionId: "il_language_english", answerType: "text", value: "Bafut" },
      { questionId: "il_language_code", answerType: "text", value: langCode },
      { questionId: "il_target_script", answerType: "select", value: targetScript },
    ],
  };
}

describe("extractIdentityLite", () => {
  it("extracts the language names and a supported Latin script", () => {
    const r = extractIdentityLite(result("Latn", "bfd"));
    expect(r.autonym).toBe("Fà'");
    expect(r.english).toBe("Bafut");
    expect(r.targetScriptRaw).toBe("Latn");
    expect(r.supported).toBe(true);
    expect(r.prefill).toEqual({
      script: "Latn",
      scriptClass: "alphabetic",
      routingGroup: "qwerty-qwertz",
    });
  });

  it("extracts the language subtag and builds bcp47 for Latin + code", () => {
    const r = extractIdentityLite(result("Latn", "ha"));
    expect(r.languageSubtag).toBe("ha");
    expect(r.bcp47).toBe("ha-Latn");
  });

  it("extracts the language subtag and builds bcp47 for Devanagari + code", () => {
    const r = extractIdentityLite(result("Deva", "hi"));
    expect(r.languageSubtag).toBe("hi");
    expect(r.bcp47).toBe("hi-Deva");
  });

  it("bcp47 is empty when language code is blank", () => {
    const r = extractIdentityLite(result("Latn", ""));
    expect(r.languageSubtag).toBe("");
    expect(r.bcp47).toBe("");
  });

  it("decouples: a romanization yields a Latin alphabetic/qwerty prefill", () => {
    const r = extractIdentityLite(result("romanization-Latn", "hi"));
    expect(r.prefill.script).toBe("Latn");
    expect(r.prefill.routingGroup).toBe("qwerty-qwertz");
    expect(r.supported).toBe(true);
    expect(r.bcp47).toBe("hi-Latn");
  });

  it("IPA carries the fonipa variant in prefill and bcp47 uses fonipa", () => {
    const r = extractIdentityLite(result("fonipa", "en"));
    expect(r.prefill.variant).toBe("fonipa");
    expect(r.prefill.scriptClass).toBe("alphabetic");
    expect(r.bcp47).toBe("en-fonipa");
  });

  it("Devanagari yields an abugida/non-roman prefill", () => {
    const r = extractIdentityLite(result("Deva"));
    expect(r.prefill.scriptClass).toBe("abugida");
    expect(r.prefill.routingGroup).toBe("non-roman");
  });

  it("flags gated scripts (Ethiopic) as unsupported", () => {
    const r = extractIdentityLite(result("Ethi"));
    expect(r.supported).toBe(false);
  });

  // spec 034 T013 (SR-4, FR-012, SC-005): every gated script family flows
  // identity -> unsupported so StepHost renders the "not supported" stub — the
  // gallery is never silently emptied. This pins BOTH halves: extractIdentityLite
  // sets supported:false AND advance() routes that to the "unsupported" terminal.
  describe("gated scripts route identity -> unsupported (SR-4)", () => {
    for (const script of ["Ethi", "Hani", "Hang"]) {
      it(`${script}: supported === false and advance("identity") === "unsupported"`, () => {
        const identity = extractIdentityLite(result(script, "xx"));
        expect(identity.supported).toBe(false);
        const outcome = advance("identity", undefined, {
          selectedTrack: null,
          identitySupported: identity.supported,
        });
        expect(outcome.next).toBe("unsupported");
      });
    }
  });

  // spec 034 T006a (FR-002, AS-1): identity resolution PROPOSES a BCP47
  // (language + script) tag to confirm — it never leaves a blank identity for a
  // typed language + chosen script. "Propose-then-confirm", never a blank form.
  describe("proposes a BCP47 tag for confirmation, never blank (T006a)", () => {
    it("a typed language code + proven script yields a non-blank language+script tag", () => {
      const identity = extractIdentityLite(result("Cyrl", "ru"));
      expect(identity.bcp47).toBe("ru-Cyrl");
      expect(identity.bcp47).not.toBe("");
      // The script prefill is proposed too (confirmed, not asked blank).
      expect(identity.prefill.script).toBe("Cyrl");
    });

    it("proposes the tag across all five proven scripts (language+script), never blank", () => {
      const cases: Array<[string, string]> = [
        ["Latn", "ha-Latn"],
        ["Cyrl", "ru-Cyrl"],
        ["Grek", "el-Grek"],
        ["Geor", "ka-Geor"],
        ["Armn", "hy-Armn"],
      ];
      for (const [script, expected] of cases) {
        const lang = expected.split("-")[0]!;
        const identity = extractIdentityLite(result(script, lang));
        expect(identity.bcp47).toBe(expected);
      }
    });
  });

  // Complement: the five proven alphabetic scripts stay supported and advance
  // into the real spine (choose_base), never the unsupported stub (FR-011).
  describe("proven alphabetic scripts stay supported (FR-011)", () => {
    for (const script of ["Latn", "Cyrl", "Grek", "Geor", "Armn"]) {
      it(`${script}: supported === true and advance("identity") === "choose_base"`, () => {
        const identity = extractIdentityLite(result(script, "xx"));
        expect(identity.supported).toBe(true);
        const outcome = advance("identity", undefined, {
          selectedTrack: null,
          identitySupported: identity.supported,
        });
        expect(outcome.next).toBe("choose_base");
      });
    }
  });

  it("returns empty strings for missing answers", () => {
    const r = extractIdentityLite({ phase: "A", answers: [] });
    expect(r.autonym).toBe("");
    expect(r.english).toBe("");
    expect(r.languageSubtag).toBe("");
    expect(r.targetScriptRaw).toBe("");
    expect(r.bcp47).toBe("");
  });
});

// ---------------------------------------------------------------------------
// buildTargetBcp47
// ---------------------------------------------------------------------------

describe("buildTargetBcp47", () => {
  it("plain Latin script: lang-Latn", () => {
    expect(buildTargetBcp47("ha", "Latn")).toBe("ha-Latn");
  });

  it("plain Devanagari script: lang-Deva", () => {
    expect(buildTargetBcp47("hi", "Deva")).toBe("hi-Deva");
  });

  it("plain Arabic script: lang-Arab", () => {
    expect(buildTargetBcp47("ar", "Arab")).toBe("ar-Arab");
  });

  it("romanization-Latn: lang-Latn (not romanization-Latn)", () => {
    expect(buildTargetBcp47("hi", "romanization-Latn")).toBe("hi-Latn");
  });

  it("fonipa: lang-fonipa (no script subtag, variant only)", () => {
    expect(buildTargetBcp47("en", "fonipa")).toBe("en-fonipa");
  });

  it("empty language subtag: empty string regardless of script", () => {
    expect(buildTargetBcp47("", "Latn")).toBe("");
    expect(buildTargetBcp47("", "fonipa")).toBe("");
    expect(buildTargetBcp47("  ", "Deva")).toBe("");
  });

  it("whitespace-only language subtag: empty string", () => {
    expect(buildTargetBcp47("  ", "Latn")).toBe("");
  });
});
