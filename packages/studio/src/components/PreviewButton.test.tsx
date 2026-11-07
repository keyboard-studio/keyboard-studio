// PreviewButton — the narrow-viewport trigger for a PreviewSheet.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PreviewButton, PREVIEW_BUTTON_CLEARANCE } from "./PreviewButton.tsx";

afterEach(cleanup);

describe("PreviewButton", () => {
  it("uses ariaLabel as the accessible name while showing the short label", () => {
    render(
      <PreviewButton
        label="Preview"
        ariaLabel="Show keyboard preview"
        onClick={() => {}}
        testId="pb"
      />,
    );
    const button = screen.getByRole("button", { name: "Show keyboard preview" });
    expect(button.textContent).toBe("Preview");
    expect(button.getAttribute("aria-haspopup")).toBe("dialog");
    expect(button.getAttribute("data-testid")).toBe("pb");
  });

  it("calls onClick when pressed", () => {
    const onClick = vi.fn();
    render(<PreviewButton label="Preview" ariaLabel="Show preview" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "Show preview" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("float placement (default) renders the bare button, absolutely positioned", () => {
    const { container } = render(
      <PreviewButton label="Preview" ariaLabel="Show preview" onClick={() => {}} />,
    );
    const button = screen.getByRole("button", { name: "Show preview" });
    expect(button.style.position).toBe("absolute");
    expect(container.firstElementChild).toBe(button);
  });

  it("sticky placement wraps the button in a sticky, click-through div", () => {
    const { container } = render(
      <PreviewButton
        label="Preview"
        ariaLabel="Show preview"
        onClick={() => {}}
        placement="sticky"
      />,
    );
    const button = screen.getByRole("button", { name: "Show preview" });
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).not.toBe(button);
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.style.position).toBe("sticky");
    expect(wrapper.style.pointerEvents).toBe("none");
    expect(wrapper.contains(button)).toBe(true);
    // Only the button takes taps, and it sits in the flow of the wrapper.
    expect(button.style.position).toBe("static");
    expect(button.style.pointerEvents).toBe("auto");
  });

  it("float placement sits 12px above its containing block, with no footer-height term (#2570)", () => {
    // The footer is in normal flow BELOW the content area, so every
    // containing block already ends at the footer's top edge. The old
    // `calc(12px + var(--studio-footer-h))` double-counted the bar and
    // lifted the button 52px too high on a coarse pointer.
    render(<PreviewButton label="Preview" ariaLabel="Show preview" onClick={() => {}} />);
    const button = screen.getByRole("button", { name: "Show preview" });
    expect(button.style.bottom).toBe("12px");
  });

  it("sticky placement pins its wrapper 12px above the scroll container's bottom (#2570)", () => {
    render(
      <PreviewButton
        label="Preview"
        ariaLabel="Show preview"
        onClick={() => {}}
        placement="sticky"
      />,
    );
    const wrapper = screen
      .getByRole("button", { name: "Show preview" })
      .parentElement as HTMLElement;
    expect(wrapper.style.bottom).toBe("12px");
  });

  it("scroll clearance is 72px, with no footer-height term (#2570)", () => {
    expect(PREVIEW_BUTTON_CLEARANCE).toBe("72px");
  });

  it.each([["keyboard" as const], ["grid" as const]])(
    "renders a decorative svg for the %s icon",
    (icon) => {
      render(
        <PreviewButton label="X" ariaLabel="Open X" onClick={() => {}} icon={icon} />,
      );
      const svg = screen.getByRole("button", { name: "Open X" }).querySelector("svg");
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute("aria-hidden")).toBe("true");
    },
  );

  it("draws different glyphs for the grid and keyboard icons", () => {
    const { unmount } = render(
      <PreviewButton label="X" ariaLabel="Open X" onClick={() => {}} icon="keyboard" />,
    );
    const keyboardSvg = screen.getByRole("button").querySelector("svg")!.innerHTML;
    unmount();
    render(<PreviewButton label="X" ariaLabel="Open X" onClick={() => {}} icon="grid" />);
    const gridSvg = screen.getByRole("button").querySelector("svg")!.innerHTML;
    expect(gridSvg).not.toBe(keyboardSvg);
  });
});
