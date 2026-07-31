// reducer.decisionRecording.test.ts — the recording spine at the reducer seam
// (specs/053 T020; FR-001, FR-002, FR-006, SC-001, SC-006).
//
// Three things are asserted here, and the third is the one that matters most:
//
//   1. a step completion carrying survey answers appends ONE entry per answer;
//   2. an editor step appends EXACTLY ONE aggregated entry;
//   3. recording is INERT with respect to the artifact. A session run with
//      `recordDecision` injected and the same session run with it omitted must
//      produce identical working-copy state — which is why the dep is optional on
//      `ReducerDeps` rather than something the reducer always calls and skips
//      internally. An audit that could change the keyboard would be worse than no
//      audit at all.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SurveyPhaseResult } from "@keyboard-studio/contracts";
import { recordStepCompletion, type ReducerDeps } from "./reducer.ts";
import {
  resetDecisionEntryIds,
  useDecisionLogStore,
} from "../decisions/decisionLogStore.ts";
import { createDecisionRecorder } from "../decisions/createDecisionRecorder.ts";
import type { SourceSnapshotter } from "../decisions/snapshotSource.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A snapshotter that captures nothing — impact attribution is covered elsewhere. */
function inertSnapshotter(): SourceSnapshotter {
  return {
    captureAtBoundary: () => Promise.resolve(null),
    reset: () => {},
  };
}

function recorderOver(
  overrides: Partial<Parameters<typeof createDecisionRecorder>[0]> = {},
): ReducerDeps["recordDecision"] {
  return createDecisionRecorder({
    snapshotter: inertSnapshotter(),
    getDeletionCounts: () => ({ nodes: 0, items: 0, touchKeys: 0 }),
    getDeletedIds: () => [],
    getKeyboardId: () => "hausa_std",
    ...overrides,
  });
}

/** Only `recordDecision` is populated — nothing else in ReducerDeps is consulted. */
function depsWith(recordDecision: ReducerDeps["recordDecision"]): ReducerDeps {
  return { ...(recordDecision !== undefined ? { recordDecision } : {}) } as ReducerDeps;
}

function phaseResult(answers: SurveyPhaseResult["answers"]): SurveyPhaseResult {
  return { phase: "A", answers };
}

beforeEach(() => {
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
});

// ---------------------------------------------------------------------------
// FR-001 — one entry per survey answer
// ---------------------------------------------------------------------------

