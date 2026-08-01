// pathOverlay projection tests (specs/053-decision-audit T043; FR-023).
//
// The projection is the whole of the overlay's logic, so the invariants that keep
// ADR-0001 intact are testable here without a renderer: it returns ids only, it
// derives edges from append order, and a revisit cannot inflate the path.

import { describe, expect, it } from "vitest";
import {
  makeEmptyDecisionRecord,
  PRE_IDENTITY_STEP_ID,
  type DecisionEntry,
  type DecisionRecord,
} from "@keyboard-studio/contracts";
import { buildPathOverlay, edgeKey, emptyPathOverlay } from "./pathOverlay.ts";

let seq = 0;

/** One survey-answer entry in `stepId`. Ids are sequential, as the store's are. */
function entry(stepId: string, over: Partial<DecisionEntry> = {}): DecisionEntry {
  seq += 1;
  return {
    entryId: `d${String(seq)}`,
    stepId,
    payload: {
      kind: "survey-answer",
      questionId: `q_${stepId}`,
      answerType: "text",
      value: "v",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000 + seq,
    supersedes: null,
    ...over,
  };
}

function recordOf(entries: readonly DecisionEntry[]): DecisionRecord {
  return { ...makeEmptyDecisionRecord("hausa_std"), entries };
}

describe("buildPathOverlay", () => {
  it("collects every step the record visited", () => {
    const overlay = buildPathOverlay(
      recordOf([entry("identity"), entry("track"), entry("characters")]),
    );
    expect([...overlay.walkedSteps]).toEqual(["identity", "track", "characters"]);
  });

  it("derives one edge per transition, in append order", () => {
    const overlay = buildPathOverlay(
      recordOf([entry("identity"), entry("track"), entry("characters")]),
    );
    expect([...overlay.walkedEdges]).toEqual([
      edgeKey("identity", "track"),
      edgeKey("track", "characters"),
    ]);
  });

  it("treats several decisions in one step as one visit, not a self-transition", () => {
    const overlay = buildPathOverlay(
      recordOf([entry("identity"), entry("identity"), entry("identity"), entry("track")]),
    );
    expect([...overlay.walkedSteps]).toEqual(["identity", "track"]);
    expect([...overlay.walkedEdges]).toEqual([edgeKey("identity", "track")]);
  });

  it("does not double-count an edge when a step is revisited and superseded", () => {
    // identity -> track -> identity(revisit, superseding) -> track(revisit).
    // The author really did traverse identity->track twice; the overlay records
    // that the edge was walked, once.
    const first = entry("identity");
    const track = entry("track");
    const revisit = entry("identity", { supersedes: first.entryId });
    const trackAgain = entry("track", { supersedes: track.entryId });
    const overlay = buildPathOverlay(recordOf([first, track, revisit, trackAgain]));

    expect([...overlay.walkedSteps]).toEqual(["identity", "track"]);
    expect([...overlay.walkedEdges].sort()).toEqual(
      [edgeKey("identity", "track"), edgeKey("track", "identity")].sort(),
    );
    // The set, not the entry count, is what the renderer reads.
    expect(overlay.walkedEdges.size).toBe(2);
  });

  it("keeps superseded entries in the path — a revisited step was still walked", () => {
    const original = entry("carve");
    const replacement = entry("carve", { supersedes: original.entryId });
    const overlay = buildPathOverlay(recordOf([original, replacement]));
    expect(overlay.walkedSteps.has("carve")).toBe(true);
  });

  it("yields empty sets for an empty record", () => {
    const overlay = buildPathOverlay(makeEmptyDecisionRecord());
    expect(overlay.walkedSteps.size).toBe(0);
    expect(overlay.walkedEdges.size).toBe(0);
  });

  it("excludes the pre-identity placeholder from steps and from edges", () => {
    // PRE_IDENTITY_STEP_ID is not a manifest step. Including it would put a node id
    // on the map that no manifest has ever contained, and would fabricate an edge
    // into whichever step ran first.
    const overlay = buildPathOverlay(
      recordOf([entry(PRE_IDENTITY_STEP_ID), entry("identity"), entry("track")]),
    );
    expect(overlay.walkedSteps.has(PRE_IDENTITY_STEP_ID)).toBe(false);
    expect([...overlay.walkedSteps]).toEqual(["identity", "track"]);
    expect([...overlay.walkedEdges]).toEqual([edgeKey("identity", "track")]);
  });

  it("contributes no structure of its own — only ids a graph can look up", () => {
    // The projection's whole output is two sets of strings. There is no node, edge,
    // or ordering for a renderer to take as graph structure (ADR-0001).
    const overlay = buildPathOverlay(recordOf([entry("identity"), entry("track")]));
    expect(Object.keys(overlay).sort()).toEqual(["walkedEdges", "walkedSteps"]);
    for (const id of [...overlay.walkedSteps, ...overlay.walkedEdges]) {
      expect(typeof id).toBe("string");
    }
  });
});

describe("emptyPathOverlay", () => {
  it("decorates nothing", () => {
    const overlay = emptyPathOverlay();
    expect(overlay.walkedSteps.size).toBe(0);
    expect(overlay.walkedEdges.size).toBe(0);
  });
});
