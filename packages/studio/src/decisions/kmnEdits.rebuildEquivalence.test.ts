// Spec 117 (research R12 addenda, R15): a Code-tab entry can name a rule only the built keyboard
// holds (an Assign-tab rule). The live commit skips what the working IR cannot anchor
// (`skipLiveMisses`) and builds the undo from what it applied; a full rebuild re-folds the whole
// recorded entry onto the IR. This pins that the two routes agree: the IR, the review flags, the
// projected text, and what undo gives back.

import { beforeEach, describe, expect, it } from "vitest";
import { createVirtualFS, type KeyboardIR, type KmnEditsValue, type StartKeyboard } from "@keyboard-studio/contracts";
import { diffIR, emitKmn, parseKmn } from "@keyboard-studio/engine";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { projectWorkingCopyForOutput } from "../lib/serializeWorkingCopy.ts";
import { reviewFlags, type ReplayMissLike } from "../editors/assignLoop/reviewFlags.ts";
import { rebuildWorkingCopyFromStores, resetRebuildTrail } from "./rebuildWorkingCopy.ts";

const KMN =
  "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
  "group(main) using keys\n+ [K_A] > 'a'\n";

const KEYBOARD = {
  id: "testkbd",
  path: "release/t/testkbd",
  script: "Latn",
  targets: [],
  displayName: "Test Keyboard",
  version: "1.0",
} as unknown as StartKeyboard;

const parse = (text: string): KeyboardIR => parseKmn(text, "testkbd").ir;

async function built(): Promise<{ text: string; ir: KeyboardIR; misses: ReplayMissLike[] }> {
  const projected = await projectWorkingCopyForOutput();
  const entry = [...projected!.vfs.entries()].find((e) => e.path.startsWith("source/") && e.path.endsWith(".kmn"));
  const text = entry!.content as string;
  const misses: ReplayMissLike[] = [];
  for (const w of projected!.warnings) {
    const m = /layout edit (\d+) skipped: (.*)$/.exec(w);
    if (m?.[1] !== undefined && m[2] !== undefined) misses.push({ seq: Number(m[1]), reason: m[2] });
  }
  return { text, ir: parse(text), misses };
}

const logged = (): KmnEditsValue | undefined =>
  useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;

/** The state a reviewer or a download would see. */
async function snapshot() {
  const { text, ir, misses } = await built();
  const wc = useWorkingCopyStore.getState();
  return {
    workingIr: emitKmn(wc.ir!),
    text,
    flags: reviewFlags(logged(), misses, wc.ir, ir),
  };
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
  resetRebuildTrail();
  const ir = parse(KMN);
  useWorkingCopyStore.setState({
    ir,
    startIr: ir,
    startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: KMN, isBinary: false }]),
    startKeyboard: KEYBOARD,
    undoStack: [],
    desktopLocked: false,
  });
  useWorkingCopyStore.getState().recordAssignments([
    {
      scope: "individual",
      target: "ŋ",
      modality: "physical",
      mechanisms: [{ patternId: "simple_swap", strategyId: "S-01", slotValues: { kmnRules: "+ [K_N] > U+014B" } }],
      source: "user",
    },
  ]);
});

/** One entry that edits a starting rule (anchors live) and the Assign-tab rule (only in the build). */
async function commitMixedEntry(): Promise<string> {
  const before = (await built()).text;
  expect(before).toContain("+ [K_N] > U+014B");
  const after = before.replace("+ [K_N] > U+014B", "+ [K_N] > U+014A").replace("+ [K_A] > 'a'", "+ [K_A] > 'b'");
  const changes = diffIR(parse(before), parse(after));
  const result = useWorkingCopyStore
    .getState()
    .commitKmnEdit({ op: "code-apply", changes, overrides: [] }, { skipLiveMisses: true });
  expect(result.ok).toBe(true);
  return before;
}

describe("a Code-tab entry that names a rule only the built keyboard holds", () => {
  it("a full rebuild gives the same IR, flags and built text as the incremental commit", async () => {
    await commitMixedEntry();
    const incremental = await snapshot();
    expect(incremental.text).toContain("+ [K_N] > U+014A");
    expect(incremental.flags).toEqual([]);
    // The live IR took the change that anchors there and skipped the one only the build holds.
    expect(incremental.workingIr).toContain("+ [K_A] > U+0062");
    expect(incremental.workingIr).not.toContain("U+014A");

    expect(rebuildWorkingCopyFromStores(["kmn-edits"])).not.toBeNull();
    expect(await snapshot()).toEqual(incremental);
  });

  it("undo restores the pre-Apply built text, incrementally and after a rebuild", async () => {
    const before = await commitMixedEntry();
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect((await built()).text).toBe(before);
    expect(logged()?.entries).toEqual([]);

    await commitMixedEntry();
    rebuildWorkingCopyFromStores(["kmn-edits"]);
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect((await built()).text).toBe(before);
    expect(logged()?.entries).toEqual([]);
  });
});
