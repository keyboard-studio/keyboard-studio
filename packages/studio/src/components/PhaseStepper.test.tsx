// PhaseStepper tests (epic #533 design-system foundation).
//
// Prop-driven component — no store, no I18nProvider dependency beyond the
// shared `renderWithI18n` wrapper every Lingui-ified component test uses
// (see that module's header).
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  screen,
  cleanup,
  fireEvent,
  within,
  act,
} from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { PhaseStepper } from "./PhaseStepper.tsx";
import { manifest } from "../steps/manifest.ts";

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
    const order = pills.map((pill) =>
      Array.from(nav.querySelectorAll("li")).indexOf(pill),
    );
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("marks aria-current='step' on exactly one pill", () => {
    render(<PhaseStepper activeStepId="carve" />);
    const current = screen
      .getAllByRole("listitem")
      .filter((li) => li.getAttribute("aria-current") === "step");
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

describe("PhaseStepper compact (narrow viewport)", () => {
  const NARROW_WIDTH = 390;
  const DESKTOP_WIDTH = 1024;

  function setViewportWidth(width: number): void {
    Object.defineProperty(window, "innerWidth", {
      value: width,
      configurable: true,
    });
  }

  // requestAnimationFrame is stubbed with a manual queue so the shared
  // Dialog's spring enter/exit flights advance deterministically — no real
  // timers, no jsdom rAF behavior to depend on (the convention from
  // ui/motion.test.ts).
  let rafQueue: FrameRequestCallback[] = [];

  function runFrames(count: number): void {
    for (let i = 0; i < count; i += 1) {
      const callback = rafQueue.shift();
      if (callback === undefined) {
        break;
      }
      callback(performance.now());
    }
  }

  beforeEach(() => {
    rafQueue = [];
    let nextRafId = 0;
    const rafIds = new Map<number, FrameRequestCallback>();
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
  });

  afterEach(() => {
    cleanup();
    setViewportWidth(DESKTOP_WIDTH);
    vi.unstubAllGlobals();
  });

  it("renders the compact summary instead of the pill row on narrow viewports", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PhaseStepper activeStepId="characters" />);
    expect(screen.queryByTestId("phase-stepper")).toBeNull();
    const trigger = screen.getByTestId("phase-stepper-compact");
    expect(trigger.textContent).toContain("Phase C");
    expect(trigger.textContent).toContain("Characters");
    // The total is derived from the manifest, not hardcoded: the survey
    // grows steps over time (spec 083 inserted "deadkeys" between carve and
    // mechanisms), and CI runs the merge commit with main.
    const stepNumber =
      manifest.findIndex((step) => step.id === "characters") + 1;
    expect(trigger.textContent).toContain(
      `step ${stepNumber} of ${manifest.length}`,
    );
  });

  it("keeps the desktop pill row at desktop widths", () => {
    setViewportWidth(DESKTOP_WIDTH);
    render(<PhaseStepper activeStepId="characters" />);
    expect(screen.queryByTestId("phase-stepper-compact")).toBeNull();
    expect(screen.getByTestId("phase-stepper")).not.toBeNull();
  });

  it("opens the full pill list in a dialog on tap, preserving aria-current", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PhaseStepper activeStepId="carve" />);
    const trigger = screen.getByRole("button", { name: /Phase D/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const dialog = screen.getByTestId("phase-stepper-dialog");
    const pills = ["a", "b", "c", "d", "e", "f"].map((letter) =>
      within(dialog).getByTestId(`phase-pill-${letter}`),
    );
    expect(pills).toHaveLength(6);
    const current = pills.filter(
      (pill) => pill.getAttribute("aria-current") === "step",
    );
    expect(current).toHaveLength(1);
    expect(current[0]).toBe(within(dialog).getByTestId("phase-pill-d"));
  });

  it("closes the dialog via its close button", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PhaseStepper activeStepId="carve" />);
    fireEvent.click(screen.getByRole("button", { name: /Phase D/ }));
    expect(screen.getByTestId("phase-stepper-dialog")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close phase list" }));
    // The exit mirrors the enter: the frame stays mounted while the spring
    // flies back to closed, then unmounts on settle.
    expect(screen.queryByTestId("phase-stepper-dialog")).not.toBeNull();
    act(() => {
      runFrames(300);
    });
    expect(screen.queryByTestId("phase-stepper-dialog")).toBeNull();
  });

  it("falls back to a generic label for unphased or unknown step ids", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PhaseStepper activeStepId="package" />);
    expect(screen.getByTestId("phase-stepper-compact").textContent).toContain(
      "Survey progress",
    );
  });

  it("falls back to a generic label when no step is resolved yet", () => {
    setViewportWidth(NARROW_WIDTH);
    render(<PhaseStepper activeStepId={null} />);
    expect(screen.getByTestId("phase-stepper-compact").textContent).toContain(
      "Survey progress",
    );
  });
});
