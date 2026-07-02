// Unit tests for useOskChannel — postMessage bridge hook.
//
// Coverage:
//   1. KEY_TAPPED message from the expected iframe contentWindow invokes onKeyTap.
//   2. Repeated taps of the same keyId each fire onKeyTap (not de-duplicated).
//   3. KEY_TAPPED from a DIFFERENT source (not the iframe's contentWindow) is ignored.
//   4. TEXT_UPDATED still updates textValue when onKeyTap is provided.
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

describe("useOskChannel — onKeyTap callback", () => {
  it("invokes onKeyTap when a KEY_TAPPED message arrives from the iframe contentWindow", async () => {
    const { ref, frame } = makeIframeRef();
    const onKeyTap = vi.fn();

    const { result } = renderHook(() => useOskChannel(ref, onKeyTap));
    // Ensure hook mounted.
    expect(result.current.engineReady).toBe(false);

    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      // JSDOM may not initialise contentWindow for detached frames; skip gracefully.
      return;
    }

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "KEY_TAPPED", keyId: "K_A" });
    });

    expect(onKeyTap).toHaveBeenCalledTimes(1);
    expect(onKeyTap).toHaveBeenCalledWith("K_A");
  });

  it("fires onKeyTap for each repeated tap of the same keyId", async () => {
    const { ref, frame } = makeIframeRef();
    const onKeyTap = vi.fn();

    renderHook(() => useOskChannel(ref, onKeyTap));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "KEY_TAPPED", keyId: "K_A" });
      dispatchFromSource(frameWindow, { type: "KEY_TAPPED", keyId: "K_A" });
      dispatchFromSource(frameWindow, { type: "KEY_TAPPED", keyId: "K_A" });
    });

    // Each tap fires onKeyTap — no de-duplication
    expect(onKeyTap).toHaveBeenCalledTimes(3);
  });

  it("ignores KEY_TAPPED from a window that is not the iframe contentWindow", async () => {
    const { ref, frame } = makeIframeRef();
    const onKeyTap = vi.fn();

    renderHook(() => useOskChannel(ref, onKeyTap));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    // Dispatch from `window` (the top-level window) instead of `frameWindow`.
    // The security guard should reject it.
    await act(async () => {
      dispatchFromSource(window, { type: "KEY_TAPPED", keyId: "K_A" });
    });

    expect(onKeyTap).not.toHaveBeenCalled();
  });
});

describe("useOskChannel — TEXT_UPDATED coexists with onKeyTap", () => {
  it("updates textValue for TEXT_UPDATED even when onKeyTap is provided", async () => {
    const { ref, frame } = makeIframeRef();
    const onKeyTap = vi.fn();

    const { result } = renderHook(() => useOskChannel(ref, onKeyTap));

    const frameWindow = frame.contentWindow;
    if (!frameWindow) return;

    await act(async () => {
      dispatchFromSource(frameWindow, { type: "TEXT_UPDATED", value: "hello" });
    });

    expect(result.current.textValue).toBe("hello");
    // onKeyTap not called for TEXT_UPDATED
    expect(onKeyTap).not.toHaveBeenCalled();
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
