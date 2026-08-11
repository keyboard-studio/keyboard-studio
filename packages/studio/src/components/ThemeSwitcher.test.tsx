// ThemeSwitcher tests (epic #533 design-system foundation).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { ThemeSwitcher } from "./ThemeSwitcher.tsx";
import { loadSavedTheme } from "../lib/theme.ts";

describe("ThemeSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.dataset.theme = "navy";
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.dataset.theme = "navy";
  });

  it("starts reflecting the default (navy) theme as not pressed", () => {
    render(<ThemeSwitcher />);
    const toggle = screen.getByTestId("theme-switcher");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("toggles the data-theme attribute and persists the choice on click", () => {
    render(<ThemeSwitcher />);
    const toggle = screen.getByTestId("theme-switcher");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(loadSavedTheme()).toBe("light");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(toggle);
    expect(document.documentElement.dataset.theme).toBe("navy");
    expect(loadSavedTheme()).toBe("navy");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("is keyboard-operable as a real button (no mouse-only path)", () => {
    render(<ThemeSwitcher />);
    const toggle = screen.getByTestId("theme-switcher");
    expect(toggle.tagName).toBe("BUTTON");
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
  });

  it("has an accessible name via its label", () => {
    render(<ThemeSwitcher />);
    const toggle = screen.getByTestId("theme-switcher");
    expect(toggle.getAttribute("aria-labelledby")).toBe("nav-theme-label");
    expect(screen.getByText("Theme")).toBeTruthy();
  });
});
