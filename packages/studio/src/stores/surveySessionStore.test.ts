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
import {
  useSurveySessionStore,
  snapshotTraversal,
  applyTraversalSnapshot,
} from "./surveySessionStore.ts";

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
    expect(getStore().scaffoldSpec).toMatchObject({ keyboardId: "test_kb", displayName: "Test Keyboard" });

    getStore().reset();

    const s = getStore();
    expect(s.activeStepId).toBe("identity");
    expect(s.history).toEqual([]);
    expect(s.identityResult).toBeNull();
    expect(s.identityPhaseResult).toBeNull();
    expect(s.surveyContext).toEqual({});
    expect(s.selectedTrack).toBeNull();
    expect(s.scaffoldSpec).toBeNull();
    expect(s.localBase).toBeNull();
    expect(s.baseConfirmed).toBe(false);
  });

  // identityPhaseResult round-trip — the history-pop resume payload
  it("identityPhaseResult round-trips through set and is cleared by reset()", () => {
    const phaseResult = {
      phase: "A" as const,
      answers: [
        { questionId: "il_language_autonym", answerType: "text" as const, value: "Hausa" },
        { questionId: "il_target_script", answerType: "select" as const, value: "Latn" },
      ],
    };

    expect(getStore().identityPhaseResult).toBeNull();
    getStore().setIdentityPhaseResult(phaseResult);
    expect(getStore().identityPhaseResult).toEqual(phaseResult);

    getStore().reset();
    expect(getStore().identityPhaseResult).toBeNull();
  });

  // hydrate() bulk-restores every value slot from a serialized draft
  it("hydrate() restores all value slots and copies the history array", () => {
    const history = ["identity", "choose_base"] as const;
    const snapshot = {
      activeStepId: "track" as const,
      history,
      identityResult: null,
      identityPhaseResult: null,
      surveyContext: { targetScript: "Latn" } as never,
      selectedTrack: "copy" as const,
      scaffoldSpec: { keyboardId: "haus_latn", displayName: "Hausa" },
      localBase: null,
      charactersSubStage: "B" as const,
    };

    getStore().hydrate(snapshot);

    const s = getStore();
    expect(s.activeStepId).toBe("track");
    expect(s.history).toEqual(["identity", "choose_base"]);
    expect(s.selectedTrack).toBe("copy");
    expect(s.scaffoldSpec).toEqual({ keyboardId: "haus_latn", displayName: "Hausa" });
    expect(s.charactersSubStage).toBe("B");

    // The restored history is a copy — advancing must not mutate the snapshot's array.
    getStore().advance("project_name");
    expect(snapshot.history).toEqual(["identity", "choose_base"]);
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

  // backToUnfinishedGallery — the Phase F hard-gate's "go back and finish" action
  // (PhaseFGate.tsx). P0 regression guard: a prior implementation routed
  // this through the forward-push `advance()` primitive, which left a stale
  // "help" entry on top of `history` — a LATER ordinary Back traversal
  // (popHistory / backToTouchSeedSource) would then pop that stale entry and
  // silently land back on "help" ("Back" appearing to route to Phase F).
  describe("backToUnfinishedGallery", () => {
    it("pops exactly the one entry 'help' pushed (leaves history exactly as it was before entering help) and sets activeStepId to the target", () => {
      const store = getStore();
      // Walk to "touch", then simulate touch's forward completion into "help"
      // (advance.ts's "touch" case always targets "help").
      store.advance("mechanisms");
      store.advance("touch_seed_source");
      store.advance("touch");
      const historyBeforeHelp = [...getStore().history]; // ["identity", "mechanisms", "touch_seed_source"]
      store.advance("help");
      expect(getStore().activeStepId).toBe("help");

      store.backToUnfinishedGallery("touch");

      expect(getStore().activeStepId).toBe("touch");
      // History is back to EXACTLY what it was before "help" was entered —
      // no stale entry left over from the round trip.
      expect([...getStore().history]).toEqual(historyBeforeHelp);
    });

    it("can route PAST the immediate predecessor to 'mechanisms' (desktop-first priority) while still only consuming the one 'help' entry", () => {
      const store = getStore();
      store.advance("mechanisms");
      store.advance("touch_seed_source");
      store.advance("touch");
      store.advance("help");
      const historyOnHelp = [...getStore().history]; // [..., "mechanisms", "touch_seed_source", "touch"]

      store.backToUnfinishedGallery("mechanisms");

      expect(getStore().activeStepId).toBe("mechanisms");
      // Exactly one entry ("touch", the top) consumed — not two, not zero.
      expect([...getStore().history]).toEqual(historyOnHelp.slice(0, -1));
    });

    it("the regression itself: a subsequent ordinary Back from the target gallery must NOT resurface 'help'", () => {
      const store = getStore();
      store.advance("mechanisms");
      store.advance("touch_seed_source");
      store.advance("touch");
      store.advance("help");

      // "Go back and finish" — the fixed action.
      store.backToUnfinishedGallery("touch");
      expect(getStore().activeStepId).toBe("touch");

      // The touch step's own "Back from the first character" special case
      // (StepHost's handleBack). Since "touch_seed_source" IS the top of
      // history here (fork was not skipped), this pops it — proving the
      // fixed backToUnfinishedGallery left a clean, poppable stack rather than a
      // stale "help" entry that this would otherwise have surfaced.
      store.backToTouchSeedSource();
      expect(getStore().activeStepId).toBe("touch_seed_source");
      expect(getStore().activeStepId).not.toBe("help");

      // And the chooser's own ordinary Back reaches "mechanisms" next — the
      // pre-existing invariant `backToTouchSeedSource`'s docstring promises —
      // proving the stack is fully intact, not just superficially not-"help".
      store.popHistory();
      expect(getStore().activeStepId).toBe("mechanisms");
    });

    it("is a no-op on history (still honors the target) when history is already empty", () => {
      // Fresh store: activeStepId = "identity", history = [].
      expect(getStore().history).toEqual([]);

      getStore().backToUnfinishedGallery("touch");

      expect(getStore().activeStepId).toBe("touch");
      expect(getStore().history).toEqual([]);
    });
  });

  // backToChooseBase — OutputScreen's "Change base keyboard" escape hatch
  // (spec 058). Re-basing was removed from the ship-it screen; this routes the
  // author back to the picker where the preview-before-commit gate lives.
  describe("backToChooseBase", () => {
    it("rewinds to the prefix walked BEFORE the picker, so Back from it lands where it did the first time", () => {
      const store = getStore();
      store.advance("choose_base");
      store.advance("track");
      store.advance("project_name");
      store.advance("characters");

      getStore().backToChooseBase();

      expect(getStore().activeStepId).toBe("choose_base");
      expect(getStore().history).toEqual(["identity"]);
      expect(getStore().lastNavigation).toBe("pop");

      // The pre-picker Back target is unchanged from a first walk-through.
      getStore().popHistory();
      expect(getStore().activeStepId).toBe("identity");
    });

    it("leaves nothing at-or-after the picker on the stack for a later Back to walk forward into", () => {
      const store = getStore();
      store.advance("choose_base");
      store.advance("track");
      store.advance("mechanisms");
      store.advance("touch");

      getStore().backToChooseBase();

      // The regression an advance("choose_base") would have caused: every step
      // the author just left still sitting on the stack, so Back walks FORWARD.
      for (const stale of ["choose_base", "track", "mechanisms", "touch"] as const) {
        expect(getStore().history).not.toContain(stale);
      }
    });

    it("clears baseConfirmed so a stale confirmation cannot instantiate on the next compile settle", () => {
      const store = getStore();
      store.advance("choose_base");
      store.advance("track");
      store.setBaseConfirmed(true);

      getStore().backToChooseBase();

      expect(getStore().baseConfirmed).toBe(false);
    });

    it("drops a stale forward-only-gate entry rather than carrying it into the rewound stack", () => {
      const store = getStore();
      store.advance("choose_base");
      store.advance("mechanisms");
      // A persisted-stale "help" entry (the class sanitizeHistory exists for).
      useSurveySessionStore.setState({ history: ["identity", "help", "choose_base", "mechanisms"] });

      getStore().backToChooseBase();

      expect(getStore().activeStepId).toBe("choose_base");
      expect(getStore().history).toEqual(["identity"]);
      expect(getStore().history).not.toContain("help");
    });

    it("falls back to an empty (Back-safe) history when the picker was never walked", () => {
      // Fresh store: activeStepId = "identity", history = [].
      getStore().backToChooseBase();

      expect(getStore().activeStepId).toBe("choose_base");
      expect(getStore().history).toEqual([]);

      // Empty is Back-safe: popHistory guards it, so the author is not stranded
      // on a step that silently no-ops into a stale entry.
      getStore().popHistory();
      expect(getStore().activeStepId).toBe("choose_base");
    });
  });

  // baseConfirmed — the choose_base preview-before-commit gate
  describe("baseConfirmed", () => {
    it("defaults to false on a fresh store", () => {
      expect(getStore().baseConfirmed).toBe(false);
    });

    it("setBaseConfirmed toggles the flag independently of other slots", () => {
      const store = getStore();
      store.setBaseConfirmed(true);
      expect(getStore().baseConfirmed).toBe(true);

      store.setBaseConfirmed(false);
      expect(getStore().baseConfirmed).toBe(false);
    });

    it("reset() clears baseConfirmed back to false", () => {
      const store = getStore();
      store.setBaseConfirmed(true);
      expect(getStore().baseConfirmed).toBe(true);

      store.reset();
      expect(getStore().baseConfirmed).toBe(false);
    });

    it("survives a snapshotTraversal -> applyTraversalSnapshot round trip", () => {
      const store = getStore();
      store.setBaseConfirmed(true);

      const snapshot = snapshotTraversal();
      expect(snapshot.baseConfirmed).toBe(true);

      // Reset, then re-apply the captured snapshot — baseConfirmed must come
      // back exactly as it was (a restored draft that already passed
      // choose_base must re-instantiate on restore, per the field's docstring).
      store.reset();
      expect(getStore().baseConfirmed).toBe(false);

      applyTraversalSnapshot(snapshot);
      expect(getStore().baseConfirmed).toBe(true);
    });
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

  // ---------------------------------------------------------------------------
  // P0 follow-up: "Going back from the mechanism gallery brings me to Phase F."
  //
  // Root cause: applyTraversalSnapshot (../lib/draftPersistence.ts's loadDraft)
  // patches `history` directly from whatever was serialized to localStorage by
  // a PRIOR page load — including a session that ran the OLDER, buggy build
  // (the one backToUnfinishedGallery's fix in this same store addressed) that
  // pushed a stale "help" entry onto `history` via the forward-push advance()
  // primitive. Shipping the store fix does not repair an already-persisted
  // draft: a returning author's localStorage record still carries the bad
  // entry, so `history` arrives at rehydrate already violating the walked-
  // path invariant, and an ordinary popHistory() then resurfaces "help".
  //
  // These tests reproduce that exact shape (a "help" entry sitting in history
  // while activeStepId is "mechanisms", constructed via applyTraversalSnapshot
  // exactly as loadDraft would apply a persisted record — never via advance(),
  // which cannot itself produce this) and assert the invariant: Back from any
  // step never lands on a step at-or-ahead-of it in the spine (never "help"
  // when the walk hasn't reached it), regardless of how `history` got there.
  // ---------------------------------------------------------------------------
  describe("corrupted/persisted history sanitization (P0 follow-up)", () => {
    it("applyTraversalSnapshot repairs a stale 'help' entry immediately on rehydrate", () => {
      const snapshot = snapshotTraversal();
      applyTraversalSnapshot({
        ...snapshot,
        activeStepId: "mechanisms",
        history: ["identity", "choose_base", "track", "characters", "marks", "carve", "help"],
      });

      // Sanitized the moment the draft is restored — "help" never lands in
      // the live store, not just at the next pop.
      expect(getStore().activeStepId).toBe("mechanisms");
      expect(getStore().history).not.toContain("help");
      expect(getStore().history).toEqual([
        "identity", "choose_base", "track", "characters", "marks", "carve",
      ]);
    });

    it("popHistory from a corrupted stack (stale 'help' on top) lands on an earlier spine step, never 'help'", () => {
      const snapshot = snapshotTraversal();
      applyTraversalSnapshot({
        ...snapshot,
        activeStepId: "mechanisms",
        history: ["identity", "choose_base", "track", "characters", "marks", "carve", "help"],
      });

      getStore().popHistory();

      expect(getStore().activeStepId).not.toBe("help");
      expect(getStore().activeStepId).toBe("carve");
    });

    it("self-heals even without applyTraversalSnapshot's rehydrate pass (direct setState corruption)", () => {
      // Bypass applyTraversalSnapshot entirely to prove popHistory() ITSELF
      // enforces the invariant — belt-and-suspenders alongside the rehydrate
      // fix, in case `history` is ever corrupted by some other path.
      useSurveySessionStore.setState({
        activeStepId: "mechanisms",
        history: ["identity", "choose_base", "track", "characters", "marks", "carve", "help"],
      });

      getStore().popHistory();

      expect(getStore().activeStepId).not.toBe("help");
      expect(getStore().activeStepId).toBe("carve");
    });

    it("drops ALL stale 'help' entries when TWO sit in a corrupted stack, not just one", () => {
      // Two independent stale "help" entries at different positions — e.g. a
      // draft corrupted across two separate old-build sessions. sanitizeHistory
      // filters the whole array, so both must go, not just whichever a naive
      // "find and remove the first/last one" fix would catch.
      const snapshot = snapshotTraversal();
      applyTraversalSnapshot({
        ...snapshot,
        activeStepId: "mechanisms",
        history: [
          "identity", "help", "choose_base", "track", "characters", "marks", "carve", "help",
        ],
      });

      // Sanitized immediately on rehydrate — neither "help" entry survives,
      // and the entries around them keep their relative order.
      expect(getStore().history).not.toContain("help");
      expect(getStore().history).toEqual([
        "identity", "choose_base", "track", "characters", "marks", "carve",
      ]);

      // popHistory from what's left still lands on "carve" (the new top),
      // never resurfaces "help" — belt-and-suspenders like the single-entry
      // case above.
      getStore().popHistory();
      expect(getStore().activeStepId).not.toBe("help");
      expect(getStore().activeStepId).toBe("carve");
    });

    it("does not disturb a well-formed history stack (no false-positive sanitization)", () => {
      const store = getStore();
      store.advance("choose_base");
      store.advance("track");
      store.advance("characters");
      store.advance("marks");
      store.advance("carve");
      store.advance("mechanisms");

      const snapshot = snapshotTraversal();
      expect(snapshot.history).toEqual([
        "identity", "choose_base", "track", "characters", "marks", "carve",
      ]);

      applyTraversalSnapshot(snapshot);

      // Nothing dropped — a valid, well-ordered stack round-trips unchanged.
      expect(getStore().history).toEqual(snapshot.history);

      getStore().popHistory();
      expect(getStore().activeStepId).toBe("carve");
    });
  });
});
