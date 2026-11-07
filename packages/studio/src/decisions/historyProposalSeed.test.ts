// Tests for historyProposalSeed (spec 079 T042).
//
// Coverage:
//   1. Empty record + no model facts -> the all-empty seed.
//   2. base-contribution, instantiationMode "adapt-existing" -> base set from
//      startId + the "version" inheritedMetadata field.
//   3. base-contribution, instantiationMode "new-from-base" (Track 1 copy) ->
//      base stays null.
//   4. No base-contribution entry at all (net-new) -> base stays null.
//   5. charactersAdded / charactersRemoved come from the model facts, never
//      from char-list survey answers (a hand test's marks step recorded its
//      host-letter lists that way and HISTORY claimed "Added 46 characters:
//      a, A, e, E, ...").
//   6. mechanism_edit editor-action -> mechanismsAssigned from summary.sample,
//      minus the characters already listed as added.
//   7. touch_edit editor-action does not feed mechanismsAssigned.
//   8. A superseded entry is excluded — only the effective (current) entry
//      for a slot contributes.
//   9. Default parameter reads the live decisionLogStore when no record is
//      supplied.
//   historyModelFacts:
//   10. Added = individual assignment targets the starting keyboard did not
//       produce, deduplicated, in assignment order (physical and touch).
//   11. Removed = the carved character count (the README's count).
//   12. No starting keyboard -> no facts.

