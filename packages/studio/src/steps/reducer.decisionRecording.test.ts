// reducer.decisionRecording.test.ts — the recording spine at the reducer seam,
// driven through the PRODUCTION completion path (specs/053 T020; specs/055 T012).
//
// WHY THIS FILE WAS REWRITTEN — the defect it now prevents from recurring.
//
// The 053 version of these tests completed the mechanisms step with a
// hand-written `{ answers: [], assignments: [{ scope, target }, …] }` payload.
// No adapter emits that. `AddPhysicalAdapter` calls `onComplete(undefined)`, and
// `CarveAdapter` does the same. So the tests asserted `mechanismsAssigned === 2`
// while the production path recorded zero mechanisms for every real session —
// they were testing a fiction, and the fiction is what made the field look
// producible when it was not (specs/055 FR-004).
//
// The rule that replaces it (FR-027 / SC-010): a test asserting what the record
// contains for a step drives that step's real completion path. Concretely, in
// this file:
//
//   - the step RESULT is the payload the step's own adapter passes to
//     `onComplete` — `undefined` for carve and mechanisms (carveAdapter.tsx,
//     addPhysicalAdapter.tsx), the `{ assignments, baseIr, baseVfs, mods,
//     seedSource }` object for touch (addTouchAdapter.tsx), a real
//     `SurveyPhaseResult` for the question steps;
//   - every COUNT the recorder reports is read out of the real working-copy
//     store, mutated beforehand by the same store actions the galleries call
//     (`deleteNode`, `deleteItem`, `deleteTouchKey`, `recordAssignments`);
//   - no test may inject a count. `realRecorder()` exposes only the snapshotter
//     as an override — the four store-derived readers are fixed, so there is no
//     seam left through which a synthetic count could re-enter.
//
// FR-029 / SC-002: each of the four reporting dimensions has a test below that
// drives it to a NON-ZERO value through that path — `keysRemoved`, `keysAdded`,
// `mechanismsAssigned`, `touchKeysAffected`. A dimension no test can move is a
// dimension with no producer.
//
// FR-005 / FR-005a: absence and a present zero are different statements and are
// asserted as different things. Absence is checked with `Object.hasOwn`, not
// just `toBeUndefined()` — a stored `0` is falsy and a value-only check would
// wave it through.
//
// The 053 guarantees this file already carried are kept and re-driven the same
// way: one entry per survey answer (FR-001), exactly one aggregated entry per
// editor step (FR-002), and recording being inert with respect to the artifact
// (FR-006 / SC-006).
//
// KNOWN LIMITATION, recorded rather than hidden: `realRecorder()` re-states
// StudioShell's `createDecisionRecorder({…})` dep block, because that block is
// written inline in StudioShell.tsx and cannot be imported. The expressions are
// copied verbatim from there; if the shell's wiring changes, this must change
// with it.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type {
  BaseKeyboard,
  DecisionImpact,
  EditorActionSummary,
  KeyboardIR,
  MechanismAssignment,
  SurveyPhaseResult,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { makeSlotId, parseKmn } from "@keyboard-studio/engine";
import { recordStepCompletion, type ReducerDeps } from "./reducer.ts";
import {
  resetDecisionEntryIds,
  useDecisionLogStore,
} from "../decisions/decisionLogStore.ts";
import { createDecisionRecorder } from "../decisions/createDecisionRecorder.ts";
import type { SourceSnapshotter } from "../decisions/snapshotSource.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { selectDesktopAssignments } from "../lib/unimplementedInventory.ts";
import { deriveDesktopModifications } from "../lib/deriveDesktopModifications.ts";

// ---------------------------------------------------------------------------
// Fixture keyboard — small, but parsed by the real codec
// ---------------------------------------------------------------------------

const BASE_ID = "test_base";

// Two rules, so the base occupies exactly {K_A, K_B}; one non-system store, so a
// store-slot item deletion has a real slot id to name.
const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Test Base'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "store(vowels) 'a' 'e' 'i' 'o' 'u'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
].join("\n");

const BASE: BaseKeyboard = {
  id: BASE_ID,
  path: "release/t/test_base",
  script: "Latn",
  targets: ["windows"],
  displayName: "Test Base",
  version: "1.0",
};

function makeBaseVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${BASE_ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${BASE_ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
}

/**
 * Instantiate the working copy the way the choose-base step does, and hand back
 * the parsed IR.
 *
 * The IR comes from the real codec rather than a hand-built literal: `keysAdded`
 * is measured against `occupiedHostKeys(applyCarveMutate(baseIr, …))`, which
 * walks parsed rule shapes. A cast stand-in would occupy nothing, and every key
 * would then look newly added.
 */
function instantiate(): KeyboardIR {
  const ir = parseKmn(KMN, `${BASE_ID}.kmn`).ir;
  useWorkingCopyStore.getState().instantiateFromBase(BASE, { vfs: makeBaseVfs(), ir });
  return ir;
}

/** The nodeId of the rule whose context is `[vkey]` — the rule a carve removes. */
function ruleNodeIdFor(ir: KeyboardIR, vkey: string): string {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      if (rule.context.some((c) => c.kind === "vkey" && c.name === vkey)) return rule.nodeId;
    }
  }
  throw new Error(`fixture has no [${vkey}] rule`);
}

/** A real store-slot item id — `<storeNodeId>#<index>` for the `vowels` store. */
function vowelSlotId(ir: KeyboardIR, index: number): string {
  const store = ir.stores.find((s) => s.name === "vowels");
  if (store === undefined) throw new Error("fixture has no `vowels` store");
  return makeSlotId(store.nodeId, index);
}

// ---------------------------------------------------------------------------
// Production step payloads — exactly what each adapter passes to onComplete
// ---------------------------------------------------------------------------

/** `CarveAdapter` / `AddPhysicalAdapter` both call `onComplete(undefined)`. */
const ADAPTER_EMITS_NOTHING = undefined;

/**
 * The touch step's payload, assembled the way `AddTouchAdapter` assembles it:
 * the gallery's assignments plus the store-sourced `baseIr` / `baseVfs`, the
 * `mods` derived through the same `deriveDesktopModifications` call, and the raw
 * seed-source fork choice.
 */
function touchCompleteResult(assignments: readonly MechanismAssignment[]): unknown {
  const wc = useWorkingCopyStore.getState();
  const { baseIr, baseVfs, deletedNodeIds, deletedItemIds, phaseResults } = wc;
  return {
    assignments,
    baseIr,
    baseVfs,
    mods:
      baseIr === null
        ? { removals: [], placements: [] }
        : deriveDesktopModifications(baseIr, deletedNodeIds, deletedItemIds, phaseResults),
    seedSource: useSurveySessionStore.getState().touchSeedSource,
  };
}

function phaseResult(answers: SurveyPhaseResult["answers"]): SurveyPhaseResult {
  return { phase: "A", answers };
}

// ---------------------------------------------------------------------------
// Assignment fixtures — recorded through `recordAssignments`, the store action
// MechanismGallery itself calls
// ---------------------------------------------------------------------------

/**
 * Places ɓ on K_Q — a key the base occupies with nothing, so it is a genuine
 * addition (FR-003).
 */
const ADDS_K_Q: MechanismAssignment = {
  scope: "individual",
  target: "ɓ",
  modality: "physical",
  mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_Q] > 'ɓ'" } }],
};

/**
 * A deadkey over the base letter `a` — host key K_A, which the base ALREADY
 * occupies. One more mechanism assigned, zero keys added (FR-003: the two counts
 * never describe the same edit).
 */
const REASSIGNS_K_A: MechanismAssignment = {
  scope: "individual",
  target: "á",
  modality: "physical",
  mechanisms: [{ patternId: "deadkey_single_tap", slotValues: { baseLetters: "a" } }],
};

/** A touch-modality assignment — must never reach a desktop count. */
const TOUCH_ONLY: MechanismAssignment = {
  scope: "individual",
  target: "ɗ",
  modality: "touch",
  mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_D] > 'ɗ'" } }],
};

function touchAssignment(target: string, vkey: string): MechanismAssignment {
  return {
    scope: "individual",
    target,
    modality: "touch",
    mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: `+ [${vkey}] > '${target}'` } }],
  };
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** A snapshotter that captures nothing — impact attribution is exercised below. */
function inertSnapshotter(): SourceSnapshotter {
  return {
    captureAtBoundary: () => Promise.resolve(null),
    reset: () => {},
  };
}

/**
 * The recorder as StudioShell builds it: every count read live out of the
 * working-copy store.
 *
 * The snapshotter is the ONLY override. That is the anti-regression property of
 * this harness — there is no parameter through which a test could supply a
 * count, so nothing recorded below can be truer than the store.
 */
