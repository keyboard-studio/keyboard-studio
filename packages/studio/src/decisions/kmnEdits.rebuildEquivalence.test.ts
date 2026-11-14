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
import { makeReadyRulesDemoArtifact, useRulesDemoArtifactStore } from "../stores/rulesDemoArtifactStore.ts";
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

// A rule a generating step makes (caps handling, here) exists only in the build, so an edit to it
// is built-keyboard-only like an Assign-tab rule: skipped live, carried by the entry, replayed
// after the generating steps (step 2.9). Both routes must still agree, and undo must give back the
// pre-Apply built text (owner ruling 2026-11-13, research R15).
describe("a Code-tab entry that edits a rule a generating step made", () => {
  const CAPS_KMN =
    "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
    "group(main) using keys\n+ [NCAPS K_A] > 'a'\n+ [NCAPS SHIFT K_A] > 'A'\n+ [CAPS K_A] > 'A'\n+ [CAPS SHIFT K_A] > 'a'\n+ [K_B] > 'b'\n";

  beforeEach(() => {
    useWorkingCopyStore.getState().recordAssignments([]);
    useDecisionStore.getState().reset();
    resetRebuildTrail();
    const ir = parse(CAPS_KMN);
    useWorkingCopyStore.setState({
      ir,
      startIr: ir,
      startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: CAPS_KMN, isBinary: false }]),
      startKeyboard: KEYBOARD,
      undoStack: [],
      desktopLocked: false,
    });
    useDecisionStore.getState().recordAll([
      { id: "character-inventory", value: { chars: ["a", "A", "b"] }, provenance: "asked" },
      { id: "caps-handling", value: { mode: "cased-keys" }, provenance: "default" },
    ] as never);
  });

  async function commitCapsEdit(): Promise<string> {
    const before = (await built()).text;
    // The caps step rewrote the four caps rules into `[K_A]`; the NCAPS rules are not in the build.
    expect(before).toContain("+ [K_A] > U+0061");
    expect(before).not.toContain("NCAPS");
    const changes = diffIR(parse(before), parse(before.replace("+ [K_A] > U+0061", "+ [K_A] > U+0078")));
    const result = useWorkingCopyStore
      .getState()
      .commitKmnEdit({ op: "code-apply", changes, overrides: [{ change: 0, owner: "another-step", step: "caps" }] }, { skipLiveMisses: true });
    expect(result.ok).toBe(true);
    return before;
  }

  it("the edit is in the build, and a full rebuild gives the same IR, flags and built text", async () => {
    await commitCapsEdit();
    const incremental = await snapshot();
    expect(incremental.text).toContain("+ [K_A] > U+0078");
    expect(incremental.text).not.toContain("+ [K_A] > U+0061");
    // The live IR holds the starting rules, not the caps step's: the change was skipped there.
    expect(incremental.workingIr).not.toContain("U+0078");
    expect(incremental.flags).toContainEqual(expect.objectContaining({ kind: "overrode", seq: 1, steps: ["caps"] }));
    expect(incremental.flags.some((f) => f.kind === "missed")).toBe(false);

    expect(rebuildWorkingCopyFromStores(["kmn-edits"])).not.toBeNull();
    expect(await snapshot()).toEqual(incremental);
  });

  it("undo restores the pre-Apply built text, incrementally and after a rebuild", async () => {
    const before = await commitCapsEdit();
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect((await built()).text).toBe(before);
    expect(logged()?.entries).toEqual([]);

    await commitCapsEdit();
    rebuildWorkingCopyFromStores(["kmn-edits"]);
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect((await built()).text).toBe(before);
    expect(logged()?.entries).toEqual([]);
  });
});

