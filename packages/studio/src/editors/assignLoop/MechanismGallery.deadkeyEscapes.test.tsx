// Gallery-level tests for the deadkey trigger escapes banner: a deadkey's
// first placement on a trigger key asks how the trigger's own character
// stays typeable (twice / then space / AltGr — sil_cameroon_qwerty's ;
// deadkey keeps all three), applies the remembered choice straight away,
// and the next new deadkey starts from whatever was left checked.
//
// Shared module mocks / harness: ../../test/mechanismGallery/.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act, waitFor, within } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { MechanismGallery } from "./MechanismGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { createVirtualFS, type IRGroup } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { expectCurrentChar } from "../../test/currentCharChip.ts";
import { installMechanismGalleryHooks } from "../../test/mechanismGallery/mocks.tsx";
import { getPhaseCPhysicalAssignments, seedInventory } from "../../test/mechanismGallery/harness.ts";

vi.mock("../../lib/services.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => import("../../test/mechanismGallery/mocks.tsx"));
vi.mock("@keyboard-studio/engine", async (importOriginal) =>
  (await import("../../test/mechanismGallery/mocks.tsx")).withMockedEngine(
    await importOriginal<typeof import("@keyboard-studio/engine")>(),
  ),
);
vi.mock("../../components/OSKFrame.tsx", () => import("../../test/mechanismGallery/mocks.tsx"));

installMechanismGalleryHooks();

async function renderGallery(inventory: string[]) {
  const group: IRGroup = {
    nodeId: "g-main",
    name: "main",
    usingKeys: true,
    readonly: false,
    rules: [
      {
        nodeId: "r-semicolon",
        context: [{ kind: "vkey", name: "K_COLON", modifiers: [] }],
        output: [{ kind: "char", value: ";" }],
      },
    ],
  };
  const seedVfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
  useWorkingCopyStore
    .getState()
    .instantiateFromStart(basicKbdus, { vfs: seedVfs, ir: makeTestIR([group]) });
  seedInventory(inventory);
  await act(async () => {
    render(<MechanismGallery selectedStartKeyboard={basicKbdus} />, { withStepNav: true });
  });
}

async function placeWithDefaultDeadkey(testId: string, ch: string) {
  fireEvent.click(within(screen.getByTestId("char-scroll-strip")).getByTestId(testId));
  await waitFor(() => {
    expectCurrentChar(ch);
  });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`Apply method for ${ch}`, "i") }));
}

const escapesOf = (ch: string) =>
  getPhaseCPhysicalAssignments().find((a) => a.target === ch)?.mechanisms[0]?.slotValues?.["escapes"];

const banner = () => screen.getByRole("note", { name: /Deadkey escapes/i });

describe("MechanismGallery — deadkey trigger escapes", () => {
  it("a deadkey's first placement applies all three escapes and asks to confirm them", async () => {
    await renderGallery(["ǎ"]);
    await placeWithDefaultDeadkey("char-scroll-chip-01CE", "ǎ");

    await waitFor(() => {
      expect(banner().textContent).toMatch(/now starts a deadkey/);
    });
    expect(escapesOf("ǎ")).toBe("double-tap space altgr");
    for (const e of ["double-tap", "space", "altgr"]) {
      expect((screen.getByTestId(`deadkey-escape-${e}`) as HTMLInputElement).checked).toBe(true);
    }

    fireEvent.click(screen.getByTestId("deadkey-escape-space"));
    await waitFor(() => {
      expect(escapesOf("ǎ")).toBe("double-tap altgr");
    });

    fireEvent.click(screen.getByTestId("deadkey-escapes-done"));
    expect(screen.queryByRole("note", { name: /Deadkey escapes/i })).toBeNull();
  });

  it("the next new deadkey starts from the last choice", async () => {
    await renderGallery(["ǎ", "à"]);
    await placeWithDefaultDeadkey("char-scroll-chip-01CE", "ǎ");
    await waitFor(() => {
      expect(banner()).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("deadkey-escape-altgr"));
    await waitFor(() => {
      expect(escapesOf("ǎ")).toBe("double-tap space");
    });

    // à adds a different mark, so it gets its own deadkey on a new trigger.
    await placeWithDefaultDeadkey("char-scroll-chip-00E0", "à");
    await waitFor(() => {
      expect(escapesOf("à")).toBe("double-tap space");
    });
    expect((screen.getByTestId("deadkey-escape-altgr") as HTMLInputElement).checked).toBe(false);
  });
});
