import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Switch } from "./Switch.tsx";

afterEach(() => {
  cleanup();
});

function renderSwitch(
  overrides: Partial<React.ComponentProps<typeof Switch>> = {},
) {
  const onCheckedChange = vi.fn();
  render(
    <Switch
      checked={false}
      onCheckedChange={onCheckedChange}
      label="Show keyboard"
      {...overrides}
    />,
  );
  return onCheckedChange;
}

describe("Switch", () => {
  it("renders a button with role=switch", () => {
    renderSwitch();
    const sw = screen.getByRole("switch");
    expect(sw.tagName).toBe("BUTTON");
  });

  it("exposes the label as its accessible name", () => {
    renderSwitch();
    expect(screen.getByRole("switch", { name: "Show keyboard" })).toBeDefined();
  });

  it("reflects checked=true via aria-checked", () => {
    renderSwitch({ checked: true });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("reflects checked=false via aria-checked", () => {
    renderSwitch({ checked: false });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe(
      "false",
    );
  });

  it("calls onCheckedChange(true) when toggled on", () => {
    const onCheckedChange = renderSwitch({ checked: false });
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("calls onCheckedChange(false) when toggled off", () => {
    const onCheckedChange = renderSwitch({ checked: true });
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("does not fire when disabled", () => {
    const onCheckedChange = renderSwitch({ disabled: true });
    fireEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });

  it("renders the label text visibly next to the track", () => {
    renderSwitch();
    const sw = screen.getByRole("switch");
    expect(sw.textContent).toContain("Show keyboard");
  });

  it("sizes the control itself to the shared touch target token", () => {
    renderSwitch();
    const sw = screen.getByRole("switch") as HTMLElement;
    expect(sw.style.minHeight).toBe("var(--app-touch-target)");
  });

  it("carries the shared ks-focus-ring class", () => {
    renderSwitch();
    const sw = screen.getByRole("switch");
    expect(sw.className.split(" ")).toContain("ks-focus-ring");
  });

  it("merges a caller className with ks-focus-ring", () => {
    renderSwitch({ className: "my-switch" });
    const classes = screen.getByRole("switch").className.split(" ");
    expect(classes).toContain("ks-focus-ring");
    expect(classes).toContain("my-switch");
  });
});
