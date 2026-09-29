// OskVisibilitySwitch tests (mobile adaptation #1853, Phase 2).
//
// A thin wrapper over the shared Phase-0 Switch primitive carrying the
// principle-9 label copy. The proof that hiding unmounts the OSK iframe
// lives in SurveyPreviewPane.test.tsx; this file covers the control itself.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { OskVisibilitySwitch } from "./OskVisibilitySwitch.tsx";

describe("OskVisibilitySwitch", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a labelled switch reflecting the checked state", () => {
    render(<OskVisibilitySwitch checked={true} onCheckedChange={() => {}} />);
    const toggle = screen.getByRole("switch", {
      name: "Show keyboard preview",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("reflects the unchecked state", () => {
    render(<OskVisibilitySwitch checked={false} onCheckedChange={() => {}} />);
    const toggle = screen.getByRole("switch", {
      name: "Show keyboard preview",
    });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("fires onCheckedChange with the toggled value", () => {
    const onCheckedChange = vi.fn();
    render(
      <OskVisibilitySwitch checked={true} onCheckedChange={onCheckedChange} />,
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Show keyboard preview" }),
    );
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });
});
