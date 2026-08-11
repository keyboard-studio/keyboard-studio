// PhaseStepper tests (epic #533 design-system foundation).
//
// Prop-driven component — no store, no I18nProvider dependency beyond the
// shared `renderWithI18n` wrapper every Lingui-ified component test uses
// (see that module's header).
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PhaseStepper } from "./PhaseStepper.tsx";

describe("PhaseStepper", () => {
  // No global auto-cleanup is registered (see test-setup.ts) — every
  // Lingui-ified component test in this repo calls cleanup() itself
  // (LocaleSwitcher.test.tsx is the precedent this mirrors).
  afterEach(() => {
    cleanup();
  });

  it("renders all six phases in A-F order", () => {
    render(<PhaseStepper activeStepId="identity" />);
    const pills = ["a", "b", "c", "d", "e", "f"].map((letter) =>
      screen.getByTestId(`phase-pill-${letter}`),
    );
    const nav = screen.getByTestId("phase-stepper");
    const order = pills.map((pill) => Array.from(nav.querySelectorAll("li")).indexOf(pill));
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("marks aria-current='step' on exactly one pill", () => {
    render(<PhaseStepper activeStepId="carve" />);
    const current = screen.getAllByRole("listitem").filter(
      (li) => li.getAttribute("aria-current") === "step",
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(screen.getByTestId("phase-pill-d"));
  });

  it.each([
    ["identity", "a"],
    ["choose_base", "b"],
    ["track", "b"],
    ["project_name", "b"],
    ["characters", "c"],
    ["marks", "c"],
    ["convenience", "c"],
    ["carve", "d"],
    ["mechanisms", "e"],
    ["touch_seed_source", "e"],
    ["touch", "e"],
    ["help", "f"],
  ])("activates phase pill %s -> %s", (stepId, letter) => {
    render(<PhaseStepper activeStepId={stepId} />);
    const active = screen.getByTestId(`phase-pill-${letter}`);
    expect(active.getAttribute("aria-current")).toBe("step");
  });

  it("activates no pill for the unphased 'package' step", () => {
    render(<PhaseStepper activeStepId="package" />);
    const anyCurrent = screen
      .getAllByRole("listitem")
      .some((li) => li.getAttribute("aria-current") === "step");
    expect(anyCurrent).toBe(false);
  });

  it("activates no pill for a terminal state id", () => {
    render(<PhaseStepper activeStepId="done" />);
    const anyCurrent = screen
      .getAllByRole("listitem")
      .some((li) => li.getAttribute("aria-current") === "step");
    expect(anyCurrent).toBe(false);
  });

  it("activates no pill when activeStepId is null", () => {
    render(<PhaseStepper activeStepId={null} />);
    const anyCurrent = screen
      .getAllByRole("listitem")
      .some((li) => li.getAttribute("aria-current") === "step");
    expect(anyCurrent).toBe(false);
  });

  it("gives every pill non-colour state text (visually-hidden) distinct from its visible label", () => {
    render(<PhaseStepper activeStepId="carve" />);
    // "Discard" (phase D, active) should carry hidden "current step" text;
    // "Survey" (phase A, before it) should carry hidden "completed" text.
    const activePill = screen.getByTestId("phase-pill-d");
    const donePill = screen.getByTestId("phase-pill-a");
    expect(activePill.textContent).toContain("current step");
    expect(donePill.textContent).toContain("completed");
  });
});
