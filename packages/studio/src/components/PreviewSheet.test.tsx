// PreviewSheet tests (mobile adaptation, Phase 4).
//
// The sheet is the narrow-viewport home of the live OSK preview. Contract:
//   - renders nothing while closed; dismissing animates first, and children
//     unmount only on exit settle (principle 9: closing the sheet unmounts
//     the OSKFrame iframe, unloading KeymanWeb);
//   - × button, backdrop tap, and Escape all dismiss;
//   - portrait docks bottom, scarce-height landscape docks side
//     (shortHeightMax), tall landscape keeps the bottom sheet;
//   - drag toward the dismiss edge tracks 1:1; dragging past open
//     rubber-bands instead of stopping dead;
//   - release decides by velocity first (a flick toward the edge dismisses
//     even under 96px; a flick away snaps back), then by the 96px distance
//     rule for slow drags;
//   - the backdrop materializes with the sheet (fades and blurs in);
//   - reduced motion cross-fades instead of sliding;
//   - opening moves focus into the sheet (close button).
//
// Viewport geometry is stubbed via `window.innerWidth/innerHeight` (the
// geometry path needs no matchMedia stub — see useViewport.ts's fallback).
// jsdom has no `setPointerCapture`, so the drag tests stub it.
// requestAnimationFrame is stubbed with a manual queue (the motion.test.ts
// pattern) so the spring flights advance deterministically, and
// performance.now is scripted so release velocities are exact.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { useState } from "react";
import { screen, cleanup, fireEvent, act } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PreviewSheet } from "./PreviewSheet.tsx";

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: width,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: height,
    configurable: true,
  });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

function stubPointerCapture(): void {
  window.HTMLElement.prototype.setPointerCapture = vi.fn();
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
}

// jsdom has no PointerEvent, and testing-library's `fireEvent.pointerDown`
// falls back to a plain Event that drops pointerId/isPrimary/clientX —
// which the sheet's drag handlers read. A minimal constructor lets the
// real init dict through.
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
  (window as unknown as { PointerEvent: unknown }).PointerEvent =
    FakePointerEvent;
}

let rafQueue: FrameRequestCallback[] = [];
let nextRafId = 0;
const rafIds = new Map<number, FrameRequestCallback>();

function installRafStub(): void {
  rafQueue = [];
  nextRafId = 0;
  rafIds.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextRafId += 1;
    rafIds.set(nextRafId, callback);
    rafQueue.push(callback);
    return nextRafId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    const callback = rafIds.get(id);
    rafIds.delete(id);
    if (callback !== undefined) {
      const index = rafQueue.indexOf(callback);
      if (index >= 0) {
        rafQueue.splice(index, 1);
      }
    }
  });
}

function runFrames(count: number): void {
  for (let i = 0; i < count; i += 1) {
    const callback = rafQueue.shift();
    if (callback === undefined) {
      break;
    }
    callback(performance.now());
  }
}

// Scripted clock for release-velocity control.
let nowMs = 1000;
function setNow(ms: number): void {
  nowMs = ms;
}

