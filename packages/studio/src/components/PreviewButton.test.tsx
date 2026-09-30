// PreviewButton — the narrow-viewport trigger for a PreviewSheet.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PreviewButton } from "./PreviewButton.tsx";

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
