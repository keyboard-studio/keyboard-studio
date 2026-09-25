// stepWalkStore — the within-step position store.
//
// The equality guards are the part worth testing rather than the setters: every
// publisher calls `publishStepWalk` from an effect whose input
// is a freshly derived object on each render, so a store that wrote
// unconditionally would notify the footer on every keystroke and, where a
// publishing effect's own deps read back from the store, re-enter itself. "A
// no-change publish is a genuine no-op" is what makes those call sites safe, and
// it is asserted by state IDENTITY, which is the only thing a subscriber sees.

import { describe, it, expect } from "vitest";
import { useStepWalkStore, peekStepCursor, peekAnswerDraft } from "./stepWalkStore.ts";
import { useSurveyAnswerStore } from "./surveyAnswerStore.ts";

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

describe("compat readers over the answer store (spec 079 R-01)", () => {
  it("peekStepCursor reads the answer store's position", () => {
    useSurveyAnswerStore.getState().setPosition("identity", "q2");
    expect(peekStepCursor("identity")).toBe("q2");
    expect(peekStepCursor("carve")).toBeUndefined();
  });

  it("peekAnswerDraft projects each saved answer's value, keyed by question id", () => {
    const save = useSurveyAnswerStore.getState().saveAnswer;
    const base = { origin: "confirmed", stage: "draft", evidenceKey: null } as const;
    save("identity", "q1", { ...base, value: "alpha", answerType: "text", screenId: "q1" });
    save("identity", "q2", { ...base, value: ["x", "y"], answerType: "char-list", screenId: "q2" });
    expect(peekAnswerDraft("identity")).toEqual({ q1: "alpha", q2: ["x", "y"] });
    expect(peekAnswerDraft("track")).toBeUndefined();
  });
});

describe("clearStepWalk", () => {
  it("drops the stops but KEEPS the position — an unmount is not a start-over", () => {
    const s = useStepWalkStore.getState();
    s.publishStepWalk("mechanisms", [{ id: "u00e1", done: false }]);
    useSurveyAnswerStore.getState().setPosition("mechanisms", "u00e1");
    s.clearStepWalk("mechanisms");
    expect(useStepWalkStore.getState().walks["mechanisms"]).toBeUndefined();
    expect(peekStepCursor("mechanisms")).toBe("u00e1");
  });
});

describe("reset", () => {
  it("clears the stops", () => {
    const s = useStepWalkStore.getState();
    s.publishStepWalk("identity", [{ id: "q1", done: true }]);
    s.reset();
    expect(useStepWalkStore.getState().walks).toEqual({});
  });
});
