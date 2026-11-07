// workingCopyStore commitKmnEdit / undoKmnEdit (spec 113 T050): a Layout-tab edit is applied to
// the live IR through applyMutatePatch and recorded as the `kmn-edits` decision (provenance
// "asked"); undo records the log without the entry and restores the IR from the effect, with
// no rebuild. Commits are refused, writing nothing, when the cell is read-only, the artifact is
// not compiled, or the step is locked (FR-025).

import { describe, it, expect, beforeEach } from "vitest";
import { parseKmn, emitKmn } from "@keyboard-studio/engine";
import type { KmnEditsValue } from "@keyboard-studio/contracts";
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
