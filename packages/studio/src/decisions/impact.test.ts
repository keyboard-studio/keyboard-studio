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

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import type {
  DecisionEntry,
  DecisionImpact,
  DecisionRecord,
  EditorActionSummary,
  EditorActionType,
  KeyboardIR,
  SurveyAnswer,
} from "@keyboard-studio/contracts";
import { resolveImpact, type ResolveImpactDeps } from "./impact.ts";
import { createDecisionRecorder } from "./createDecisionRecorder.ts";
import { resetDecisionEntryIds, useDecisionLogStore } from "./decisionLogStore.ts";
import { DecisionTrailView } from "./DecisionTrailView.tsx";
import { render } from "../test/renderWithI18n.tsx";

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

// ---------------------------------------------------------------------------
// Resolution stays on request, through the stage-grouped trail
// (specs/055-legible-decision-trail T039 — FR-021, SC-009).
//
// THE REGRESSION THIS PINS. 055 put a stage roll-up line above each group — a
// one-line net effect for a whole stage. That is exactly the shape that invites
// computing the line by resolving every entry in the group and folding the
// results, which would turn opening the trail from "render the record" into
// "resolve every decision in it". A 200-decision trail must not resolve 200
// impacts to render, and the roll-up must stay what stageGroups.ts already
// derived: a pure value read off the record.
//
// The spy is the component's OWN seam. `DecisionTrailView` takes its resolver
// as a prop (`resolveImpact: (entry) => DecisionImpact | null`) — nothing in
// the trail imports the module directly, which the injection guard below
// asserts mechanically rather than assuming — so a `vi.fn` wrapping the real
// `resolveImpact` counts every resolution the trail performs, and records WHICH
// entry each one was for. Counts alone would not be enough: "0 calls" also
// describes a component that rendered nothing, so every case here first pins
// what actually reached the DOM.
// ---------------------------------------------------------------------------

/** An editor stage's counts; only what a case names is measured (FR-005a). */
function summaryOf(overrides: Partial<EditorActionSummary> = {}): EditorActionSummary {
  return {
    keysRemoved: 0,
    keysAdded: 0,
    mechanismsAssigned: 0,
    touchKeysAffected: 0,
    sample: [],
    sampleTruncated: false,
    ...overrides,
  };
}

function answerEntry(entryId: string, stepId: string, questionId: string): DecisionEntry {
  return {
    entryId,
    stepId,
    payload: { kind: "survey-answer", questionId, answerType: "text", value: "Ewondo" },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
  };
}

function editorEntry(
  entryId: string,
  stepId: string,
  actionType: EditorActionType,
  summary: EditorActionSummary,
  supersedes: string | null = null,
): DecisionEntry {
  return {
    entryId,
    stepId,
    payload: { kind: "editor-action", actionType, summary },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes,
    impact: CAPTURED,
  };
}

function baseEntry(entryId: string): DecisionEntry {
  return {
    entryId,
    stepId: "choose_base",
    payload: {
      kind: "base-contribution",
      baseId: "basic_kbdfr",
      baseDisplayName: "French",
      startingKeyCount: 47,
      derivedAxes: [],
      inheritedMetadata: [],
      instantiationMode: "new-from-base",
    },
    provenance: { agency: "hand-set" },
    recordedAt: 1,
    supersedes: null,
  };
}

function recordOf(entries: readonly DecisionEntry[]): DecisionRecord {
  return {
    format: "keyboard-studio.decision-record",
    version: 1,
    keyboardId: "ewo",
    entries: [...entries],
    truncated: null,
  };
}

/**
 * Five populated stages, in manifest order: identity, choose_base, carve,
 * mechanisms, help.
 *
 * `carve` deliberately carries a superseding revisit (40 keys -> 172), because
 * a roll-up that read history rather than the effective entry would be a second
 * way to end up walking — and potentially resolving — every entry in a group.
 */
const TRAIL_ENTRIES: readonly DecisionEntry[] = [
  answerEntry("id-1", "identity", "il_language_english"),
  answerEntry("id-2", "identity", "il_target_script"),
  baseEntry("base-1"),
  editorEntry("carve-1", "carve", "gallery_edit", summaryOf({ keysRemoved: 40 })),
  editorEntry("carve-2", "carve", "gallery_edit", summaryOf({ keysRemoved: 172 }), "carve-1"),
  editorEntry("mech-1", "mechanisms", "mechanism_edit", summaryOf({ mechanismsAssigned: 12 })),
  answerEntry("help-1", "help", "help_tips"),
];

