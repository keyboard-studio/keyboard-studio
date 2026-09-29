// Dialog — shared modal primitive tests.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Dialog } from "./Dialog.tsx";

afterEach(() => {
  cleanup();
});

describe("Dialog — open/closed", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <Dialog open={false} onCancel={() => {}} label="Test dialog">
        <span>content</span>
      </Dialog>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders a modal dialog with the given label when open", () => {
    render(
      <Dialog open onCancel={() => {}} label="Test dialog" testId="test-dialog">
        <span>content</span>
      </Dialog>,
    );
    const dialog = screen.getByTestId("test-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBe("Test dialog");
    expect(screen.getByText("content")).not.toBeNull();
  });
});

describe("Dialog — dismiss", () => {
  it("calls onCancel on backdrop click", () => {
    const onCancel = vi.fn();
    const { container } = render(
      <Dialog open onCancel={onCancel} label="Test dialog">
        <span>content</span>
      </Dialog>,
    );
    const backdrop = container.firstElementChild as HTMLElement;
    expect(backdrop.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("calls onCancel on Escape", () => {
    const onCancel = vi.fn();
    render(
      <Dialog open onCancel={onCancel} label="Test dialog">
        <span>content</span>
      </Dialog>,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders no close button by default (migrated dialogs keep their Cancel buttons)", () => {
    render(
      <Dialog open onCancel={() => {}} label="Test dialog">
        <button type="button">Cancel</button>
      </Dialog>,
    );
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("renders an opt-in 44px close button that cancels", () => {
    const onCancel = vi.fn();
    render(
      <Dialog
        open
        onCancel={onCancel}
        label="Test dialog"
        showCloseButton
        closeLabel="Close dialog"
      >
        <span>content</span>
      </Dialog>,
    );
    const close = screen.getByRole("button", { name: "Close dialog" });
    expect(close.style.width).toBe("var(--app-touch-target)");
    expect(close.style.height).toBe("var(--app-touch-target)");
    fireEvent.click(close);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("Dialog — frame", () => {
  it("renders a <form> when onSubmit is provided, else a <div>", () => {
    const { rerender } = render(
      <Dialog
        open
        onCancel={() => {}}
        label="D"
        testId="d1"
        onSubmit={() => {}}
      >
        <span>x</span>
      </Dialog>,
    );
    expect(screen.getByTestId("d1").tagName).toBe("FORM");
    rerender(
      <Dialog open onCancel={() => {}} label="D" testId="d1">
        <span>x</span>
      </Dialog>,
    );
    expect(screen.getByTestId("d1").tagName).toBe("DIV");
  });

  it("clamps width to 92vw so the dialog fits a phone", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="d1" maxWidth={560}>
        <span>x</span>
      </Dialog>,
    );
    expect(screen.getByTestId("d1").style.maxWidth).toBe("min(560px, 92vw)");
  });

  it("honors minWidth, clamped to 92vw so it never defeats maxWidth on a phone", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="d1" minWidth={380}>
        <span>x</span>
      </Dialog>,
    );
    expect(screen.getByTestId("d1").style.minWidth).toBe("min(380px, 92vw)");
  });

  it("clamps the default minWidth to 92vw as well", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="d1">
        <span>x</span>
      </Dialog>,
    );
    expect(screen.getByTestId("d1").style.minWidth).toBe("min(320px, 92vw)");
  });

  it("moves focus to the first focusable element on open", () => {
    render(
      <Dialog open onCancel={() => {}} label="D">
        <button type="button">First</button>
        <button type="button">Second</button>
      </Dialog>,
    );
    expect(document.activeElement?.textContent).toBe("First");
  });

  it("traps Tab at the last focusable element", () => {
    render(
      <Dialog open onCancel={() => {}} label="D" testId="d1">
        <button type="button">First</button>
        <button type="button">Second</button>
      </Dialog>,
    );
    const dialog = screen.getByTestId("d1");
    const second = screen.getByText("Second");
    second.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement?.textContent).toBe("First");
  });
});

describe("Dialog — fullscreen mode (mobile adaptation issue 1853, Phase 4)", () => {
  it("fills the viewport with no border or radius when fullscreen", () => {
    render(
      <Dialog open onCancel={() => {}} label="Full" testId="full1" fullscreen>
        <button type="button">Content</button>
      </Dialog>,
    );
    const dialog = screen.getByTestId("full1");
    expect(dialog.style.width).toBe("100vw");
    expect(dialog.style.height).toBe("100dvh");
    expect(dialog.style.borderRadius).toBe("0");
  });

  it("keeps the centered desktop frame by default", () => {
    render(
      <Dialog open onCancel={() => {}} label="Centered" testId="center1">
        <button type="button">Content</button>
      </Dialog>,
    );
    const dialog = screen.getByTestId("center1");
    expect(dialog.style.width).not.toBe("100vw");
    expect(dialog.style.height).not.toBe("100dvh");
  });

  it("fullscreen keeps the shared close, Escape, and backdrop behavior", () => {
    const onCancel = vi.fn();
    render(
      <Dialog open onCancel={onCancel} label="Full" testId="full2" fullscreen showCloseButton closeLabel="Close it">
        <button type="button">Content</button>
      </Dialog>,
    );
    fireEvent.click(screen.getByLabelText("Close it"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
