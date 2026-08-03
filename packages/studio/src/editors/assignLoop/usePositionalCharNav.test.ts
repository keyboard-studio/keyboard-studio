// Unit tests for usePositionalCharNav (F7 defect 3 — "the button eats the
// click"): handleBack must fall through to onBack when there is no current
// position to step back within (currentChar === null, or currentChar is no
// longer present in `list` after an inventory change), rather than silently
// doing nothing.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePositionalCharNav } from "./usePositionalCharNav.ts";

describe("usePositionalCharNav — handleBack null-position fallthrough", () => {
  it("calls onBack when currentChar is null", () => {
    const onBack = vi.fn();
    const setCurrentChar = vi.fn();
    const { result } = renderHook(() =>
      usePositionalCharNav({
        list: ["a", "b", "c"],
        currentChar: null,
        setCurrentChar,
        onBack,
      }),
    );

    act(() => {
      result.current.handleBack();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(setCurrentChar).not.toHaveBeenCalled();
  });

  it("calls onBack when currentChar is no longer present in `list` (currentIdx === -1)", () => {
    const onBack = vi.fn();
    const setCurrentChar = vi.fn();
    const { result } = renderHook(() =>
      usePositionalCharNav({
        // "z" was the current character before the inventory changed
        // underneath this gallery; it is no longer in `list`.
        list: ["a", "b", "c"],
        currentChar: "z",
        setCurrentChar,
        onBack,
      }),
    );

    expect(result.current.currentIdx).toBe(-1);

    act(() => {
      result.current.handleBack();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(setCurrentChar).not.toHaveBeenCalled();
  });

  it("is a no-op (no throw) when onBack is undefined and there is no current position", () => {
    const setCurrentChar = vi.fn();
    const { result } = renderHook(() =>
      usePositionalCharNav({
        list: ["a", "b", "c"],
        currentChar: null,
        setCurrentChar,
      }),
    );

    expect(() => {
      act(() => {
        result.current.handleBack();
      });
    }).not.toThrow();
    expect(setCurrentChar).not.toHaveBeenCalled();
  });

  it("still steps back one position (not onBack) when currentIdx > 0", () => {
    const onBack = vi.fn();
    const setCurrentChar = vi.fn();
    const { result } = renderHook(() =>
      usePositionalCharNav({
        list: ["a", "b", "c"],
        currentChar: "b",
        setCurrentChar,
        onBack,
      }),
    );

    act(() => {
      result.current.handleBack();
    });

    expect(setCurrentChar).toHaveBeenCalledWith("a");
    expect(onBack).not.toHaveBeenCalled();
  });

  it("still calls onBack on the first character (currentIdx === 0) — unchanged behavior", () => {
    const onBack = vi.fn();
    const setCurrentChar = vi.fn();
    const { result } = renderHook(() =>
      usePositionalCharNav({
        list: ["a", "b", "c"],
        currentChar: "a",
        setCurrentChar,
        onBack,
      }),
    );

    act(() => {
      result.current.handleBack();
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(setCurrentChar).not.toHaveBeenCalled();
  });
});
