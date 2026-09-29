// PreviewSheet tests (mobile adaptation #1853, Phase 4).
//
// The sheet is the narrow-viewport home of the live OSK preview. Contract:
//   - renders nothing while closed — children unmount (principle 9: closing
//     the sheet unmounts the OSKFrame iframe, unloading KeymanWeb);
//   - × button, backdrop tap, and Escape all dismiss;
//   - portrait docks bottom, scarce-height landscape docks side
//     (shortHeightMax), tall landscape keeps the bottom sheet;
//   - drag past the threshold toward the dismiss edge dismisses, a short
//     drag snaps back (no dismiss);
//   - opening moves focus into the sheet (close button).
//
// Viewport geometry is stubbed via `window.innerWidth/innerHeight` (the
// geometry path needs no matchMedia stub — see useViewport.ts's fallback).
// jsdom has no `setPointerCapture`, so the drag tests stub it.
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
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

beforeEach(() => {
  setViewport(1280, 800);
  stubPointerCapture();
  stubPointerEvent();
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
  function dragHeader(
    testId: string,
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): void {
    const header = screen.getByTestId(`${testId}-header`);
    fireEvent.pointerDown(header, {
      pointerId: 1,
      isPrimary: true,
      clientX: from.x,
      clientY: from.y,
    });
    fireEvent.pointerMove(header, {
      pointerId: 1,
      isPrimary: true,
      clientX: to.x,
      clientY: to.y,
    });
    fireEvent.pointerUp(header, {
      pointerId: 1,
      isPrimary: true,
      clientX: to.x,
      clientY: to.y,
    });
  }

  it("dismisses on a downward drag past the threshold (bottom sheet)", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    dragHeader("preview-sheet", { x: 195, y: 700 }, { x: 195, y: 810 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("does not dismiss on a short drag (snaps back)", () => {
    setViewport(390, 844);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    dragHeader("preview-sheet", { x: 195, y: 700 }, { x: 195, y: 730 });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("dismisses on a rightward drag past the threshold (side dock)", () => {
    setViewport(479, 350);
    const onOpenChange = vi.fn();
    renderOpen(onOpenChange);
    dragHeader("preview-sheet", { x: 300, y: 175 }, { x: 410, y: 175 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
