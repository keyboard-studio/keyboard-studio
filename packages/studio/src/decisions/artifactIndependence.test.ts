// FR-007 / SC-008 end-to-end: recording cannot change the keyboard
// (specs/055-legible-decision-trail T041; inherits 053 FR-006 / SC-006).
//
// 053's T020 asserted this structurally at the reducer seam — the recorder
// receives only readers, and mutates nothing it is handed. This asserts it
// OBSERVATIONALLY, at the far end of the pipeline: the same scripted session is
// run twice against the real working-copy store, once with `recordDecision`
// injected and once with the dep absent entirely (the shape a build without the
// audit has), and the two artifacts are compared byte for byte.
//
// WHY THIS GUARD HAD TO GROW FOR 055
//
//   T027 widened the boundary capture from ONE `.kmn` to EVERY non-binary file
//   the projection emits, and T028 added `normalizeHistoryDateStamp`, which
//   REWRITES `HISTORY.md` text before diffing. Both read far more of the
//   projection than the 053 capture did, so the surface on which an accidental
//   write could land grew with them. A guard that only compared the `.kmn` would
//   no longer cover the code it is meant to cover.
//
//   So the session below is a Track 2 (`adapt-existing`) walk over a seven-file
//   base — `.kmn`, `.kps`, `.kvks`, `.css`, a BINARY `.ico`, `HISTORY.md`, and
//   `README.md` — and it renames the keyboard mid-session, which fans the
//   capture out across renamed-away and renamed-to paths at one boundary. Every
//   one of those files is compared, not just the ones the capture happens to
//   report a hunk for.
//
// WHAT "IDENTICAL" MEANS HERE, PRECISELY
//
//   Projected VFS — identical, entry for entry, byte for byte. No exceptions.
//   This is the artifact: the keyboard's own files, produced by the one
//   projection the download, the pull request, and the live preview all share.
//
//   Emitted zip — identical EXCEPT for `.studio/decision-record.json`, which the
//   recording run adds on purpose (053 FR-020). The assertion is therefore
//   two-sided, and the second side is the one that matters: the set of differing
//   paths must be EXACTLY the studio-metadata path. A one-sided "the keyboard
//   files match" check would pass while a second stray file rode along under
//   another name.
//
// THE `HISTORY.md` NORMALIZER, SPECIFICALLY
//
//   `normalizeHistoryDateStamp` neutralises the staged `## <version> (<date>)`
//   heading FOR COMPARISON ONLY. The session crosses a simulated midnight
//   between two boundaries (the clock advances a day inside the carve step), so
//   the normalizer is genuinely exercised: without it the carve boundary would
//   report a spurious `HISTORY.md` hunk. The two assertions that matter are then
//   opposite-facing — the carve boundary must NOT list `HISTORY.md`, and the
//   SHIPPED `HISTORY.md` must still carry its real date stamp, never the
//   `0000-00-00` placeholder. Hunks carrying the normalized form is expected and
//   fine; the normalized form reaching the artifact would be the defect.
//
// SC-008 (nothing added to the COMMITTED tree) is asserted where the commit is
// built, in engine/src/output/sidecar.decisionRecord.test.ts. The zip
// legitimately carries the sidecar; the commit legitimately does not. Both facts
// belong to whichever test can see the tree in question.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type {
  BaseKeyboard,
  DecisionEntry,
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
import { selectDesktopAssignments } from "../lib/unimplementedInventory.ts";
import { createDecisionRecorder } from "./createDecisionRecorder.ts";
import { createSourceSnapshotter } from "./snapshotSource.ts";
import { useDecisionLogStore, resetDecisionEntryIds } from "./decisionLogStore.ts";
import {
  projectWorkingCopyForOutput,
  serializeWorkingCopy,
} from "../lib/serializeWorkingCopy.ts";

// ---------------------------------------------------------------------------
// Fixtures — a small but real keyboard, deliberately more than one file
// ---------------------------------------------------------------------------

const BASE_ID = "test_base";
const NEW_ID = "hausa_std";

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

const KPS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<Package>",
  "  <Keyboards>",
  "    <Keyboard>",
  "      <Name>Test Base</Name>",
  `      <ID>${BASE_ID}</ID>`,
  "      <Version>1.0</Version>",
  "    </Keyboard>",
  "  </Keyboards>",
  "</Package>",
  "",
].join("\n");

