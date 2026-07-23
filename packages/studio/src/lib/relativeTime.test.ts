// Tests for relativeTime() — coarse "time ago" bucketing used by
// MyKeyboardsList. Returns a structured { unit, count } rather than a
// rendered string (P1-4) — the plural-ICU rendering happens in the component
// layer, which always has a live `i18n`; see relativeTime.ts's header note
// for why.

import { describe, it, expect, vi, afterEach } from "vitest";
import { relativeTime } from "./relativeTime.ts";

const NOW = 1_700_000_000_000;

afterEach(() => {
  vi.useRealTimers();
});

describe("relativeTime()", () => {
  it("returns unit 'now' for under a minute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(NOW - 30_000)).toEqual({ unit: "now", count: 0 });
  });

  it("buckets minutes correctly, including the singular boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(NOW - 60_000)).toEqual({ unit: "minute", count: 1 });
    expect(relativeTime(NOW - 5 * 60_000)).toEqual({ unit: "minute", count: 5 });
  });

  it("buckets hours correctly, including the singular boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(NOW - 60 * 60_000)).toEqual({ unit: "hour", count: 1 });
    expect(relativeTime(NOW - 3 * 60 * 60_000)).toEqual({ unit: "hour", count: 3 });
  });

  it("buckets days correctly, including the singular boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(NOW - 24 * 60 * 60_000)).toEqual({ unit: "day", count: 1 });
    expect(relativeTime(NOW - 2 * 24 * 60 * 60_000)).toEqual({ unit: "day", count: 2 });
  });

  it("never returns a negative count for a future timestamp", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    expect(relativeTime(NOW + 10_000)).toEqual({ unit: "now", count: 0 });
  });
});
