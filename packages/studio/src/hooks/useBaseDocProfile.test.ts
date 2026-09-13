// Unit tests for useBaseDocProfile (spec 076 FR-008): the per-base-id cache
// that drives BaseResolution's suggestion-card badges.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { BaseDocumentationProfile } from "@keyboard-studio/contracts";

const getBaseDocProfileMock = vi.fn<(baseId: string) => Promise<BaseDocumentationProfile>>();

vi.mock("../lib/services.ts", () => ({
  getBaseDocProfile: (baseId: string) => getBaseDocProfileMock(baseId),
}));

import { useBaseDocProfile } from "./useBaseDocProfile.ts";

const FULL_PROFILE: BaseDocumentationProfile = {
  level: "full",
  members: ["welcome-htm"],
  welcomeConvention: "folder",
  hasUsableDescription: true,
  welcomeImages: [],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useBaseDocProfile", () => {
  it("starts with an empty cache and does not fetch until requested", () => {
    const { result } = renderHook(() => useBaseDocProfile());
    expect(result.current.profiles).toEqual({});
    expect(getBaseDocProfileMock).not.toHaveBeenCalled();
  });

  it("request() fetches and populates the cache for that id", async () => {
    getBaseDocProfileMock.mockResolvedValueOnce(FULL_PROFILE);
    const { result } = renderHook(() => useBaseDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });

    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]).toEqual(FULL_PROFILE);
    });
    expect(getBaseDocProfileMock).toHaveBeenCalledTimes(1);
  });

  it("a second request() for the SAME id does not refetch (cached)", async () => {
    getBaseDocProfileMock.mockResolvedValueOnce(FULL_PROFILE);
    const { result } = renderHook(() => useBaseDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });
    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]).toEqual(FULL_PROFILE);
    });

    act(() => {
      result.current.request("sil_euro_latin");
    });
    expect(getBaseDocProfileMock).toHaveBeenCalledTimes(1);
  });

  it("two overlapping in-flight requests for the same id fetch only once", async () => {
    let resolveFetch: (profile: BaseDocumentationProfile) => void = () => {};
    getBaseDocProfileMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const { result } = renderHook(() => useBaseDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
      result.current.request("sil_euro_latin");
    });
    expect(getBaseDocProfileMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(FULL_PROFILE);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]).toEqual(FULL_PROFILE);
    });
  });

  it("a rejected fetch is cached as 'unknown' rather than retried forever", async () => {
    getBaseDocProfileMock.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useBaseDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });

    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]?.level).toBe("unknown");
    });
  });

  it("does not update state after unmount (no act warning / crash)", async () => {
    let resolveFetch: (profile: BaseDocumentationProfile) => void = () => {};
    getBaseDocProfileMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const { result, unmount } = renderHook(() => useBaseDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });
    unmount();

    // Resolving after unmount must not throw / must not attempt a setState.
    await act(async () => {
      resolveFetch(FULL_PROFILE);
      await Promise.resolve();
    });
  });
});