const KVKS = [
  '<?xml version="1.0" encoding="utf-8"?>',
  "<visualkeyboard>",
  `  <header><kbdname>${BASE_ID}</kbdname></header>`,
  "</visualkeyboard>",
  "",
].join("\n");

const CSS = [`.kmw-keyboard-${BASE_ID} .kmw-key { color: #000; }`, ""].join("\n");

/** A pre-existing release heading. Its date stamp must survive untouched. */
const HISTORY_EXISTING = ["## 1.0 (2020-01-01)", "* Initial release.", ""].join("\n");

const README = ["# Test Base", "", "A fixture keyboard.", ""].join("\n");

/** Deliberately binary: proves the comparison is not string-only. */
const ICON_BYTES = new Uint8Array([0, 0, 1, 0, 1, 0, 16, 16, 255, 254, 7]);

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

/** A FRESH VFS per run — the two runs must never share a mutable fixture. */
function makeBaseVfs(): VirtualFS {
  return createVirtualFS([
    { path: `source/${BASE_ID}.kmn`, content: KMN, isBinary: false },
    { path: `source/${BASE_ID}.kps`, content: KPS, isBinary: false },
    { path: `source/${BASE_ID}.kvks`, content: KVKS, isBinary: false },
    { path: `source/${BASE_ID}.css`, content: CSS, isBinary: false },
    { path: `source/${BASE_ID}.ico`, content: ICON_BYTES, isBinary: true },
    { path: "HISTORY.md", content: HISTORY_EXISTING, isBinary: false },
    { path: "README.md", content: README, isBinary: false },
  ]);
}

const BASE: BaseKeyboard = makeBaseKeyboard({
  id: BASE_ID,
  path: `release/t/${BASE_ID}`,
  script: "Latn",
  targets: ["windows", "web"],
  displayName: "Test Base",
  version: "1.0",
});

function phaseResult(answers: SurveyPhaseResult["answers"]): SurveyPhaseResult {
  return { phase: "A", answers };
}

const ASSIGNMENTS: MechanismAssignment[] = [];

// ---------------------------------------------------------------------------
// Simulated wall clock
// ---------------------------------------------------------------------------
//
// `serializeWorkingCopy` stamps `HISTORY.md` with `new Date()`, so the two runs
// must see the SAME clock or the comparison would fail for a reason that has
// nothing to do with recording. Only `Date` is faked — `setTimeout` stays real,
// because the fire-and-forget captures are drained with it.

const DAY_ONE = new Date("2026-03-14T08:00:00Z");
const DAY_TWO = new Date("2026-03-15T08:00:00Z");
const DAY_TWO_STAMP = "2026-03-15";

// ---------------------------------------------------------------------------
// The scripted session
// ---------------------------------------------------------------------------

/**
 * The session, as a list of (stepId, result, act) triples.
 *
 * `act` performs the step's real effect on the working copy — the same store
 * actions the editors and adapters call — plus, for one step, the simulated
 * midnight crossing. Recording is layered on top of it, exactly where StepHost
 * calls `recordStepCompletion`: AFTER the step's own effects. Both runs replay
 * this identical script, clock included.
 */
