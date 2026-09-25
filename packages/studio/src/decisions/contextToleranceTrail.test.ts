// The context-tolerance decision on the decision trail (spec 078 T031/T045).
//
// accept   -> `marks.context_tolerance` is tool-proposed, source "analysis".
// partial  -> hand-set with the tool's offer kept as `proposed`, plus a
//             `marks.context_tolerance.sites` answer.
// decline  -> hand-set with `proposed: { value: "accept", siteIds }`.
// A revisit with the same outcome appends nothing; the headline reads with a
// real question label.

import { afterEach, describe, expect, it } from "vitest";
import type { DecisionEntry, MarksContextToleranceDecision, SurveyPhaseResult } from "@keyboard-studio/contracts";
import { makeEmptyPlacementWorklist } from "@keyboard-studio/contracts";

import { contextToleranceAnswers } from "../survey/marks/MarksSeriesStep.tsx";
import { withContextToleranceProposal } from "./contextToleranceProposal.ts";
import { useDecisionLogStore } from "./decisionLogStore.ts";
import { headlineOf } from "./headline.ts";
import { createLookupQuestionLabel } from "./lookupQuestionLabel.ts";
import { recordSurveyAnswers } from "./recordSurveyAnswers.ts";

const PROPOSED = ["rule#10", "rule#12", "rule#15"];

function decision(kind: MarksContextToleranceDecision["decision"], accepted: string[]): MarksContextToleranceDecision {
  return { decision: kind, acceptedSiteIds: accepted, proposedSiteIds: PROPOSED, fingerprint: "00ff00ff00ff00ff" };
}

function marksResult(d: MarksContextToleranceDecision): SurveyPhaseResult {
  return {
    phase: "C",
    answers: contextToleranceAnswers(d),
    marksContextTolerance: d,
    marksWorklist: makeEmptyPlacementWorklist(),
  };
}

function record(d: MarksContextToleranceDecision): string[] {
  const result = marksResult(d);
  const append = useDecisionLogStore.getState().append;
  const resolveProposal = withContextToleranceProposal(result, undefined);
  return recordSurveyAnswers("marks", result, { append, ...(resolveProposal !== undefined ? { resolveProposal } : {}) });
}

function entries(): DecisionEntry[] {
  return useDecisionLogStore.getState().record.entries;
}

afterEach(() => {
  useDecisionLogStore.getState().reset();
});

describe("context-tolerance decision on the trail (spec 078)", () => {
  it("accept records the outcome as tool-proposed by the analysis", () => {
    record(decision("accept", PROPOSED));
    const [entry] = entries();
    expect(entries()).toHaveLength(1);
    expect(entry!.payload).toMatchObject({ kind: "survey-answer", questionId: "marks.context_tolerance", value: "accept" });
    expect(entry!.provenance).toEqual({ agency: "tool-proposed", source: "analysis" });
  });

  it("partial records hand-set with the offer kept, plus the accepted sites", () => {
    record(decision("partial", ["rule#10", "rule#15"]));
    const byQuestion = Object.fromEntries(
      entries().map((e) => [e.payload.kind === "survey-answer" ? e.payload.questionId : "", e] as const),
    );
    const outcome = byQuestion["marks.context_tolerance"]!;
    const sites = byQuestion["marks.context_tolerance.sites"]!;
    expect(outcome.provenance).toEqual({ agency: "hand-set", proposed: { value: "accept", siteIds: PROPOSED } });
    expect(sites.payload).toMatchObject({ value: "rule#10,rule#15" });
    expect(sites.provenance).toEqual({ agency: "hand-set", proposed: { value: "accept", siteIds: PROPOSED } });
  });

  it("decline records hand-set with the tool's proposal attached", () => {
    record(decision("decline", []));
    expect(entries()).toHaveLength(1);
    const [entry] = entries();
    expect(entry!.payload).toMatchObject({ value: "decline" });
    expect(entry!.provenance).toEqual({ agency: "hand-set", proposed: { value: "accept", siteIds: PROPOSED } });
  });

  it("a revisit with the same outcome appends nothing", () => {
    expect(record(decision("decline", []))).toHaveLength(1);
    expect(record(decision("decline", []))).toHaveLength(0);
    expect(entries()).toHaveLength(1);
  });

  it("a changed outcome supersedes rather than being dropped", () => {
    record(decision("decline", []));
    record(decision("accept", PROPOSED));
    expect(entries().map((e) => (e.payload.kind === "survey-answer" ? e.payload.value : null))).toEqual([
      "decline",
      "accept",
    ]);
  });

  it("the headline names the question with a real label, not the unknown fallback", () => {
    record(decision("accept", PROPOSED));
    const [entry] = entries();
    const spec = headlineOf(entry!.payload, entry!.provenance, { lookupQuestionLabel: createLookupQuestionLabel() });
    expect(JSON.stringify(spec)).toContain("Accents typed as separate characters");
    expect(JSON.stringify(spec)).not.toMatch(/"known":false/);
  });
});
