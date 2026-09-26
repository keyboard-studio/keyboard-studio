// Unit tests for TouchGallery — shell: the empty-inventory guard, the heading, and the first-entry intro splash.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { installTouchGalleryHooks, seedStore } from "../../test/touchGallery/harness.ts";

vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../lib/buildTouchLayoutJson.ts", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedBuildTouchLayoutJson(
    await importOriginal<typeof import("../../lib/buildTouchLayoutJson.ts")>(),
  ),
);
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/touchGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/touchGallery/mocks.tsx"));
vi.mock("../../components/OskModeToggle.tsx", () => import("../../test/touchGallery/mocks.tsx"));

installTouchGalleryHooks();

// ---------------------------------------------------------------------------
// Guard: empty inventory
// ---------------------------------------------------------------------------

describe("TouchGallery — empty inventory guard", () => {
  it("renders the no-inventory prompt when confirmedInventory is empty", async () => {
    seedStore();
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });
    // With empty inventory the component renders a guard message and no OSK.
    expect(screen.getByText(/No characters in inventory yet/i)).toBeTruthy();
    expect(screen.queryByTestId("osk-frame")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Heading — gallery-QoL rename
// ---------------------------------------------------------------------------

describe("TouchGallery — heading", () => {
  it("renders 'Touch Gallery' as the main heading with 'Touch' subheading", async () => {
    seedStore({ withInventory: ["ä"] });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });
    // The h1 contains both "Touch Gallery" and the "Touch" span as a child.
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toMatch(/Touch Gallery/i);
    expect(h1.textContent).toMatch(/Touch/i);
  });
});

// ---------------------------------------------------------------------------
// Intro splash — first-entry orientation
// ---------------------------------------------------------------------------

describe("TouchGallery — intro splash", () => {
  it("shows the intro on first entry and reveals the gallery after 'Get started'", async () => {
    seedStore({ withInventory: ["ä"], intro: true });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });

    // Intro is visible; the per-character gallery is not yet shown.
    expect(screen.queryByText(/Welcome to the Touch Gallery/i)).not.toBeNull();
    expect(screen.queryByText(/Touch mapping/i)).toBeNull();

    const startBtn = screen.getByRole("button", { name: /start the touch gallery/i });
    await act(async () => {
      fireEvent.click(startBtn);
    });

    // Gallery now visible; intro gone.
    expect(screen.queryByText(/Welcome to the Touch Gallery/i)).toBeNull();
    expect(screen.queryAllByText(/Touch mapping/i).length).toBeGreaterThan(0);
  });

  it("does NOT show the intro on a return visit (intro already marked seen)", async () => {
    // seedStore (without intro:true) marks the intro seen, simulating a prior visit.
    seedStore({ withInventory: ["ä"] });

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });

    expect(screen.queryByText(/Welcome to the Touch Gallery/i)).toBeNull();
    expect(screen.queryAllByText(/Touch mapping/i).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Nav publisher ownership (spec 081 T034) — TouchGallery must not publish its
// own step nav while it renders GalleryIntroSplash or GalleryEmptyState;
// those already publish theirs. Exactly one Back handle should reach the
// footer in either state.
// ---------------------------------------------------------------------------

describe("TouchGallery — nav publisher ownership", () => {
  it("splash state: exactly one Back, using the splash's own handle", async () => {
    seedStore({ withInventory: ["ä"], intro: true });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, {
        withStepNav: true,
      });
    });

    expect(screen.getByTestId("gallery-intro-back")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /back/i })).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("a second component tried to publish"),
    );
    errorSpy.mockRestore();
  });

  it("empty-inventory state: exactly one Back, using the empty state's own handle", async () => {
    seedStore();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, {
        withStepNav: true,
      });
    });

    expect(screen.getByTestId("gallery-empty-back")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /back/i })).toHaveLength(1);
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("a second component tried to publish"),
    );
    errorSpy.mockRestore();
  });
});