function realRecorder(
  overrides: { snapshotter?: SourceSnapshotter } = {},
): ReducerDeps["recordDecision"] {
  return createDecisionRecorder({
    snapshotter: overrides.snapshotter ?? inertSnapshotter(),
    getDeletionCounts: () => {
      const wc = useWorkingCopyStore.getState();
      return {
        nodes: wc.deletedNodeIds.size,
        items: wc.deletedItemIds.size,
        touchKeys: wc.deletedTouchKeyIds.size,
      };
    },
    getDeletedIds: () => {
      const wc = useWorkingCopyStore.getState();
      return [...wc.deletedNodeIds, ...wc.deletedItemIds, ...wc.deletedTouchKeyIds];
    },
    getMechanismAssignments: () =>
      selectDesktopAssignments(useWorkingCopyStore.getState().phaseResults),
    getBaseIr: () => useWorkingCopyStore.getState().baseIr,
    getDeletedNodeIds: () => useWorkingCopyStore.getState().deletedNodeIds,
    getDeletedItemIds: () => useWorkingCopyStore.getState().deletedItemIds,
    getKeyboardId: () => {
      const wc = useWorkingCopyStore.getState();
      return wc.identity?.keyboardId ?? wc.baseKeyboard?.id ?? null;
    },
  });
}

/** Only `recordDecision` is populated — nothing else in ReducerDeps is consulted. */
function depsWith(recordDecision: ReducerDeps["recordDecision"]): ReducerDeps {
  return { ...(recordDecision !== undefined ? { recordDecision } : {}) } as ReducerDeps;
}

/** The single editor-action summary the log holds, or a failure if there isn't one. */
function onlyEditorSummary(): EditorActionSummary {
  const entries = useDecisionLogStore.getState().record.entries;
  expect(entries).toHaveLength(1);
  const payload = entries[0]!.payload;
  if (payload.kind !== "editor-action") throw new Error("expected an editor action");
  return payload.summary;
}

/**
 * FR-005 absence: the dimension is not on the summary at all.
 *
 * `Object.hasOwn` is the load-bearing half — a present `0` is falsy, so a
 * `toBeUndefined()`-only check would accept exactly the coercion FR-005a bans.
 */
function expectAbsent(summary: EditorActionSummary, key: keyof EditorActionSummary): void {
  expect(Object.hasOwn(summary, key)).toBe(false);
  expect(summary[key]).toBeUndefined();
}

/** FR-005 present zero: measured, and nothing changed. Distinct from absent. */
function expectPresentZero(summary: EditorActionSummary, key: keyof EditorActionSummary): void {
  expect(Object.hasOwn(summary, key)).toBe(true);
  expect(summary[key]).toBe(0);
}

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
});

// ---------------------------------------------------------------------------
// FR-029 / SC-002 — every reporting dimension has a producer, driven non-zero
// through the production completion path
// ---------------------------------------------------------------------------