const TRAIL_STEP_IDS = ["identity", "choose_base", "carve", "mechanisms", "help"];

function entryOf(entryId: string): DecisionEntry {
  const found = TRAIL_ENTRIES.find((e) => e.entryId === entryId);
  if (found === undefined) throw new Error(`no fixture entry "${entryId}"`);
  return found;
}

/**
 * Render the trail with a counting resolver.
 *
 * The resolver is the REAL `resolveImpact`, not a stub, so an expansion is the
 * production path end to end; `vi.fn` only observes it.
 */
function renderTrail(entries: readonly DecisionEntry[] = TRAIL_ENTRIES) {
  const spy = vi.fn((entry: DecisionEntry) => resolveImpact(entry, deps()));
  render(
    createElement(DecisionTrailView, { record: recordOf(entries), resolveImpact: spy }),
  );
  return spy;
}

/** The `entryId`s a spy was asked about, in call order. */
function resolvedIds(spy: ReturnType<typeof renderTrail>): string[] {
  return spy.mock.calls.map((call) => call[0].entryId);
}

function rowFor(entryId: string): HTMLElement {
  const row = screen
    .getAllByTestId("decision-entry")
    .find((r) => r.getAttribute("data-entry-id") === entryId);
  if (row === undefined) throw new Error(`no rendered row for entry "${entryId}"`);
  return row;
}

/** Click one row's expand/collapse toggle. */
function toggleRow(entryId: string): void {
  fireEvent.click(within(rowFor(entryId)).getByTestId("decision-entry-expand"));
}

/** Click one stage group's show/hide toggle. */
function toggleStage(stepId: string): void {
  const group = screen
    .getAllByTestId("decision-stage-group")
    .find((g) => g.getAttribute("data-step-id") === stepId);
  if (group === undefined) throw new Error(`no rendered stage group for step "${stepId}"`);
  fireEvent.click(within(group).getByTestId("decision-stage-toggle"));
}

/** The `entryId`s whose expanded impact region is currently in the document. */
function expandedIds(): string[] {
  return screen
    .getAllByTestId("decision-entry")
    .filter((row) => within(row).queryByTestId("decision-entry-impact") !== null)
    .map((row) => row.getAttribute("data-entry-id") ?? "");
}

