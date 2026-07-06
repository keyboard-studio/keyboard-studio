// Unit tests for surveySessionStore (spec 026 SC-001).
//
// Covers:
//   (a) copy-track back-walk: identity->choose_base->track->project_name->characters
//       then popHistory() -> project_name (history top was project_name).
//   (b) adapt-track back-walk: identity->choose_base->track->characters
//       then popHistory() -> track (project_name skipped, history top was track).
//   (c) reset() clears every slot to initial, including empty history.
//   (d) double-advance idempotence: advance(x) twice does not corrupt the stack;
//       a later popHistory still returns to the prior distinct step (D-R4).
//   (e) empty-history popHistory() is a no-op (activeStepId stays "identity").

import { describe, it, expect, beforeEach } from "vitest";
import { useSurveySessionStore } from "./surveySessionStore.ts";

function getStore() {
  return useSurveySessionStore.getState();
}

function resetStore() {
  useSurveySessionStore.getState().reset();
}

describe("surveySessionStore", () => {
  beforeEach(() => {
    resetStore();
  });

  // (a) copy-track back-walk
  it("copy-track back-walk: popHistory from characters lands on project_name", () => {
    const store = getStore();
    // Walk: identity -> choose_base -> track -> project_name -> characters
    store.advance("choose_base");
    store.advance("track");
    store.advance("project_name");
    store.advance("characters");

    expect(getStore().activeStepId).toBe("characters");
    expect(getStore().history).toEqual(["identity", "choose_base", "track", "project_name"]);

    getStore().popHistory();

    expect(getStore().activeStepId).toBe("project_name");
    expect(getStore().history).toEqual(["identity", "choose_base", "track"]);
  });

  // (b) adapt-track back-walk
  it("adapt-track back-walk: popHistory from characters lands on track", () => {
    const store = getStore();
    // Walk: identity -> choose_base -> track -> characters (no project_name)
    store.advance("choose_base");
    store.advance("track");
    store.advance("characters");

    expect(getStore().activeStepId).toBe("characters");
    expect(getStore().history).toEqual(["identity", "choose_base", "track"]);

    getStore().popHistory();

    expect(getStore().activeStepId).toBe("track");
    expect(getStore().history).toEqual(["identity", "choose_base"]);
  });

  // (c) reset() clears all slots including history
  it("reset() returns every slot to initial, including empty history", () => {
    const store = getStore();
    store.advance("choose_base");
    store.advance("track");
    store.setSelectedTrack("copy");
    store.setScaffoldSpec({ keyboardId: "test_kb", displayName: "Test Keyboard" });

    // Confirm non-initial state
    expect(getStore().activeStepId).toBe("track");
    expect(getStore().history.length).toBe(2);
    expect(getStore().selectedTrack).toBe("copy");
    expect(getStore().scaffoldSpec).not.toBeNull();

    getStore().reset();

    const s = getStore();
    expect(s.activeStepId).toBe("identity");
    expect(s.history).toEqual([]);
    expect(s.identityResult).toBeNull();
    expect(s.surveyContext).toEqual({});
    expect(s.selectedTrack).toBeNull();
    expect(s.scaffoldSpec).toBeNull();
    expect(s.localBase).toBeNull();
  });

  // (d) double-advance idempotence — no stack corruption
  it("double-advance: advancing to the same step twice does not corrupt the stack", () => {
    const store = getStore();
    // Walk to choose_base, then advance to "track" twice (simulates an accidental double-fire).
    store.advance("choose_base");
    store.advance("track");
    store.advance("track"); // second advance to same step id

    // History should record both advances honestly (D-R4: no silent de-dup).
    expect(getStore().activeStepId).toBe("track");
    expect(getStore().history).toEqual(["identity", "choose_base", "track"]);

    // Now advance to a distinct step and pop back — must land on "track" (not "track" twice).
    getStore().advance("characters");
    getStore().popHistory();

    // popped to the last history entry — "track" was pushed when advance("characters") ran.
    expect(getStore().activeStepId).toBe("track");
  });

  // (e) empty-history popHistory() is a no-op
  it("popHistory() on empty history is a no-op", () => {
    // Store freshly reset: activeStepId = "identity", history = [].
    expect(getStore().activeStepId).toBe("identity");
    expect(getStore().history).toEqual([]);

    getStore().popHistory();

    expect(getStore().activeStepId).toBe("identity");
    expect(getStore().history).toEqual([]);
  });

  // Bonus: round-trip invariant (I3 from data-model.md)
  it("advance then popHistory round-trips to the original state", () => {
    const store = getStore();
    store.advance("choose_base");
    const historyBefore = [...getStore().history];
    const stepBefore = getStore().activeStepId; // "choose_base"

    store.advance("track");
    getStore().popHistory();

    expect(getStore().activeStepId).toBe(stepBefore);
    expect([...getStore().history]).toEqual(historyBefore);
  });
});
