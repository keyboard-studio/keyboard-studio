// useScrollRestoration.test — spec 057 T060 (FR-050).
//
// Exercises the hook against plain DOM nodes rather than rendered JSX (this
// file is a leaf .ts file — no .tsx — matching useOskChannel.test.ts's
// `makeIframeRef` idiom of a manually-constructed ref pointing at a real,
// document-attached element).
//
// The keying tests are the point of this file, not a formality: a pane
// identified by a STABLE STRING must restore to its own offset regardless of
// how many other panes exist, in what order they mount, or whether a pane is
// inserted ahead of it — the exact array-index failure data-model.md's
// ViewState section calls out by name.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { useScrollRestoration } from "./useScrollRestoration.ts";
import { useViewStateStore } from "../stores/viewStateStore.ts";

/** A real, document-attached div plus a manually-built ref pointing at it —
 * the hook reads `ref.current` inside a `useEffect`, so the element must
 * exist before the hook mounts, not be created by the hook itself. */
function makePaneRef(): { ref: RefObject<HTMLDivElement | null>; el: HTMLDivElement } {
  const el = document.createElement("div");
  el.setAttribute("data-scroll-test-pane", "");
  document.body.appendChild(el);
  const ref = { current: el } as RefObject<HTMLDivElement | null>;
  return { ref, el };
}

beforeEach(() => {
  useViewStateStore.getState().reset();
});

afterEach(() => {
  document.querySelectorAll("[data-scroll-test-pane]").forEach((n) => n.remove());
});

describe("useScrollRestoration", () => {
  it("restores a previously stored offset on mount", () => {
    useViewStateStore.getState().setScrollTop("pane-a", 120);
    const { ref, el } = makePaneRef();

    renderHook(() => useScrollRestoration(ref, "pane-a"));

    expect(el.scrollTop).toBe(120);
  });

  it("leaves the offset at 0 when nothing was ever stored for this pane", () => {
    const { ref, el } = makePaneRef();

    renderHook(() => useScrollRestoration(ref, "pane-fresh"));

    expect(el.scrollTop).toBe(0);
  });

  it("writes the new offset to the store when the pane scrolls", () => {
    const { ref, el } = makePaneRef();
    renderHook(() => useScrollRestoration(ref, "pane-b"));

    el.scrollTop = 75;
    el.dispatchEvent(new Event("scroll"));

    expect(useViewStateStore.getState().scrollTop["pane-b"]).toBe(75);
  });

  it("keys by a stable identifier — two panes never cross-contaminate", () => {
    const left = makePaneRef();
    const right = makePaneRef();
    renderHook(() => useScrollRestoration(left.ref, "pane-left"));
    renderHook(() => useScrollRestoration(right.ref, "pane-right"));

    left.el.scrollTop = 30;
    left.el.dispatchEvent(new Event("scroll"));
    right.el.scrollTop = 90;
    right.el.dispatchEvent(new Event("scroll"));

    expect(useViewStateStore.getState().scrollTop).toEqual({
      "pane-left": 30,
      "pane-right": 90,
    });
  });

  it("a NEW pane appearing does not re-target an EXISTING pane's restored offset", () => {
    // The failure this guards against: if the hook were keyed by mount/render
    // ORDER instead of an id, a pane that starts mounting ahead of "pane-old"
    // would silently make "pane-old"'s restore land on the wrong element —
    // exactly the risk data-model.md calls out for an index key.
    useViewStateStore.getState().setScrollTop("pane-old", 200);

    const newPane = makePaneRef();
    const oldPane = makePaneRef();
    // "pane-new" mounts FIRST, ahead of "pane-old" — the reordering an
    // index-based key would get wrong.
    renderHook(() => useScrollRestoration(newPane.ref, "pane-new"));
    renderHook(() => useScrollRestoration(oldPane.ref, "pane-old"));

    expect(oldPane.el.scrollTop).toBe(200);
    expect(newPane.el.scrollTop).toBe(0);
  });

  it("restores across an unmount/remount with the same pane id — the tab-switch case", () => {
    const first = makePaneRef();
    const { unmount } = renderHook(() => useScrollRestoration(first.ref, "pane-c"));
    first.el.scrollTop = 66;
    first.el.dispatchEvent(new Event("scroll"));
    unmount();

    const second = makePaneRef();
    renderHook(() => useScrollRestoration(second.ref, "pane-c"));

    expect(second.el.scrollTop).toBe(66);
  });

  it("does nothing when the ref is not yet attached to an element", () => {
    const ref: RefObject<HTMLDivElement | null> = { current: null };

    expect(() => renderHook(() => useScrollRestoration(ref, "pane-d"))).not.toThrow();
    expect(useViewStateStore.getState().scrollTop["pane-d"]).toBeUndefined();
  });
});
