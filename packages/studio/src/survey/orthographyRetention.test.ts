// Spec 022 — orthographyUrl retention test (FR-008, SC-005).
//
// The full non-identity Phase A is demoted to the library in spec 022, so its
// runtime capture of `orthographyUrl` (PhaseA.tsx:163-164, a linguist-agent
// grounding input) is gone. FR-008 retains that capture on the CANONICAL,
// LIVE surface — extractIdentityLite (the real StudioShell→IdentityLite default
// path) — reusing the existing answerString helper and the existing
// `provenance.orthographyUrl` contract field (no contracts bump, no write routing).
//
// These tests assert the value survives a REAL default-path run through
// extractIdentityLite (not a standalone helper's return value); a run with no
// orthography answer is a clean no-op (the field stays unset, exactly as today).
//
// Test-only: no contracts bump, no write routing, no flag flip (FR-010/FR-011).

import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult, SurveyAnswer } from "@keyboard-studio/contracts";

import {
  extractIdentityLite,
  ORTHOGRAPHY_URL_QUESTION_ID,
} from "./IdentityLite.tsx";

/** A minimal completed identity-lite phase result, plus any extra answers. */
function identityResult(extra: SurveyAnswer[] = []): SurveyPhaseResult {
  return {
    phase: "A",
    answers: [
      { questionId: "il_language_autonym", answerType: "text", value: "Akan" },
      { questionId: "il_language_english", answerType: "text", value: "Akan" },
      { questionId: "il_language_code", answerType: "text", value: "ak" },
      { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ...extra,
    ],
  };
}

describe("spec 022 — orthographyUrl retention on the canonical IdentityLite surface (FR-008)", () => {
  it("FR-008: orthographyUrl SURVIVES a real default-path run through extractIdentityLite", () => {
    const url = "https://example.org/orthography.pdf";
    const r = extractIdentityLite(
      identityResult([
        { questionId: ORTHOGRAPHY_URL_QUESTION_ID, answerType: "text", value: url },
      ]),
    );
    // It rides on the IdentityLiteResult (the live identity surface), reusing the
    // existing provenance.orthographyUrl field shape — no contracts bump.
    expect(r.orthographyUrl).toBe(url);
    // The rest of the identity result is unchanged (byte-identical otherwise).
    expect(r.bcp47).toBe("ak-Latn");
    expect(r.targetScriptRaw).toBe("Latn");
  });

  it("SC-005: a default-path run with NO orthographyUrl is a clean no-op (field stays unset)", () => {
    const r = extractIdentityLite(identityResult());
    expect(r.orthographyUrl).toBeUndefined();
    expect("orthographyUrl" in r).toBe(false);
  });

  it("SC-005: an EMPTY orthographyUrl answer is also a clean no-op (not forced/fabricated)", () => {
    const r = extractIdentityLite(
      identityResult([
        { questionId: ORTHOGRAPHY_URL_QUESTION_ID, answerType: "text", value: "" },
      ]),
    );
    expect(r.orthographyUrl).toBeUndefined();
  });

  it("reuses the SAME questionRegistry id as the demoted Phase-A reference capture (PhaseA.tsx:163-164)", () => {
    expect(ORTHOGRAPHY_URL_QUESTION_ID).toBe("provenance_orthography_url");
  });
});
