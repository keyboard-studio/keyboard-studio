// draftAutosave.test.ts — the localStorage resumable-draft layer.
//
// Covers: the meaningful-progress guard (a pristine survey writes nothing),
// survey-slot round-trip through save → apply, working-copy round-trip,
// TTL expiry, malformed/wrong-version recovery, and clearDraft.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IdentityLiteResult } from "../survey/IdentityLite.tsx";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import {
  saveDraft,
  loadDraftMeta,
  applyDraft,
  clearDraft,
  startDraftAutosave,
} from "./draftAutosave.ts";

const DRAFT_KEY = "ks.studio.draft";

function makeIdentity(english: string): IdentityLiteResult {
  return {
    autonym: english,
    english,
    languageSubtag: "ha",
    region: "",
    targetScriptRaw: "Latn",
    bcp47: "ha-Latn",
    supported: true,
    // prefill is not exercised by the draft layer — a minimal cast is enough.
    prefill: {} as IdentityLiteResult["prefill"],
  };
}

beforeEach(() => {
  localStorage.clear();
  useSurveySessionStore.getState().reset();
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("draftAutosave", () => {
  it("saveDraft writes nothing for a pristine survey (no meaningful progress)", () => {
    saveDraft();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(loadDraftMeta()).toBeNull();
  });

  it("saveDraft persists once the survey has progressed", () => {
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    store.setIdentityResult(makeIdentity("Hausa"));

    saveDraft();

    const meta = loadDraftMeta();
    expect(meta).not.toBeNull();
    expect(meta!.activeStepId).toBe("choose_base");
    expect(meta!.label).toBe("Hausa");
  });

  it("applyDraft restores every survey slot", () => {
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    store.advance("track");
    store.setSelectedTrack("copy");
    store.setScaffoldSpec({ keyboardId: "haus_latn", displayName: "Hausa" });
    store.setCharactersSubStage("B");
    saveDraft();

    // Wipe the store, then restore from the draft.
    useSurveySessionStore.getState().reset();
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");

    expect(applyDraft()).toBe(true);

    const s = useSurveySessionStore.getState();
    expect(s.activeStepId).toBe("track");
    expect(s.history).toEqual(["identity", "choose_base"]);
    expect(s.selectedTrack).toBe("copy");
    expect(s.scaffoldSpec).toEqual({ keyboardId: "haus_latn", displayName: "Hausa" });
    expect(s.charactersSubStage).toBe("B");
  });

  it("applyDraft restores the working copy when the draft includes one", () => {
    // Seed a minimal instantiated working copy so captureWorkingCopySnapshot fires.
    useWorkingCopyStore.setState({
      instantiationMode: "new-from-base",
      ir: makeMinimalIr(),
    });
    useSurveySessionStore.getState().advance("carve");
    saveDraft();

    useWorkingCopyStore.getState().reset();
    useSurveySessionStore.getState().reset();

    expect(applyDraft()).toBe(true);
    expect(useWorkingCopyStore.getState().instantiationMode).toBe("new-from-base");
    expect(useWorkingCopyStore.getState().ir).not.toBeNull();
    expect(useSurveySessionStore.getState().activeStepId).toBe("carve");
  });

  it("loadDraftMeta discards a draft older than the 7-day TTL", () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 1,
        savedAt: eightDaysAgo,
        survey: { activeStepId: "carve", history: [], identityResult: null },
        workingCopy: null,
      }),
    );

    expect(loadDraftMeta()).toBeNull();
    // Expired draft is cleared, not left to rot.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("loadDraftMeta recovers from malformed JSON without throwing", () => {
    localStorage.setItem(DRAFT_KEY, "NOT_VALID_JSON{{{");
    let meta: ReturnType<typeof loadDraftMeta>;
    expect(() => {
      meta = loadDraftMeta();
    }).not.toThrow();
    expect(meta!).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("loadDraftMeta discards a draft written at an incompatible version", () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        version: 999,
        savedAt: Date.now(),
        survey: { activeStepId: "carve", history: [], identityResult: null },
        workingCopy: null,
      }),
    );
    expect(loadDraftMeta()).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("startDraftAutosave collapses a burst of edits into a single debounced write", () => {
    vi.useFakeTimers();
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const draftWrites = () =>
      setItemSpy.mock.calls.filter(([key]) => key === DRAFT_KEY).length;

    const stop = startDraftAutosave();

    // A burst of edits within one debounce window.
    const store = useSurveySessionStore.getState();
    store.advance("choose_base");
    store.advance("track");
    store.setSelectedTrack("copy");

    // Still inside the debounce window — nothing written yet.
    expect(draftWrites()).toBe(0);

    vi.advanceTimersByTime(1000);

    // Exactly one write for the whole burst.
    expect(draftWrites()).toBe(1);
    expect(loadDraftMeta()).not.toBeNull();

    // A later edit debounces into a second, separate write.
    store.advance("project_name");
    vi.advanceTimersByTime(1000);
    expect(draftWrites()).toBe(2);

    stop();
    setItemSpy.mockRestore();
  });

  it("clearDraft removes a saved draft", () => {
    useSurveySessionStore.getState().advance("choose_base");
    saveDraft();
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();

    clearDraft();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(applyDraft()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helper — minimal KeyboardIR-like object (mirrors persistWorkingCopy.test.ts)
// ---------------------------------------------------------------------------

function makeMinimalIr() {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  };
}
