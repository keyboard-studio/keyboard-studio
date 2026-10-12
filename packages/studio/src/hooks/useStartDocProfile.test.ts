// Unit tests for useStartDocProfile (spec 079 FR-008): the per-base-id cache
// that drives StartResolution's suggestion-card badges.

import { describe, it, expect, vi, afterEach } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { StartDocumentationProfile } from "@keyboard-studio/contracts";

const getStartDocProfileMock = vi.fn<(startId: string) => Promise<StartDocumentationProfile>>();

vi.mock("../lib/services.ts", () => ({
  getStartDocProfile: (startId: string) => getStartDocProfileMock(startId),
}));

import { useStartDocProfile } from "./useStartDocProfile.ts";

const FULL_PROFILE: StartDocumentationProfile = {
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

describe("useStartDocProfile", () => {
  it("starts with an empty cache and does not fetch until requested", () => {
    const { result } = renderHook(() => useStartDocProfile());
    expect(result.current.profiles).toEqual({});
    expect(getStartDocProfileMock).not.toHaveBeenCalled();
  });

  it("request() fetches and populates the cache for that id", async () => {
    getStartDocProfileMock.mockResolvedValueOnce(FULL_PROFILE);
    const { result } = renderHook(() => useStartDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });

    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]).toEqual(FULL_PROFILE);
    });
    expect(getStartDocProfileMock).toHaveBeenCalledTimes(1);
  });

  it("a second request() for the SAME id does not refetch (cached)", async () => {
    getStartDocProfileMock.mockResolvedValueOnce(FULL_PROFILE);
    const { result } = renderHook(() => useStartDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });
    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]).toEqual(FULL_PROFILE);
    });

    act(() => {
      result.current.request("sil_euro_latin");
    });
    expect(getStartDocProfileMock).toHaveBeenCalledTimes(1);
  });

  it("two overlapping in-flight requests for the same id fetch only once", async () => {
    let resolveFetch: (profile: StartDocumentationProfile) => void = () => {};
    getStartDocProfileMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const { result } = renderHook(() => useStartDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
      result.current.request("sil_euro_latin");
    });
    expect(getStartDocProfileMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch(FULL_PROFILE);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]).toEqual(FULL_PROFILE);
    });
  });

  it("a rejected fetch is cached as 'unknown' rather than retried forever", async () => {
    getStartDocProfileMock.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useStartDocProfile());

    act(() => {
      result.current.request("sil_euro_latin");
    });

    await waitFor(() => {
      expect(result.current.profiles["sil_euro_latin"]?.level).toBe("unknown");
    });
  });

  it("does not update state after unmount (no act warning / crash)", async () => {
    let resolveFetch: (profile: StartDocumentationProfile) => void = () => {};
    getStartDocProfileMock.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );
    const { result, unmount } = renderHook(() => useStartDocProfile());

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
