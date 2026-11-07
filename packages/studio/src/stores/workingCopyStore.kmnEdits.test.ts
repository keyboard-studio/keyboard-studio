// workingCopyStore commitKmnEdit / undoKmnEdit (spec 113 T050): a Layout-tab edit is applied to
// the live IR through applyMutatePatch and recorded as the `kmn-edits` decision (provenance
// "asked"); undo records the log without the entry and restores the IR from the effect, with
// no rebuild. Commits are refused, writing nothing, when the cell is read-only, the artifact is
// not compiled, or the step is locked (FR-025).

import { describe, it, expect, beforeEach } from "vitest";
import { parseKmn, emitKmn } from "@keyboard-studio/engine";
import type { KmnEditsValue } from "@keyboard-studio/contracts";
import type { DeadkeysDefinedValue } from "../lib/deadkeyOps.ts";
import { useWorkingCopyStore } from "./workingCopyStore.ts";
import { useDecisionStore } from "./decisionStore.ts";
import {
  makeIdleRulesDemoArtifact,
  makeReadyRulesDemoArtifact,
  useRulesDemoArtifactStore,
} from "./rulesDemoArtifactStore.ts";

const KMN = `store(&VERSION) '10.0'
store(&NAME) 'wc-kmn-edits'
store(&TARGETS) 'any'
store(letters) 'abc'
begin Unicode > use(main)

group(main) using keys

+ [K_A] > 'a'
+ [SHIFT K_A] > 'A'
+ [K_B] > 'b'
+ [K_C] > any(letters)
`;

function seed(): void {
  const ir = parseKmn(KMN, "wc-kmn-edits").ir;
  useWorkingCopyStore.setState({ ir, startIr: ir, undoStack: [], desktopLocked: false });
  useDecisionStore.getState().reset();
  useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:x", "wc-kmn-edits"));
}

const logged = (): KmnEditsValue | undefined =>
  useDecisionStore.getState().decisions["kmn-edits"]?.value as KmnEditsValue | undefined;
const text = (): string => emitKmn(useWorkingCopyStore.getState().ir!);

const setKey = (vkey: string, t: string, layer: Array<"SHIFT"> = []) =>
  ({ op: "set-key", vkey, layer, output: { kind: "text", text: t } }) as const;

beforeEach(seed);

describe("commitKmnEdit", () => {
  it("applies to the live IR and records kmn-edits as an asked decision", () => {
    const before = text();
    const result = useWorkingCopyStore.getState().commitKmnEdit(setKey("K_A", "z"));
    expect(result.ok).toBe(true);
    expect(text()).not.toBe(before);
    expect(text()).toContain("U+007A");
    const rec = useDecisionStore.getState().decisions["kmn-edits"];
    expect(rec?.provenance).toBe("asked");
    expect(logged()?.entries).toHaveLength(1);
    expect(logged()?.entries[0]).toMatchObject({ op: "set-key", vkey: "K_A", seq: 1 });
  });

  it("appends later entries with increasing seq, and pushes one undo entry per commit", () => {
    const s = useWorkingCopyStore.getState();
    s.commitKmnEdit(setKey("K_A", "z"));
    s.commitKmnEdit(setKey("K_B", "y"));
    expect(logged()?.entries.map((e) => e.seq)).toEqual([1, 2]);
    expect(useWorkingCopyStore.getState().undoStack.map((e) => e.k)).toEqual(["l", "l"]);
  });

  it("a case partner is committed in the same confirm as one lb undo entry", () => {
    useWorkingCopyStore.getState().commitKmnEdit(setKey("K_A", "z"), { partner: setKey("K_A", "Z", ["SHIFT"]) });
    expect(logged()?.entries).toHaveLength(2);
    expect(useWorkingCopyStore.getState().undoStack.map((e) => e.k)).toEqual(["lb"]);
  });

  it.each([
    ["the cell is read-only (store-based)", () => undefined, setKey("K_C", "q"), "read-only"],
    [
      "the artifact is not compiled",
      () => useRulesDemoArtifactStore.getState().setArtifact(makeIdleRulesDemoArtifact()),
      setKey("K_A", "z"),
      "not-compiled",
    ],
    ["the step is locked", () => useWorkingCopyStore.setState({ desktopLocked: true }), setKey("K_A", "z"), "locked"],
  ] as const)("refuses, writing nothing, when %s", (_name, arrange, op, reason) => {
    arrange();
    const before = text();
    const result = useWorkingCopyStore.getState().commitKmnEdit(op);
    expect(result).toEqual({ ok: false, reason });
    expect(text()).toBe(before);
    expect(logged()).toBeUndefined();
    expect(useWorkingCopyStore.getState().undoStack).toEqual([]);
  });
});

