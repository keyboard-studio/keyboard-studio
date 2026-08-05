// stepWalkStore — the within-step position store.
//
// The equality guards are the part worth testing rather than the setters: every
// publisher calls `publishStepWalk`/`setAnswerDraft` from an effect whose input
// is a freshly derived object on each render, so a store that wrote
// unconditionally would notify the footer on every keystroke and, where a
// publishing effect's own deps read back from the store, re-enter itself. "A
// no-change publish is a genuine no-op" is what makes those call sites safe, and
// it is asserted by state IDENTITY, which is the only thing a subscriber sees.

import { describe, it, expect, beforeEach } from "vitest";
import { useStepWalkStore, peekStepCursor, peekAnswerDraft } from "./stepWalkStore.ts";

beforeEach(() => {
  useStepWalkStore.getState().reset();
});

describe("publishStepWalk", () => {
  it("stores a step's stops", () => {
    useStepWalkStore.getState().publishStepWalk("identity", [{ id: "q1", done: false }]);
    expect(useStepWalkStore.getState().walks["identity"]).toEqual([{ id: "q1", done: false }]);
  });

  it("is a no-op for a field-identical republish, even from a new array", () => {
    const { publishStepWalk } = useStepWalkStore.getState();
    publishStepWalk("identity", [{ id: "q1", label: "First", done: false }]);
    const before = useStepWalkStore.getState().walks;
    publishStepWalk("identity", [{ id: "q1", label: "First", done: false }]);
    expect(useStepWalkStore.getState().walks).toBe(before);
  });

  it("writes when a stop's done flag flips", () => {
    const { publishStepWalk } = useStepWalkStore.getState();
    publishStepWalk("identity", [{ id: "q1", done: false }]);
    const before = useStepWalkStore.getState().walks;
    publishStepWalk("identity", [{ id: "q1", done: true }]);
    expect(useStepWalkStore.getState().walks).not.toBe(before);
    expect(useStepWalkStore.getState().walks["identity"]?.[0]?.done).toBe(true);
  });

  it("writes when the stop list grows, and keeps other steps untouched", () => {
    const { publishStepWalk } = useStepWalkStore.getState();
    publishStepWalk("mechanisms", [{ id: "u00e1", done: false }]);
    publishStepWalk("identity", [{ id: "q1", done: true }]);
    publishStepWalk("identity", [{ id: "q1", done: true }, { id: "q2", done: false }]);
    expect(useStepWalkStore.getState().walks["identity"]).toHaveLength(2);
    expect(useStepWalkStore.getState().walks["mechanisms"]).toHaveLength(1);
  });
});

describe("setStepCursor", () => {
  it("stores and reads back a cursor per step", () => {
    useStepWalkStore.getState().setStepCursor("identity", "q2");
    useStepWalkStore.getState().setStepCursor("mechanisms", "u00e1");
    expect(peekStepCursor("identity")).toBe("q2");
    expect(peekStepCursor("mechanisms")).toBe("u00e1");
    expect(peekStepCursor("carve")).toBeUndefined();
  });

  it("is a no-op when unchanged", () => {
    useStepWalkStore.getState().setStepCursor("identity", "q2");
    const before = useStepWalkStore.getState().cursors;
    useStepWalkStore.getState().setStepCursor("identity", "q2");
    expect(useStepWalkStore.getState().cursors).toBe(before);
  });
});

describe("setAnswerDraft", () => {
  it("stores and reads back a step's in-progress answers", () => {
    useStepWalkStore.getState().setAnswerDraft("identity", { q1: "alpha", q2: ["x", "y"] });
    expect(peekAnswerDraft("identity")).toEqual({ q1: "alpha", q2: ["x", "y"] });
  });

  it("is a no-op for a value-identical redraft, including array contents", () => {
    const { setAnswerDraft } = useStepWalkStore.getState();
    setAnswerDraft("identity", { q1: "alpha", q2: ["x", "y"] });
    const before = useStepWalkStore.getState().answerDrafts;
    setAnswerDraft("identity", { q1: "alpha", q2: ["x", "y"] });
    expect(useStepWalkStore.getState().answerDrafts).toBe(before);
  });

  it("writes when an array answer's order changes", () => {
    // Order is author-visible in the character lists these flows collect, so a
    // reorder is a different answer.
    const { setAnswerDraft } = useStepWalkStore.getState();
    setAnswerDraft("identity", { q: ["x", "y"] });
    const before = useStepWalkStore.getState().answerDrafts;
    setAnswerDraft("identity", { q: ["y", "x"] });
    expect(useStepWalkStore.getState().answerDrafts).not.toBe(before);
  });

  it("writes when a key is removed", () => {
    const { setAnswerDraft } = useStepWalkStore.getState();
    setAnswerDraft("identity", { q1: "alpha", q2: "beta" });
    setAnswerDraft("identity", { q1: "alpha" });
    expect(peekAnswerDraft("identity")).toEqual({ q1: "alpha" });
  });
});

describe("clearStepWalk", () => {
  it("drops the stops but KEEPS the cursor — an unmount is not a start-over", () => {
    const s = useStepWalkStore.getState();
    s.publishStepWalk("mechanisms", [{ id: "u00e1", done: false }]);
    s.setStepCursor("mechanisms", "u00e1");
    s.clearStepWalk("mechanisms");
    expect(useStepWalkStore.getState().walks["mechanisms"]).toBeUndefined();
    expect(peekStepCursor("mechanisms")).toBe("u00e1");
  });
});

describe("reset", () => {
  it("clears stops, cursors and drafts together", () => {
    const s = useStepWalkStore.getState();
    s.publishStepWalk("identity", [{ id: "q1", done: true }]);
    s.setStepCursor("identity", "q1");
    s.setAnswerDraft("identity", { q1: "alpha" });
    s.reset();
    expect(useStepWalkStore.getState().walks).toEqual({});
    expect(useStepWalkStore.getState().cursors).toEqual({});
    expect(useStepWalkStore.getState().answerDrafts).toEqual({});
  });
});
