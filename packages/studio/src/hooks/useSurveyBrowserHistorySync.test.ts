// Unit tests for useSurveyBrowserHistorySync (F7 defect 1 — the browser Back
// button has zero integration with the survey wizard).
//
// Covers the popstate -> store dispatch mapping (mock window.history / fire a
// real popstate event in jsdom) and the one-push-per-advance contract. Does
// NOT exercise a real browser Back button (jsdom's `history.back()` is
// asynchronous); instead a raw `popstate` event is dispatched directly with a
// crafted `state`, which is exactly what the hook's listener consumes — same
// coverage, no timing flakiness.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act, cleanup } from "@testing-library/react";
import { useSurveyBrowserHistorySync } from "./useSurveyBrowserHistorySync.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

function dispatchPopState(state: unknown): void {
  window.dispatchEvent(new PopStateEvent("popstate", { state }));
}

beforeEach(() => {
  useSurveySessionStore.getState().reset();
  // Start each test from a clean, known browser-history entry.
  window.history.replaceState(null, "");
});

afterEach(() => {
  // Unmount the previous test's hook instance (removes its popstate listener)
  // before the next test's renderHook() call — without this, listeners
  // accumulate across tests in the same jsdom window.
  cleanup();
  window.history.replaceState(null, "");
});

describe("useSurveyBrowserHistorySync", () => {
  it("tags the current entry with the mount-time activeStepId", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    expect((window.history.state as { ksStep?: string } | null)?.ksStep).toBe("identity");
  });

  it("pushes exactly one entry per manifest-step advance", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    const before = window.history.length;
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    expect(window.history.length).toBe(before + 1);
    expect((window.history.state as { ksStep?: string } | null)?.ksStep).toBe("choose_base");
  });

  it("does not push on a pop transition (in-app Back stays synchronous, no browser motion)", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    const before = window.history.length;
    act(() => {
      useSurveySessionStore.getState().popHistory();
    });
    expect(window.history.length).toBe(before); // no new entry pushed
    expect(useSurveySessionStore.getState().activeStepId).toBe("identity");
  });

  it("a popstate whose ksStep matches the expected back target performs the pop", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.getState().advance("track");
    });
    // Simulate the browser landing back on the "choose_base" entry.
    act(() => {
      dispatchPopState({ ksStep: "choose_base" });
    });
    expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");
    expect(useSurveySessionStore.getState().history).toEqual(["identity"]);
  });

  it("a popstate with no ksStep (a hash-route entry) is ignored", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
    });
    act(() => {
      dispatchPopState(null);
    });
    expect(useSurveySessionStore.getState().activeStepId).toBe("choose_base");
    expect(useSurveySessionStore.getState().history).toEqual(["identity"]);
  });

  it("a popstate whose ksStep does not match the expected target degrades to a no-op", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    act(() => {
      useSurveySessionStore.getState().advance("choose_base");
      useSurveySessionStore.getState().advance("track");
    });
    // "track" (a Forward-shaped, or otherwise stale, ksStep) does not match
    // the expected back target from "track" (which is "choose_base").
    act(() => {
      dispatchPopState({ ksStep: "track" });
    });
    // Store untouched — never corrupted by the unverified guess.
    expect(useSurveySessionStore.getState().activeStepId).toBe("track");
    expect(useSurveySessionStore.getState().history).toEqual(["identity", "choose_base"]);
  });

  it("the 'touch' step always accepts a popstate to touch_seed_source", () => {
    renderHook(() => useSurveyBrowserHistorySync());
    act(() => {
      // Land directly on "touch" without a touch_seed_source entry in
      // history (the fork-skipped case) — backToTouchSeedSource must still
      // resolve a target, so expectedBackTarget always returns non-null here.
      useSurveySessionStore.getState().advance("mechanisms");
      useSurveySessionStore.getState().advance("touch");
    });
    act(() => {
      dispatchPopState({ ksStep: "touch_seed_source" });
    });
    expect(useSurveySessionStore.getState().activeStepId).toBe("touch_seed_source");
  });
});

// ---------------------------------------------------------------------------
// resetOrRestoreSettledRef — the dev-mode ordering guard (StudioShell.tsx's
// SurveyView reset/restore effect must settle before this hook's own mount
// effect runs; see the module + hook-signature doc comments).
// ---------------------------------------------------------------------------

describe("useSurveyBrowserHistorySync — resetOrRestoreSettledRef ordering guard", () => {
  it("logs no error when the caller omits the ref (existing callers unaffected)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderHook(() => useSurveyBrowserHistorySync());
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs no error when the ref is already settled by mount time", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const settledRef = { current: true };
    renderHook(() => useSurveyBrowserHistorySync(settledRef));
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("fails loud when mounted before the reset/restore effect settles (reordering caught)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const settledRef = { current: false };
    renderHook(() => useSurveyBrowserHistorySync(settledRef));
    expect(errorSpy).toHaveBeenCalled();
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("useSurveyBrowserHistorySync");
  });
});