const SESSION: ReadonlyArray<{ stepId: string; result: unknown; act: () => void }> = [
  {
    // Establishes the snapshotter's baseline, and records the base contribution
    // (055 FR-030..FR-035) — recording surface that must still cost the
    // artifact nothing.
    stepId: "choose_base",
    result: {},
    act: () => {},
  },
  {
    stepId: "identity",
    result: phaseResult([
      { questionId: "il_language_english", answerType: "text", value: "Hausa" },
      { questionId: "il_target_script", answerType: "select", value: "Latn" },
    ]),
    act: () => {
      // A new keyboard id fires the projection's rename pass, so this ONE
      // boundary changes the `.kmn`, `.kps`, `.kvks`, `.css` and `.ico` paths at
      // once — the widened capture's real workload (055 FR-016).
      useWorkingCopyStore
        .getState()
        .setIdentity({ keyboardId: NEW_ID, displayName: "Hausa Standard" });
    },
  },
  {
    stepId: "track",
    result: { track: "copy" },
    act: () => {},
  },
  {
    stepId: "characters",
    result: phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }]),
    act: () => {
      useWorkingCopyStore
        .getState()
        .recordPhase(
          phaseResult([{ questionId: "b_inventory", answerType: "char-list", value: ["ɓ"] }]),
        );
    },
  },
  {
    stepId: "carve",
    result: {},
    act: () => {
      // The simulated midnight: the NEXT projection stamps HISTORY.md with a
      // different date than the baseline carries. `normalizeHistoryDateStamp`
      // must absorb that, and must absorb it only for the comparison.
      vi.setSystemTime(DAY_TWO);
      // A real carve: the [K_B] rule leaves the projected .kmn.
      const ir = useWorkingCopyStore.getState().baseIr;
      if (ir === null) throw new Error("no working copy to carve");
      useWorkingCopyStore.getState().deleteNode(kbRuleNodeId(ir));
    },
  },
  {
    stepId: "mechanisms",
    result: { answers: [], assignments: ASSIGNMENTS },
    act: () => {
      useWorkingCopyStore.getState().recordAssignments(ASSIGNMENTS);
      useWorkingCopyStore.getState().lockDesktop();
    },
  },
];

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** A recorder wired exactly the way StudioShell wires it, over the real log. */
function realRecorder(): ReducerDeps["recordDecision"] {
  // `readProjectedFiles` delegates to `projectWorkingCopyForOutput` — the SAME
  // function the zip and the pull request use, and the same delegation
  // StudioShell performs. That is what makes this test meaningful: the recording
  // run genuinely performs the widened projection reads that a careless
  // implementation might let leak into the artifact.
  const snapshotter = createSourceSnapshotter({
    readProjectedFiles: async () => {
      const projected = await projectWorkingCopyForOutput();
      return projected === null ? null : { entries: projected.vfs.entries() };
    },
  });
  return createDecisionRecorder({
    snapshotter,
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
    getBaseKeyboard: () => useWorkingCopyStore.getState().baseKeyboard,
    getIrAxes: () => useWorkingCopyStore.getState().irAxes,
    getInstantiationMode: () => useWorkingCopyStore.getState().instantiationMode,
    getRemovalCapabilities: () => useWorkingCopyStore.getState().removalCapabilities,
  });
}