describe("FR-029 / SC-002 — each dimension driven non-zero through the production path", () => {
  it("keysRemoved: a real carve of a rule node and a store slot", () => {
    const ir = instantiate();
    const wc = useWorkingCopyStore.getState();
    wc.deleteNode(ruleNodeIdFor(ir, "K_B"));
    wc.deleteItem(vowelSlotId(ir, 0));

    // The carve adapter's own completion payload.
    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    // nodes + items, and it agrees with the store rather than with a constant.
    const after = useWorkingCopyStore.getState();
    expect(summary.keysRemoved).toBe(after.deletedNodeIds.size + after.deletedItemIds.size);
    expect(summary.keysRemoved).toBe(2);
    expect(summary.sample).toEqual([ruleNodeIdFor(ir, "K_B"), vowelSlotId(ir, 0)]);
  });

  it("touchKeysAffected: real touch-key deletions reported by the carve stage", () => {
    instantiate();
    const wc = useWorkingCopyStore.getState();
    for (const id of ["touch-key-1", "touch-key-2", "touch-key-3"]) wc.deleteTouchKey(id);

    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.touchKeysAffected).toBe(3);
    expect(summary.touchKeysAffected).toBe(
      useWorkingCopyStore.getState().deletedTouchKeyIds.size,
    );
  });

  it("touchKeysAffected: the touch stage's own assignments, from the adapter's payload", () => {
    instantiate();
    const assignments = [
      touchAssignment("ɓ", "K_B"),
      touchAssignment("ɗ", "K_D"),
      touchAssignment("ƴ", "K_Y"),
    ];

    recordStepCompletion("touch", touchCompleteResult(assignments), depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.touchKeysAffected).toBe(3);
    expect(summary.sample).toEqual(["ɓ", "ɗ", "ƴ"]);
  });

  it("mechanismsAssigned: the store's phase-C physical assignments", () => {
    instantiate();
    // The store action MechanismGallery calls when the author assigns.
    useWorkingCopyStore.getState().recordAssignments([ADDS_K_Q, REASSIGNS_K_A, TOUCH_ONLY]);

    // AddPhysicalAdapter passes NOTHING — the whole point. A count read off the
    // result would be zero here.
    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    // Two physical assignments; the touch-modality one belongs to the touch
    // stage and must not leak into a desktop count (FR-002 — the trail and the
    // studio read the same `selectDesktopAssignments` state).
    expect(summary.mechanismsAssigned).toBe(2);
    expect(summary.mechanismsAssigned).toBe(
      selectDesktopAssignments(useWorkingCopyStore.getState().phaseResults).length,
    );
    expect(summary.sample).toEqual(["ɓ", "á"]);
  });

  it("keysAdded: an assignment landing on a key the base did not occupy", () => {
    instantiate();
    useWorkingCopyStore.getState().recordAssignments([ADDS_K_Q, REASSIGNS_K_A]);

    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    // K_Q was empty in the base and now carries ɓ. K_A already typed `a`, so
    // reassigning it is a mechanism assigned and NOT a key added (FR-003) —
    // which is why this is 1 and not 2.
    expect(summary.keysAdded).toBe(1);
    expect(summary.mechanismsAssigned).toBe(2);
  });

  it("keysAdded: reads occupancy through the carve projection, not the raw base", () => {
    // research D-05: `before` is the base IR with the carve applied, rebuilt at
    // completion — so a key the author carved away and then re-assigned counts
    // as newly occupied. A `before` taken from the untouched base IR would call
    // K_B occupied and report 0 here.
    const ir = instantiate();
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_B"));
    useWorkingCopyStore.getState().recordAssignments([
      {
        scope: "individual",
        target: "ɓ",
        modality: "physical",
        mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_B] > 'ɓ'" } }],
      },
    ]);

    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    expect(onlyEditorSummary().keysAdded).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// FR-005 / FR-005a — unmeasured is ABSENT; measured-and-unchanged is a present 0
// (data-model.md §1's producer/consumer matrix)
// ---------------------------------------------------------------------------

describe("FR-005 / FR-005a — absence and a present zero are different statements", () => {
  it("gallery_edit leaves keysAdded and mechanismsAssigned absent", () => {
    const ir = instantiate();
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_A"));

    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.keysRemoved).toBe(1);
    // Carve does not measure either of these, so it reports no value — not a 0
    // that would read as "mechanisms were considered and left alone".
    expectAbsent(summary, "keysAdded");
    expectAbsent(summary, "mechanismsAssigned");
  });

  it("gallery_edit records a PRESENT zero for touch keys it measured and did not change", () => {
    const ir = instantiate();
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_A"));

    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    // Measured (carve owns touch deletions) and unchanged — distinct from the
    // two absences above, and the distinction is what FR-005 turns on.
    expectPresentZero(summary, "touchKeysAffected");
  });

  it("mechanism_edit leaves keysRemoved and touchKeysAffected absent", () => {
    instantiate();
    useWorkingCopyStore.getState().recordAssignments([ADDS_K_Q]);

    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.mechanismsAssigned).toBe(1);
    expectAbsent(summary, "keysRemoved");
    expectAbsent(summary, "touchKeysAffected");
  });

  it("mechanism_edit records a PRESENT zero when every assignment lands on an occupied key", () => {
    instantiate();
    useWorkingCopyStore.getState().recordAssignments([REASSIGNS_K_A]);

    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.mechanismsAssigned).toBe(1);
    // Measured — the stage did look — and nothing was newly occupied.
    expectPresentZero(summary, "keysAdded");
  });

  it("mechanism_edit leaves keysAdded ABSENT when there is no working copy to measure against", () => {
    // No instantiate(): `getBaseIr()` is null, so occupancy has no baseline. A
    // fabricated 0 here would be indistinguishable from "added nothing".
    useWorkingCopyStore.getState().recordAssignments([ADDS_K_Q]);

    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.mechanismsAssigned).toBe(1);
    expectAbsent(summary, "keysAdded");
  });

  it("touch_edit measures only touch keys and leaves the other three absent", () => {
    instantiate();

    recordStepCompletion(
      "touch",
      touchCompleteResult([touchAssignment("ɓ", "K_B")]),
      depsWith(realRecorder()),
    );

    const summary = onlyEditorSummary();
    expect(summary.touchKeysAffected).toBe(1);
    expectAbsent(summary, "keysRemoved");
    expectAbsent(summary, "keysAdded");
    expectAbsent(summary, "mechanismsAssigned");
  });
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
      depsWith(realRecorder()),
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
    instantiate();
    // The identity the project_name step's onCommit writes.
    useWorkingCopyStore.getState().setIdentity({ keyboardId: "hausa_std" });

    recordStepCompletion(
      "identity",
      phaseResult([{ questionId: "il_language_english", answerType: "text", value: "Hausa" }]),
      depsWith(realRecorder()),
    );
    expect(useDecisionLogStore.getState().record.keyboardId).toBe("hausa_std");
  });

  it("falls back to the base's id before the author has named the keyboard", () => {
    instantiate();
    recordStepCompletion(
      "identity",
      phaseResult([{ questionId: "il_language_english", answerType: "text", value: "Hausa" }]),
      depsWith(realRecorder()),
    );
    expect(useDecisionLogStore.getState().record.keyboardId).toBe(BASE_ID);
  });

  it("records nothing for a step that carries no answers and is not an editor", () => {
    // The track step's real payload (flowStepOptions.ts trackOptions.extract).
    recordStepCompletion("track", { track: "copy" }, depsWith(realRecorder()));
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
        depsWith(realRecorder()),
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
    const ir = instantiate();
    const wc = useWorkingCopyStore.getState();
    // 40 real store-slot deletions — one entry, not forty.
    const deleted = Array.from({ length: 40 }, (_, i) => vowelSlotId(ir, i));
    for (const id of deleted) wc.deleteItem(id);

    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const summary = onlyEditorSummary();
    expect(summary.keysRemoved).toBe(40);
    // Forty keys summarise to a count plus a bounded sample that says it is one.
    expect(summary.sample).toHaveLength(12);
    expect(summary.sampleTruncated).toBe(true);
  });

  it("records the mechanisms step as one mechanism_edit entry", () => {
    instantiate();
    useWorkingCopyStore.getState().recordAssignments([ADDS_K_Q, REASSIGNS_K_A]);

    recordStepCompletion("mechanisms", ADAPTER_EMITS_NOTHING, depsWith(realRecorder()));

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    const payload = entries[0]!.payload;
    if (payload.kind !== "editor-action") throw new Error("expected an editor action");
    expect(payload.actionType).toBe("mechanism_edit");
  });

  it("records the touch step as one touch_edit entry", () => {
    instantiate();
    recordStepCompletion(
      "touch",
      touchCompleteResult([touchAssignment("ɓ", "K_B"), touchAssignment("ɗ", "K_D")]),
      depsWith(realRecorder()),
    );
    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    const payload = entries[0]!.payload;
    if (payload.kind !== "editor-action") throw new Error("expected an editor action");
    expect(payload.actionType).toBe("touch_edit");
  });

  it("supersedes the earlier entry when the step is revisited and changed", () => {
    const ir = instantiate();
    const deps = depsWith(realRecorder());

    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_A"));
    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, deps);
    // Back into the gallery, one more key removed.
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_B"));
    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, deps);

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(2);
    expect(entries[1]!.supersedes).toBe(entries[0]!.entryId);
  });

  it("records nothing when the step is revisited and nothing changed", () => {
    const ir = instantiate();
    const deps = depsWith(realRecorder());
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_A"));
    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, deps);
    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, deps);
    expect(useDecisionLogStore.getState().record.entries).toHaveLength(1);
  });

  it("records the characters step through its answers, not as an editor action", () => {
    // `characters` produces a declared inventory, not a source edit — see
    // recordEditorStep.ts. Classing it as an editor action would report an
    // alphabet as though it were a layout change.
    recordStepCompletion(
      "characters",
      phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ", "ɗ"] }]),
      depsWith(realRecorder()),
    );
    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.payload.kind).toBe("survey-answer");
  });
});

