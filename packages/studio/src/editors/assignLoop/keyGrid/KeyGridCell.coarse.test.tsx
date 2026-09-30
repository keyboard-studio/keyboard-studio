// KeyGridCell coarse-pointer tests (mobile adaptation, Phase 4).
//
// On touch there is no hover, so the hover-revealed (+) / ⋯ wedges need tap
// equivalents — driven by the POINTER (`useIsCoarsePointer`), never by the
// viewport width (a landscape phone is wide and coarse simultaneously):
//   - tap a selected cell: toggles the wedge reveal (the tap equivalent of hover);
//   - long-press a cell: opens the command menu at the press point;
//   - coarse wedges render at 32px touch size.
//
// Fixture builders (makeCell/makeRow/makeViewModel) mirror KeyGrid.test.tsx's.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { ComponentProps } from "react";
import { render } from "../../../test/renderWithI18n.tsx";
import { computeRowMetrics } from "@keyboard-studio/engine";
import { KeyGrid } from "./KeyGrid.tsx";
import type {
  KeyGridAnnotationCounts,
  KeyGridCellViewModel,
  KeyGridRowViewModel,
  KeyGridViewModel,
} from "./keyGridViewModel.ts";

const EMPTY_ANNOTATIONS: KeyGridAnnotationCounts = {
  longpress: 0,
  multitap: 0,
  flick: 0,
};

function makeCell(
  overrides: Partial<KeyGridCellViewModel> & { id: string },
): KeyGridCellViewModel {
  const address = overrides.address ?? `phone:default:${overrides.id}`;
  return {
    address,
    id: overrides.id,
    keycap: overrides.keycap ?? overrides.id,
    sp: overrides.sp,
    padPct: overrides.padPct ?? 15,
    widthPct: overrides.widthPct ?? 100,
    producedChars: overrides.producedChars ?? [],
    annotations: overrides.annotations ?? EMPTY_ANNOTATIONS,
    findings: overrides.findings ?? [],
    isLastInRow: overrides.isLastInRow ?? false,
    ...(overrides.nextlayer !== undefined ? { nextlayer: overrides.nextlayer } : {}),
    ...(overrides.provenance !== undefined ? { provenance: overrides.provenance } : {}),
  };
}

function makeRow(
  keys: readonly KeyGridCellViewModel[],
  slackPct = 0,
  platform = "phone",
): KeyGridRowViewModel {
  keys.forEach((key, i) => {
    (key as { isLastInRow: boolean }).isLastInRow = i === keys.length - 1;
  });
  return {
    slackPct,
    metrics: computeRowMetrics(
      keys.map((k) => ({ sp: k.sp, width: k.widthPct, pad: k.padPct })),
      platform,
    ),
    keys,
  };
}

function makeViewModel(rows: readonly KeyGridRowViewModel[]): KeyGridViewModel {
  return {
    platform: "phone",
    layerId: "default",
    direction: "ltr",
    rows,
  };
}

function requiredKeyGridHandlers() {
  return {
    onKeyDown: vi.fn(),
    onPlatformChange: vi.fn(),
    onAddKeyAfter: vi.fn(),
    onOpenCommandMenu: vi.fn(),
    onFollowNextLayer: vi.fn(),
  };
}

/** `(pointer: coarse)` matches; everything else falls back to no-match. */
function stubCoarsePointer(): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(pointer: coarse)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

// jsdom has no PointerEvent — same minimal stub as PreviewSheet.test.tsx so
// the long-press pointer handlers receive real init values.
function stubPointerEvent(): void {
  class FakePointerEvent extends Event {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    readonly clientX: number;
    readonly clientY: number;
    constructor(
      type: string,
      init: {
        pointerId?: number;
        isPrimary?: boolean;
        clientX?: number;
        clientY?: number;
        bubbles?: boolean;
        cancelable?: boolean;
        composed?: boolean;
      } = {},
    ) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.isPrimary = init.isPrimary ?? false;
      this.clientX = init.clientX ?? 0;
      this.clientY = init.clientY ?? 0;
    }
  }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = FakePointerEvent;
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
}

const CELL_TESTID = "key-grid-cell-phone:default:K1";
const ADD_WEDGE = `${CELL_TESTID}-add-wedge`;
const MENU_WEDGE = `${CELL_TESTID}-menu-wedge`;

function renderSelectedCell(
  props: Partial<ComponentProps<typeof KeyGrid>> = {},
) {
  const cell = makeCell({ id: "K1" });
  const vm = makeViewModel([makeRow([cell])]);
  const handlers = requiredKeyGridHandlers();
  render(
    <KeyGrid
      {...handlers}
      viewModel={vm}
      selectedAddress={cell.address}
      onSelectCell={vi.fn()}
      {...props}
    />,
  );
  return { cell, handlers, el: screen.getByTestId(CELL_TESTID) };
}

