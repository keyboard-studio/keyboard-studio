// Spec 022 — orthographyUrl retention test (FR-008, SC-005).
//
// With the full Phase A demoted to the library, `orthographyUrl` capture is
// retained on the canonical surface via captureOrthographyUrl(), reusing the
// existing provenance.orthographyUrl field (no contracts bump). A default-path run
// with no orthographyUrl is a clean no-op (the field stays unset, exactly as today).
//
// Test-only: no contracts bump, no write routing, no flag flip (FR-010/FR-011).

import { describe, it, expect } from "vitest";
import type { SurveyPhaseResult, SurveyAnswer } from "@keyboard-studio/contracts";

import {
  captureOrthographyUrl,
  ORTHOGRAPHY_URL_QUESTION_ID,
} from "./orthographyRetention.ts";

function textAnswer(questionId: string, value: string): SurveyAnswer {
  return { questionId, answerType: "text", value };
}

function phaseResult(answers: SurveyAnswer[]): SurveyPhaseResult {
  return { phase: "A", answers };
}

describe("spec 022 — orthographyUrl retention (FR-008)", () => {
  it("FR-008: retains orthographyUrl when provided, reusing provenance.orthographyUrl (no contracts bump)", () => {
    const result = phaseResult([
      textAnswer(ORTHOGRAPHY_URL_QUESTION_ID, "https://example.org/orthography.pdf"),
    ]);
    const captured = captureOrthographyUrl(result);
    expect(captured).toEqual({ orthographyUrl: "https://example.org/orthography.pdf" });
  });

  it("SC-005: a default-path run with NO orthographyUrl is a clean no-op (field stays unset)", () => {
    const result = phaseResult([
      // Some unrelated answer — no orthography question answered.
      textAnswer("language_name_english", "Akan"),
    ]);
    const captured = captureOrthographyUrl(result);
    expect(captured).toEqual({});
    expect("orthographyUrl" in captured).toBe(false);
  });

  it("SC-005: an EMPTY orthographyUrl answer is also a clean no-op (not forced/fabricated)", () => {
    const result = phaseResult([textAnswer(ORTHOGRAPHY_URL_QUESTION_ID, "")]);
    expect(captureOrthographyUrl(result)).toEqual({});
  });

  it("the captured value merges cleanly into an existing provenance object (caller pattern)", () => {
    const result = phaseResult([
      textAnswer(ORTHOGRAPHY_URL_QUESTION_ID, "https://lang.example/ortho"),
    ]);
    const provenance = { localizedName: "Akan", ...captureOrthographyUrl(result) };
    expect(provenance.orthographyUrl).toBe("https://lang.example/ortho");
    expect(provenance.localizedName).toBe("Akan");
  });

  it("reuses the SAME questionRegistry id as the reference capture (PhaseA.tsx:163-164)", () => {
    expect(ORTHOGRAPHY_URL_QUESTION_ID).toBe("provenance_orthography_url");
  });
});
