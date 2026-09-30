// useViewport — viewport sensor tests.
//
// jsdom has no `matchMedia`, so the no-matchMedia fallback path is the
// default here; the coarse-pointer path is covered by stubbing
// `window.matchMedia` per test.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useViewport, useIsNarrow, useIsCoarsePointer } from "./useViewport.ts";
import { BREAKPOINTS } from "../ui/breakpoints.ts";

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The default-geometry test runs before any afterEach, and jsdom's own
// default is 1024x768 — so the 1280x800 baseline must be set before each
// test, not restored after it.
beforeEach(() => {
  setViewport(1280, 800);
});

describe("useViewport — fallback (no matchMedia)", () => {
  it("reports desktop geometry by default", () => {
    const { result } = renderHook(() => useViewport());
    expect(result.current.width).toBe(1280);
    expect(result.current.height).toBe(800);
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.isNarrow).toBe(false);
    expect(result.current.isTabletOrNarrow).toBe(false);
    expect(result.current.isCoarsePointer).toBe(false);
  });

  it("derives narrow + portrait from a phone viewport", () => {
    setViewport(390, 844);
    const { result } = renderHook(() => useViewport());
    expect(result.current.orientation).toBe("portrait");
    expect(result.current.isNarrow).toBe(true);
    expect(result.current.isTabletOrNarrow).toBe(true);
  });

  it("treats the 479px breakpoint as inclusive", () => {
    setViewport(BREAKPOINTS.mobileMax, 800);
    const { result } = renderHook(() => useViewport());
    expect(result.current.isNarrow).toBe(true);
    setViewport(BREAKPOINTS.mobileMax + 1, 800);
    expect(result.current.isNarrow).toBe(false);
  });

  it("treats 768px as tablet-but-not-narrow", () => {
    setViewport(BREAKPOINTS.tabletMax, 800);
    const { result } = renderHook(() => useViewport());
    expect(result.current.isNarrow).toBe(false);
    expect(result.current.isTabletOrNarrow).toBe(true);
  });

  it("updates on resize", () => {
    const { result } = renderHook(() => useViewport());
    expect(result.current.isNarrow).toBe(false);
    setViewport(390, 844);
    expect(result.current.isNarrow).toBe(true);
    expect(result.current.orientation).toBe("portrait");
  });
});

describe("useViewport — coarse pointer via matchMedia", () => {
  it("reports isCoarsePointer from the (pointer: coarse) query", () => {
    const listeners: Record<string, Array<() => void>> = {};
    const query = {
      matches: true,
      addEventListener: vi.fn((type: string, cb: () => void) => {
        (listeners[type] ??= []).push(cb);
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((q: string) =>
        q === "(pointer: coarse)"
          ? query
          : {
              matches: false,
              addEventListener: vi.fn(),
              removeEventListener: vi.fn(),
            },
      ),
    );

    setViewport(844, 390);
    const { result } = renderHook(() => useViewport());
    // Landscape phone: NOT narrow (layout follows width) but coarse (touch sizing follows pointer).
    expect(result.current.orientation).toBe("landscape");
    expect(result.current.isNarrow).toBe(false);
    expect(result.current.isCoarsePointer).toBe(true);
    expect(query.addEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
  });
});

describe("convenience hooks", () => {
  it("useIsNarrow defaults to the mobile breakpoint and accepts an override", () => {
    setViewport(600, 800);
    const { result } = renderHook(() => ({
      narrow: useIsNarrow(),
      tablet: useIsNarrow(BREAKPOINTS.tabletMax),
    }));
    expect(result.current.narrow).toBe(false);
    expect(result.current.tablet).toBe(true);
  });

  it("useIsCoarsePointer is false without matchMedia", () => {
    const { result } = renderHook(() => useIsCoarsePointer());
    expect(result.current).toBe(false);
  });
});