beforeEach(() => {
  stubCoarsePointer();
  stubPointerEvent();
  setViewport(390, 844);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setViewport(1280, 800);
});

describe("KeyGridCell — coarse-pointer wedge reveal", () => {
  it("tap on the selected cell reveals the wedges; a second tap hides them", () => {
    const { el } = renderSelectedCell();

    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();

    fireEvent.click(el);
    expect(screen.getByTestId(ADD_WEDGE)).not.toBeNull();
    expect(screen.getByTestId(MENU_WEDGE)).not.toBeNull();

    fireEvent.click(el);
    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();
    expect(screen.queryByTestId(MENU_WEDGE)).toBeNull();
  });

  it("tap on an unselected cell selects instead of revealing", () => {
    const onSelectCell = vi.fn();
    const cell = makeCell({ id: "K1" });
    const vm = makeViewModel([makeRow([cell])]);
    render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={onSelectCell}
      />,
    );
    const el = screen.getByTestId(CELL_TESTID);

    fireEvent.click(el);
    expect(onSelectCell).toHaveBeenCalledWith(cell);
    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();
  });

  it("coarse wedges render at 32px touch size — secondary targets, cell is the 48px primary", () => {
    // Deliberate: 32px clears WCAG 2.5.8 AA (24px); 44px wedges would overlap
    // on narrow phone-grid cells. See the touch-size note in KeyGridCell.tsx.
    const { el } = renderSelectedCell();
    fireEvent.click(el);
    const wedge = screen.getByTestId(ADD_WEDGE);
    expect(wedge.style.minWidth).toBe("32px");
    expect(wedge.style.minHeight).toBe("32px");
  });

  it("tap-reveal works on a WIDE coarse viewport too — pointer, not width, drives it", () => {
    // 844×390 landscape phone: not narrow, but coarse.
    setViewport(844, 390);
    const { el } = renderSelectedCell();
    fireEvent.click(el);
    expect(screen.getByTestId(ADD_WEDGE)).not.toBeNull();
  });

  it("fine pointers keep hover-only wedges — tap does not reveal", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    setViewport(390, 844);
    const { el } = renderSelectedCell();
    fireEvent.click(el);
    expect(screen.queryByTestId(ADD_WEDGE)).toBeNull();
  });
});

