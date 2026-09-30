// Tests for the haptics primitive (lib/haptics.ts): the guarded wrapper
// around navigator.vibrate must be a no-op without the API and must never
// throw, even when the platform API itself fails.

import { afterEach, describe, expect, it, vi } from "vitest";
import { buzz } from "./haptics.ts";

type MutableNavigator = Navigator & {
  vibrate?: (pattern: number) => boolean;
};

afterEach(() => {
  const nav = navigator as MutableNavigator;
  delete nav.vibrate;
  vi.restoreAllMocks();
});

describe("buzz", () => {
  it("is a no-op when navigator.vibrate is absent", () => {
    const nav = navigator as MutableNavigator;
    expect(nav.vibrate).toBeUndefined();
    expect(() => buzz(10)).not.toThrow();
  });

  it("calls navigator.vibrate with the requested duration when available", () => {
    const nav = navigator as MutableNavigator;
    const vibrate = vi.fn().mockReturnValue(true);
    nav.vibrate = vibrate;
    buzz(15);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(15);
  });

  it("never throws when the platform API throws", () => {
    const nav = navigator as MutableNavigator;
    nav.vibrate = vi.fn(() => {
      throw new Error("vibration unavailable");
    });
    expect(() => buzz(10)).not.toThrow();
  });
});