/** Let every queued task turn run — see the call site for why microtasks are not enough. */
async function drainTasks(turns = 12): Promise<void> {
  for (let i = 0; i < turns; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A path-keyed snapshot of a VFS, ordered so two of them compare directly. */
function entrySnapshot(vfs: VirtualFS): Map<string, { content: string | Uint8Array; isBinary: boolean }> {
  const out = new Map<string, { content: string | Uint8Array; isBinary: boolean }>();
  for (const entry of vfs.entries()) {
    out.set(entry.path, { content: entry.content, isBinary: entry.isBinary });
  }
  return out;
}

/** The working-copy state a step actually mutates, in a comparable shape. */
function workingCopySnapshot(): unknown {
  const wc = useWorkingCopyStore.getState();
  return {
    instantiationMode: wc.instantiationMode,
    identity: wc.identity,
    deletedNodeIds: [...wc.deletedNodeIds].sort(),
    deletedItemIds: [...wc.deletedItemIds].sort(),
    deletedTouchKeyIds: [...wc.deletedTouchKeyIds].sort(),
    phaseResults: wc.phaseResults,
    irAxes: wc.irAxes,
  };
}

interface RunResult {
  /** The projected keyboard — the artifact itself. */
  vfs: Map<string, { content: string | Uint8Array; isBinary: boolean }>;
  /** The packaged zip, path -> bytes. */
  zip: Record<string, Uint8Array>;
  /** The store's base VFS as it stood when the run ended. */
  baseVfs: Map<string, { content: string | Uint8Array; isBinary: boolean }>;
  /** The mutated working-copy state at the end of the run. */
  workingCopy: unknown;
  /** The decision entries this run produced (empty for the control run). */
  entries: readonly DecisionEntry[];
}

/**
 * Run the scripted session end to end and return everything it produced.
 *
 * Every run starts from a full store reset, a FRESH base VFS and a FRESH parsed
 * IR, and rewinds the simulated clock — so the two runs share no object and no
 * residual state. Nothing is carried between them but the returned snapshots,
 * which is what makes the comparison a comparison and not a self-check.
 */
async function runSession(recordDecision: ReducerDeps["recordDecision"]): Promise<RunResult> {
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
  vi.setSystemTime(DAY_ONE);

  // Track 2 (`adapt-existing`): the mode that stages HISTORY.md and bumps the
  // `.kps` version at output time — the volatile content T028's normalizer
  // exists for.
  useWorkingCopyStore
    .getState()
    .instantiateFromExisting(BASE, { vfs: makeBaseVfs(), ir: makeIr() });

  // `recordDecision` OMITTED entirely in the control run — not passed as
  // undefined, not stubbed. That is the shape of a build without the feature.
  const deps = (recordDecision !== undefined ? { recordDecision } : {}) as ReducerDeps;

  for (const step of SESSION) {
    step.act();
    recordStepCompletion(step.stepId, step.result, deps);
    // No drain here. `projectWorkingCopyForOutput` reads the working-copy store's
    // state SYNCHRONOUSLY at call time, before its first `await` — so each
    // boundary's fire-and-forget capture reads the state (and the clock) as they
    // stood at ITS step, not whatever they hold by the time the promise settles.
  }
  // This drain IS load-bearing: it lets every step's fire-and-forget capture
  // settle and attach its impact before the assertions below read the log.
  await drainTasks();

  const projected = await projectWorkingCopyForOutput();
  if (projected === null) throw new Error("projection produced nothing");

  const serialized = await serializeWorkingCopy();
  if (serialized === null) throw new Error("serialization produced nothing");

  const storeBaseVfs = useWorkingCopyStore.getState().baseVfs;
  if (storeBaseVfs === null) throw new Error("working copy lost its base VFS");

  return {
    vfs: entrySnapshot(projected.vfs),
    zip: unzipSync(serialized.bytes),
    baseVfs: entrySnapshot(storeBaseVfs),
    workingCopy: workingCopySnapshot(),
    entries: [...useDecisionLogStore.getState().record.entries],
  };
}

/** Byte-exact comparison that keeps strings and binaries honest about their type. */
function expectSameBytes(
  actual: { content: string | Uint8Array; isBinary: boolean } | undefined,
  expected: { content: string | Uint8Array; isBinary: boolean },
  path: string,
): void {
  expect(actual, `${path} is missing from the other run`).toBeDefined();
  expect(actual!.isBinary, `${path} changed binary-ness`).toBe(expected.isBinary);
  if (typeof expected.content === "string") {
    expect(typeof actual!.content, `${path} changed content type`).toBe("string");
    expect(actual!.content, `${path} differs`).toBe(expected.content);
  } else {
    expect(actual!.content, `${path} is no longer binary`).toBeInstanceOf(Uint8Array);
    expect([...(actual!.content as Uint8Array)], `${path} differs`).toEqual([...expected.content]);
  }
}

function sortedKeys(record: Record<string, Uint8Array>): string[] {
  return Object.keys(record).sort();
}

/** Every path the recording run's captures reported a change for. */
function capturedPaths(entries: readonly DecisionEntry[]): Set<string> {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (entry.impact?.state !== "captured") continue;
    for (const file of entry.impact.files) paths.add(file.path);
  }
  return paths;
}

function textOf(zip: Record<string, Uint8Array>, path: string): string {
  const bytes = zip[path];
  if (bytes === undefined) throw new Error(`zip has no ${path}`);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DAY_ONE);
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  useDecisionLogStore.getState().reset();
  resetDecisionEntryIds();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FR-007 / SC-008 — the projected keyboard does not depend on recording", () => {
  it("produces a byte-identical artifact across every file the projection emits", async () => {
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    // --- the recording run really recorded, and really read the projection ---
    // Without these, the comparison below could be two identical no-ops.
    expect(withRecording.entries.length).toBeGreaterThan(0);
    expect(withRecording.entries.some((e) => e.impact?.state === "captured")).toBe(true);
    expect(withoutRecording.entries).toEqual([]);

    // --- the WIDENED capture really ran (T027) -------------------------------
    // More than one file, and at least one that is not the `.kmn`: proof this
    // session exercises the post-widening read path rather than the 053 one.
    const captured = capturedPaths(withRecording.entries);
    expect(captured.size).toBeGreaterThan(1);
    expect([...captured].filter((p) => !p.endsWith(".kmn")).length).toBeGreaterThan(0);

    // --- the artifact is identical, file for file ---------------------------
    // Not a summary of the artifact: the projected entries themselves.
    expect([...withRecording.vfs.keys()].sort()).toEqual([...withoutRecording.vfs.keys()].sort());
    // The fixture ships seven files; a projection that collapsed to one would
    // make the loop below vacuous.
    expect(withRecording.vfs.size).toBe(7);
    for (const [path, entry] of withRecording.vfs) {
      expectSameBytes(withoutRecording.vfs.get(path), entry, path);
    }
  });

  it("leaves no studio metadata in the projected VFS at all", async () => {
    // The projection is the keyboard. Studio metadata is added at packaging time,
    // never to the working copy's projection (053 research D-07).
    const { vfs } = await runSession(realRecorder());
    expect([...vfs.keys()].filter((p) => p.startsWith(STUDIO_METADATA_PREFIX))).toEqual([]);
  });
});