beforeEach(() => {
  setViewport(1280, 800);
  stubPointerCapture();
  stubPointerEvent();
  installRafStub();
  nowMs = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => nowMs);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderOpen(
  onOpenChange: (open: boolean) => void = () => {},
) {
  return render(
    <PreviewSheet
      open={true}
      onOpenChange={onOpenChange}
      label="Keyboard preview"
      testId="preview-sheet"
    >
      <div data-testid="sheet-child">preview content</div>
    </PreviewSheet>,
  );
}

function pressHeader(x: number, y: number): void {
  fireEvent.pointerDown(screen.getByTestId("preview-sheet-header"), {
    pointerId: 1,
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

function moveHeader(x: number, y: number): void {
  fireEvent.pointerMove(screen.getByTestId("preview-sheet-header"), {
    pointerId: 1,
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

function releaseHeader(x: number, y: number): void {
  fireEvent.pointerUp(screen.getByTestId("preview-sheet-header"), {
    pointerId: 1,
    isPrimary: true,
    clientX: x,
    clientY: y,
  });
}

/** Let the spring enter flight settle, so drags start from the open position. */
function settleEnter(): void {
  act(() => {
    runFrames(200);
  });
}

/** A stateful wrapper so tests can drive open → closed → open. */
function ToggleWrapper({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        data-testid="toggle"
        onClick={() => {
          setOpen((v) => {
            onOpenChange?.(!v);
            return !v;
          });
        }}
      >
        toggle
      </button>
      <PreviewSheet
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          setOpen(next);
        }}
        label="Keyboard preview"
        testId="preview-sheet"
      >
        <div data-testid="sheet-child">preview content</div>
      </PreviewSheet>
    </>
  );
}

describe("PreviewSheet — closed", () => {
  it("renders nothing while closed (children unmount — principle 9)", () => {
    render(
      <PreviewSheet
        open={false}
        onOpenChange={() => {}}
        label="Keyboard preview"
        testId="preview-sheet"
      >
        <div data-testid="sheet-child">preview content</div>
      </PreviewSheet>,
    );
    expect(screen.queryByTestId("preview-sheet")).toBeNull();
    expect(screen.queryByTestId("sheet-child")).toBeNull();
  });
});

describe("PreviewSheet — open chrome", () => {
  it("renders the label, children, and a close control", () => {
    renderOpen();
    const sheet = screen.getByTestId("preview-sheet");
    expect(sheet.getAttribute("role")).toBe("dialog");
    expect(sheet.getAttribute("aria-modal")).toBe("true");
    expect(sheet.getAttribute("aria-label")).toBe("Keyboard preview");
    expect(screen.getByTestId("sheet-child")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Close preview" }),
    ).not.toBeNull();
  });

  it("moves focus into the sheet on open", () => {
    renderOpen();
    expect(
      document.activeElement?.getAttribute("aria-label"),
    ).toBe("Close preview");
  });

  it("springs in from off-screen on open (symmetric enter path)", () => {
    setViewport(390, 844);
    renderOpen();
    const sheet = screen.getByTestId("preview-sheet");
    // jsdom has no layout: travel falls back to 480px.
    expect(sheet.style.transform).toBe("translateY(480.0px)");
    act(() => {
      runFrames(200);
    });
    expect(sheet.style.transform).toBe("translateY(0.0px)");
  });

  it("× button dismisses", () => {
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("backdrop tap dismisses", () => {
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    fireEvent.click(screen.getByTestId("preview-sheet-backdrop"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("Escape dismisses", () => {
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("the header is translucent (backdrop-filter chrome)", () => {
    renderOpen();
    const header = screen.getByTestId("preview-sheet-header");
    // jsdom's CSSOM drops unknown properties from getPropertyValue, but
    // retains the direct camelCase assignment.
    expect(header.style.backdropFilter).toContain("blur(");
  });
});

describe("PreviewSheet — exit animation", () => {
  it("× animates the exit before unmounting children", () => {
    render(<ToggleWrapper />);
    act(() => {
      runFrames(200);
    });
    expect(
      screen.getByTestId("preview-sheet").style.transform,
    ).toBe("translateY(0.0px)");

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    // Mid-exit: the sheet and its children are still mounted.
    act(() => {
      runFrames(10);
    });
    const midFlight = parseFloat(
      screen
        .getByTestId("preview-sheet")
        .style.transform.replace("translateY(", ""),
    );
    expect(midFlight).toBeGreaterThan(0);
    expect(screen.queryByTestId("sheet-child")).not.toBeNull();

    // Settled: children unmount (KeymanWeb unloads).
    act(() => {
      runFrames(300);
    });
    expect(screen.queryByTestId("preview-sheet")).toBeNull();
    expect(screen.queryByTestId("sheet-child")).toBeNull();
  });

  it("re-opening mid-exit springs back without unmounting", () => {
    render(<ToggleWrapper />);
    act(() => {
      runFrames(200);
    });
    fireEvent.click(screen.getByTestId("toggle"));
    act(() => {
      runFrames(10);
    });
    expect(screen.queryByTestId("preview-sheet")).not.toBeNull();

    fireEvent.click(screen.getByTestId("toggle"));
    act(() => {
      runFrames(300);
    });
    expect(
      screen.getByTestId("preview-sheet").style.transform,
    ).toBe("translateY(0.0px)");
    expect(screen.queryByTestId("sheet-child")).not.toBeNull();
  });
});

describe("PreviewSheet — docking", () => {
  it("docks bottom in narrow portrait (390×844)", () => {
    setViewport(390, 844);
    renderOpen();
    expect(
      screen.getByTestId("preview-sheet").getAttribute("data-sheet-dock"),
    ).toBe("bottom");
  });

  it("docks side in scarce-height landscape (479×350)", () => {
    setViewport(479, 350);
    renderOpen();
    expect(
      screen.getByTestId("preview-sheet").getAttribute("data-sheet-dock"),
    ).toBe("side");
  });

  it("keeps the bottom sheet in tall landscape (1280×720)", () => {
    setViewport(1280, 720);
    renderOpen();
    expect(
      screen.getByTestId("preview-sheet").getAttribute("data-sheet-dock"),
    ).toBe("bottom");
  });
});

describe("PreviewSheet — drag to dismiss", () => {
  it("dismisses on a downward drag past the threshold (bottom sheet)", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    settleEnter();
    pressHeader(195, 700);
    moveHeader(195, 810);
    releaseHeader(195, 810);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not dismiss on a slow short drag (snaps back)", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    settleEnter();
    setNow(1000);
    pressHeader(195, 700);
    // 30px in 300ms = 100px/s: slow, under the flick threshold, and under
    // the 96px distance rule — the sheet must snap back.
    setNow(1300);
    moveHeader(195, 730);
    releaseHeader(195, 730);
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      runFrames(200);
    });
    expect(
      screen.getByTestId("preview-sheet").style.transform,
    ).toBe("translateY(0.0px)");
  });

  it("dismisses on a fast flick under the distance threshold", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    settleEnter();
    setNow(1000);
    pressHeader(195, 700);
    // 60px in 20ms = 3000px/s: a flick — velocity decides, not distance.
    setNow(1020);
    moveHeader(195, 760);
    releaseHeader(195, 760);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("dismisses on a slow drag past the distance threshold", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    settleEnter();
    setNow(1000);
    pressHeader(195, 700);
    // 120px in 500ms = 240px/s: slow, so the 96px distance rule decides.
    setNow(1500);
    moveHeader(195, 820);
    releaseHeader(195, 820);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("a flick away from the dismiss edge snaps back", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    settleEnter();
    setNow(1000);
    pressHeader(195, 700);
    moveHeader(195, 740);
    // The last 120ms of travel heads back up: release velocity is negative.
    setNow(1200);
    moveHeader(195, 700);
    setNow(1210);
    moveHeader(195, 680);
    releaseHeader(195, 680);
    expect(onOpenChange).not.toHaveBeenCalled();
    act(() => {
      runFrames(300);
    });
    expect(
      screen.getByTestId("preview-sheet").style.transform,
    ).toBe("translateY(0.0px)");
  });

  it("rubber-bands when dragged past open (no dead zone)", () => {
    setViewport(390, 844);
    renderOpen();
    settleEnter();
    setNow(1000);
    pressHeader(195, 700);
    moveHeader(195, 600);
    // 100px past open resists down to ~45px of travel.
    expect(screen.getByTestId("preview-sheet").style.transform).toBe(
      "translateY(-45.4px)",
    );
    releaseHeader(195, 600);
    expect(
      screen.getByTestId("preview-sheet").style.transform,
    ).not.toBe("translateY(-100.0px)");
  });

  it("dismisses on a rightward drag past the threshold (side dock)", () => {
    setViewport(479, 350);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    settleEnter();
    pressHeader(300, 175);
    moveHeader(410, 175);
    releaseHeader(410, 175);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("grabbing mid-flight restarts from the live on-screen value", () => {
    setViewport(390, 844);
    renderOpen();
    // Let the enter flight run partway: the sheet is between off-screen
    // and open.
    act(() => {
      runFrames(6);
    });
    const midEnter = parseFloat(
      screen
        .getByTestId("preview-sheet")
        .style.transform.replace("translateY(", ""),
    );
    expect(midEnter).toBeGreaterThan(0);

    // Grab: the drag restarts from the live value, not from 0 or 480.
    setNow(1000);
    pressHeader(195, 700);
    moveHeader(195, 720);
    const grabbed = parseFloat(
      screen
        .getByTestId("preview-sheet")
        .style.transform.replace("translateY(", ""),
    );
    expect(grabbed).toBeCloseTo(midEnter + 20, 0);
    releaseHeader(195, 720);
  });
});

describe("PreviewSheet — backdrop materializes", () => {
  it("fades and blurs in with the sheet", () => {
    setViewport(390, 844);
    renderOpen();
    settleEnter();
    const backdrop = screen.getByTestId("preview-sheet-backdrop");
    setNow(1000);
    pressHeader(195, 700);
    // Halfway down (240 of 480px travel): half materialized. (jsdom
    // normalizes opacity decimals on readback, so compare numerically.)
    moveHeader(195, 940);
    expect(parseFloat(backdrop.style.opacity)).toBeCloseTo(0.25, 3);
    expect(backdrop.style.backdropFilter).toBe("blur(7px)");
    releaseHeader(195, 940);
  });

  it("is fully materialized when the sheet is open", () => {
    setViewport(390, 844);
    renderOpen();
    act(() => {
      runFrames(200);
    });
    const backdrop = screen.getByTestId("preview-sheet-backdrop");
    expect(parseFloat(backdrop.style.opacity)).toBeCloseTo(0.5, 3);
    expect(backdrop.style.backdropFilter).toBe("blur(14px)");
  });
});

describe("PreviewSheet — reduced motion", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it("cross-fades in instead of sliding", () => {
    setViewport(390, 844);
    renderOpen();
    const sheet = screen.getByTestId("preview-sheet");
    // No slide, no spring: the sheet fades in via an opacity transition.
    expect(sheet.style.transform).toBe("");
    expect(sheet.style.opacity).toBe("0");
    act(() => {
      runFrames(1);
    });
    expect(sheet.style.opacity).toBe("1");
  });

  it("fades out before unmounting children", () => {
    vi.useFakeTimers();
    try {
      // Fake timers replace rAF too — reinstall the manual queue after.
      installRafStub();
      setViewport(390, 844);
      render(<ToggleWrapper />);
      act(() => {
        runFrames(1);
      });
      const sheet = screen.getByTestId("preview-sheet");
      expect(sheet.style.opacity).toBe("1");

      fireEvent.click(screen.getByTestId("toggle"));
      // Fading out, still mounted.
      expect(sheet.style.opacity).toBe("0");
      expect(screen.queryByTestId("sheet-child")).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByTestId("preview-sheet")).toBeNull();
      expect(screen.queryByTestId("sheet-child")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
