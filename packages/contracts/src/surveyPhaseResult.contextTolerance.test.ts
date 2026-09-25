// Tests for the context-tolerance station's contract additions (spec 078):
// `SurveyPhaseResult.marksContextTolerance`, the `DecisionProposalSource`
// member `"analysis"`, and `DecisionProvenance.proposed`. Mirrors the
// existing `marksOutputForm` coverage in surveySession.test.ts and the
// DecisionRecordSchema coverage in schemas.test.ts.
//
// @see specs/078-context-tolerance-wiring/data-model.md — "Tolerance
//   decision" and "Decision record entries"

import { describe, expect, it } from "vitest";
import {
  DecisionEntrySchema,
  DecisionProposalSourceSchema,
  DecisionProvenanceSchema,
  DecisionRecordSchema,
  MarksContextToleranceDecisionSchema,
} from "./schemas";
import {
  DECISION_RECORD_FORMAT,
  DECISION_RECORD_VERSION,
  type DecisionRecord,
} from "./decisionRecord";
import { mergePhaseResults } from "./surveySession";
import type { SurveyPhaseResult } from "./surveyPhaseResult";

describe("MarksContextToleranceDecisionSchema (spec 078)", () => {
  it("round-trips an accept decision without appliedFingerprint", () => {
    const value = {
      decision: "accept",
      acceptedSiteIds: ["site-1", "site-2"],
      proposedSiteIds: ["site-1", "site-2"],
      fingerprint: "abc123",
    };
    const result = MarksContextToleranceDecisionSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(value);
  });

  it("round-trips a partial decision with appliedFingerprint", () => {
    const value = {
      decision: "partial",
      acceptedSiteIds: ["site-1"],
      proposedSiteIds: ["site-1", "site-2"],
      fingerprint: "abc123",
      appliedFingerprint: "abc123",
    };
    const result = MarksContextToleranceDecisionSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(value);
  });

  it("round-trips a decline decision (empty acceptedSiteIds)", () => {
    const value = {
      decision: "decline",
      acceptedSiteIds: [],
      proposedSiteIds: ["site-1", "site-2"],
      fingerprint: "abc123",
    };
    const result = MarksContextToleranceDecisionSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(value);
  });
});

describe("DecisionProposalSourceSchema — analysis member (spec 078)", () => {
  it("parses \"analysis\"", () => {
    expect(DecisionProposalSourceSchema.safeParse("analysis").success).toBe(true);
  });
});

describe("DecisionProvenanceSchema — proposed field (spec 078)", () => {
  it("parses a hand-set provenance carrying the tool's overridden proposal", () => {
    const value = {
      agency: "hand-set",
      proposed: { value: "accept", siteIds: ["site-1", "site-2"] },
    };
    const result = DecisionProvenanceSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual(value);
  });

  it("parses proposed without siteIds", () => {
    const value = { agency: "hand-set", proposed: { value: "accept" } };
    expect(DecisionProvenanceSchema.safeParse(value).success).toBe(true);
  });

  it("parses a tool-proposed provenance with source \"analysis\" and no proposed field", () => {
    const value = { agency: "tool-proposed", source: "analysis" };
    const result = DecisionProvenanceSchema.safeParse(value);
    expect(result.success).toBe(true);
    if (result.success) expect("proposed" in result.data).toBe(false);
  });
});

describe("DecisionRecordSchema — tolerant reader (spec 078)", () => {
  it("still parses a v2 record whose entries carry no proposed/analysis fields", () => {
    const record: DecisionRecord = {
      format: DECISION_RECORD_FORMAT,
      version: DECISION_RECORD_VERSION,
      keyboardId: "kbd-1",
      entries: [
        {
          entryId: "entry-1",
          stepId: "identity",
          payload: {
            kind: "survey-answer",
            questionId: "il_language_english",
            answerType: "text",
            value: "Example",
          },
          provenance: { agency: "hand-set" },
          recordedAt: 1_700_000_000_000,
          supersedes: null,
        },
      ],
      truncated: null,
    };
    const result = DecisionRecordSchema.safeParse(record);
    expect(result.success).toBe(true);
  });

  it("parses a marks.context_tolerance entry using the new source/proposed fields", () => {
    const entry = {
      entryId: "entry-2",
      stepId: "marks",
      payload: {
        kind: "survey-answer",
        questionId: "marks.context_tolerance",
        answerType: "select",
        value: "partial",
      },
      provenance: {
        agency: "hand-set",
        proposed: { value: "accept", siteIds: ["site-1", "site-2"] },
      },
      recordedAt: 1_700_000_000_000,
      supersedes: null,
    };
    expect(DecisionEntrySchema.safeParse(entry).success).toBe(true);
  });
});

describe("mergePhaseResults — marksContextTolerance is last-wins (spec 078, mirrors marksOutputForm)", () => {
  it("takes the last phase's decision", () => {
    const phases: SurveyPhaseResult[] = [
      {
        phase: "C",
        answers: [],
        marksContextTolerance: {
          decision: "accept",
          acceptedSiteIds: ["site-1"],
          proposedSiteIds: ["site-1"],
          fingerprint: "fp-1",
        },
      },
      {
        phase: "C-prime",
        answers: [],
        marksContextTolerance: {
          decision: "partial",
          acceptedSiteIds: [],
          proposedSiteIds: ["site-1"],
          fingerprint: "fp-1",
          appliedFingerprint: "fp-1",
        },
      },
    ];
    const session = mergePhaseResults({}, phases);
    expect(session.marksContextTolerance).toEqual({
      decision: "partial",
      acceptedSiteIds: [],
      proposedSiteIds: ["site-1"],
      fingerprint: "fp-1",
      appliedFingerprint: "fp-1",
    });
  });

  it("is absent when no phase carries a decision", () => {
    const session = mergePhaseResults({}, [{ phase: "C", answers: [] }]);
    expect("marksContextTolerance" in session).toBe(false);
  });
});