describe("FR-007 — the widened capture writes to nothing it reads", () => {
  it("leaves the store's base VFS exactly as instantiated", async () => {
    const { baseVfs } = await runSession(realRecorder());

    // The projection clones; the capture reads the clone. Neither may reach back
    // into the base the working copy was instantiated from.
    const pristine = entrySnapshot(makeBaseVfs());
    expect([...baseVfs.keys()].sort()).toEqual([...pristine.keys()].sort());
    for (const [path, entry] of pristine) {
      expectSameBytes(baseVfs.get(path), entry, path);
    }
  });

  it("leaves the working copy in the same state as an unrecorded session", async () => {
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    expect(withRecording.workingCopy).toEqual(withoutRecording.workingCopy);
  });
});

describe("FR-017a — the HISTORY.md normalizer never reaches the artifact", () => {
  it("absorbs the midnight date drift in the diff but ships the real stamp", async () => {
    const withRecording = await runSession(realRecorder());

    // The carve boundary straddles the simulated midnight (see SESSION). It must
    // report the carve's real `.kmn` change and NOT a HISTORY.md hunk — which is
    // only true because `normalizeHistoryDateStamp` ran on both sides.
    const carve = withRecording.entries.find((e) => e.stepId === "carve");
    expect(carve, "the carve step recorded no entry").toBeDefined();
    expect(carve!.impact?.state).toBe("captured");
    const changed =
      carve!.impact?.state === "captured" ? carve!.impact.files.map((f) => f.path) : [];
    expect(changed).toContain(`source/${NEW_ID}.kmn`);
    expect(changed).not.toContain("HISTORY.md");

    // And the file that SHIPS still carries the real, un-normalized stamps: the
    // freshly staged one (day two, because the clock advanced mid-session) and
    // the pre-existing release heading underneath it.
    const projectedHistory = withRecording.vfs.get("HISTORY.md");
    expect(projectedHistory?.content).toBe(textOf(withRecording.zip, "HISTORY.md"));
    const history = String(projectedHistory?.content ?? "");
    expect(history).toContain(`## 1.1 (${DAY_TWO_STAMP})`);
    expect(history).toContain("## 1.0 (2020-01-01)");
    expect(history).not.toContain("0000-00-00");
  });

  it("ships the same HISTORY.md whether or not the normalizer ran at all", async () => {
    // The control run never constructs a snapshotter, so `normalizeHistoryDateStamp`
    // is never called in it. Its HISTORY.md is the reference text.
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    expect(withRecording.vfs.get("HISTORY.md")?.content).toBe(
      withoutRecording.vfs.get("HISTORY.md")?.content,
    );
    expect(textOf(withRecording.zip, "HISTORY.md")).toBe(
      textOf(withoutRecording.zip, "HISTORY.md"),
    );
  });
});

describe("SC-008 — the packaged keyboard differs only by the studio sidecar", () => {
  it("differs in exactly one path, and that path is the decision record", async () => {
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    const added = sortedKeys(withRecording.zip).filter((p) => !(p in withoutRecording.zip));
    const removed = sortedKeys(withoutRecording.zip).filter((p) => !(p in withRecording.zip));

    expect(removed).toEqual([]);
    expect(added).toEqual([`${STUDIO_METADATA_PREFIX}decision-record.json`]);
  });

  it("every shared zip entry is byte-identical", async () => {
    const withRecording = await runSession(realRecorder());
    const withoutRecording = await runSession(undefined);

    const shared = sortedKeys(withoutRecording.zip);
    // The keyboard's own files, all of them — not just the one the 053 capture
    // used to read — plus the NEXT_STEPS.md `toZip` always injects (spec §12).
    expect(shared).toEqual(
      [...withoutRecording.vfs.keys(), "NEXT_STEPS.md"].sort(),
    );
    for (const path of shared) {
      expect([...(withRecording.zip[path] ?? [])], `${path} differs`).toEqual([
        ...(withoutRecording.zip[path] ?? []),
      ]);
    }
  });
});
