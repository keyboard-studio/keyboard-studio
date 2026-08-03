// Tests for on-request impact resolution (specs/053 T029, FR-010/FR-011).
//
// The two things worth pinning: a stored capture is returned VERBATIM (never
// re-derived, or the audit could disagree with the artifact — SC-005), and an
// underivable impact reports WHICH of the two reasons applies rather than
// degrading to an empty diff.
//
// The mutate-seam-off case is not an edge case here: it is the SHIPPED default
// (flags/mutateFlag.ts), so it is the behaviour most survey entries will actually
// take, and it must say so honestly.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DecisionEntry,
  DecisionImpact,
  KeyboardIR,
  SurveyAnswer,
} from "@keyboard-studio/contracts";
import { resolveImpact, type ResolveImpactDeps } from "./impact.ts";
import { createDecisionRecorder } from "./createDecisionRecorder.ts";
import { resetDecisionEntryIds, useDecisionLogStore } from "./decisionLogStore.ts";

function deps(overrides: Partial<ResolveImpactDeps> = {}): ResolveImpactDeps {
  return {
    getWorkingIR: () => null,
    isDesktopLocked: () => false,
    isTouchLocked: () => false,
    ...overrides,
  };
}

function entry(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    entryId: "d1",
    stepId: "sequences",
    payload: {
      kind: "survey-answer",
      questionId: "some_question_with_no_module",
      answerType: "text",
      value: "x",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
    ...overrides,
  };
}

const CAPTURED: DecisionImpact = {
  state: "captured",
  // Per-file since specs/055 FR-016 widened a capture from one `.kmn` path to a
  // set spanning every projected text file.
  files: [
    {
      path: "source/foo.kmn",
      hunks: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 2, lines: [" a", "+b"] }],
      magnitude: { added: 1, removed: 0 },
    },
  ],
  magnitude: { added: 1, removed: 0 },
};

describe("stored captures are returned verbatim", () => {
  it("returns an editor step's captured impact unchanged", () => {
    const editor = entry({
      stepId: "carve",
      payload: {
        kind: "editor-action",
        actionType: "gallery_edit",
        summary: {
          keysRemoved: 3,
          keysAdded: 0,
          mechanismsAssigned: 0,
          touchKeysAffected: 0,
          sample: [],
          sampleTruncated: false,
        },
      },
      impact: CAPTURED,
    });
    // Identity, not equality: the stored object is handed back, so there is no
    // opportunity for a re-derivation to differ from what was captured.
    expect(resolveImpact(editor, deps())).toBe(CAPTURED);
  });

  it("returns a stored `none` rather than re-deriving it", () => {
    const none: DecisionImpact = { state: "none" };
    expect(resolveImpact(entry({ impact: none }), deps())).toBe(none);
  });

  it("never touches the working IR when a capture is stored", () => {
    const getWorkingIR = vi.fn(() => null);
    resolveImpact(entry({ impact: CAPTURED }), deps({ getWorkingIR }));
    expect(getWorkingIR).not.toHaveBeenCalled();
  });
});

describe("shed entries", () => {
  it("returns null for an entry whose detail was shed", () => {
    // null is the caller's signal to render the shed notice — distinct from
    // "unavailable" (never derivable) and from "none" (derived, no change).
    expect(resolveImpact(entry({ impact: null }), deps())).toBeNull();
  });
});

describe("underivable impacts report a reason (FR-011)", () => {
  it("reports no-rederivable-write-path with the mutate seam off — the shipped default", () => {
    // No VITE_KM_MUTATE_SEAM in the test env, so isMutateSeamEnabled() is false:
    // exactly the default build's behaviour.
    expect(resolveImpact(entry(), deps())).toEqual({
      state: "unavailable",
      reason: "no-rederivable-write-path",
    });
  });

  it("reports lock-gate-dependency for a step behind a lock that has passed", () => {
    // "mechanisms" carries lock: "physical" in the manifest.
    const locked = entry({ stepId: "mechanisms" });
    expect(resolveImpact(locked, deps({ isDesktopLocked: () => true }))).toEqual({
      state: "unavailable",
      reason: "lock-gate-dependency",
    });
  });

  it("does not report a lock that has not yet passed", () => {
    const notYetLocked = entry({ stepId: "mechanisms" });
    expect(resolveImpact(notYetLocked, deps({ isDesktopLocked: () => false }))).toEqual({
      state: "unavailable",
      reason: "no-rederivable-write-path",
    });
  });

  it("reports lock-gate-dependency for the touch lock once a layout exists", () => {
    expect(resolveImpact(entry({ stepId: "touch" }), deps({ isTouchLocked: () => true }))).toEqual({
      state: "unavailable",
      reason: "lock-gate-dependency",
    });
  });

  it("never returns an empty captured impact in place of a reason", () => {
    // The failure this guards against: rendering `{ state: "captured", hunks: [] }`
    // for something that could not be derived, which reads as "nothing happened".
    const result = resolveImpact(entry(), deps());
    expect(result).not.toBeNull();
    expect(result!.state).not.toBe("captured");
  });
});

