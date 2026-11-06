// The Code tab must keep the step's footer Back/Continue: the gallery publishes
// them, so it stays mounted (hidden) while the Code tab is active.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { AddPhysicalAdapter } from "./addPhysicalAdapter.tsx";
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
vi.mock("../assignLoop/KmnCodePane.tsx", () => ({
  KmnCodePane: () => <div data-testid="kmn-code-pane" />,
}));

installMechanismGalleryHooks();

describe("AddPhysicalAdapter — Code tab navigation", () => {
  it("keeps Back available and calls onBack from the Code tab", async () => {
    seedInventory(["á"]);
    const onBack = vi.fn();
    await act(async () => {
      render(<AddPhysicalAdapter onComplete={vi.fn()} onBack={onBack} />, {
        withStepNav: true,
      });
    });
    fireEvent.click(screen.getByRole("tab", { name: "Code" }));
    await waitFor(() => screen.getByTestId("kmn-code-pane"));
    const footer = screen.getByTestId("step-nav");
    fireEvent.click(within(footer).getByRole("button", { name: /Back/ }));
    expect(onBack).toHaveBeenCalled();
  });
});