// ---------------------------------------------------------------------------
// FR-006 / SC-006 — recording is inert with respect to the artifact
// ---------------------------------------------------------------------------

/**
 * A scripted session, each step carrying its adapter's real completion payload
 * and the store mutation the step itself performs.
 *
 * `result` is a thunk because the touch payload reads the store at build time,
 * exactly as `AddTouchAdapter` does on the render that completes the step.
 */
const SESSION: ReadonlyArray<{ stepId: string; result: () => unknown; mutate: () => void }> = [
  {
    stepId: "identity",
    result: () =>
      phaseResult([{ questionId: "il_language_english", answerType: "text", value: "Hausa" }]),
    mutate: () => {
      useWorkingCopyStore.getState().setIdentity({ displayName: "Hausa Standard" });
    },
  },
  { stepId: "track", result: () => ({ track: "copy" }), mutate: () => {} },
  {
    stepId: "characters",
    result: () =>
      phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }]),
    mutate: () => {
      useWorkingCopyStore
        .getState()
        .recordPhase(phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }]));
    },
  },
  {
    stepId: "carve",
    result: () => ADAPTER_EMITS_NOTHING,
    mutate: () => {
      const ir = useWorkingCopyStore.getState().baseIr;
      if (ir === null) throw new Error("no working copy to carve");
      useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_B"));
    },
  },
  {
    stepId: "mechanisms",
    result: () => ADAPTER_EMITS_NOTHING,
    mutate: () => {
      useWorkingCopyStore.getState().recordAssignments([ADDS_K_Q]);
      useWorkingCopyStore.getState().lockDesktop();
    },
  },
  {
    stepId: "touch",
    result: () => touchCompleteResult([touchAssignment("ɓ", "K_B")]),
    mutate: () => {},
  },
];

