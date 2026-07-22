// Tests for useFontSupportChecker — the hook wrapping fontSupport.ts for
// CharacterMapPane. fontSupport.ts's own detection/caching/degradation logic
// is covered directly in fontSupport.test.ts; this file only covers the
// hook's own behavior: returning a checker bound to the current font stack,
// and forcing a re-render once fonts become ready.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

describe("useFontSupportChecker", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a checker function that reflects isGlyphSupported for the given font stack", async () => {
    const { useFontSupportChecker } = await import("./useFontSupportChecker.ts");
    const { result } = renderHook(() => useFontSupportChecker("'Noto Sans', system-ui, sans-serif"));
    // Real jsdom has no canvas backing — degrades to "supported" (true).
    expect(result.current("a")).toBe(true);
  });

  it("re-renders once document.fonts.ready resolves, so a glyph measured before fonts loaded gets re-evaluated", async () => {
    let resolveReady!: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: readyPromise },
    });

    const { useFontSupportChecker } = await import("./useFontSupportChecker.ts");
    const renderSpy = vi.fn();
    const { result } = renderHook(() => {
      renderSpy();
      return useFontSupportChecker("'Noto Sans', system-ui, sans-serif");
    });

    const rendersBeforeReady = renderSpy.mock.calls.length;
    expect(result.current("a")).toBe(true);

    await act(async () => {
      resolveReady();
      await readyPromise;
      await Promise.resolve();
    });

    expect(renderSpy.mock.calls.length).toBeGreaterThan(rendersBeforeReady);

    Reflect.deleteProperty(document, "fonts");
  });
});