import { describe, expect, it, beforeEach } from "vitest";
import {
  makeEmptyDecisionRecord,
  type DecisionEntry,
  type DecisionPayload,
  type DecisionProvenance,
  type DecisionRecord,
  type MechanismAssignment,
} from "@keyboard-studio/contracts";
import { makeTestIR, irGroup, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { buildHistoryProposalSeed, historyModelFacts, type HistoryModelFacts } from "./historyProposalSeed.ts";
import { useDecisionLogStore } from "./decisionLogStore.ts";

const NO_FACTS: HistoryModelFacts = { charactersAdded: [], charactersRemoved: 0 };

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

function startContribution(
  instantiationMode: "new-from-base" | "adapt-existing",
  overrides: { startId?: string; version?: string } = {},
): DecisionPayload {
  return {
    kind: "base-contribution",
    startId: overrides.startId ?? "basic_kbdfr",
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
  it("returns the all-empty seed for an empty record and no model facts", () => {
    expect(buildHistoryProposalSeed(NO_FACTS, record([]))).toEqual({
      base: null,
      charactersAdded: [],
      mechanismsAssigned: [],
      charactersRemoved: 0,
    });
  });

  it("sets base from an adapt-existing base-contribution (id + version)", () => {
    const rec = record([
      entry("choose_base", startContribution("adapt-existing", { startId: "basic_kbdfr", version: "1.3" }), BASE_DERIVED),
    ]);
    expect(buildHistoryProposalSeed(NO_FACTS, rec).base).toEqual({ id: "basic_kbdfr", version: "1.3" });
  });

  it("leaves base null for a new-from-base (Track 1 copy) base-contribution", () => {
    const rec = record([entry("choose_base", startContribution("new-from-base"), BASE_DERIVED)]);
    expect(buildHistoryProposalSeed(NO_FACTS, rec).base).toBeNull();
  });

  it("leaves base null when there is no base-contribution entry at all (net-new)", () => {
    const rec = record([entry("characters", surveyAnswer("char_build_list", "char-list", ["a", "b"]))]);
    expect(buildHistoryProposalSeed(NO_FACTS, rec).base).toBeNull();
  });

  it("takes added and removed characters from the model facts, never from char-list answers", () => {
    const rec = record([
      entry("marks", surveyAnswer("marks_series", "char-list", ["a", "A", "e", "E"])),
      entry("carve", editorAction("gallery_edit", { keysRemoved: 481 })),
    ]);
    const seed = buildHistoryProposalSeed({ charactersAdded: ["‐", "‑"], charactersRemoved: 103 }, rec);
    expect(seed.charactersAdded).toEqual(["‐", "‑"]);
    expect(seed.charactersRemoved).toBe(103);
  });

  it("takes mechanismsAssigned from the mechanism_edit sample", () => {
    const rec = record([entry("mechanisms", editorAction("mechanism_edit", { sample: ["é", "tone-vowels"] }))]);
    expect(buildHistoryProposalSeed(NO_FACTS, rec).mechanismsAssigned).toEqual(["é", "tone-vowels"]);
  });

  it("does not repeat an added character under mechanismsAssigned", () => {
    const rec = record([entry("mechanisms", editorAction("mechanism_edit", { sample: ["‐", "tone-vowels"] }))]);
    const seed = buildHistoryProposalSeed({ charactersAdded: ["‐"], charactersRemoved: 0 }, rec);
    expect(seed.mechanismsAssigned).toEqual(["tone-vowels"]);
  });

  it("caps the merged mechanism_edit sample so huge keyboards stay bounded", () => {
    const sample = Array.from({ length: 300 }, (_, i) => `x${i}`);
    const rec = record([entry("mechanisms", editorAction("mechanism_edit", { sample }))]);
    const seed = buildHistoryProposalSeed(NO_FACTS, rec);
    expect(seed.mechanismsAssigned).toHaveLength(200);
    expect(seed.mechanismsAssigned[0]).toBe("x0");
    expect(seed.mechanismsAssigned[199]).toBe("x199");
  });

  it("does not feed touch_edit into mechanismsAssigned", () => {
    const rec = record([entry("touch", editorAction("touch_edit", { sample: ["K_A"] }))]);
    expect(buildHistoryProposalSeed(NO_FACTS, rec).mechanismsAssigned).toEqual([]);
  });

  it("counts only the effective (non-superseded) entry for a revisited slot", () => {
    const first = entry("mechanisms", editorAction("mechanism_edit", { sample: ["é"] }));
    const rec = record([
      first,
      entry("mechanisms", editorAction("mechanism_edit", { sample: ["è"] }), HAND_SET, first.entryId),
    ]);
    expect(buildHistoryProposalSeed(NO_FACTS, rec).mechanismsAssigned).toEqual(["è"]);
  });

  it("reads the live decisionLogStore when no record is supplied", () => {
    useDecisionLogStore.getState().append({
      stepId: "choose_base",
      payload: startContribution("adapt-existing", { startId: "basic_kbdus", version: "2.0" }),
      provenance: BASE_DERIVED,
    });
    expect(buildHistoryProposalSeed(NO_FACTS).base).toEqual({ id: "basic_kbdus", version: "2.0" });
  });
});

describe("historyModelFacts", () => {
  // The starting keyboard types a and e.
  const startIr = makeTestIR([
    irGroup({
      nodeId: "group#main",
      name: "main",
      rules: [
        vkeyRule({ nodeId: "rule#a", vkey: "K_A", output: [{ kind: "char", value: "a" }] }),
        vkeyRule({ nodeId: "rule#e", vkey: "K_E", output: [{ kind: "char", value: "e" }] }),
      ],
    }),
  ]);

  function individual(target: string, modality: "physical" | "touch"): MechanismAssignment {
    return { scope: "individual", target, modality, mechanisms: [{ patternId: "simple_swap" }] };
  }

  it("lists individual assignment targets the starting keyboard did not type, once each, in order", () => {
    const facts = historyModelFacts({
      startIr,
      phaseResults: [
        {
          phase: "C",
          assignments: [
            individual("‐", "physical"),
            individual("e", "physical"), // already typed by the start: not added
            { scope: "character-class", target: "tone-vowels", modality: "physical", mechanisms: [] },
            individual("‐", "touch"), // same character on touch: listed once
            individual("‑", "touch"),
          ],
        },
      ],
      carveChars: new Set(),
    });
    expect(facts.charactersAdded).toEqual(["‐", "‑"]);
  });

  it("counts the carved characters as removed", () => {
    const facts = historyModelFacts({ startIr, phaseResults: [], carveChars: new Set(["a", "æ"]) });
    expect(facts.charactersRemoved).toBe(2);
  });

  it("states nothing before a starting keyboard exists", () => {
    expect(historyModelFacts({ startIr: null, phaseResults: [], carveChars: new Set(["a"]) })).toEqual(NO_FACTS);
  });
});
