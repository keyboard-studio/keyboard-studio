// MechanismGallery: no new raw Ctrl content, AltGr in the keyboard's own Alt
// form (spec 114 FR-003, lead ruling 2). Copy and Open share this gallery.
//
// Shared module mocks and seeders: ../../test/mechanismGallery/.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS, type IRGroup } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { changeSelectMenu, selectMenuValue, selectMenuOptionValues } from "../../test/selectMenuTestUtils.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { seedInventory, groupWithModifiers } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

/** Seed a working copy whose `main` group carries one rule per modifier list. */
function seedCombos(combos: string[][]): void {
  const groups = combos.map((m, i) => groupWithModifiers(`K_${"WXYZ"[i] ?? "W"}`, m));
  const merged: IRGroup = { ...groups[0]!, rules: groups.flatMap((g) => g.rules) };
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([merged], []) });
}

async function openFirstLayer(): Promise<HTMLElement> {
  seedInventory(["ε"]);
  await act(async () => {
    render(<MechanismGallery selectedStartKeyboard={basicKbdus} />);
  });
  fireEvent.click(screen.getByText(/Assign to a key/i));
  fireEvent.click(screen.getByRole("button", { name: /Add another layer/i }));
  return screen.getByLabelText(/Layer 1 for layer-switch combo/i) as HTMLElement;
}

async function applyOnKeyE(): Promise<string | undefined> {
  await changeSelectMenu(screen.getByLabelText(/Physical key for Assign to a key/i), "K_E");
  fireEvent.click(screen.getByRole("button", { name: /Apply method for ε/i }));
  const a = useWorkingCopyStore
    .getState()
    .session.assignments.filter((x) => x.modality === "physical");
  return a[0]?.mechanisms[0]?.slotValues?.["altgrKeyList"] as string | undefined;
}

describe("MechanismGallery - no raw Ctrl, AltGr in the keyboard's own form", () => {
  it("offers no raw CTRL on a keyboard with no Ctrl or Alt rules, and defaults AltGr to RALT", async () => {
    seedCombos([["SHIFT"]]);
    const layer1 = await openFirstLayer();
    const values = (await selectMenuOptionValues(layer1)).filter((v) => v !== "");
    expect(values).not.toContain("CTRL");
    expect(selectMenuValue(layer1)).toBe("RALT");
    expect(await applyOnKeyE()).toBe("[RALT K_E]");
  });

  it("offers no raw CTRL even when the keyboard already has a raw Ctrl rule", async () => {
    seedCombos([["CTRL"]]);
    const layer1 = await openFirstLayer();
    const values = (await selectMenuOptionValues(layer1)).filter((v) => v !== "");
    expect(values).not.toContain("CTRL");
  });

  it("still offers LCTRL / RCTRL when the keyboard uses a sided Ctrl", async () => {
    seedCombos([["LCTRL"]]);
    const layer1 = await openFirstLayer();
    const values = (await selectMenuOptionValues(layer1)).filter((v) => v !== "");
    expect(values).toContain("LCTRL");
    expect(values).toContain("RCTRL");
    expect(values).not.toContain("CTRL");
  });

  it("writes AltGr as CTRL ALT when the keyboard already uses CTRL ALT", async () => {
    seedCombos([["CTRL", "ALT"]]);
    const layer1 = await openFirstLayer();
    expect(selectMenuValue(layer1)).toBe("CTRL");
    expect(selectMenuValue(screen.getByLabelText(/Layer 2 for layer-switch combo/i) as HTMLElement)).toBe("ALT");
    expect(await applyOnKeyE()).toBe("[CTRL ALT K_E]");
  });

  it("writes AltGr as generic ALT when the keyboard already uses ALT", async () => {
    seedCombos([["ALT"]]);
    const layer1 = await openFirstLayer();
    expect(selectMenuValue(layer1)).toBe("ALT");
    expect(await applyOnKeyE()).toBe("[ALT K_E]");
  });

  it("writes AltGr as RALT when the keyboard uses RALT / LALT", async () => {
    seedCombos([["LALT"]]);
    const layer1 = await openFirstLayer();
    expect(selectMenuValue(layer1)).toBe("RALT");
    expect(await applyOnKeyE()).toBe("[RALT K_E]");
  });
});