/**
 * A structured-cloneable view of a step payload.
 *
 * The touch payload carries the base `VirtualFS`, whose methods are not
 * cloneable. The recorder never reads it, so it is dropped here rather than
 * narrowing the check to the payloads that happen to be plain data.
 */
function cloneablePayload(result: unknown): unknown {
  if (typeof result !== "object" || result === null) return result;
  const rest: Record<string, unknown> = { ...(result as Record<string, unknown>) };
  delete rest["baseVfs"];
  return structuredClone(rest);
}

/** Run the scripted session, mutating the working copy exactly as each step does. */
function runSession(deps: ReducerDeps): void {
  instantiate();
  for (const step of SESSION) {
    step.mutate();
    recordStepCompletion(step.stepId, step.result(), deps);
  }
}

describe("FR-006 / SC-006 — recording does not alter the keyboard", () => {
  it("is a total no-op when recordDecision is absent", () => {
    // The dep omitted entirely — the shape a build without the audit would have.
    expect(() => runSession(depsWith(undefined))).not.toThrow();
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);
  });

  it("mutates only the decision log — never the result payload it is given", () => {
    // The recorder receives the same opaque `result` the reducer does. If it
    // mutated one, a downstream consumer of that payload would see a different
    // value depending on whether auditing was on — which is exactly the class of
    // artifact divergence FR-006 forbids.
    instantiate();
    const deps = depsWith(realRecorder());
    for (const step of SESSION) {
      step.mutate();
      const result = step.result();
      const before = cloneablePayload(result);
      recordStepCompletion(step.stepId, result, deps);
      expect(cloneablePayload(result)).toEqual(before);
    }
    expect(useDecisionLogStore.getState().record.entries.length).toBeGreaterThan(0);
  });

  it("leaves the working copy's own state untouched across a whole session", () => {
    // Recording reads the store through readers only — there is no setter in
    // DecisionRecorderDeps. Run the session twice, recording on the second, and
    // the store must land in the same place both times.
    runSession(depsWith(undefined));
    const withoutRecording = snapshotWorkingCopy();

    useWorkingCopyStore.getState().reset();
    useDecisionLogStore.getState().reset();
    resetDecisionEntryIds();

    runSession(depsWith(realRecorder()));
    expect(snapshotWorkingCopy()).toEqual(withoutRecording);
    expect(useDecisionLogStore.getState().record.entries.length).toBeGreaterThan(0);
  });

  it("advances the source baseline on every completion, recording or not", async () => {
    // A boundary skipped on a non-recording step would make the NEXT diff span two
    // boundaries and attribute another step's change to this one.
    const captureAtBoundary = vi.fn(() => Promise.resolve(null));
    runSession(depsWith(realRecorder({ snapshotter: { captureAtBoundary, reset: () => {} } })));
    await Promise.resolve();
    expect(captureAtBoundary).toHaveBeenCalledTimes(SESSION.length);
  });
});

