// Regression test for the main-CI failure of 2026-11-14 (CI run 43578870313):
// the chooser's async search runs in several rounds and outlives the
// component. A late round called setLanguageResults after unmount, which
// under a torn-down jsdom environment throws `ReferenceError: window is not
// defined` as an unhandled error and fails the whole studio suite (all 12558
// tests pass; the run still exits 1). The search callback must return false
// (abort the search) once the component is gone, so no state update is
// attempted after unmount.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { asyncSearchForLanguage, type ILanguage } from "@ethnolib/find-language";
import { useLanguageChooser } from "./useLanguageChooser.ts";

type SearchCallback = (results: ILanguage[], forSearchString: string) => boolean;

const mockSearch = vi.mocked(asyncSearchForLanguage);

vi.mock("@ethnolib/find-language", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@ethnolib/find-language")>();
  return {
    ...orig,
    // Never resolves: the test drives the captured callback by hand.
    asyncSearchForLanguage: vi.fn(async () => {
      await new Promise(() => {});
    }),
  };
});

function capturedCallback(): SearchCallback {
  const call = mockSearch.mock.calls[0];
  expect(call).toBeDefined();
  return call![1] as SearchCallback;
}

async function startSearch(): Promise<ReturnType<typeof renderHook>> {
  const hook = renderHook(() => useLanguageChooser());
  await act(async () => {
    hook.result.current.onSearchStringChange("an");
  });
  expect(mockSearch).toHaveBeenCalledWith("an", expect.any(Function));
  return hook;
}

describe("useLanguageChooser search cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a search round after unmount aborts instead of setting state", async () => {
    const hook = await startSearch();
    const cb = capturedCallback();
    hook.unmount();
    // Pre-fix this returns true (appendResults only checks the search
    // string) and calls setLanguageResults on the unmounted component.
    expect(cb([], "an")).toBe(false);
  });

  it("a search round for the current string still appends while mounted", async () => {
    const hook = await startSearch();
    const cb = capturedCallback();
    expect(cb([], "an")).toBe(true);
    expect(hook.result.current.languageResults).toEqual([]);
    hook.unmount();
  });
});