describe("FR-010 — nothing is computed for an entry that was not asked about", () => {
  it("has no batch form: one call resolves one entry", () => {
    // Structural, so asserted structurally: `resolveImpact` takes a single entry.
    // There is no code path that could walk a record, which is what makes
    // "computed only when requested" true rather than merely intended.
    expect(resolveImpact.length).toBeGreaterThanOrEqual(2);
  });

  it("reads the working IR at most once per resolution", () => {
    const getWorkingIR = vi.fn((): KeyboardIR | null => null);
    resolveImpact(entry(), deps({ getWorkingIR }));
    // With the seam off it is not consulted at all; with it on it is consulted
    // once. Either way, resolving one entry never fans out.
    expect(getWorkingIR.mock.calls.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// The identity stage, end to end (specs/055-legible-decision-trail T034 —
// FR-016/FR-017/FR-019/FR-019a, SC-006, US4 scenarios 2-3).
//
// THE DEFECT THIS PINS. The identity stage resolves several answers in ONE
// completion event, and together they change only the `.kps` package metadata.
// The pre-055 capture compared a single `.kmn` text, so every identity decision
// resolved to `"unavailable"` — not because the studio could not tell, but
// because the comparison was not looking at the file that changed (SC-006:
// "zero report a reason that a widened comparison would have resolved").
//
// So these drive the PRODUCTION path — `createDecisionRecorder` over the real
// store, then `resolveImpact` per entry, the same call the trail makes when an
// author expands one — and only the boundary capture is a stub, standing in for
// the projection read.
// ---------------------------------------------------------------------------

/** The metadata file the identity answers jointly change, and nothing else. */
const KPS_PATH = "source/ewo.kps";

const KPS_CAPTURE: DecisionImpact = {
  state: "captured",
  files: [
    {
      path: KPS_PATH,
      hunks: [
        {
          oldStart: 4,
          oldLines: 1,
          newStart: 4,
          newLines: 1,
          lines: ["-    <Name>New Keyboard</Name>", "+    <Name>Ewondo</Name>"],
        },
      ],
      magnitude: { added: 1, removed: 1 },
    },
  ],
  magnitude: { added: 1, removed: 1 },
};

/** The four answers the identity stage resolves together, in ask order. */
const IDENTITY_ANSWERS: readonly SurveyAnswer[] = [
  { questionId: "il_language_english", answerType: "text", value: "Ewondo" },
  { questionId: "il_language_autonym", answerType: "text", value: "Kolo" },
  { questionId: "il_language_code", answerType: "text", value: "ewo" },
  { questionId: "il_target_script", answerType: "select", value: "Latn" },
];

/**
 * A recorder wired to a stub boundary capture.
 *
 * Everything except `snapshotter` is the inert shape the identity step presents:
 * no carve deletions, no assignments, no base yet. The returned `captureAtBoundary`
 * spy is what FR-019a is asserted against.
 */
function identityRecorder(capture: DecisionImpact | null) {
  const captureAtBoundary = vi.fn(async () => capture);
  const record = createDecisionRecorder({
    snapshotter: { captureAtBoundary, reset: () => {} },
    getDeletionCounts: () => ({ nodes: 0, items: 0, touchKeys: 0 }),
    getDeletedIds: () => [],
    getMechanismAssignments: () => [],
    getBaseIr: () => null,
    getDeletedNodeIds: () => new Set<string>(),
    getDeletedItemIds: () => new Set<string>(),
    getKeyboardId: () => "ewo",
    getBaseKeyboard: () => null,
    getIrAxes: () => ({}),
    getInstantiationMode: () => null,
    getRemovalCapabilities: () => new Map(),
  });
  return { record, captureAtBoundary };
}

/** The log's entries, in the order the stage recorded them. */
function recordedEntries(): readonly DecisionEntry[] {
  return useDecisionLogStore.getState().read().entries;
}

/**
 * Wait for the boundary capture to be attached.
 *
 * The recorder appends synchronously and attaches the impact when the async
 * projection read resolves, so a test that read the store immediately would see
 * entries with no impact yet — a timing artefact, not the behaviour under test.
 */
async function attachedImpacts(expectedCount: number): Promise<readonly DecisionEntry[]> {
  await vi.waitFor(() => {
    const entries = recordedEntries();
    expect(entries).toHaveLength(expectedCount);
    expect(entries.filter((e) => e.impact !== undefined)).toHaveLength(expectedCount);
  });
  return recordedEntries();
}

/** Narrow to the captured variant, failing loudly (never silently) otherwise. */
function expectCaptured(impact: DecisionImpact | null) {
  if (impact === null || impact.state !== "captured") {
    throw new Error(
      `expected a captured impact, got ${impact === null ? "null (shed)" : `"${impact.state}"`}`,
    );
  }
  return impact;
}

describe("identity stage — a metadata-only change is shown, and shown jointly", () => {
  beforeEach(() => {
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();
  });

  it("shows each identity decision the .kps change, with the file identified (FR-017, SC-006)", async () => {
    const { record } = identityRecorder(KPS_CAPTURE);
    record({ stepId: "identity", result: { phase: "A", answers: [...IDENTITY_ANSWERS] } });
    const entries = await attachedImpacts(IDENTITY_ANSWERS.length);

    for (const entry of entries) {
      // The same call `DecisionTrailView` makes when the author expands a row.
      const impact = expectCaptured(resolveImpact(entry, deps()));
      // The file is IDENTIFIED — the assertion the old one-`.kmn` comparison
      // could not have passed, since `source/ewo.kps` was never compared.
      expect(impact.files.map((f) => f.path)).toEqual([KPS_PATH]);
      expect(impact.files[0]!.hunks).not.toHaveLength(0);
      expect(impact.magnitude).toEqual({ added: 1, removed: 1 });
    }
  });

  it("reports no unavailability reason for any identity decision (SC-006)", async () => {
    const { record } = identityRecorder(KPS_CAPTURE);
    record({ stepId: "identity", result: { phase: "A", answers: [...IDENTITY_ANSWERS] } });
    const entries = await attachedImpacts(IDENTITY_ANSWERS.length);

    // SC-006 counts reasons, so this counts them: zero, across the whole stage.
    const states = entries.map((e) => resolveImpact(e, deps())?.state ?? "shed");
    expect(states).toEqual(new Array(IDENTITY_ANSWERS.length).fill("captured"));
  });

  it("attributes the one change to all four decisions jointly, each naming its co-decisions (FR-019)", async () => {
    const { record } = identityRecorder(KPS_CAPTURE);
    record({ stepId: "identity", result: { phase: "A", answers: [...IDENTITY_ANSWERS] } });
    const entries = await attachedImpacts(IDENTITY_ANSWERS.length);
    const allIds = entries.map((e) => e.entryId);

    for (const entry of entries) {
      const impact = expectCaptured(resolveImpact(entry, deps()));
      // The SAME change on every entry — not four differently-attributed ones.
      expect(impact.files).toEqual(KPS_CAPTURE.files);
      expect(impact.magnitude).toEqual(KPS_CAPTURE.magnitude);
      // Stated as shared, and the co-decisions are NAMED: exactly the other three.
      expect(impact.sharedWith).toBeDefined();
      expect([...impact.sharedWith!].sort()).toEqual(
        allIds.filter((id) => id !== entry.entryId).sort(),
      );
    }
  });

  it("never lets an entry name itself among its co-decisions", async () => {
    const { record } = identityRecorder(KPS_CAPTURE);
    record({ stepId: "identity", result: { phase: "A", answers: [...IDENTITY_ANSWERS] } });
    const entries = await attachedImpacts(IDENTITY_ANSWERS.length);

    for (const entry of entries) {
      const impact = expectCaptured(resolveImpact(entry, deps()));
      // "Shared with itself" is not a statement about anything; it would also
      // let a renderer count one decision twice.
      expect(impact.sharedWith).not.toContain(entry.entryId);
      expect(impact.sharedWith).toHaveLength(IDENTITY_ANSWERS.length - 1);
    }
  });

  it("compares once per stage boundary, not once per decision (FR-019a)", async () => {
    const { record, captureAtBoundary } = identityRecorder(KPS_CAPTURE);
    record({ stepId: "identity", result: { phase: "A", answers: [...IDENTITY_ANSWERS] } });
    await attachedImpacts(IDENTITY_ANSWERS.length);

    // The count, not merely "was called": four decisions attributed from ONE
    // comparison is the whole of FR-019a. Fanning out to a diff per decision
    // would still produce a correct-looking trail, and would quietly reintroduce
    // 053's one-change-per-boundary violation.
    expect(captureAtBoundary).toHaveBeenCalledTimes(1);
  });

  it("leaves a single-decision boundary claiming the change outright — sharedWith ABSENT, not empty", async () => {
    const { record, captureAtBoundary } = identityRecorder(KPS_CAPTURE);
    // One answer resolved at this boundary: nothing to share with.
    record({ stepId: "identity", result: { phase: "A", answers: [IDENTITY_ANSWERS[0]!] } });
    const [entry] = await attachedImpacts(1);
    const impact = expectCaptured(resolveImpact(entry!, deps()));

    // Absence, three ways, because `[]` would pass a falsiness check while
    // saying something different and wrong: "this change is shared with nobody"
    // rather than "this decision made it".
    expect("sharedWith" in impact).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(impact, "sharedWith")).toBe(false);
    expect(impact.sharedWith).toBeUndefined();
    // Still a fully attributed change, with the file identified.
    expect(impact.files.map((f) => f.path)).toEqual([KPS_PATH]);
    expect(captureAtBoundary).toHaveBeenCalledTimes(1);
  });
});