describe("FR-001 — a step completion with survey answers", () => {
  it("appends exactly one entry per answer", () => {
    recordStepCompletion(
      "identity",
      phaseResult([
        { questionId: "il_language_english", answerType: "text", value: "Hausa" },
        { questionId: "il_language_code", answerType: "text", value: "ha" },
        { questionId: "il_target_script", answerType: "select", value: "Latn" },
      ]),
      depsWith(recorderOver()),
    );

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.payload.kind)).toEqual([
      "survey-answer",
      "survey-answer",
      "survey-answer",
    ]);
    expect(
      entries.map((e) => (e.payload.kind === "survey-answer" ? e.payload.questionId : null)),
    ).toEqual(["il_language_english", "il_language_code", "il_target_script"]);
  });

  it("stamps the keyboard identity onto the record (FR-004)", () => {
    recordStepCompletion(
      "identity",
      phaseResult([{ questionId: "q", answerType: "text", value: "x" }]),
      depsWith(recorderOver()),
    );
    expect(useDecisionLogStore.getState().record.keyboardId).toBe("hausa_std");
  });

  it("records nothing for a step that carries no answers and is not an editor", () => {
    recordStepCompletion("track", { track: "copy" }, depsWith(recorderOver()));
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);
  });

  it("fires for steps ABSENT from the reducer's effect table", () => {
    // The point of the separate `recordStepCompletion` seam: "identity" and
    // "project_name" are not in STEPS_WITH_APPLY_COMPLETION, and FR-001 covers
    // their answers all the same.
    for (const stepId of ["identity", "project_name", "track", "sequences"]) {
      recordStepCompletion(
        stepId,
        phaseResult([{ questionId: `q_${stepId}`, answerType: "text", value: "v" }]),
        depsWith(recorderOver()),
      );
    }
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// FR-002 — one aggregated entry per editor step
// ---------------------------------------------------------------------------

describe("FR-002 — an editor step", () => {
  it("appends exactly one aggregated entry for a carve of many keys", () => {
    const deleted = Array.from({ length: 40 }, (_, i) => `node-${String(i)}`);
    recordStepCompletion(
      "carve",
      {},
      depsWith(
        recorderOver({
          getDeletionCounts: () => ({ nodes: 40, items: 0, touchKeys: 0 }),
          getDeletedIds: () => deleted,
        }),
      ),
    );

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    const payload = entries[0]!.payload;
    expect(payload.kind).toBe("editor-action");
    if (payload.kind !== "editor-action") throw new Error("unreachable");
    expect(payload.actionType).toBe("gallery_edit");
    expect(payload.summary.keysRemoved).toBe(40);
    // Forty keys summarise to a count plus a bounded sample that says it is one.
    expect(payload.summary.sample).toHaveLength(12);
    expect(payload.summary.sampleTruncated).toBe(true);
  });

  it("records the mechanisms step as one mechanism_edit entry", () => {
    recordStepCompletion(
      "mechanisms",
      {
        answers: [],
        assignments: [
          { scope: "global", target: "ɓ" },
          { scope: "global", target: "ɗ" },
        ],
      },
      depsWith(recorderOver()),
    );
    // The result is SurveyPhaseResult-shaped with no answers, so the only entry is
    // the aggregated editor action.
    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    const payload = entries[0]!.payload;
    if (payload.kind !== "editor-action") throw new Error("expected an editor action");
    expect(payload.actionType).toBe("mechanism_edit");
    expect(payload.summary.mechanismsAssigned).toBe(2);
    expect(payload.summary.sample).toEqual(["ɓ", "ɗ"]);
  });

  it("records the touch step as one touch_edit entry", () => {
    recordStepCompletion(
      "touch",
      { assignments: [{ target: "K_A" }, { target: "K_B" }, { target: "K_C" }] },
      depsWith(recorderOver()),
    );
    const payload = useDecisionLogStore.getState().record.entries[0]!.payload;
    if (payload.kind !== "editor-action") throw new Error("expected an editor action");
    expect(payload.actionType).toBe("touch_edit");
    expect(payload.summary.touchKeysAffected).toBe(3);
  });

  it("supersedes the earlier entry when the step is revisited and changed", () => {
    let nodes = 3;
    const deps = depsWith(
      recorderOver({
        getDeletionCounts: () => ({ nodes, items: 0, touchKeys: 0 }),
        getDeletedIds: () => [],
      }),
    );
    recordStepCompletion("carve", {}, deps);
    nodes = 5;
    recordStepCompletion("carve", {}, deps);

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(2);
    expect(entries[1]!.supersedes).toBe(entries[0]!.entryId);
  });

  it("records nothing when the step is revisited and nothing changed", () => {
    const deps = depsWith(
      recorderOver({
        getDeletionCounts: () => ({ nodes: 3, items: 0, touchKeys: 0 }),
        getDeletedIds: () => [],
      }),
    );
    recordStepCompletion("carve", {}, deps);
    recordStepCompletion("carve", {}, deps);
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(1);
  });

  it("records the characters step through its answers, not as an editor action", () => {
    // `characters` produces a declared inventory, not a source edit — see
    // recordEditorStep.ts. Classing it as an editor action would report an
    // alphabet as though it were a layout change.
    recordStepCompletion(
      "characters",
      phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ", "ɗ"] }]),
      depsWith(recorderOver()),
    );
    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.payload.kind).toBe("survey-answer");
  });
});

// ---------------------------------------------------------------------------
// FR-006 / SC-006 — recording is inert with respect to the artifact
// ---------------------------------------------------------------------------

describe("FR-006 / SC-006 — recording does not alter the keyboard", () => {
  /** The scripted session both runs below replay. */
  const SESSION: Array<[string, unknown]> = [
    ["identity", phaseResult([{ questionId: "il_language_english", answerType: "text", value: "Hausa" }])],
    ["track", { track: "copy" }],
    ["characters", phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }])],
    ["carve", {}],
    ["mechanisms", { answers: [], assignments: [{ scope: "global", target: "ɓ" }] }],
  ];

  it("is a total no-op when recordDecision is absent", () => {
    // The dep omitted entirely — the shape a build without the audit would have.
    const deps = depsWith(undefined);
    for (const [stepId, result] of SESSION) {
      expect(() => recordStepCompletion(stepId, result, deps)).not.toThrow();
    }
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);
  });

  it("mutates only the decision log — never the result payload it is given", () => {
    // The recorder receives the same opaque `result` the reducer does. If it
    // mutated one, a downstream consumer of that payload would see a different
    // value depending on whether auditing was on — which is exactly the class of
    // artifact divergence FR-006 forbids.
    const results = SESSION.map(([, result]) => structuredClone(result));
    const deps = depsWith(recorderOver());
    SESSION.forEach(([stepId, result], i) => {
      recordStepCompletion(stepId, result, deps);
      expect(result).toEqual(results[i]);
    });
    expect(useDecisionLogStore.getState().record.entries.length).toBeGreaterThan(0);
  });

  it("never reads or writes the working copy through the recording seam", () => {
    // Everything the recorder can reach is an injected reader. Asserting the
    // readers are read-only functions is the structural half of SC-006; the
    // end-to-end projected-VFS comparison is T046 (Polish).
    const getDeletionCounts = vi.fn(() => ({ nodes: 0, items: 0, touchKeys: 0 }));
    const getDeletedIds = vi.fn((): readonly string[] => []);
    const getKeyboardId = vi.fn(() => "hausa_std");
    const deps = depsWith(recorderOver({ getDeletionCounts, getDeletedIds, getKeyboardId }));
    for (const [stepId, result] of SESSION) recordStepCompletion(stepId, result, deps);
    // Called, and only as readers — there is no setter in DecisionRecorderDeps.
    expect(getKeyboardId).toHaveBeenCalled();
    expect(getDeletionCounts).toHaveBeenCalled();
  });

  it("advances the source baseline on every completion, recording or not", async () => {
    // A boundary skipped on a non-recording step would make the NEXT diff span two
    // boundaries and attribute another step's change to this one.
    const captureAtBoundary = vi.fn(() => Promise.resolve(null));
    const deps = depsWith(
      recorderOver({ snapshotter: { captureAtBoundary, reset: () => {} } }),
    );
    for (const [stepId, result] of SESSION) recordStepCompletion(stepId, result, deps);
    await Promise.resolve();
    expect(captureAtBoundary).toHaveBeenCalledTimes(SESSION.length);
  });
});