describe("undoKmnEdit", () => {
  it("kind l: records the log without the entry and restores the emitted text", () => {
    const original = text();
    const s = useWorkingCopyStore.getState();
    s.commitKmnEdit(setKey("K_A", "z"));
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(text()).toBe(original);
    expect(logged()?.entries).toEqual([]);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([]);
  });

  it("kind lb: one undo removes both entries", () => {
    const original = text();
    useWorkingCopyStore.getState().commitKmnEdit(setKey("K_A", "z"), { partner: setKey("K_A", "Z", ["SHIFT"]) });
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(text()).toBe(original);
    expect(logged()?.entries).toEqual([]);
  });

  it("undoes in reverse order, one edit per call", () => {
    const original = text();
    const s = useWorkingCopyStore.getState();
    s.commitKmnEdit(setKey("K_A", "z"));
    const afterFirst = text();
    s.commitKmnEdit(setKey("K_B", "y"));
    useWorkingCopyStore.getState().undoKmnEdit();
    expect(text()).toBe(afterFirst);
    expect(logged()?.entries.map((e) => e.seq)).toEqual([1]);
    useWorkingCopyStore.getState().undoKmnEdit();
    expect(text()).toBe(original);
  });

  it("is also reached through the shared undoDelete", () => {
    const original = text();
    useWorkingCopyStore.getState().commitKmnEdit(setKey("K_A", "z"));
    useWorkingCopyStore.getState().undoDelete();
    expect(text()).toBe(original);
    expect(logged()?.entries).toEqual([]);
  });

  it("does nothing when the edit's nodes are no longer in the IR (a rebuild re-minted them)", () => {
    useWorkingCopyStore.getState().commitKmnEdit(setKey("K_A", "z"));
    const reminted = parseKmn(KMN, "wc-kmn-edits").ir;
    useWorkingCopyStore.setState({ ir: reminted });
    const before = text();
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(false);
    expect(text()).toBe(before);
    expect(logged()?.entries).toHaveLength(1);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(1);
  });
});

