// useSourcedExemplars — the settled result is keyed by tag, so a tag change
// never reports the previous tag's `loading: false`.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { SourcedInventory } from "../lib/services.ts";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("../lib/services.ts", () => ({
  sourcedExemplars: (tag: string) => lookup(tag),
}));

import { useSourcedExemplars } from "./useSourcedExemplars.ts";

function inv(tag: string): SourcedInventory {
  return {
    resolvedTag: tag,
    source: "cldr",
    confidence: "approved",
    characters: [],
    digraphs: [],
  } as unknown as SourcedInventory;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  lookup.mockReset();
});

describe("useSourcedExemplars", () => {
  it("reports settled, not loading, and makes no lookup for a blank or missing tag", () => {
    const a = renderHook(() => useSourcedExemplars(undefined));
    expect(a.result.current).toEqual({ inventory: null, loading: false });
    const b = renderHook(() => useSourcedExemplars("   "));
    expect(b.result.current).toEqual({ inventory: null, loading: false });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("is loading until the lookup settles, then reports the inventory", async () => {
    const d = deferred<SourcedInventory | null>();
    lookup.mockReturnValue(d.promise);
    const { result } = renderHook(() => useSourcedExemplars("ewo"));
    expect(result.current).toEqual({ inventory: null, loading: true });
    await act(async () => d.resolve(inv("ewo")));
    expect(result.current.loading).toBe(false);
    expect(result.current.inventory?.resolvedTag).toBe("ewo");
  });

  it("degrades a rejected lookup to settled-with-no-inventory", async () => {
    lookup.mockRejectedValue(new Error("no index"));
    const { result } = renderHook(() => useSourcedExemplars("ewo"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.inventory).toBeNull();
  });

  it("after the tag changes, reports loading:true (no stale loading:false) until the new lookup settles", async () => {
    const second = deferred<SourcedInventory | null>();
    lookup.mockImplementation((tag: string) =>
      tag === "ewo" ? Promise.resolve(inv("ewo")) : second.promise,
    );
    const { result, rerender } = renderHook(({ tag }) => useSourcedExemplars(tag), {
      initialProps: { tag: "ewo" },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.inventory?.resolvedTag).toBe("ewo");

    rerender({ tag: "bfd" });
    // Immediately after the rerender: the old tag's answer must not leak.
    expect(result.current).toEqual({ inventory: null, loading: true });

    await act(async () => second.resolve(inv("bfd")));
    expect(result.current.loading).toBe(false);
    expect(result.current.inventory?.resolvedTag).toBe("bfd");
  });

  it("ignores a stale lookup that resolves after the tag changed", async () => {
    const first = deferred<SourcedInventory | null>();
    const second = deferred<SourcedInventory | null>();
    lookup.mockImplementation((tag: string) => (tag === "ewo" ? first.promise : second.promise));
    const { result, rerender } = renderHook(({ tag }) => useSourcedExemplars(tag), {
      initialProps: { tag: "ewo" },
    });
    rerender({ tag: "bfd" });
    await act(async () => first.resolve(inv("ewo")));
    expect(result.current).toEqual({ inventory: null, loading: true });
    await act(async () => second.resolve(null));
    expect(result.current).toEqual({ inventory: null, loading: false });
  });
});