// ---------------------------------------------------------------------------
// Impact attribution — only when it can be honest
// ---------------------------------------------------------------------------

describe("impact attribution", () => {
  const CAPTURED = {
    state: "captured" as const,
    path: "source/hausa_std.kmn",
    hunks: [],
    magnitude: { added: 2, removed: 0 },
  };

  it("attaches the boundary capture to an editor step's single entry", async () => {
    const deps = depsWith(
      recorderOver({
        snapshotter: { captureAtBoundary: () => Promise.resolve(CAPTURED), reset: () => {} },
        getDeletionCounts: () => ({ nodes: 2, items: 0, touchKeys: 0 }),
      }),
    );
    recordStepCompletion("carve", {}, deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(useDecisionLogStore.getState().record.entries[0]!.impact).toEqual(CAPTURED);
  });

  it("attaches it to a question step that resolved exactly one answer", async () => {
    const deps = depsWith(
      recorderOver({
        snapshotter: { captureAtBoundary: () => Promise.resolve(CAPTURED), reset: () => {} },
      }),
    );
    recordStepCompletion(
      "sequences",
      phaseResult([{ questionId: "q_one", answerType: "text", value: "v" }]),
      deps,
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(useDecisionLogStore.getState().record.entries[0]!.impact).toEqual(CAPTURED);
  });

  it("attaches it to NONE of them when a step resolved several answers", async () => {
    // One diff cannot be split between four answers. Attaching it to each would
    // make all four overstate what they did; leaving them to the on-request
    // counterfactual path lets each say honestly that it cannot be isolated.
    const deps = depsWith(
      recorderOver({
        snapshotter: { captureAtBoundary: () => Promise.resolve(CAPTURED), reset: () => {} },
      }),
    );
    recordStepCompletion(
      "identity",
      phaseResult([
        { questionId: "q_a", answerType: "text", value: "1" },
        { questionId: "q_b", answerType: "text", value: "2" },
      ]),
      deps,
    );
    await Promise.resolve();
    await Promise.resolve();
    for (const entry of useDecisionLogStore.getState().record.entries) {
      expect(entry.impact).toBeUndefined();
    }
  });

  it("survives a capture that rejects, leaving the decision recorded", async () => {
    const deps = depsWith(
      recorderOver({
        snapshotter: {
          captureAtBoundary: () => Promise.reject(new Error("projection failed")),
          reset: () => {},
        },
        getDeletionCounts: () => ({ nodes: 1, items: 0, touchKeys: 0 }),
      }),
    );
    recordStepCompletion("carve", {}, deps);
    await Promise.resolve();
    await Promise.resolve();
    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.impact).toBeUndefined();
  });
});
