// Extraction tests for the identity-lite step. refs #369.

import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { extractIdentityLite } from "./IdentityLite.tsx";

function result(targetScript: string): SurveyPhaseResult {
  return {
    phase: "A",
    answers: [
      { questionId: "il_language_autonym", answerType: "text", value: "Fà'" },
      { questionId: "il_language_english", answerType: "text", value: "Bafut" },
      { questionId: "il_target_script", answerType: "select", value: targetScript },
    ],
  };
}

describe("extractIdentityLite", () => {
  it("extracts the language names and a supported Latin script", () => {
    const r = extractIdentityLite(result("Latn"));
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

  it("decouples: a romanization yields a Latin alphabetic/qwerty prefill", () => {
    const r = extractIdentityLite(result("romanization-Latn"));
    expect(r.prefill.script).toBe("Latn");
    expect(r.prefill.routingGroup).toBe("qwerty-qwertz");
    expect(r.supported).toBe(true);
  });

  it("IPA carries the fonipa variant", () => {
    const r = extractIdentityLite(result("fonipa"));
    expect(r.prefill.variant).toBe("fonipa");
    expect(r.prefill.scriptClass).toBe("alphabetic");
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

  it("returns empty strings for missing answers", () => {
    const r = extractIdentityLite({ phase: "A", answers: [] });
    expect(r.autonym).toBe("");
    expect(r.english).toBe("");
    expect(r.targetScriptRaw).toBe("");
  });
});
