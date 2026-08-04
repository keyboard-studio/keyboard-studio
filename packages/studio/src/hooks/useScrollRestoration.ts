// useScrollRestoration — restores a scrollable pane's offset across a route
// unmount/remount (spec 057 US5, T060, FR-050).
//
// A tab switch unmounts the pane that held the scroll position — the same
// "position lives in component lifetime, not a model" shape D-5 names for
// every other bit of per-tab view state. This hook is the fix for scroll
// specifically: restore once at mount from `viewStateStore.scrollTop`, and
// write back on every scroll so the NEXT mount has something to restore.
//
// KEYED BY A STABLE PANE IDENTIFIER, NEVER AN ARRAY INDEX (data-model.md
// ViewState, FR-050). An index would silently re-target a restored offset
// onto the wrong pane the moment a pane is added, removed, or reordered.
// Callers pass a literal string naming the pane ("dashboard-flow-map",
// "decision-trail") — never a position in a list.
//
// Takes a caller-owned ref rather than returning one of its own (the
// `useOskChannel` idiom, not the `useResizablePanes` one): the caller already
// needs the ref for its own JSX (`<div ref={scrollRef} style={{ overflow:
// "auto" }}>`), so this hook attaches behaviour to an existing element
// instead of asking every caller to thread an extra ref back onto the right
// node.
//
// Deliberately NO throttling / rAF-coalescing of the scroll-driven write: the
// store write is a plain object-spread assignment, and nothing selects
// `scrollTop` for render (see viewStateStore.ts) — there is no subscriber to
// spare from extra renders. Coalescing would trade a real simplification for
// a maintenance cost this hook does not need to carry; add it later if
// profiling ever says otherwise.
//
// FR-053: this hook never reaches a compile or a validator run. It touches
// exactly one store (`viewStateStore`), which has no reducer, no debounce,
// and no subscriber wired to `useValidator` or the compiler worker.

import { useEffect } from "react";
import type { RefObject } from "react";
import { useViewStateStore } from "../stores/viewStateStore.ts";

export function useScrollRestoration(
  ref: RefObject<HTMLElement | null>,
  paneId: string,
): void {
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;

    // Restore ONCE at mount. Read via getState() rather than a subscribed
    // selector: this is a one-shot restore, not a live binding — nothing here
    // should re-run when some OTHER pane's offset changes.
    const stored = useViewStateStore.getState().scrollTop[paneId];
    if (stored !== undefined) {
      el.scrollTop = stored;
    }

    const handleScroll = () => {
      useViewStateStore.getState().setScrollTop(paneId, el.scrollTop);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
    // ref is a stable object identity from the caller's useRef; paneId is the
    // only input that should ever cause this effect to re-subscribe.
  }, [ref, paneId]);
}
