// TouchGallery: no raw Ctrl plane is offered (spec 114 FR-003). Sided Ctrl and
// Ctrl+Alt (AltGr) stay on offer.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and hooks:
// ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { irGroup, makeTestIR, vkeyRule } from "@keyboard-studio/contracts/fixtures";
import { selectMenuOptionValues } from "../../test/selectMenuTestUtils.ts";
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

const irWithRawAndSidedCtrl = makeTestIR([
  irGroup({
    nodeId: "g1",
    rules: [
      vkeyRule({ nodeId: "r1", vkey: "K_A", modifiers: ["SHIFT"], output: "A" }),
      vkeyRule({ nodeId: "r2", vkey: "K_B", modifiers: ["CTRL"], output: "b" }),
      vkeyRule({ nodeId: "r3", vkey: "K_C", modifiers: ["LCTRL"], output: "c" }),
      vkeyRule({ nodeId: "r4", vkey: "K_D", modifiers: ["RALT"], output: "d" }),
    ],
  }),
]);

describe("TouchGallery - no raw Ctrl plane", () => {
  it("does not offer raw CTRL in the touch layer builder, but keeps sided Ctrl, Shift and AltGr", async () => {
    seedStore({ withInventory: ["ä"], ir: irWithRawAndSidedCtrl });
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });
    const deny =
      screen.queryAllByRole("button").find((b) => b.textContent?.trim() === "Deny") ?? null;
    if (deny !== null) {
      await act(async () => {
        fireEvent.click(deny);
      });
    }
    await act(async () => {
      fireEvent.click(screen.getByText(/long.press on a key/i));
    });
    await act(async () => {
      fireEvent.click(
        screen.getByRole("button", { name: /add another touch layer for long-press/i }),
      );
    });
    const slot1 = screen.getByRole("button", { name: /^touch layer 1 for long-press$/i });
    const values = (await selectMenuOptionValues(slot1)).filter((v) => v !== "");
    expect(values).not.toContain("CTRL");
    expect(values).toEqual(expect.arrayContaining(["SHIFT", "LCTRL", "RALT"]));
  });
});