describe("FR-021 — rendering a stage roll-up resolves no entry's impact", () => {
  afterEach(cleanup);

  it("resolves exactly zero impacts to render five populated stage groups (SC-009)", () => {
    const spy = renderTrail();

    // First: the render is NOT vacuous. A component that threw or bailed would
    // also report zero resolutions, so what reached the DOM is pinned before
    // the count is read.
    expect(
      screen.getAllByTestId("decision-stage-group").map((g) => g.getAttribute("data-step-id")),
    ).toEqual(TRAIL_STEP_IDS);
    expect(screen.getAllByTestId("decision-entry")).toHaveLength(TRAIL_ENTRIES.length);
    // Every roll-up line actually said something.
    const summaries = screen.getAllByTestId("decision-stage-summary").map((s) => s.textContent);
    expect(summaries).toHaveLength(TRAIL_STEP_IDS.length);
    for (const text of summaries) expect(text).not.toBe("");
    // And the lines carry the derived numbers — proving the roll-ups were
    // computed, from `group.rollUp`, with the D-02 revisit rule applied (172,
    // never 40 and never the 212 a sum would give).
    expect(summaries.join(" | ")).toContain("172");
    expect(summaries.join(" | ")).toContain("12");
    expect(summaries.join(" | ")).toContain("47");
    expect(summaries.join(" | ")).not.toContain("212");
    // Nothing is expanded, so nothing has been asked about.
    expect(screen.queryAllByTestId("decision-entry-impact")).toHaveLength(0);

    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("still resolves zero for a 200-decision trail — the cost of rendering is not the trail's length", () => {
    const long = Array.from({ length: 200 }, (_, i) =>
      answerEntry(`long-${i}`, i % 2 === 0 ? "identity" : "help", "il_language_english"),
    );
    const spy = renderTrail(long);

    expect(screen.getAllByTestId("decision-entry")).toHaveLength(200);
    expect(screen.getAllByTestId("decision-stage-group")).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it("resolves nothing when a stage is collapsed and re-expanded with no row open", () => {
    const spy = renderTrail();
    toggleStage("carve");
    expect(within(
      screen.getAllByTestId("decision-stage-group").find((g) => g.getAttribute("data-step-id") === "carve")!,
    ).queryAllByTestId("decision-entry")).toHaveLength(0);
    toggleStage("carve");
    // The rows are back, and re-mounting them computed nothing: a row resolves
    // on its own expand click, never on being rendered.
    expect(screen.getAllByTestId("decision-entry")).toHaveLength(TRAIL_ENTRIES.length);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe("FR-021 — expanding one entry resolves only that entry", () => {
  afterEach(cleanup);

  it("resolves exactly one impact, for the entry that was expanded", () => {
    const spy = renderTrail();
    toggleRow("id-2");

    expect(spy).toHaveBeenCalledTimes(1);
    // Identity, not just the count: the resolver was handed THAT entry object.
    expect(spy.mock.calls[0]![0]).toBe(entryOf("id-2"));
    // And only that row opened, so no other row could have been resolved for.
    expect(expandedIds()).toEqual(["id-2"]);
  });

  it("resolves only the second entry when a second is expanded — the first is not re-resolved", () => {
    const spy = renderTrail();
    toggleRow("id-2");
    toggleRow("mech-1");

    // Two expansions, two resolutions, in that order. A sibling row's state
    // change does not re-render an already-open row, so "id-2" appears once.
    expect(resolvedIds(spy)).toEqual(["id-2", "mech-1"]);
    expect(spy.mock.calls[1]![0]).toBe(entryOf("mech-1"));
    expect(expandedIds()).toEqual(["id-2", "mech-1"]);
    // Both rendered real impact detail — the resolutions produced something,
    // rather than the rows opening onto nothing.
    expect(screen.getAllByTestId("decision-entry-impact")).toHaveLength(2);
  });

  it("re-resolves only the same entry across collapse and re-expand", () => {
    const spy = renderTrail();
    toggleRow("id-2");
    toggleRow("id-2"); // collapse
    expect(expandedIds()).toEqual([]);
    // Collapsing computes nothing.
    expect(spy).toHaveBeenCalledTimes(1);

    toggleRow("id-2"); // re-expand
    // Re-expanding DOES resolve again — impact.ts's resolution is deliberately
    // not memoised across collapse (DecisionEntryRow's comment: the working copy
    // may have moved on). What matters for FR-021 is that the second resolution
    // is still for the same single entry and fans out to nobody.
    expect(resolvedIds(spy)).toEqual(["id-2", "id-2"]);
    expect(new Set(resolvedIds(spy))).toEqual(new Set(["id-2"]));
  });

  it("does not resolve siblings when a different stage is collapsed under an open row", () => {
    const spy = renderTrail();
    toggleRow("id-2");
    // A parent-state change: it re-renders every group, which is the moment a
    // roll-up recomputed from resolved impacts would fan out across the record.
    toggleStage("mechanisms");

    // The open row re-renders and re-resolves itself; nothing else is asked
    // about, so no other entry's `entryId` ever appears.
    expect(new Set(resolvedIds(spy))).toEqual(new Set(["id-2"]));
    expect(expandedIds()).toEqual(["id-2"]);
    // The stage really did collapse — otherwise this asserts nothing.
    expect(screen.getAllByTestId("decision-entry")).toHaveLength(TRAIL_ENTRIES.length - 1);
  });

  it("resolves nothing at all for a base-contribution row, which has no diff to isolate", () => {
    const spy = renderTrail();
    toggleRow("base-1");

    // The row opens onto the base's own derived/inherited detail rather than a
    // source change, so `resolveImpact` is never reached — the count is zero,
    // not one.
    expect(expandedIds()).toEqual(["base-1"]);
    expect(spy).toHaveBeenCalledTimes(0);
  });
});

describe("FR-021 — the injected resolver is the trail's only route to impact", () => {
  // What makes the prop spy above COMPLETE. If a component imported
  // `resolveImpact` from this module directly, it could resolve as many entries
  // as it liked without the spy seeing one of them, and every zero-count
  // assertion here would still pass. So the absence of that import is asserted,
  // not assumed.
  const sourceOf = (file: string): string =>
    readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8");

  it("neither trail component imports impact.ts", () => {
    for (const file of ["DecisionTrailView.tsx", "DecisionEntryRow.tsx"]) {
      const source = sourceOf(file);
      // Guard the guard: the files this reads must actually be the components.
      expect(source).toContain("resolveImpact");
      expect(source).not.toMatch(/^\s*import[^;]*from\s+"\.\/impact\.ts"/m);
    }
  });
});
