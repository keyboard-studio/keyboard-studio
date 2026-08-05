// Unit tests for CharScrollStrip — the horizontal character-scroll strip
// shared by MechanismGallery (physical) and TouchGallery (touch). See the
// file-header comment on CharScrollStrip.tsx for the testid scheme (chip/
// badge key off the FULL hyphen-joined hex of every codepoint in the
// grapheme, not just the first one — the reason for "full", not "first", is
// exactly the collision case the last test below locks down).

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../../test/renderWithI18n.tsx";
import { CharScrollStrip, MAX_VISIBLE_CHIPS } from "./CharScrollStrip.tsx";
import type { MechanismAssignment } from "@keyboard-studio/contracts";
import { PATTERN_DEADKEY } from "../patternIds.ts";
import { expectCurrentChar, getCurrentCharChip } from "../../../test/currentCharChip.ts";

/** `count` distinct, collision-free single-codepoint characters (private-use
 *  area, well away from every other test's ASCII/Latin fixtures in this file). */
function manyChars(count: number): string[] {
  return Array.from({ length: count }, (_, i) => String.fromCodePoint(0xe000 + i));
}

afterEach(() => {
  cleanup();
});

describe("CharScrollStrip — chip rendering", () => {
  it("renders one chip per character in `chars`", () => {
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-chip-0061")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-0062")).toBeTruthy();
    expect(screen.getByTestId("char-scroll-chip-0063")).toBeTruthy();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("renders null (no strip) when `chars` is empty", () => {
    const { container } = render(
      <CharScrollStrip
        chars={[]}
        currentChar={null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("CharScrollStrip — large-inventory rendering cap (regression: full-inventory freeze)", () => {
  // A `chars` list past MAX_VISIBLE_CHIPS mounted one <button> chip per
  // character — for a real several-thousand-character inventory (e.g.
  // Hakka's ~3k confirmed romanization inventory) this froze the tab on
  // entry to the gallery. These lock the fix's actual contract: the DOM node
  // count stays bounded, AND the currently-selected character is never
  // truncated out of the rendered slice, however far into the list it is.

  it("mounts at most MAX_VISIBLE_CHIPS chips for a list far larger than that", () => {
    const chars = manyChars(MAX_VISIBLE_CHIPS + 500);
    render(
      <CharScrollStrip
        chars={chars}
        currentChar={chars[0] ?? null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(MAX_VISIBLE_CHIPS);
  });

  it("keeps the currently-selected chip rendered and aria-pressed even when its index is far past a naive head-of-list truncation", () => {
    const chars = manyChars(MAX_VISIBLE_CHIPS + 500);
    const lastChar = chars[chars.length - 1] ?? "";
    render(
      <CharScrollStrip
        chars={chars}
        currentChar={lastChar}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expectCurrentChar(lastChar);
    expect(getCurrentCharChip().getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the 'Showing N of M' note only when the list is actually truncated", () => {
    const chars = manyChars(MAX_VISIBLE_CHIPS + 500);
    render(
      <CharScrollStrip
        chars={chars}
        currentChar={chars[0] ?? null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(
      screen.getByText(new RegExp(`Showing ${MAX_VISIBLE_CHIPS} of ${chars.length}`)),
    ).toBeTruthy();
  });

  it("renders every chip with no truncation note when the list is exactly at the cap", () => {
    const chars = manyChars(MAX_VISIBLE_CHIPS);
    render(
      <CharScrollStrip
        chars={chars}
        currentChar={chars[0] ?? null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getAllByRole("button")).toHaveLength(MAX_VISIBLE_CHIPS);
    expect(screen.queryByText(/Showing \d+ of \d+/)).toBeNull();
  });
});

describe("CharScrollStrip — producer-count badge", () => {
  it("badges an unproduced character RED at count 0", () => {
    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    const badge = screen.getByTestId("char-scroll-badge-0061");
    expect(badge.textContent).toBe("0");
    expect(badge.style.color).toBe("rgb(248, 81, 73)"); // #f85149 — the badge-bad color
  });

  it("badges a produced character GREEN at count >= 1, with the count as its text", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "a",
        modality: "physical",
        mechanisms: [{ patternId: PATTERN_DEADKEY, slotValues: { baseLetters: "a" } }],
      },
    ];

    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={assignments}
        modality="physical"
      />,
    );

    const badge = screen.getByTestId("char-scroll-badge-0061");
    expect(badge.textContent).toBe("1");
    expect(badge.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — the badge-good color
  });

  it("computes each chip's badge from the shared getProducerBadge selector, not a re-derived count — a modality mismatch still reads 0", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "a",
        modality: "touch", // caller below asks for "physical" — must not count
        mechanisms: [{ patternId: PATTERN_DEADKEY }],
      },
    ];

    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={assignments}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-badge-0061").textContent).toBe("0");
  });

  it("badges a seed-reachable character (baseDirectSet) GREEN at 1 with no assignment — 'already in the layout' must never read red 0", () => {
    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="touch"
        baseDirectSet={new Set(["a"])}
      />,
    );

    const badge = screen.getByTestId("char-scroll-badge-0061");
    expect(badge.textContent).toBe("1");
    expect(badge.style.color).toBe("rgb(86, 211, 100)"); // #56d364 — the badge-good color
  });

  it("keeps a seed-reachable character at 1 once its 'already in layout' suggestion is accepted (touch_inherited is not double-counted)", () => {
    const assignments: MechanismAssignment[] = [
      {
        scope: "individual",
        target: "a",
        modality: "touch",
        mechanisms: [{ patternId: "touch_inherited" }],
      },
    ];

    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={assignments}
        modality="touch"
        baseDirectSet={new Set(["a"])}
      />,
    );

    expect(screen.getByTestId("char-scroll-badge-0061").textContent).toBe("1");
  });
});

describe("CharScrollStrip — 'mark for later review' blue flag (mechanism-gallery-progression follow-up)", () => {
  it("renders no flag marker at all when markedSet is omitted", () => {
    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.queryByTestId("char-scroll-badge-marked-0061")).toBeNull();
  });

  it("renders no flag marker for a character NOT in markedSet", () => {
    render(
      <CharScrollStrip
        chars={["a", "b"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
        markedSet={new Set(["b"])}
      />,
    );

    expect(screen.queryByTestId("char-scroll-badge-marked-0061")).toBeNull();
    expect(screen.getByTestId("char-scroll-badge-marked-0062")).toBeTruthy();
  });

  it("renders a decorative, BLUE (#6ea8fe) flag marker on a chip whose character is in markedSet, distinct from the badge's own good/bad palette", () => {
    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
        markedSet={new Set(["a"])}
      />,
    );

    const flag = screen.getByTestId("char-scroll-badge-marked-0061");
    expect(flag.getAttribute("aria-hidden")).toBe("true");
    expect(flag.textContent).toBe("⚑");
    expect(flag.style.color).toBe("rgb(110, 168, 254)"); // #6ea8fe — ACCENT, never the badge's amber/green/red palette
  });

  it("appends a 'marked for later review' clause to the chip's own accessible name — never the ONLY signal (docs/accessibility.md)", () => {
    render(
      <CharScrollStrip
        chars={["a"]}
        currentChar="a"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
        markedSet={new Set(["a"])}
      />,
    );

    expectCurrentChar("a", { marked: true });
  });
});

describe("CharScrollStrip — current-chip selection (aria-pressed + accessible name)", () => {
  // This strip is the sole replacement for the removed per-gallery character-
  // heading card (see the file-header comment above); MechanismGallery.test.tsx
  // and TouchGallery.test.tsx locate "the current character" via the shared
  // getCurrentCharChip()/expectCurrentChar() helpers
  // (../../../test/currentCharChip.ts). These tests exercise those helpers
  // directly against the component they key off, so a change to the chip's
  // aria-pressed/aria-label contract fails here first, not only in the two
  // much larger gallery suites.
  it("marks only the currentChar chip aria-pressed, with the 'Go to U+XXXX <char>' accessible name", () => {
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expectCurrentChar("b");
    expect(getCurrentCharChip()).toBe(screen.getByTestId("char-scroll-chip-0062"));
    expect(screen.getByTestId("char-scroll-chip-0061").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("char-scroll-chip-0063").getAttribute("aria-pressed")).toBe("false");
  });

  it("throws (via getCurrentCharChip) when currentChar is null — no chip is pressed", () => {
    render(
      <CharScrollStrip
        chars={["a", "b"]}
        currentChar={null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(() => getCurrentCharChip()).toThrow();
  });
});

describe("CharScrollStrip — roving tabindex", () => {
  // Only one chip should ever be a Tab stop at a time (tabIndex 0); the rest
  // are tabIndex -1 and reachable only via ArrowLeft/ArrowRight (see
  // handleKeyDown) or a mouse click — otherwise up to MAX_VISIBLE_CHIPS chips
  // would each be its own Tab stop.
  it("gives the selected chip tabIndex 0 and every other visible chip tabIndex -1", () => {
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-chip-0061").getAttribute("tabindex")).toBe("-1");
    expect(screen.getByTestId("char-scroll-chip-0062").getAttribute("tabindex")).toBe("0");
    expect(screen.getByTestId("char-scroll-chip-0063").getAttribute("tabindex")).toBe("-1");
  });

  it("falls back to tabIndex 0 on the FIRST visible chip when currentChar is null — the strip must stay Tab-reachable with no selection", () => {
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar={null}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-chip-0061").getAttribute("tabindex")).toBe("0");
    expect(screen.getByTestId("char-scroll-chip-0062").getAttribute("tabindex")).toBe("-1");
    expect(screen.getByTestId("char-scroll-chip-0063").getAttribute("tabindex")).toBe("-1");
  });

  it("falls back to tabIndex 0 on the FIRST visible chip when currentChar is a stale value not present in `chars` — same guarantee for the indexOf === -1 case", () => {
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="z" // not in `chars` at all
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(screen.getByTestId("char-scroll-chip-0061").getAttribute("tabindex")).toBe("0");
    expect(screen.getByTestId("char-scroll-chip-0062").getAttribute("tabindex")).toBe("-1");
    expect(screen.getByTestId("char-scroll-chip-0063").getAttribute("tabindex")).toBe("-1");
  });
});

describe("CharScrollStrip — chip click", () => {
  it("clicking a chip calls onSelectChar with that exact character", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b"]}
        currentChar="a"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-0062"));

    expect(onSelectChar).toHaveBeenCalledTimes(1);
    expect(onSelectChar).toHaveBeenCalledWith("b");
  });
});

describe("CharScrollStrip — wheel horizontal scroll", () => {
  // The component dampens the raw wheel delta before applying it to
  // scrollLeft (WHEEL_SCROLL_FACTOR in CharScrollStrip.tsx) — the direction
  // pick and all boundary/early-return checks still branch on the RAW,
  // unfactored delta; only the actual `el.scrollLeft +=` step is scaled. Every
  // expectation below that asserts a concrete post-wheel scrollLeft is
  // `rawDelta * FACTOR`, not the raw delta itself.
  const FACTOR = 0.6; // mirrors CharScrollStrip.tsx's WHEEL_SCROLL_FACTOR

  // The listener under test is a native `addEventListener("wheel", ..., {
  // passive: false })` attached directly to the strip div (see the component's
  // useEffect), NOT a JSX onWheel prop — so it sits outside React's synthetic
  // event system entirely. A raw `element.dispatchEvent(new WheelEvent(...))`
  // reaches it exactly the way a real browser wheel notch would; that's the
  // mechanism used below rather than RTL's fireEvent.wheel helper, so this
  // test suite exercises the actual code path (native DOM dispatch) rather
  // than relying on a testing-library abstraction to happen to line up with
  // it. cancelable:true matters — the handler conditionally calls
  // `e.preventDefault()`, and a non-cancelable event makes that a silent
  // no-op / always-false `defaultPrevented`, which would make several
  // assertions below vacuous.
  //
  // dispatchWheel returns the SAME event instance it dispatched so tests can
  // read `.defaultPrevented` off it afterward (dispatchEvent's own boolean
  // return value is the inverse — false means "was prevented" — which reads
  // backwards at call sites, so we hand back the event instead).
  function dispatchWheel(el: Element, init: WheelEventInit): WheelEvent {
    const event = new WheelEvent("wheel", {
      cancelable: true,
      bubbles: true,
      deltaX: 0,
      deltaY: 0,
      ...init,
    });
    el.dispatchEvent(event);
    return event;
  }

  // jsdom does no layout: scrollWidth/clientWidth are hardcoded to 0 on every
  // element, so a strip left at jsdom's defaults always takes the
  // `scrollWidth <= clientWidth` early return — a naive wheel test would
  // "pass" without ever reaching the panning logic. This stubs both as fixed
  // values via `Object.defineProperty` (own-property override shadows
  // jsdom's prototype getters) and replaces `scrollLeft` with a real
  // get/set pair backed by a closure variable, so `el.scrollLeft += delta`
  // in the handler actually persists between reads — jsdom's own
  // scrollLeft, even where present, is not guaranteed to accumulate the way
  // a laid-out browser element would, so this test does not rely on it.
  function stubOverflowGeometry(
    el: HTMLElement,
    opts: { scrollWidth: number; clientWidth: number; scrollLeft?: number },
  ) {
    Object.defineProperty(el, "scrollWidth", {
      value: opts.scrollWidth,
      configurable: true,
    });
    Object.defineProperty(el, "clientWidth", {
      value: opts.clientWidth,
      configurable: true,
    });
    let current = opts.scrollLeft ?? 0;
    Object.defineProperty(el, "scrollLeft", {
      configurable: true,
      get() {
        return current;
      },
      set(v: number) {
        current = v;
      },
    });
  }

  it("stubOverflowGeometry actually puts the strip on the overflow (scrolling) path, not the early-return path", () => {
    // Sanity check for the stub itself, ahead of the behavioral assertions
    // below: scrollWidth (500) > clientWidth (200) must be true, or every
    // test in this block would pass vacuously against the early return.
    const strip = document.createElement("div");
    stubOverflowGeometry(strip, { scrollWidth: 500, clientWidth: 200, scrollLeft: 0 });
    expect(strip.scrollWidth).toBe(500);
    expect(strip.clientWidth).toBe(200);
    expect(strip.scrollWidth > strip.clientWidth).toBe(true);
    strip.scrollLeft = 42;
    expect(strip.scrollLeft).toBe(42); // confirms the get/set pair persists, unlike jsdom's own no-op default
  });

  it("wheeling down (positive deltaY) over an overflowing strip increases scrollLeft and does NOT call onSelectChar", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );
    const strip = screen.getByTestId("char-scroll-strip");
    stubOverflowGeometry(strip, { scrollWidth: 500, clientWidth: 200, scrollLeft: 100 });

    const event = dispatchWheel(strip, { deltaY: 60 });

    expect(strip.scrollLeft).toBe(100 + 60 * FACTOR); // 100 + 36 = 136
    expect(onSelectChar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("wheeling up (negative deltaY) while scrollLeft > 0 decreases scrollLeft and does NOT call onSelectChar", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );
    const strip = screen.getByTestId("char-scroll-strip");
    stubOverflowGeometry(strip, { scrollWidth: 500, clientWidth: 200, scrollLeft: 200 });

    dispatchWheel(strip, { deltaY: -60 });

    expect(strip.scrollLeft).toBe(200 - 60 * FACTOR); // 200 - 36 = 164
    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("at the left edge (scrollLeft 0), wheeling up releases the event — scrollLeft stays 0, defaultPrevented is false", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );
    const strip = screen.getByTestId("char-scroll-strip");
    stubOverflowGeometry(strip, { scrollWidth: 500, clientWidth: 200, scrollLeft: 0 });

    const event = dispatchWheel(strip, { deltaY: -60 });

    // Boundary check branches on the RAW delta (unaffected by FACTOR), so
    // this early-returns before the factor is ever applied — 0 is correct
    // either way, not a value that needs rescaling.
    expect(strip.scrollLeft).toBe(0);
    expect(event.defaultPrevented).toBe(false);
    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("at the right edge (scrollLeft === maxScrollLeft), wheeling down releases the event — scrollLeft unchanged, defaultPrevented is false", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );
    const strip = screen.getByTestId("char-scroll-strip");
    // maxScrollLeft = scrollWidth - clientWidth = 500 - 200 = 300
    stubOverflowGeometry(strip, { scrollWidth: 500, clientWidth: 200, scrollLeft: 300 });

    const event = dispatchWheel(strip, { deltaY: 60 });

    // Boundary check branches on the RAW delta (unaffected by FACTOR), so
    // this early-returns before the factor is ever applied — 300 is correct
    // either way, not a value that needs rescaling.
    expect(strip.scrollLeft).toBe(300);
    expect(event.defaultPrevented).toBe(false);
    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("with no overflow (scrollWidth <= clientWidth), wheeling does nothing — scrollLeft unchanged, defaultPrevented false", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );
    const strip = screen.getByTestId("char-scroll-strip");
    stubOverflowGeometry(strip, { scrollWidth: 200, clientWidth: 200, scrollLeft: 0 });

    const event = dispatchWheel(strip, { deltaY: 60 });

    // No-overflow early return happens before the raw delta is even read for
    // direction, let alone scaled — unaffected by FACTOR.
    expect(strip.scrollLeft).toBe(0);
    expect(event.defaultPrevented).toBe(false);
    expect(onSelectChar).not.toHaveBeenCalled();
  });

  it("a horizontal trackpad swipe (deltaX dominant, deltaY 0) pans by deltaX and does NOT call onSelectChar", () => {
    const onSelectChar = vi.fn();
    render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );
    const strip = screen.getByTestId("char-scroll-strip");
    stubOverflowGeometry(strip, { scrollWidth: 500, clientWidth: 200, scrollLeft: 100 });

    const event = dispatchWheel(strip, { deltaX: 80, deltaY: 0 });

    expect(strip.scrollLeft).toBe(100 + 80 * FACTOR); // 100 + 48 = 148
    expect(onSelectChar).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("CharScrollStrip — focus glue (DOM focus follows the newly selected chip, gated on an already-focused chip)", () => {
  // ArrowLeft/ArrowRight cycling itself has moved to the PANE level —
  // useCharCycleKeys.test.ts now owns the wrap-around/guard-key/no-op
  // coverage that used to live here (see that file). What's left here is
  // CharScrollStrip's own remaining contract: reacting to a `currentChar`
  // prop change by (a) scrolling the new chip into view and (b) moving DOM
  // focus onto it, but ONLY when focus was already resting on one of this
  // strip's own chips — see the component's own doc comment on the
  // `[currentChar]` effect for why the gate exists (a Next/Skip button click
  // elsewhere in the pane must never yank focus onto a distant chip).
  it("moving currentChar while focus is on a DIFFERENT chip in this strip moves focus to the new chip", () => {
    const { rerender } = render(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="b"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );
    // Simulate an in-progress roving-focus session: focus already sits on
    // some chip in the strip (not necessarily the selected one).
    screen.getByTestId("char-scroll-chip-0062").focus();
    expect(document.activeElement).toBe(screen.getByTestId("char-scroll-chip-0062"));

    rerender(
      <CharScrollStrip
        chars={["a", "b", "c"]}
        currentChar="c"
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    expect(document.activeElement).toBe(screen.getByTestId("char-scroll-chip-0063")); // "c"
  });

  it("moving currentChar while focus is OUTSIDE the strip does NOT steal focus onto the new chip (no double-handling / no hijack regression), but still scrolls the new chip into view", () => {
    // jsdom does not implement scrollIntoView at all — the component
    // feature-detects it (see CharScrollStrip.tsx's `[currentChar]` effect),
    // so without a stub the call is silently skipped and this test would
    // have nothing to assert on. Stub it here and restore afterward so
    // other tests in this file keep running against the real feature-detect
    // (undefined) path.
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollSpy = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrollSpy;

    try {
      // A sibling focusable control outside the strip — stands in for e.g. the
      // gallery's own "Next character"/"Skip" button, which sits in the same
      // pane but outside CharScrollStrip.
      const outsideButton = document.createElement("button");
      document.body.appendChild(outsideButton);
      outsideButton.focus();
      expect(document.activeElement).toBe(outsideButton);

      const { rerender } = render(
        <CharScrollStrip
          chars={["a", "b", "c"]}
          currentChar="b"
          onSelectChar={vi.fn()}
          assignments={[]}
          modality="physical"
        />,
      );
      // Rendering the strip itself must not steal focus from outsideButton.
      expect(document.activeElement).toBe(outsideButton);

      scrollSpy.mockClear();

      rerender(
        <CharScrollStrip
          chars={["a", "b", "c"]}
          currentChar="c"
          onSelectChar={vi.fn()}
          assignments={[]}
          modality="physical"
        />,
      );

      // Focus stays on outsideButton — the strip does not hijack it just
      // because currentChar advanced.
      expect(document.activeElement).toBe(outsideButton);
      // But scrollIntoView is UNCONDITIONAL (not gated on focus location) —
      // the newly selected chip must still be brought into view even though
      // DOM focus never moved.
      expect(scrollSpy).toHaveBeenCalledTimes(1);
      outsideButton.remove();
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });
});

describe("CharScrollStrip — full-codepoint testid keying (no first-codepoint collision)", () => {
  it("gives two distinct multi-codepoint graphemes sharing a base codepoint distinct, non-colliding testids", () => {
    // "e" + combining acute (U+0301) vs "e" + combining grave (U+0300) — both
    // start with the SAME base codepoint (U+0065). Keying the testid off only
    // the first codepoint (the pre-fix scheme) would collide; keying off the
    // FULL sequence must not.
    const eAcute = "é";
    const eGrave = "è";

    render(
      <CharScrollStrip
        chars={[eAcute, eGrave]}
        currentChar={eAcute}
        onSelectChar={vi.fn()}
        assignments={[]}
        modality="physical"
      />,
    );

    const acuteChip = screen.getByTestId("char-scroll-chip-0065-0301");
    const graveChip = screen.getByTestId("char-scroll-chip-0065-0300");

    expect(acuteChip).toBeTruthy();
    expect(graveChip).toBeTruthy();
    expect(acuteChip).not.toBe(graveChip);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("clicking each of the two colliding-base-codepoint chips navigates to its OWN distinct character, not the other one", () => {
    const onSelectChar = vi.fn();
    const eAcute = "é";
    const eGrave = "è";

    render(
      <CharScrollStrip
        chars={[eAcute, eGrave]}
        currentChar={eAcute}
        onSelectChar={onSelectChar}
        assignments={[]}
        modality="physical"
      />,
    );

    fireEvent.click(screen.getByTestId("char-scroll-chip-0065-0300"));
    expect(onSelectChar).toHaveBeenCalledWith(eGrave);
    expect(onSelectChar).not.toHaveBeenCalledWith(eAcute);
  });
});
