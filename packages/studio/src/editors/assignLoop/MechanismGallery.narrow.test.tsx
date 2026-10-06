// Narrow-viewport sequence builder tests (mobile adaptation, Phase 4).
//
// On narrow viewports the S-03 "Type a sequence" method does NOT swap the
// right pane (there is no side-by-side pane — the preview lives in the
// PreviewSheet): the SequenceBuilderPanel renders in a fullscreen Dialog
// modal instead. Desktop keeps the pane swap, unchanged.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx. Seeders and IR fixtures:
// ../../test/mechanismGallery/harness.ts.
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, act, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory } from "../../test/mechanismGallery/harness.ts";
import { setViewport } from "../../test/viewport.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

beforeEach(() => {
  setViewport(1280, 800);
});

afterEach(() => {
  cleanup();
  setViewport(1280, 800);
});

async function renderGallery(): Promise<void> {
  seedInventory(["á"]);
  await act(async () => {
    render(<MechanismGallery selectedBaseKeyboard={basicKbdus} />, { withStepNav: true });
  });
}

describe("MechanismGallery — narrow sequence modal", () => {
  it("opens the sequence builder as a fullscreen modal, not a pane swap", async () => {
    setViewport(390, 844);
    await renderGallery();

    fireEvent.click(screen.getByText(/Type a sequence/i));

    const modal = screen.getByTestId("sequence-builder-modal");
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(modal.getAttribute("aria-label")).toBe("Build a key sequence");
    // The builder itself is inside the modal.
    expect(screen.getByTestId("sequences-content")).not.toBeNull();
    // No desktop-style pane swap: on narrow the preview lives in the closed
    // PreviewSheet, so its wrapper is not in the DOM at all.
    expect(screen.queryByTestId("mechanism-preview-wrapper")).toBeNull();
  });

  it("closing the modal hands control back (method resets, modal unmounts)", async () => {
    setViewport(390, 844);
    await renderGallery();

    fireEvent.click(screen.getByText(/Type a sequence/i));
    expect(screen.getByTestId("sequence-builder-modal")).not.toBeNull();

    fireEvent.click(screen.getByTestId("sequence-builder-cancel"));
    expect(screen.queryByTestId("sequence-builder-modal")).toBeNull();
  });

  it("desktop keeps the pane swap and shows no modal", async () => {
    setViewport(1280, 800);
    await renderGallery();

    fireEvent.click(screen.getByText(/Type a sequence/i));

    expect(screen.queryByTestId("sequence-builder-modal")).toBeNull();
    expect(screen.getByTestId("mechanism-preview-wrapper").style.display).toBe("none");
    expect(screen.getByTestId("sequences-content")).not.toBeNull();
  });
});
