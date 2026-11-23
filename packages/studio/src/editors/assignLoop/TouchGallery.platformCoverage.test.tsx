// TouchGallery — per-platform touch coverage and the delete-key warning.
//
// Coverage is judged per platform: a letter the tablet types but the phone
// does not is still unplaced (on the phone). Deleting the phone's only key for
// a letter warns at once, and the warning survives the builder moving the
// selection to a neighbouring key.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, act } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { installTouchGalleryHooks } from "../../test/touchGallery/harness.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";

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
vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));
vi.mock("@monaco-editor/react", () => ({ default: () => null }));

installTouchGalleryHooks();

/** A shipped layout with one default-layer row per platform, keys typing exactly `chars`. */
function seed(platforms: Record<string, string[]>, inventory: string[], opts: { open?: boolean } = {}) {
  const json: Record<string, unknown> = {};
  for (const [id, chars] of Object.entries(platforms)) {
    json[id] = {
      layer: [
        {
          id: "default",
          row: [{ id: 1, key: chars.map((c, i) => ({ id: `T_${id}${i}`, text: c, output: c })) }],
        },
      ],
    };
  }
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    { path: "source/basic_kbdus.keyman-touch-layout", content: JSON.stringify(json), isBinary: false },
    ...(opts.open ? [{ path: "source/basic_kbdus.kps", content: "<Package/>", isBinary: false }] : []),
  ]);
  if (opts.open) {
    // Opened for update (spec 111): every edit is written to the file as it lands.
    useOpenUndoStore.getState().clear();
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
  } else {
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs, ir: makeTestIR([]) });
  }
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: inventory });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useDecisionStore
    .getState()
    .record({ id: "touch-seed-source", value: "import-adapt", provenance: "asked", step: "touch_seed_source" });
}

async function renderGallery() {
  await act(async () => {
    render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
  });
}

describe("TouchGallery — Manage Layout leads", () => {
  it("opens on Manage Layout, with Place Letters still offered as the second tab", async () => {
    seed({ tablet: ["ä"], phone: ["ä"] }, ["ä"]);
    await renderGallery();
    const tabs = [...screen.getByTestId("touch-mode-tabs").querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent,
    );
    expect(tabs).toEqual(["Manage Layout", "Place Letters", "Code"]);
    expect(screen.getByTestId("touch-mode-tab-key").getAttribute("aria-selected")).toBe("true");
  });
});

describe("TouchGallery — coverage per platform", () => {
  it("a letter only the tablet types still counts as unplaced, and Continue says the phone lacks it", async () => {
    seed({ tablet: ["ä", "b"], phone: ["b"] }, ["ä", "b"]);
    await renderGallery();
    expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe("1 character still unplaced");
    expect(document.body.textContent).toContain("ä has no key on Phone");
  });

  it("badges the platform tab that still needs placements, and only that one", async () => {
    seed({ tablet: ["ä", "b"], phone: ["b"] }, ["ä", "b", "c"]);
    await renderGallery();
    const phoneBadge = screen.getByTestId("touch-builder-platform-unplaced-phone");
    expect(phoneBadge.textContent).toContain("2");
    expect(screen.getByTestId("touch-builder-platform-phone").textContent).toContain(
      "2 letters still need a key on Phone",
    );
    expect(screen.getByTestId("touch-builder-platform-unplaced-tablet").textContent).toContain(
      "1 letter still needs a key on Tablet",
    );
    expect(screen.getByTestId("touch-key-mode-continue").hasAttribute("disabled")).toBe(true);
  });

  it("Continue stays shut while only one platform is badged", async () => {
    seed({ tablet: ["ä"], phone: [] }, ["ä"]);
    await renderGallery();
    expect(screen.queryByTestId("touch-builder-platform-unplaced-tablet")).toBeNull();
    expect(screen.getByTestId("touch-builder-platform-unplaced-phone")).toBeDefined();
    expect(screen.getByTestId("touch-key-mode-continue").hasAttribute("disabled")).toBe(true);
  });

  it("shows no badge, and opens Continue, once every letter has a key on both platforms", async () => {
    seed({ tablet: ["ä"], phone: ["ä"] }, ["ä"]);
    await renderGallery();
    expect(screen.queryByTestId("touch-builder-platform-unplaced-phone")).toBeNull();
    expect(screen.queryByTestId("touch-builder-platform-unplaced-tablet")).toBeNull();
    expect(screen.getByTestId("touch-key-mode-continue").hasAttribute("disabled")).toBe(false);
  });

  it.each([
    ["a copied keyboard", false],
    ["a keyboard opened for update", true],
  ])("on %s, deleting the phone's only key for a letter warns, and the warning outlives the neighbour selection", async (_track, open) => {
    seed({ tablet: ["ä", "b"], phone: ["ä", "b"] }, ["ä", "b"], { open });
    await renderGallery();

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-builder-platform-phone"));
    });
    const key = screen
      .getAllByTestId("touch-builder-key")
      .find((el) => el.getAttribute("data-address")?.includes("T_phone0"));
    expect(key).toBeDefined();
    await act(async () => {
      fireEvent.click(key!);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-builder-delete-key"));
    });

    const warnings = screen.getByTestId("key-edit-invalidation-warnings");
    expect(warnings.textContent).toContain("Nothing on the Phone layout types ä");
    expect(screen.getByTestId("touch-progress-unplaced").textContent).toBe("1 character still unplaced");
    expect(screen.getByTestId("touch-builder-platform-unplaced-phone").textContent).toContain("1");
    expect(screen.queryByTestId("touch-builder-platform-unplaced-tablet")).toBeNull();

    // The author's own next selection clears it, as before.
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-builder-platform-tablet"));
    });
    const tabletKey = screen
      .getAllByTestId("touch-builder-key")
      .find((el) => el.getAttribute("data-address")?.includes("T_tablet0"));
    await act(async () => {
      fireEvent.click(tabletKey!);
    });
    expect(screen.queryByTestId("key-edit-invalidation-warnings")).toBeNull();
  });
});

describe("TouchGallery — a letter missing on one platform can still be set aside", () => {
  it("Place Letters reaches a tablet-only letter by its chip, and marking it for later opens Continue", async () => {
    seed({ tablet: ["ä"], phone: [] }, ["ä"]);
    useWorkingCopyStore.getState().setTouchEditorMode("character");
    await renderGallery();
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByTestId("char-scroll-chip-00E4"));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mark U\+00E4 ä for later review/i }));
    });
    expect(screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled")).toBe(false);
  });
});
