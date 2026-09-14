// Tests for historyProposalSeed (spec 076 T042).
//
// Coverage:
//   1. Empty record -> the all-empty seed.
//   2. base-contribution, instantiationMode "adapt-existing" -> base set from
//      baseId + the "version" inheritedMetadata field.
//   3. base-contribution, instantiationMode "new-from-base" (Track 1 copy) ->
//      base stays null.
//   4. No base-contribution entry at all (net-new) -> base stays null.
//   5. char-list survey answers across multiple steps aggregate, in order.
//   6. Non-char-list survey answers are ignored.
//   7. gallery_edit editor-action -> keysRemoved (absent treated as 0).
//   8. mechanism_edit editor-action -> mechanismsAssigned from summary.sample.
//   9. touch_edit editor-action contributes to neither field (spec: only
//      keys/mechanisms feed the seed).
//   10. A superseded entry is excluded — only the effective (current) entry
//       for a slot contributes.
//   11. Default parameter reads the live decisionLogStore when no record is
//       supplied.

import { describe, expect, it, beforeEach } from "vitest";
import {
  makeEmptyDecisionRecord,
  type DecisionEntry,
  type DecisionPayload,
  type DecisionProvenance,
  type DecisionRecord,
} from "@keyboard-studio/contracts";
import { buildHistoryProposalSeed } from "./historyProposalSeed.ts";
import { useDecisionLogStore } from "./decisionLogStore.ts";

const HAND_SET: DecisionProvenance = { agency: "hand-set" };
const BASE_DERIVED: DecisionProvenance = { agency: "base-derived", source: "base" };

let nextId = 0;
function entry(
  stepId: string,
  payload: DecisionPayload,
  provenance: DecisionProvenance = HAND_SET,
  supersedes: string | null = null,
): DecisionEntry {
  nextId += 1;
  return {
    entryId: `e${nextId}`,
    stepId,
    payload,
    provenance,
    recordedAt: nextId,
    supersedes,
  };
}

function record(entries: DecisionEntry[]): DecisionRecord {
  return { ...makeEmptyDecisionRecord("kb"), entries };
}

function surveyAnswer(
  questionId: string,
  answerType: "char-list",
  value: readonly string[],
): DecisionPayload {
  return { kind: "survey-answer", questionId, answerType, value: [...value] };
}

function baseContribution(
  instantiationMode: "new-from-base" | "adapt-existing",
  overrides: { baseId?: string; version?: string } = {},
): DecisionPayload {
  return {
    kind: "base-contribution",
    baseId: overrides.baseId ?? "basic_kbdfr",
    baseDisplayName: "Basic (French)",
    derivedAxes: [],
    inheritedMetadata: [
      { field: "script", value: "Latn" },
      { field: "version", value: overrides.version ?? "1.3" },
    ],
    instantiationMode,
  };
}

function editorAction(
  actionType: "gallery_edit" | "mechanism_edit" | "touch_edit",
  overrides: {
    keysRemoved?: number;
    sample?: readonly string[];
  } = {},
): DecisionPayload {
  return {
    kind: "editor-action",
    actionType,
    summary: {
      ...(overrides.keysRemoved !== undefined ? { keysRemoved: overrides.keysRemoved } : {}),
      sample: overrides.sample ?? [],
      sampleTruncated: false,
    },
  };
}

beforeEach(() => {
  nextId = 0;
  useDecisionLogStore.getState().reset();
});

describe("buildHistoryProposalSeed", () => {
  it("returns the all-empty seed for an empty record", () => {
    expect(buildHistoryProposalSeed(record([]))).toEqual({
      base: null,
      charactersAdded: [],
      mechanismsAssigned: [],
      keysRemoved: 0,
    });
  });

  it("sets base from an adapt-existing base-contribution (id + version)", () => {
    const rec = record([
      entry("choose_base", baseContribution("adapt-existing", { baseId: "basic_kbdfr", version: "1.3" }), BASE_DERIVED),
    ]);
    expect(buildHistoryProposalSeed(rec).base).toEqual({ id: "basic_kbdfr", version: "1.3" });
  });

  it("leaves base null for a new-from-base (Track 1 copy) base-contribution", () => {
    const rec = record([
      entry("choose_base", baseContribution("new-from-base"), BASE_DERIVED),
    ]);
    expect(buildHistoryProposalSeed(rec).base).toBeNull();
  });

  it("leaves base null when there is no base-contribution entry at all (net-new)", () => {
    const rec = record([
      entry("characters", surveyAnswer("char_build_list", "char-list", ["a", "b"])),
    ]);
    expect(buildHistoryProposalSeed(rec).base).toBeNull();
  });

  it("aggregates char-list survey answers across steps, in record order", () => {
    const rec = record([
      entry("characters", surveyAnswer("char_build_list", "char-list", ["a", "b"])),
      entry("marks", surveyAnswer("marks_series", "char-list", ["á", "à"])),
      entry("punctuation", surveyAnswer("punct_build_list", "char-list", ["."])),
    ]);
    expect(buildHistoryProposalSeed(rec).charactersAdded).toEqual(["a", "b", "á", "à", "."]);
  });

  it("ignores non-char-list survey answers", () => {
    const rec = record([
      entry("track", { kind: "survey-answer", questionId: "track_choice", answerType: "select", value: "copy" }),
      entry("characters", surveyAnswer("char_build_list", "char-list", ["a"])),
    ]);
    expect(buildHistoryProposalSeed(rec).charactersAdded).toEqual(["a"]);
  });

  it("sums gallery_edit keysRemoved, treating an absent count as 0", () => {
    const rec = record([entry("carve", editorAction("gallery_edit", { keysRemoved: 7 }))]);
    expect(buildHistoryProposalSeed(rec).keysRemoved).toBe(7);

    const recUnmeasured = record([entry("carve", editorAction("gallery_edit", {}))]);
    expect(buildHistoryProposalSeed(recUnmeasured).keysRemoved).toBe(0);
  });

  it("takes mechanismsAssigned from the mechanism_edit sample", () => {
    const rec = record([
      entry("mechanisms", editorAction("mechanism_edit", { sample: ["é", "tone-vowels"] })),
    ]);
    expect(buildHistoryProposalSeed(rec).mechanismsAssigned).toEqual(["é", "tone-vowels"]);
  });

  it("does not feed touch_edit into either keysRemoved or mechanismsAssigned", () => {
    const rec = record([entry("touch", editorAction("touch_edit", { sample: ["K_A"] }))]);
    const seed = buildHistoryProposalSeed(rec);
    expect(seed.keysRemoved).toBe(0);
    expect(seed.mechanismsAssigned).toEqual([]);
  });

  it("counts only the effective (non-superseded) entry for a revisited slot", () => {
    const first = entry("carve", editorAction("gallery_edit", { keysRemoved: 3 }));
    const rec = record([
      first,
      entry("carve", editorAction("gallery_edit", { keysRemoved: 10 }), HAND_SET, first.entryId),
    ]);
    expect(buildHistoryProposalSeed(rec).keysRemoved).toBe(10);
  });

  it("reads the live decisionLogStore when no record is supplied", () => {
    useDecisionLogStore.getState().append({
      stepId: "choose_base",
      payload: baseContribution("adapt-existing", { baseId: "basic_kbdus", version: "2.0" }),
      provenance: BASE_DERIVED,
    });
    expect(buildHistoryProposalSeed().base).toEqual({ id: "basic_kbdus", version: "2.0" });
  });
});