// Owner ruling 2026-11-13 (research R15): on a key the most recent edit wins, whichever tab made
// it, and the live model follows the build's order whenever the log holds a Code-tab entry. For
// every case the live IR, the rebuilt IR and the projected `.kmn` hold the same rules.
describe("a Code-tab entry and a Layout-tab edit on the same key", () => {
  const TWO_KEYS =
    "store(&VERSION) '10.0'\nstore(&NAME) 'Test'\nstore(&TARGETS) 'any'\nbegin Unicode > use(main)\n\n" +
    "group(main) using keys\n+ [K_A] > 'a'\n+ [K_B] > 'b'\n";

  beforeEach(() => {
    useDecisionStore.getState().reset();
    useWorkingCopyStore.getState().reset();
    resetRebuildTrail();
    const ir = parse(TWO_KEYS);
    useWorkingCopyStore.setState({
      ir,
      startIr: ir,
      startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: TWO_KEYS, isBinary: false }]),
      startKeyboard: KEYBOARD,
      undoStack: [],
      desktopLocked: false,
    });
    useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:x", "testkbd"));
  });

  const setKey = (vkey: string, text: string) =>
    ({ op: "set-key", vkey, layer: [], output: { kind: "text", text } }) as const;

  /** The rule lines of a `.kmn`, version-stamp and header lines aside. */
  const rules = (text: string): string[] =>
    text.split(/\r?\n/).filter((l) => l.includes(" > ") && !/^\s*(begin|store)/.test(l)).map((l) => l.trim());

  /** Apply `edit` to the built text as the Code tab would and commit the diff. */
  async function codeEdit(edit: (built: string) => string): Promise<void> {
    const before = (await built()).text;
    const changes = diffIR(parse(before), parse(edit(before)));
    // A no-op edit (a pattern that missed the built text) would make a case pass vacuously.
    expect(changes.length).toBeGreaterThan(0);
    const result = useWorkingCopyStore
      .getState()
      .commitKmnEdit({ op: "code-apply", changes, overrides: [] }, { skipLiveMisses: true });
    expect(result.ok).toBe(true);
  }

  const layout = (op: Parameters<ReturnType<typeof useWorkingCopyStore.getState>["commitKmnEdit"]>[0]) =>
    expect(useWorkingCopyStore.getState().commitKmnEdit(op).ok).toBe(true);

  /** Live, rebuilt and built rules (the rebuild runs last, over the same decisions). */
  async function threeWays() {
    const live = rules(emitKmn(useWorkingCopyStore.getState().ir!));
    const flagsLive = (await snapshot()).flags;
    // `deadkeys-defined` is recorded without a rebuild (R12 addendum), so the resume trail is stale for it.
    expect(rebuildWorkingCopyFromStores(["deadkeys-defined", "kmn-edits"])).not.toBeNull();
    const rebuilt = rules(emitKmn(useWorkingCopyStore.getState().ir!));
    const b = await built();
    return { live, rebuilt, built: rules(b.text), flags: (await snapshot()).flags, flagsLive };
  }

  it("1. code adds K_C c, then layout sets K_C z: z everywhere, no flag", async () => {
    await codeEdit((t) => `${t}+ [K_C] > 'c'\n`);
    layout(setKey("K_C", "z"));
    const r = await threeWays();
    for (const got of [r.live, r.rebuilt, r.built]) {
      expect(got.filter((l) => l.includes("K_C"))).toEqual(["+ [K_C] > U+007A"]);
    }
    expect(r.flagsLive).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it("2. layout sets K_C z, then code changes it to c: c everywhere (the code edit is more recent)", async () => {
    layout(setKey("K_C", "z"));
    await codeEdit((t) => t.replace("+ [K_C] > U+007A", "+ [K_C] > 'c'"));
    const r = await threeWays();
    for (const got of [r.live, r.rebuilt, r.built]) {
      expect(got.filter((l) => l.includes("K_C"))).toEqual(["+ [K_C] > U+0063"]);
    }
    expect(r.flagsLive).toEqual([]);
    expect(r.flags).toEqual([]);
  });

  it("3. code edits K_A a to x, then layout sets K_A z: z everywhere, no missed flag", async () => {
    await codeEdit((t) => t.replace("+ [K_A] > 'a'", "+ [K_A] > 'x'"));
    layout(setKey("K_A", "z"));
    const r = await threeWays();
    for (const got of [r.live, r.rebuilt, r.built]) {
      expect(got.filter((l) => l.includes("K_A"))).toEqual(["+ [K_A] > U+007A"]);
    }
    expect(r.flagsLive.some((f) => f.kind === "missed")).toBe(false);
    expect(r.flags.some((f) => f.kind === "missed")).toBe(false);
    expect(r.flags).toEqual([]);
  });

  it("4. undo of the layout edit in case 1 gives c everywhere with one K_C rule and no shadowed flag; redoing it gives case 1", async () => {
    await codeEdit((t) => `${t}+ [K_C] > 'c'\n`);
    layout(setKey("K_C", "z"));
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    const r = await threeWays();
    for (const got of [r.live, r.rebuilt, r.built]) {
      expect(got.filter((l) => l.includes("K_C"))).toEqual(["+ [K_C] > U+0063"]);
    }
    expect(r.flagsLive.some((f) => f.kind === "shadowed")).toBe(false);
    expect(r.flags).toEqual([]);

    layout(setKey("K_C", "z"));
    const again = await threeWays();
    for (const got of [again.live, again.rebuilt, again.built]) {
      expect(got.filter((l) => l.includes("K_C"))).toEqual(["+ [K_C] > U+007A"]);
    }
  });

  it("5. a code entry with two changes, one superseded: the other still applies", async () => {
    await codeEdit((t) => `${t.replace("+ [K_A] > 'a'", "+ [K_A] > 'x'")}+ [K_C] > 'c'\n`);
    layout(setKey("K_A", "z"));
    const r = await threeWays();
    for (const got of [r.live, r.rebuilt, r.built]) {
      expect(got.filter((l) => l.includes("K_A"))).toEqual(["+ [K_A] > U+007A"]);
      expect(got.filter((l) => l.includes("K_C"))).toEqual(["+ [K_C] > U+0063"]);
    }
    expect(r.flags).toEqual([]);
  });

  it("6. a layout clear-key after a code edit on the same key: the key is back to its starting rule everywhere", async () => {
    await codeEdit((t) => t.replace("+ [K_A] > 'a'", "+ [K_A] > 'x'"));
    layout({ op: "clear-key", vkey: "K_A", layer: [] });
    const r = await threeWays();
    for (const got of [r.live, r.rebuilt, r.built]) {
      expect(got.filter((l) => l.includes("K_A"))).toEqual(["+ [K_A] > U+0061"]);
    }
    expect(r.flags).toEqual([]);
    // Deadkey lifecycle ops are not `kmn-edits` entries (they replay at step 1.8, before every entry),
    // so they cannot supersede a code change and have no case here.
  });

  it("7. with no code entry the incremental path is used and the result is the replay's", async () => {
    layout(setKey("K_A", "z"));
    const wc = useWorkingCopyStore.getState();
    const top = wc.undoStack[wc.undoStack.length - 1];
    expect(top).toMatchObject({ k: "l" });
    expect((top as { stale?: true }).stale).toBeUndefined();
    // An incremental effect names the live nodes it touched; a re-derive records none.
    expect((top as { effect: { groupNodeId: string } }).effect.groupNodeId).not.toBe("");
    const r = await threeWays();
    expect(r.live).toEqual(r.built);
    expect(r.rebuilt).toEqual(r.built);
    expect(r.live.filter((l) => l.includes("K_A"))).toEqual(["+ [K_A] > U+007A"]);
  });

  // Contextual rows: a set-row / remove-row supersedes a code change on the row with the SAME
  // context only; a context-free set-key, or a row with another context, does not.
  describe("rows", () => {
    const ROWS =
      `${TWO_KEYS}'x' + [K_A] > 'p'\n'w' + [K_A] > 'r'\n`;
    const ctx = (text: string) => [{ kind: "text", text }] as const;
    const becomes = (text: string) => [{ kind: "text", text }] as const;
    const setRow = (vkey: string, context: string, to: string) =>
      ({ op: "set-row", vkey, layer: [], context: ctx(context), becomes: becomes(to) }) as const;
    const removeRow = (vkey: string, context: string) =>
      ({ op: "remove-row", vkey, layer: [], context: ctx(context) }) as const;

    beforeEach(() => {
      useDecisionStore.getState().reset();
      resetRebuildTrail();
      const ir = parse(ROWS);
      useWorkingCopyStore.setState({
        ir,
        startIr: ir,
        startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: ROWS, isBinary: false }]),
        undoStack: [],
      });
    });

    /** The K_A / K_C rule lines (contextual or not), compared as live, rebuilt and built. */
    async function agree(key: string): Promise<string[]> {
      const r = await threeWays();
      const pick = (lines: string[]) => lines.filter((l) => l.includes(key));
      expect(pick(r.live)).toEqual(pick(r.built));
      expect(pick(r.rebuilt)).toEqual(pick(r.built));
      expect(r.flagsLive).toEqual([]);
      expect(r.flags).toEqual([]);
      return pick(r.built);
    }

    it("code adds a K_C row, then set-row on the same context: the layout row wins", async () => {
      await codeEdit((t) => t.replace(/(\+ \[K_B\] > (?:'b'|U\+0062))/, "$1\n'x' + [K_C] > 'c'"));
      layout(setRow("K_C", "x", "z"));
      const got = await agree("K_C");
      expect(got).toHaveLength(1);
      expect(got[0]).toContain("U+007A");
    });

    it("code edits the 'x' row of K_A, then set-row on the same context: the layout row wins", async () => {
      await codeEdit((t) => t.replace(/(\[K_A\] > )(?:'p'|U\+0070)/, "$1U+0071"));
      layout(setRow("K_A", "x", "z"));
      const got = await agree("K_A");
      expect(got.join("\n")).toContain("U+007A");
      expect(got.join("\n")).not.toContain("U+0071");
      expect(got.join("\n")).not.toContain("U+0070");
    });

    it("code edits the 'x' row of K_A, then remove-row on the same context: the row is gone", async () => {
      await codeEdit((t) => t.replace(/(\[K_A\] > )(?:'p'|U\+0070)/, "$1U+0071"));
      layout(removeRow("K_A", "x"));
      const got = (await agree("K_A")).join("\n");
      expect(got).not.toContain("U+0071");
      expect(got).not.toContain("U+0070");
      expect(got).toContain("U+0072");
    });

    it("code edits the 'w' row, then set-row / remove-row on context 'x': the code change survives", async () => {
      await codeEdit((t) => t.replace(/(\[K_A\] > )(?:'r'|U\+0072)/, "$1U+0073"));
      layout(setRow("K_A", "x", "z"));
      expect((await agree("K_A")).join("\n")).toContain("U+0073");
      layout(removeRow("K_A", "x"));
      const got = (await agree("K_A")).join("\n");
      expect(got).toContain("U+0073");
      expect(got).not.toContain("U+007A");
    });

    it("code edits the 'w' row, then a context-free set-key on K_A: the code change survives", async () => {
      await codeEdit((t) => t.replace(/(\[K_A\] > )(?:'r'|U\+0072)/, "$1U+0073"));
      layout(setKey("K_A", "z"));
      const got = (await agree("K_A")).join("\n");
      expect(got).toContain("U+0073");
      expect(got).toContain("+ [K_A] > U+007A");
    });

    it("code edits context-free K_A, then set-row on context 'x': the code change survives", async () => {
      await codeEdit((t) => t.replace("+ [K_A] > 'a'", "+ [K_A] > 'e'"));
      layout(setRow("K_A", "x", "z"));
      const got = (await agree("K_A")).join("\n");
      expect(got).toContain("+ [K_A] > U+0065");
      expect(got).toContain("U+007A");
    });
  });

  // The build applies deadkey ops (step 1.8) before the Layout-tab (2.2) and Code-tab (2.9) entries,
  // so a deadkey op committed AFTER a code edit must still be re-derived in that order.
  describe("a deadkey op after a code edit", () => {
    const DK = `${TWO_KEYS}+ [K_D] > dk(3000)\ndk(3000) + [K_A] > 'x'\n`;

    beforeEach(() => {
      useDecisionStore.getState().reset();
      useWorkingCopyStore.setState({ deadkeyOverlay: { ops: [] } });
      resetRebuildTrail();
      const ir = parse(DK);
      useWorkingCopyStore.setState({
        ir,
        startIr: ir,
        startVfs: createVirtualFS([{ path: "source/testkbd.kmn", content: DK, isBinary: false }]),
        undoStack: [],
      });
    });

    it("deleting the deadkey a code-added rule uses: live IR == rebuilt IR == built rules", async () => {
      await codeEdit((t) => t.replace(/(\+ \[K_B\] > (?:'b'|U\+0062))/, "$1\ndk(3000) + [K_E] > 'e'"));
      expect(useWorkingCopyStore.getState().commitLayoutDeadkeyOp({ kind: "delete", id: 0x3000 }).ok).toBe(true);
      const r = await threeWays();
      expect(r.rebuilt).toEqual(r.built);
      expect(r.live).toEqual(r.built);
      // Step 1.8 deleted the deadkey's own rules first; the code entry then added its rule.
      expect(r.built.some((l) => l.includes("K_E"))).toBe(true);
      expect(r.built.some((l) => l.includes("K_D"))).toBe(false);
      expect(r.flagsLive).toEqual(r.flags);
    });

    it("a deadkey op defined after a code edit is a stale ld entry, and undoing it lands on the same rules", async () => {
      await codeEdit((t) => t.replace(/(\+ \[K_B\] > (?:'b'|U\+0062))/, "$1\n+ [K_E] > 'e'"));
      const define = { kind: "define", triggerKey: "K_G", id: 0x3001, accentChar: "\u00b4" } as const;
      expect(useWorkingCopyStore.getState().commitLayoutDeadkeyOp(define).ok).toBe(true);
      expect((useWorkingCopyStore.getState().undoStack.at(-1) as { stale?: true }).stale).toBe(true);
      const withDeadkey = await threeWays();
      expect(withDeadkey.live).toEqual(withDeadkey.built);
      expect(withDeadkey.rebuilt).toEqual(withDeadkey.built);
      expect(withDeadkey.built.some((l) => l.includes("dk(3001)"))).toBe(true);
      expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
      const r = await threeWays();
      expect(r.live).toEqual(r.built);
      expect(r.rebuilt).toEqual(r.built);
      expect(r.built.some((l) => l.includes("dk(3001)"))).toBe(false);
      expect(r.built.some((l) => l.includes("K_E"))).toBe(true);
    });
  });
});