// Spec 113 T079: undo kind `ld` -- a Layout-tab deadkey lifecycle edit (spec 083 ops).
describe("commitLayoutDeadkeyOp / undo kind ld", () => {
  const define = { kind: "define", triggerKey: "K_D", id: 0x3000, accentChar: "\u00b4" } as const;
  const recorded = (): DeadkeysDefinedValue | undefined =>
    useDecisionStore.getState().decisions["deadkeys-defined"]?.value as DeadkeysDefinedValue | undefined;
  const ops = () => useWorkingCopyStore.getState().deadkeyOverlay.ops;
  const top = () => {
    const stack = useWorkingCopyStore.getState().undoStack;
    return stack[stack.length - 1];
  };

  beforeEach(() => useWorkingCopyStore.setState({ deadkeyOverlay: { ops: [] } }));

  it("applies the op, appends it to the overlay, records deadkeys-defined, and pushes an ld entry", () => {
    const result = useWorkingCopyStore.getState().commitLayoutDeadkeyOp(define);
    expect(result.ok).toBe(true);
    expect(text()).toContain("dk(3000)");
    expect(ops()).toEqual([define]);
    expect(recorded()?.ops).toEqual([define]);
    expect(useDecisionStore.getState().decisions["deadkeys-defined"]?.provenance).toBe("asked");
    expect(top()).toEqual({ k: "ld", inverse: [{ kind: "delete", id: 0x3000 }] });
  });

  it("add-pair undoes with remove-pair; remove-pair undoes with insert-pair at its index; emitted text is restored", () => {
    const store = useWorkingCopyStore.getState();
    store.commitLayoutDeadkeyOp(define);
    store.commitLayoutDeadkeyOp({ kind: "add-pair", id: 0x3000, base: "a", accented: "\u00e1" });
    store.commitLayoutDeadkeyOp({ kind: "add-pair", id: 0x3000, base: "e", accented: "\u00e9" });
    store.commitLayoutDeadkeyOp({ kind: "add-pair", id: 0x3000, base: "i", accented: "\u00ed" });
    expect(top()).toEqual({ k: "ld", inverse: [{ kind: "remove-pair", id: 0x3000, index: 2 }] });

    const before = text();
    store.commitLayoutDeadkeyOp({ kind: "remove-pair", id: 0x3000, index: 1 });
    expect(text()).not.toBe(before);
    expect(top()).toEqual({
      k: "ld",
      inverse: [{ kind: "insert-pair", id: 0x3000, index: 1, base: "e", accented: "\u00e9" }],
    });

    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(text()).toBe(before);
    // The overlay is append-only: undo appends the inverse and records the longer list.
    expect(ops().at(-1)).toMatchObject({ kind: "insert-pair", index: 1 });
    expect(recorded()?.ops).toHaveLength(6);

    // Undoing the three adds then restores the text from before the first of them.
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(text()).toContain("dk(3000)");
    expect(text()).not.toContain("\u00e1");
  });

  it("several ops in one confirm are one undo step and none applies when one is refused", () => {
    const store = useWorkingCopyStore.getState();
    store.commitLayoutDeadkeyOp([define, { kind: "add-pair", id: 0x3000, base: "a", accented: "\u00e1" }]);
    const before = text();
    const depth = useWorkingCopyStore.getState().undoStack.length;
    // A changed combination: remove the pair and insert its replacement at the same index.
    store.commitLayoutDeadkeyOp([
      { kind: "remove-pair", id: 0x3000, index: 0 },
      { kind: "insert-pair", id: 0x3000, index: 0, base: "a", accented: "\u00e0" },
    ]);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(depth + 1);
    expect(text()).toContain("\u00e0");
    store.undoKmnEdit();
    expect(text()).toBe(before);

    const refusedAt = text();
    const refused = store.commitLayoutDeadkeyOp([
      { kind: "add-pair", id: 0x3000, base: "e", accented: "\u00e9" },
      { kind: "remove-pair", id: 0x3000, index: 9 },
    ]);
    expect(refused).toEqual({ ok: false, reason: "refused" });
    expect(text()).toBe(refusedAt);
  });

  it("undoing a define removes the deadkey and the emitted .kmn equals the text before it", () => {
    const before = text();
    useWorkingCopyStore.getState().commitLayoutDeadkeyOp(define);
    expect(useWorkingCopyStore.getState().undoKmnEdit()).toBe(true);
    expect(text()).toBe(before);
    expect(top()).toBeUndefined();
  });

  it("set-display undoes to the previous display", () => {
    const store = useWorkingCopyStore.getState();
    store.commitLayoutDeadkeyOp(define);
    const before = text();
    store.commitLayoutDeadkeyOp({ kind: "set-display", id: 0x3000, display: "Z" });
    expect(text()).toContain("display=");
    store.undoKmnEdit();
    expect(text()).toBe(before);
  });

  it("an op with no faithful inverse (delete) is committed without an undo entry", () => {
    const store = useWorkingCopyStore.getState();
    store.commitLayoutDeadkeyOp(define);
    const depth = useWorkingCopyStore.getState().undoStack.length;
    expect(store.commitLayoutDeadkeyOp({ kind: "delete", id: 0x3000 }).ok).toBe(true);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(depth);
    expect(text()).not.toContain("dk(3000)");
  });

  it("undoDelete routes an ld entry to the same undo", () => {
    const before = text();
    useWorkingCopyStore.getState().commitLayoutDeadkeyOp(define);
    useWorkingCopyStore.getState().undoDelete();
    expect(text()).toBe(before);
  });

  it("is refused, writing nothing, when locked, not compiled, or the lifecycle refuses", () => {
    const store = useWorkingCopyStore.getState();
    useWorkingCopyStore.setState({ desktopLocked: true });
    expect(store.commitLayoutDeadkeyOp(define)).toEqual({ ok: false, reason: "locked" });
    useWorkingCopyStore.setState({ desktopLocked: false });
    useRulesDemoArtifactStore.getState().setArtifact(makeIdleRulesDemoArtifact());
    expect(store.commitLayoutDeadkeyOp(define)).toEqual({ ok: false, reason: "not-compiled" });
    useRulesDemoArtifactStore.getState().setArtifact(makeReadyRulesDemoArtifact("blob:x", "wc-kmn-edits"));
    expect(store.commitLayoutDeadkeyOp({ kind: "add-pair", id: 0x9999, base: "a", accented: "b" })).toEqual({
      ok: false,
      reason: "refused",
    });
    expect(ops()).toEqual([]);
    expect(useWorkingCopyStore.getState().undoStack).toEqual([]);
    expect(recorded()).toBeUndefined();
  });

  it("filling an empty combination table is allowed while the keyboard does not compile (an empty table is why)", () => {
    const store = useWorkingCopyStore.getState();
    store.commitLayoutDeadkeyOp(define);
    useRulesDemoArtifactStore.getState().setArtifact(makeIdleRulesDemoArtifact());
    expect(store.commitLayoutDeadkeyOp({ kind: "add-pair", id: 0x3000, base: "a", accented: "á" }).ok).toBe(true);
    // Once the table has a row, the not-compiled refusal applies again.
    expect(store.commitLayoutDeadkeyOp({ kind: "add-pair", id: 0x3000, base: "e", accented: "é" })).toEqual({
      ok: false,
      reason: "not-compiled",
    });
  });

  it("a modifier-layer define round-trips through undo", () => {
    const before = text();
    useWorkingCopyStore
      .getState()
      .commitLayoutDeadkeyOp({ kind: "define", triggerKey: "K_QUOTE", triggerModifiers: ["RALT"], id: 0x3001, accentChar: "\u00b4" });
    expect(text()).toContain("RALT");
    useWorkingCopyStore.getState().undoKmnEdit();
    expect(text()).toBe(before);
  });
});