/** The carve/assignment state a recorder could plausibly disturb. */
function snapshotWorkingCopy(): unknown {
  const wc = useWorkingCopyStore.getState();
  return {
    deletedNodeIds: [...wc.deletedNodeIds].sort(),
    deletedItemIds: [...wc.deletedItemIds].sort(),
    deletedTouchKeyIds: [...wc.deletedTouchKeyIds].sort(),
    phaseResults: wc.phaseResults,
    desktopLocked: wc.desktopLocked,
    identity: wc.identity,
    ir: wc.ir,
  };
}

// ---------------------------------------------------------------------------
// Impact attribution — only when it can be honest
// ---------------------------------------------------------------------------

describe("impact attribution", () => {
  const CAPTURED: DecisionImpact = {
    state: "captured",
    files: [
      { path: `source/${BASE_ID}.kmn`, hunks: [], magnitude: { added: 2, removed: 0 } },
    ],
    magnitude: { added: 2, removed: 0 },
  };

  function capturingRecorder(): ReducerDeps["recordDecision"] {
    return realRecorder({
      snapshotter: { captureAtBoundary: () => Promise.resolve(CAPTURED), reset: () => {} },
    });
  }

  it("attaches the boundary capture to an editor step's single entry", async () => {
    const ir = instantiate();
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_A"));

    recordStepCompletion("carve", ADAPTER_EMITS_NOTHING, depsWith(capturingRecorder()));
    await Promise.resolve();
    await Promise.resolve();

    const entry = useDecisionLogStore.getState().record.entries[0]!;
    expect(entry.impact).toEqual(CAPTURED);
    // Sole decision at this boundary — it claims the change outright (FR-019).
    expect(entry.impact?.state === "captured" ? entry.impact.sharedWith : "n/a").toBeUndefined();
  });

  it("attaches it to a question step that resolved exactly one answer", async () => {
    recordStepCompletion(
      "sequences",
      phaseResult([{ questionId: "q_one", answerType: "text", value: "v" }]),
      depsWith(capturingRecorder()),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(useDecisionLogStore.getState().record.entries[0]!.impact).toEqual(CAPTURED);
  });

  it("states the change as SHARED when a step resolved several answers (FR-019)", async () => {
    // One diff cannot be split between two answers. Attaching it to each without
    // saying so would make both overstate what they did; `sharedWith` makes it a
    // joint statement instead, and an entry never names itself.
    recordStepCompletion(
      "identity",
      phaseResult([
        { questionId: "q_a", answerType: "text", value: "1" },
        { questionId: "q_b", answerType: "text", value: "2" },
      ]),
      depsWith(capturingRecorder()),
    );
    await Promise.resolve();
    await Promise.resolve();

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(2);
    for (const entry of entries) {
      const impact = entry.impact;
      if (impact === undefined || impact === null || impact.state !== "captured") {
        throw new Error("expected a captured impact");
      }
      expect(impact.files).toEqual(CAPTURED.files);
      expect(impact.sharedWith).toEqual(
        entries.filter((e) => e.entryId !== entry.entryId).map((e) => e.entryId),
      );
      expect(impact.sharedWith).not.toContain(entry.entryId);
    }
  });

  it("survives a capture that rejects, leaving the decision recorded", async () => {
    const ir = instantiate();
    useWorkingCopyStore.getState().deleteNode(ruleNodeIdFor(ir, "K_A"));

    recordStepCompletion(
      "carve",
      ADAPTER_EMITS_NOTHING,
      depsWith(
        realRecorder({
          snapshotter: {
            captureAtBoundary: () => Promise.reject(new Error("projection failed")),
            reset: () => {},
          },
        }),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();

    const entries = useDecisionLogStore.getState().record.entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!.impact).toBeUndefined();
  });
});