describe("KeyGridCell — coarse-pointer long-press", () => {
  it("long-press opens the command menu at the press point", () => {
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(handlers.onOpenCommandMenu).toHaveBeenCalledTimes(1);
    const [cell, at] = handlers.onOpenCommandMenu.mock.calls[0] as [
      KeyGridCellViewModel,
      { x: number; y: number },
    ];
    expect(cell.id).toBe("K1");
    expect(at).toEqual({ x: 100, y: 200 });
  });

  it("a press that drifts is a scroll — the menu does not open", () => {
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerMove(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 230,
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(handlers.onOpenCommandMenu).not.toHaveBeenCalled();
  });

  it("release before the threshold is an ordinary tap — no menu", () => {
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(handlers.onOpenCommandMenu).not.toHaveBeenCalled();
  });

  it("the click trailing a long-press does not move selection", () => {
    const onSelectCell = vi.fn();
    const { el } = renderSelectedCell({ onSelectCell });

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // The browser fires click on release after a long-press.
    fireEvent.click(el);

    expect(onSelectCell).not.toHaveBeenCalled();
  });

  it("unmounting mid-hold clears the timer — no menu opens for a stale cell", () => {
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    // The cell unmounts before the 500ms threshold (e.g. the grid
    // re-rendered under the finger). The pending callback must not fire
    // for the unmounted cell.
    cleanup();
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(handlers.onOpenCommandMenu).not.toHaveBeenCalled();
  });

  it("a long-press whose release never clicks does not swallow the next tap", () => {
    const { handlers, el } = renderSelectedCell();

    // First gesture: long-press fires the menu, but the release produces
    // no click (gesture interrupted) — suppressClick stays set.
    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(handlers.onOpenCommandMenu).toHaveBeenCalledTimes(1);

    // Second gesture: a fresh pointerdown clears the stale flag, so the
    // tap reaches the cell and toggles the wedge reveal.
    fireEvent.pointerDown(el, {
      pointerId: 2,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    fireEvent.click(el);

    expect(screen.getByTestId(ADD_WEDGE)).not.toBeNull();
  });
});

const LONGPRESS_HINT = `${CELL_TESTID}-longpress-hint`;

describe("KeyGridCell — long-press discipline (M3)", () => {
  it("the hold shows a progress hint that fills, then hides on commit", () => {
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });

    // The hint is visible while the hold registers, driven by the CSS fill
    // whose duration is pinned to the long-press threshold — the visual and
    // the timer cannot drift apart.
    const hint = screen.getByTestId(LONGPRESS_HINT);
    expect(hint.className).toContain("ks-longpress-hint");
    expect(hint.style.animationDuration).toBe("500ms");

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(handlers.onOpenCommandMenu).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId(LONGPRESS_HINT)).toBeNull();
  });

  it("release before the threshold hides the progress hint", () => {
    const { el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    expect(screen.getByTestId(LONGPRESS_HINT)).not.toBeNull();

    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true });
    expect(screen.queryByTestId(LONGPRESS_HINT)).toBeNull();
  });

  it("a press that drifts hides the progress hint too", () => {
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    expect(screen.getByTestId(LONGPRESS_HINT)).not.toBeNull();

    fireEvent.pointerMove(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 230,
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByTestId(LONGPRESS_HINT)).toBeNull();
    expect(handlers.onOpenCommandMenu).not.toHaveBeenCalled();
  });

  it("tap commits immediately — the selection does not wait for the hold timer", () => {
    const onSelectCell = vi.fn();
    const handlers = requiredKeyGridHandlers();
    const cell = makeCell({ id: "K1" });
    const vm = makeViewModel([makeRow([cell])]);
    render(
      <KeyGrid
        {...handlers}
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={onSelectCell}
      />,
    );
    const el = screen.getByTestId(CELL_TESTID);

    // A quick tap: pointer down, a fraction of the 500ms passes, release,
    // click — the tap path must commit without the timer ever reaching the
    // threshold, let alone being awaited.
    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true });
    fireEvent.click(el);

    expect(onSelectCell).toHaveBeenCalledTimes(1);
    expect(onSelectCell).toHaveBeenCalledWith(cell);

    // The cancelled timer must never open the menu afterwards.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(handlers.onOpenCommandMenu).not.toHaveBeenCalled();
  });

  it("an interrupted hold cancels and does not swallow the next tap", () => {
    const onSelectCell = vi.fn();
    const cell = makeCell({ id: "K1" });
    const vm = makeViewModel([makeRow([cell])]);
    render(
      <KeyGrid
        {...requiredKeyGridHandlers()}
        viewModel={vm}
        selectedAddress={null}
        onSelectCell={onSelectCell}
      />,
    );
    const el = screen.getByTestId(CELL_TESTID);

    // First gesture: the hold starts, then the pointer lifts early.
    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    fireEvent.pointerUp(el, { pointerId: 1, isPrimary: true });
    fireEvent.click(el);
    expect(onSelectCell).toHaveBeenCalledTimes(1);

    // Second gesture: a plain tap still reaches the cell — nothing about
    // the cancelled hold suppresses it.
    fireEvent.pointerDown(el, {
      pointerId: 2,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    fireEvent.pointerUp(el, { pointerId: 2, isPrimary: true });
    fireEvent.click(el);
    expect(onSelectCell).toHaveBeenCalledTimes(2);
  });

  it("commit fires a guarded haptic on the same frame as the menu", () => {
    const vibrate = vi.fn();
    Object.defineProperty(window.navigator, "vibrate", {
      value: vibrate,
      configurable: true,
    });
    try {
      const { handlers, el } = renderSelectedCell();

      fireEvent.pointerDown(el, {
        pointerId: 1,
        isPrimary: true,
        clientX: 100,
        clientY: 200,
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(vibrate).toHaveBeenCalledWith(15);
      expect(handlers.onOpenCommandMenu).toHaveBeenCalledTimes(1);
    } finally {
      delete (window.navigator as { vibrate?: unknown }).vibrate;
    }
  });

  it("a throwing vibrate does not break the commit", () => {
    Object.defineProperty(window.navigator, "vibrate", {
      value: vi.fn(() => {
        throw new Error("vibrate unavailable");
      }),
      configurable: true,
    });
    try {
      const { handlers, el } = renderSelectedCell();

      fireEvent.pointerDown(el, {
        pointerId: 1,
        isPrimary: true,
        clientX: 100,
        clientY: 200,
      });
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(handlers.onOpenCommandMenu).toHaveBeenCalledTimes(1);
    } finally {
      delete (window.navigator as { vibrate?: unknown }).vibrate;
    }
  });

  it("fine pointers never start the hold — no hint, no menu", () => {
    vi.unstubAllGlobals();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        media: "",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    setViewport(390, 844);
    const { handlers, el } = renderSelectedCell();

    fireEvent.pointerDown(el, {
      pointerId: 1,
      isPrimary: true,
      clientX: 100,
      clientY: 200,
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.queryByTestId(LONGPRESS_HINT)).toBeNull();
    expect(handlers.onOpenCommandMenu).not.toHaveBeenCalled();
  });
});
