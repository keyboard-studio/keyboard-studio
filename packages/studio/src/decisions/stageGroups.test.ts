// Tests for stageGroups (specs/055-legible-decision-trail FR-022 through
// FR-026, research D-02).
//
// The claim under test that matters most is D-02: an editor stage's rollUp
// reads the LATEST EFFECTIVE entry, never a sum — a carve of 40 revisited to
// 172 must roll up as 172. Getting this wrong silently doubles every revisit.

import { describe, it, expect } from "vitest";
import { PRE_IDENTITY_STEP_ID } from "@keyboard-studio/contracts";
import type { DecisionEntry, EditorActionSummary, EditorActionType } from "@keyboard-studio/contracts";
import { buildStageGroups } from "./stageGroups.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function summary(overrides: Partial<EditorActionSummary> = {}): EditorActionSummary {
  return { sample: [], sampleTruncated: false, ...overrides };
}

function surveyEntry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "e1",
    stepId: "identity",
    payload: {
      kind: "survey-answer",
      questionId: "il_language_english",
      answerType: "text",
      value: "Bambara",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  } as DecisionEntry;
}

function editorEntry(
  stepId: string,
  actionType: EditorActionType,
  editorSummary: EditorActionSummary,
  overrides: Partial<DecisionEntry> = {},
): DecisionEntry {
  return {
    entryId: "e1",
    stepId,
    payload: { kind: "editor-action", actionType, summary: editorSummary },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  } as DecisionEntry;
}

