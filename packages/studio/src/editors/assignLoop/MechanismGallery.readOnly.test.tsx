// MechanismGallery — read-only mode (a basic keyboard opened for update): the
// gallery is shown, its editing controls are disabled, and Continue moves on
// without the unplaced-letters gate.
//
// Shared module mocks, spies, and the lifecycle hooks every suite installs:
// ../../test/mechanismGallery/mocks.tsx.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { basicKbdus } from "@keyboard-studio/contracts/fixtures";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

async function renderGallery(readOnly: boolean, onComplete = vi.fn()) {
  await act(async () => {
    render(
      <MechanismGallery selectedStartKeyboard={basicKbdus} onComplete={onComplete} readOnly={readOnly} />,
      { withStepNav: true },
    );
  });
  return onComplete;
}

describe("MechanismGallery — read-only", () => {
  it("shows the gallery with its editing controls disabled and says why", async () => {
    seedInventory(["á", "é"]);
    await renderGallery(true);

    expect(screen.getByTestId("mechanisms-read-only")).toBeTruthy();
    const region = screen.getByTestId("mechanisms-edit-region") as HTMLFieldSetElement;
    expect(region.disabled).toBe(true);
    // The controls are still there to look at.
    expect(within(region).getAllByRole("button").length).toBeGreaterThan(0);
    // Browsing the characters still works.
    expect(screen.getByTestId("char-scroll-strip")).toBeTruthy();
    expect(screen.queryByText(/before you can finish/i)).toBeNull();
  });

  it("offers Continue with letters still unplaced, and it calls onComplete", async () => {
    seedInventory(["á", "é"]);
    const onComplete = await renderGallery(true);

    const forward = screen.getByTestId("mechanisms-continue") as HTMLButtonElement;
    expect(forward.disabled).toBe(false);
    fireEvent.click(forward);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it("skips the intro splash, which introduces building", async () => {
    seedInventory(["á"], { intro: true });
    await renderGallery(true);
    expect(screen.queryByRole("button", { name: "Start the mechanism gallery" })).toBeNull();
    expect(screen.getByTestId("mechanisms-edit-region")).toBeTruthy();
  });

  it("does not unlock a completed layout", async () => {
    seedInventory(["á"]);
    useWorkingCopyStore.getState().lockDesktop();
    await renderGallery(true);
    expect(useWorkingCopyStore.getState().desktopLocked).toBe(true);
  });

  it("leaves the editing region enabled when not read-only", async () => {
    seedInventory(["á", "é"]);
    await renderGallery(false);
    expect((screen.getByTestId("mechanisms-edit-region") as HTMLFieldSetElement).disabled).toBe(false);
    expect(screen.queryByTestId("mechanisms-read-only")).toBeNull();
  });
});
