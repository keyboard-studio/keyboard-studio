// FR-006 / SC-006 / SC-008 end-to-end: recording cannot change the keyboard
// (specs/053-decision-audit T046).
//
// T020 asserted this structurally at the reducer seam — the recorder receives only
// readers, and mutates nothing it is handed. This asserts it OBSERVATIONALLY, at
// the far end of the pipeline: the same scripted session is run twice against the
// real working-copy store, once with `recordDecision` injected and once with the
// dep absent entirely (the shape a build without the audit has), and the two
// artifacts are compared.
//
// WHAT "IDENTICAL" MEANS HERE, PRECISELY
//
//   Projected VFS — identical, entry for entry, byte for byte. No exceptions. This
//   is the artifact: the keyboard's own files, produced by the one projection the
//   download, the pull request, and the live preview all share.
//
//   Emitted zip — identical EXCEPT for `.studio/decision-record.json`, which the
//   recording run adds on purpose (FR-020). The assertion is therefore two-sided,
//   and the second side is the one that matters: the set of differing paths must be
//   EXACTLY the studio-metadata path. A one-sided "the keyboard files match" check
//   would pass while a second stray file rode along under another name.
//
// SC-008 (nothing added to the COMMITTED tree) is asserted where the commit is
// built, in engine/src/output/sidecar.decisionRecord.test.ts. The zip legitimately
// carries the sidecar; the commit legitimately does not. Both facts belong to
// whichever test can see the tree in question.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS } from "@keyboard-studio/contracts";
import type {
  BaseKeyboard,
  KeyboardIR,
  MechanismAssignment,
  SurveyPhaseResult,
  VirtualFS,
} from "@keyboard-studio/contracts";
import { parseKmn, STUDIO_METADATA_PREFIX } from "@keyboard-studio/engine";
import { unzipSync } from "fflate";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { recordStepCompletion, type ReducerDeps } from "../steps/reducer.ts";
import { createDecisionRecorder } from "./createDecisionRecorder.ts";
import { createSourceSnapshotter, type ProjectedSource } from "./snapshotSource.ts";
import { useDecisionLogStore, resetDecisionEntryIds } from "./decisionLogStore.ts";
import {
  projectWorkingCopyForOutput,
  serializeWorkingCopy,
} from "../lib/serializeWorkingCopy.ts";

// ---------------------------------------------------------------------------
// Fixtures — a small but real keyboard: two carvable rules and a .kps
// ---------------------------------------------------------------------------

const BASE_ID = "test_base";
const KMN = [
  "store(&VERSION) '10.0'",
  "store(&NAME) 'Test Base'",
  "store(&KEYBOARDVERSION) '1.0'",
  "",
  "begin Unicode > use(main)",
  "",
  "group(main) using keys",
  "",
  "+ [K_A] > 'a'",
  "+ [K_B] > 'b'",
  "",
].join("\n");

/**
 * The IR comes from the REAL codec, not a hand-built literal.
 *
 * A stripped-down cast satisfies `KeyboardIR` and then fails inside the emitter,
 * so the carve projection warns and silently re-emits nothing — which would leave
 * this test comparing two unchanged files and calling that agreement. Parsing the
 * fixture means every projection step runs on the shape it was written for.
 */
function makeIr(): KeyboardIR {
  const parsed = parseKmn(KMN, `${BASE_ID}.kmn`);
  return parsed.ir;
}

/** The nodeId of the `[K_B]` rule in the parsed IR — the rule the carve removes. */
function kbRuleNodeId(ir: KeyboardIR): string {
  for (const group of ir.groups) {
    for (const rule of group.rules) {
      const hit = rule.context.some((c) => c.kind === "vkey" && c.name === "K_B");
      if (hit) return rule.nodeId;
    }
  }
  throw new Error("fixture has no [K_B] rule to carve");
}

function makeBaseVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${BASE_ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${BASE_ID}.kps`, content: "<Package/>", isBinary: false },
  ]);
}

const BASE: BaseKeyboard = {
  id: BASE_ID,
  displayName: "Test Base",
  languages: [],
} as unknown as BaseKeyboard;

function phaseResult(answers: SurveyPhaseResult["answers"]): SurveyPhaseResult {
  return { phase: "A", answers };
}

const ASSIGNMENTS: MechanismAssignment[] = [];

/**
 * The scripted session, as a list of (stepId, result, mutate) triples.
 *
 * `mutate` performs the step's real effect on the working copy — the same store
 * actions the editors and adapters call. Recording is layered on top of it, exactly
 * where StepHost calls `recordStepCompletion`: AFTER the step's own effects.
 */
const SESSION: ReadonlyArray<{ stepId: string; result: unknown; mutate: () => void }> = [
  {
    stepId: "identity",
    result: phaseResult([
      { questionId: "il_language_english", answerType: "text", value: "Hausa" },
      { questionId: "il_target_script", answerType: "select", value: "Latn" },
    ]),
    mutate: () => {
      useWorkingCopyStore.getState().setIdentity({ displayName: "Hausa Standard" });
    },
  },
  {
    stepId: "track",
    result: { track: "copy" },
    mutate: () => {},
  },
  {
    stepId: "characters",
    result: phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }]),
    mutate: () => {
      useWorkingCopyStore
        .getState()
        .recordPhase(phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }]));
    },
  },
  {
    stepId: "carve",
    result: {},
    mutate: () => {
      // A real carve: the [K_B] rule leaves the projected .kmn.
      const ir = useWorkingCopyStore.getState().baseIr;
      if (ir === null) throw new Error("no working copy to carve");
      useWorkingCopyStore.getState().deleteNode(kbRuleNodeId(ir));
    },
  },
  {
    stepId: "mechanisms",
    result: { answers: [], assignments: ASSIGNMENTS },
    mutate: () => {
      useWorkingCopyStore.getState().recordAssignments(ASSIGNMENTS);
      useWorkingCopyStore.getState().lockDesktop();
    },
  },
];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** A recorder wired the way StudioShell wires it, over the real decision log. */
function realRecorder(): ReducerDeps["recordDecision"] {
  // The snapshotter reads the SAME projection the output path uses, as it does in
  // production — so the recording run genuinely performs the extra projection reads
  // that a naive implementation might let leak into the artifact.
  const snapshotter = createSourceSnapshotter({
    readProjectedKmn: async (): Promise<ProjectedSource | null> => {
      const projected = await projectWorkingCopyForOutput();
      if (projected === null) return null;
      const path = `source/${projected.keyboardId}.kmn`;
      const entry = projected.vfs.get(path);
      if (entry === undefined || typeof entry.content !== "string") return null;
      return { path, text: entry.content };
    },
  });
  return createDecisionRecorder({
    snapshotter,
    getDeletionCounts: () => {
      const state = useWorkingCopyStore.getState();
      return {
        nodes: state.deletedNodeIds.size,
        items: state.deletedItemIds.size,
        touchKeys: state.deletedTouchKeyIds.size,
      };
    },
    getDeletedIds: () => [...useWorkingCopyStore.getState().deletedNodeIds],
    getKeyboardId: () => useWorkingCopyStore.getState().identity?.keyboardId ?? BASE_ID,
  });
}

/** Let every queued task turn run — see the call site for why microtasks are not enough. */
async function drainTasks(turns = 12): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Run the scripted session end to end; return the artifact it produced. */
async function runSession(
  recordDecision: ReducerDeps["recordDecision"],
): Promise<{ vfs: Map<string, string | Uint8Array>; zip: Record<string, Uint8Array> }> {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();

  useWorkingCopyStore
    .getState()
    .instantiateFromBase(BASE, { vfs: makeBaseVfs(), ir: makeIr() });

  // `recordDecision` OMITTED entirely in the control run — not passed as
  // undefined, not stubbed. That is the shape of a build without the feature.
  const deps = (recordDecision !== undefined ? { recordDecision } : {}) as ReducerDeps;

  for (const step of SESSION) {
    step.mutate();
    recordStepCompletion(step.stepId, step.result, deps);
    // No drain here. `projectWorkingCopyForOutput` reads the working-copy
    // store's state SYNCHRONOUSLY at call time, before its first `await` — so
    // each boundary's fire-and-forget capture (createDecisionRecorder) reads
    // the state as it stood at ITS step, not whatever the store holds by the
    // time the promise settles. Resolution order does not change what was
    // read. (Verified: removing this drain does not change which entries end
    // up captured.) What DOES make this comparison meaningful is `makeIr`
    // parsing the fixture through the real codec instead of a hand-built IR
    // cast — a hand-rolled cast IR made the carve projection silently
    // re-emit nothing, which is what a missing diff here would actually be
    // testing for.
  }
  // This drain IS load-bearing: it lets every step's fire-and-forget capture
  // settle and attach its impact before the assertions below read the log.
  await drainTasks();

  const projected = await projectWorkingCopyForOutput();
  if (projected === null) throw new Error("projection produced nothing");
  const vfs = new Map<string, string | Uint8Array>(
    projected.vfs.entries().map((e) => [e.path, e.content]),
  );

  const serialized = await serializeWorkingCopy();
  if (serialized === null) throw new Error("serialization produced nothing");
  const zip = unzipSync(serialized.bytes);

  return { vfs, zip };
}

function sortedKeys(record: Record<string, Uint8Array>): string[] {
  return Object.keys(record).sort();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.restoreAllMocks();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
});

describe("FR-006 / SC-006 — the projected VFS does not depend on recording", () => {
  it("produces byte-identical projected files with and without the recorder", async () => {
    const withRecording = await runSession(realRecorder());
    const recorded = [...useDecisionLogStore.getState().record.entries];
    const withoutRecording = await runSession(undefined);

    // The recording run really did record — otherwise this test compares two
    // identical no-ops and proves nothing.
    expect(recorded.length).toBeGreaterThan(0);
    // And it really did read the shared projection: the carve step's entry carries
    // a captured diff. Without this the run could have snapshotted nothing and the
    // comparison below would be trivially true.
    expect(recorded.some((e) => e.impact?.state === "captured")).toBe(true);
    expect(useDecisionLogStore.getState().record.entries).toEqual([]);

    expect([...withRecording.vfs.keys()].sort()).toEqual([...withoutRecording.vfs.keys()].sort());
    for (const [path, content] of withRecording.vfs) {
      expect(withoutRecording.vfs.get(path)).toEqual(content);
    }
  });

  it("leaves no studio metadata in the projected VFS at all", async () => {
    // The projection is the keyboard. Studio metadata is added at packaging time,
    // never to the working copy's projection (research D-07).
    const { vfs } = await runSession(realRecorder());
    expect([...vfs.keys()].filter((p) => p.startsWith(STUDIO_METADATA_PREFIX))).toEqual([]);
  });
});

describe("SC-008 — the packaged keyboard differs only by the studio sidecar", () => {
  it("differs in exactly one path, and that path is the decision record", async () => {
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    const added = sortedKeys(withRecording.zip).filter(
      (p) => !(p in withoutRecording.zip),
    );
    const removed = sortedKeys(withoutRecording.zip).filter(
      (p) => !(p in withRecording.zip),
    );

    expect(removed).toEqual([]);
    expect(added).toEqual([`${STUDIO_METADATA_PREFIX}decision-record.json`]);
  });

  it("every shared zip entry is byte-identical", async () => {
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    for (const path of sortedKeys(withoutRecording.zip)) {
      expect(withRecording.zip[path]).toEqual(withoutRecording.zip[path]);
    }
  });
});