function baseEntry(
  startingKeyCount: number | undefined,
  overrides: Partial<DecisionEntry> = {},
): DecisionEntry {
  return {
    entryId: "e1",
    stepId: "choose_base",
    payload: {
      kind: "base-contribution",
      baseId: "base_kb",
      baseDisplayName: "Base KB",
      startingKeyCount,
      derivedAxes: [],
      inheritedMetadata: [],
      instantiationMode: "new-from-base",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1_700_000_000_000,
    supersedes: null,
    ...overrides,
  } as DecisionEntry;
}

// ---------------------------------------------------------------------------
// FR-022 — walked order
// ---------------------------------------------------------------------------

describe("buildStageGroups — flow-manifest order (FR-022)", () => {
  it("orders stages by the manifest's walked order, not the record's append order", () => {
    // Appended out of walked order on purpose: touch first, then identity,
    // then carve — a naive derivation keyed on insertion order would put
    // touch's group before identity's and carve's.
    const groups = buildStageGroups({
      entries: [
        editorEntry("touch", "touch_edit", summary({ touchKeysAffected: 3 })),
        surveyEntry({ entryId: "e2" }),
        editorEntry("carve", "gallery_edit", summary({ keysRemoved: 5 }), { entryId: "e3" }),
      ],
    });

    const indexOf = (stepId: string) => groups.findIndex((g) => g.stepId === stepId);

    expect(indexOf("identity")).toBeGreaterThanOrEqual(0);
    expect(indexOf("carve")).toBeGreaterThanOrEqual(0);
    expect(indexOf("touch")).toBeGreaterThanOrEqual(0);
    expect(indexOf("identity")).toBeLessThan(indexOf("carve"));
    expect(indexOf("carve")).toBeLessThan(indexOf("touch"));
  });
});

// ---------------------------------------------------------------------------
// D-02 — the revisit regression guard: net effect, never a sum
// ---------------------------------------------------------------------------

describe("buildStageGroups — rollUp is the net effect, never a sum (D-02)", () => {
  it("a carve of 40 revisited to 172 rolls up as 172, not 212", () => {
    const first = editorEntry("carve", "gallery_edit", summary({ keysRemoved: 40 }), {
      entryId: "e1",
      supersedes: null,
    });
    const revisit = editorEntry("carve", "gallery_edit", summary({ keysRemoved: 172 }), {
      entryId: "e2",
      supersedes: "e1",
    });

    const groups = buildStageGroups({ entries: [first, revisit] });
    const carve = groups.find((g) => g.stepId === "carve");
    expect(carve).toBeDefined();

    // Superseded history stays visible (FR-026) — both entries remain.
    expect(carve!.entries.map((e) => e.entryId)).toEqual(["e1", "e2"]);

    // The roll-up reads the latest EFFECTIVE entry's count, not 40 + 172.
    expect(carve!.rollUp).toEqual({
      kind: "editor-summary",
      actionType: "gallery_edit",
      dimensions: [{ kind: "keysRemoved", count: 172 }],
    });
  });
});

// ---------------------------------------------------------------------------
// FR-024 — an unrecognised stepId is sorted first, never dropped
// ---------------------------------------------------------------------------

describe("buildStageGroups — unknown stepId (FR-024)", () => {
  it("PRE_IDENTITY_STEP_ID and a removed step id are sorted before every manifest stage, and kept", () => {
    const preIdentity = surveyEntry({ entryId: "e1", stepId: PRE_IDENTITY_STEP_ID });
    const removedStep = surveyEntry({ entryId: "e2", stepId: "a_step_a_later_build_removed" });
    const identity = surveyEntry({ entryId: "e3", stepId: "identity" });

    const groups = buildStageGroups({ entries: [identity, preIdentity, removedStep] });

    const stepIds = groups.map((g) => g.stepId);
    expect(stepIds).toContain(PRE_IDENTITY_STEP_ID);
    expect(stepIds).toContain("a_step_a_later_build_removed");

    const identityIndex = stepIds.indexOf("identity");
    const preIdentityIndex = stepIds.indexOf(PRE_IDENTITY_STEP_ID);
    const removedIndex = stepIds.indexOf("a_step_a_later_build_removed");

    expect(preIdentityIndex).toBeLessThan(identityIndex);
    expect(removedIndex).toBeLessThan(identityIndex);

    // Not dropped: the entries are reachable inside their group.
    const preIdentityGroup = groups.find((g) => g.stepId === PRE_IDENTITY_STEP_ID)!;
    expect(preIdentityGroup.entries.map((e) => e.entryId)).toEqual(["e1"]);
  });
});

// ---------------------------------------------------------------------------
// FR-025 — "nothing recorded" is distinct from "changed nothing"
// ---------------------------------------------------------------------------

describe("buildStageGroups — nothing recorded vs. measured-and-unchanged (FR-025)", () => {
  it("a stage with no entries at all is not-recorded, never a reported change", () => {
    // No entries anywhere name the "help" stage.
    const groups = buildStageGroups({ entries: [surveyEntry({ stepId: "identity" })] });
    const help = groups.find((g) => g.stepId === "help");
    expect(help).toBeDefined();
    expect(help!.entries).toEqual([]);
    expect(help!.rollUp).toEqual({ kind: "not-recorded" });
  });

  it("a stage that was entered and measured every dimension as zero is editor-no-change, not not-recorded", () => {
    const zeroed = editorEntry(
      "carve",
      "gallery_edit",
      summary({ keysRemoved: 0, keysAdded: 0, mechanismsAssigned: 0, touchKeysAffected: 0 }),
    );
    const groups = buildStageGroups({ entries: [zeroed] });
    const carve = groups.find((g) => g.stepId === "carve")!;

    expect(carve.rollUp).toEqual({ kind: "editor-no-change", actionType: "gallery_edit" });
    // The two states are genuinely distinct — this is the assertion FR-025 is
    // written against, not just two differently-shaped objects that happen
    // never to be compared.
    expect(carve.rollUp.kind).not.toBe("not-recorded");
  });
});

// ---------------------------------------------------------------------------
// FR-005a — absence rolls up as "not measured", never a number
// ---------------------------------------------------------------------------

describe("buildStageGroups — absent counts roll up as unmeasured, never zero (FR-005a)", () => {
  it("a stage whose every dimension is absent rolls up as editor-unmeasured", () => {
    const unmeasured = editorEntry(
      "mechanisms",
      "mechanism_edit",
      summary({
        keysRemoved: undefined,
        keysAdded: undefined,
        mechanismsAssigned: undefined,
        touchKeysAffected: undefined,
      }),
    );
    const groups = buildStageGroups({ entries: [unmeasured] });
    const mechanisms = groups.find((g) => g.stepId === "mechanisms")!;

    expect(mechanisms.rollUp).toEqual({ kind: "editor-unmeasured", actionType: "mechanism_edit" });
  });

  it("an absent startingKeyCount on a base-contribution entry rolls up as undefined, not 0", () => {
    const groups = buildStageGroups({ entries: [baseEntry(undefined)] });
    const chooseBase = groups.find((g) => g.stepId === "choose_base")!;

    expect(chooseBase.rollUp).toEqual({ kind: "base-contribution", startingKeyCount: undefined });
    // Guard against a `?? 0`-shaped regression: the field must be `undefined`,
    // never the number 0.
    if (chooseBase.rollUp.kind === "base-contribution") {
      expect(chooseBase.rollUp.startingKeyCount).not.toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Survey-only stages (D-02: "for survey decisions, a count of the effective answers")
// ---------------------------------------------------------------------------

describe("buildStageGroups — survey-only stage rollup", () => {
  it("counts only the effective survey answers, excluding superseded ones", () => {
    const first = surveyEntry({ entryId: "e1", stepId: "identity", supersedes: null });
    const revised = surveyEntry({ entryId: "e2", stepId: "identity", supersedes: "e1" });
    const second = surveyEntry({
      entryId: "e3",
      stepId: "identity",
      payload: { kind: "survey-answer", questionId: "il_language_code", answerType: "text", value: "bam" },
      supersedes: null,
    });

    const groups = buildStageGroups({ entries: [first, revised, second] });
    const identity = groups.find((g) => g.stepId === "identity")!;

    // Both the superseded and the superseding entry remain visible.
    expect(identity.entries.map((e) => e.entryId)).toEqual(["e1", "e2", "e3"]);
    // Only e2 and e3 are effective — e1 is history, not counted.
    expect(identity.rollUp).toEqual({ kind: "survey-summary", answerCount: 2 });
  });
});
