// Unit tests for useOskChannel — postMessage bridge hook.
//
// Coverage:
//   1. KEYBOARD_ACTIVE from the expected iframe contentWindow is counted.
//   2. Repeated activations are each counted (every recompile re-activates).
//   3. Events from a DIFFERENT source (not the iframe's contentWindow) are ignored.
//   4. TEXT_UPDATED updates textValue.
//
// NOTE: The security guard in useOskChannel requires event.source === frame.contentWindow.
// We achieve this by creating a real iframe element in the document, grabbing its
// contentWindow, and using that same window as the event source via window.dispatchEvent
// with a synthetic MessageEvent.
//
// JSDOM limitation: window.dispatchEvent with a MessageEvent whose `source` is set to
// frame.contentWindow requires that the frame is actually appended to the document
// (so JSDOM creates a contentWindow for it). This works in vitest's jsdom environment.

import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { RefObject } from "react";
import { useOskChannel } from "./useOskChannel";

// ---------------------------------------------------------------------------
// Helper: create a real HTMLIFrameElement appended to the document and return
// a stable RefObject pointing at it (mimicking React's useRef).
// ---------------------------------------------------------------------------

function makeIframeRef(): { ref: RefObject<HTMLIFrameElement | null>; frame: HTMLIFrameElement } {
  const frame = document.createElement("iframe");
  document.body.appendChild(frame);
  const ref = { current: frame } as RefObject<HTMLIFrameElement | null>;
  return { ref, frame };
}

// ---------------------------------------------------------------------------
// Helper: dispatch a postMessage-like MessageEvent from a given source window
// to the top window. This simulates what osk-frame.html does when it calls
// window.parent.postMessage(...).
// ---------------------------------------------------------------------------

function dispatchFromSource(source: Window, data: unknown): void {
  const event = new MessageEvent("message", {
    data,
    source,
    origin: window.location.origin,
  });
  window.dispatchEvent(event);
}

// ---------------------------------------------------------------------------
// Teardown
// ---------------------------------------------------------------------------

afterEach(() => {
  // Remove any iframes appended during the test.
  document.querySelectorAll("iframe").forEach((f) => f.remove());
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useOskChannel — KEYBOARD_ACTIVE", () => {
  it("counts a KEYBOARD_ACTIVE message from the iframe contentWindow", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));
    expect(result.current.keyboardActivations).toBe(0);

    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      // JSDOM may not initialise contentWindow for detached frames; skip gracefully.
      return;
    }

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
    });

    expect(result.current.keyboardActivations).toBe(1);
  });

  it("counts each repeated activation", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
    });

    expect(result.current.keyboardActivations).toBe(3);
  });

  it("clears a stale engineError when a later KEYBOARD_ACTIVE arrives", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));
    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "ENGINE_ERROR", message: "KMW: load failed" });
    });
    expect(result.current.engineError).toBe("KMW: load failed");

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
    });
    expect(result.current.engineError).toBeNull();

    // A genuine failure of the latest keyboard still surfaces.
    await act(async () => {
      dispatchFromSource(frameWindow, { type: "ENGINE_ERROR", message: "KMW: second failure" });
    });
    expect(result.current.engineError).toBe("KMW: second failure");
  });

  it("ignores events from a window that is not the iframe contentWindow", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    // Dispatch from `window` (the top-level window) instead of `frameWindow`.
    // The security guard should reject it.
    await act(async () => {
      dispatchFromSource(window, { type: "KEYBOARD_ACTIVE" });
      dispatchFromSource(window, { type: "TEXT_UPDATED", value: "spoofed" });
    });

    expect(result.current.keyboardActivations).toBe(0);
    expect(result.current.textValue).toBe("");
  });
});

describe("useOskChannel — engineError lifecycle (#1905)", () => {
  it("sets engineError on ENGINE_ERROR", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, {
        type: "ENGINE_ERROR",
        message: "keyboard load failed for 'Keyboard_x'",
      });
    });

    expect(result.current.engineError).toBe("keyboard load failed for 'Keyboard_x'");
  });

  it("clears a stale engineError when the final keyboard activates", async () => {
    // The reported bug: a superseded load's failure (e.g. a recompile whose
    // blob was revoked before KMW's script tag fetched it) left the red
    // banner up forever, even though the final keyboard activated fine.
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, {
        type: "ENGINE_ERROR",
        message: "keyboard load failed for 'Keyboard_sil_cameroon_qwerty'",
      });
    });
    expect(result.current.engineError).not.toBeNull();

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
    });

    expect(result.current.engineError).toBeNull();
    expect(result.current.keyboardActivations).toBe(1);
  });

  it("keeps the error when the latest keyboard genuinely fails to load", async () => {
    // A genuine failure posts ENGINE_ERROR with no following KEYBOARD_ACTIVE —
    // the banner must stay up.
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, {
        type: "ENGINE_ERROR",
        message: "keyboard load failed for 'Keyboard_broken'",
      });
    });

    expect(result.current.engineError).toBe("keyboard load failed for 'Keyboard_broken'");
    expect(result.current.keyboardActivations).toBe(0);
  });

  it("a later genuine failure re-surfaces the error after an activation cleared it", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "ENGINE_ERROR", message: "stale" });
      dispatchFromSource(frameWindow, { type: "KEYBOARD_ACTIVE" });
    });
    expect(result.current.engineError).toBeNull();

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "ENGINE_ERROR", message: "genuine" });
    });
    expect(result.current.engineError).toBe("genuine");
  });

  it("ENGINE_READY still clears a previous engineError", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "ENGINE_ERROR", message: "boom" });
      dispatchFromSource(frameWindow, { type: "ENGINE_READY" });
    });

    expect(result.current.engineError).toBeNull();
    expect(result.current.engineReady).toBe(true);
  });
});

describe("useOskChannel — TEXT_UPDATED", () => {
  it("updates textValue", async () => {
    const { ref, frame } = makeIframeRef();
    const { result } = renderHook(() => useOskChannel(ref));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "TEXT_UPDATED", value: "hello" });
    });

    expect(result.current.textValue).toBe("hello");
  });
});

describe("useOskChannel — send() targetOrigin", () => {
  it("scopes postMessage to window.location.origin, never a wildcard", () => {
    const { ref, frame } = makeIframeRef();
    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    const postMessageSpy = vi.spyOn(frameWindow, "postMessage");

    const { result } = renderHook(() => useOskChannel(ref));

    act(() => {
      result.current.send({ type: "SET_OSK_MODE", mode: "touch" });
    });

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: "SET_OSK_MODE", mode: "touch" },
      window.location.origin
    );
    // Never a wildcard target — that was the pre-fix behavior.
    expect(postMessageSpy).not.toHaveBeenCalledWith(expect.anything(), "*");
  });
});
