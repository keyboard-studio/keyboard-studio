// Reseed touch from desktop, and creating the touch file, on a keyboard opened for update (spec 111 phase 16, T087b; owner rulings 2026-11-14).
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { OpenApplyHost } from "../../components/OpenApplyHost.tsx";
import { undoLastOpenApply } from "../../lib/openApply.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { buildTouchLayoutJsonSpy } from "../../test/touchGallery/mocks.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { installTouchGalleryHooks } from "../../test/touchGallery/harness.ts";

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
// The Code tab's Monaco chain cannot load under vitest's module runner:
// monacoSetup's `?worker` imports are resolved by Vite's worker plugin,
// which never runs for externalized deps in the test environment (the
// production build resolves them — vite.config.ts sets worker.format "es"
// in anticipation). These suites render the real TouchGallery, which
// lazy-loads the real TouchCodePane, so both the worker wiring and the
// Editor component are stubbed here; the pane's own suite
// (touchBuilder/TouchCodePane.test.tsx) mocks @monaco-editor/react
// directly with a functional stand-in.
vi.mock("./touchBuilder/monacoSetup.ts", () => ({}));
vi.mock("@monaco-editor/react", () => ({
  default: () => null,
}));

installTouchGalleryHooks();

beforeAll(async () => {
  await import("./touchBuilder/TouchCodePane.tsx");
}, 60000);

const PATH = "source/basic_kbdus.keyman-touch-layout";
const TOUCH = JSON.stringify(
  { phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }] }] }] } },
  null,
  2,
);
const RESEEDED = JSON.stringify({
  phone: {
    layer: [
      { id: "default", row: [{ id: 1, key: [{ id: "K_Q", text: "q" }, { id: "K_W", text: "w" }, { id: "K_E", text: "e" }] }] },
      { id: "shift", row: [{ id: 1, key: [{ id: "K_Q", text: "Q" }] }] },
      { id: "numeric", row: [{ id: 1, key: [{ id: "K_1", text: "1" }] }] },
    ],
  },
});

beforeEach(() => {
  buildTouchLayoutJsonSpy.mockImplementation(() => ({ json: RESEEDED, warnings: [] }));
});

function seedOpen(touch: string | null): void {
  useOpenUndoStore.getState().clear();
  const files = [
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    { path: "source/basic_kbdus.kps", content: "<Package/>", isBinary: false },
    ...(touch === null ? [] : [{ path: PATH, content: touch, isBinary: false }]),
  ];
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: createVirtualFS(files), ir: makeTestIR([]) });
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: ["中"] });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useDecisionStore.getState().record({ id: "touch-seed-source", value: "import-adapt", provenance: "asked", step: "touch_seed_source" });
}

const fileText = (): string | undefined => {
  const vfs = useWorkingCopyStore.getState().startVfs!;
  return vfs.get(PATH) === undefined ? undefined : readVfsText(vfs, PATH);
};

async function mount(onComplete = vi.fn()): Promise<ReturnType<typeof vi.fn>> {
  await act(async () => {
    render(
      <OpenApplyHost>
        <TouchGallery onComplete={onComplete} onBack={vi.fn()} />
      </OpenApplyHost>,
      { withStepNav: true },
    );
  });
  return onComplete;
}

describe("reseed on a keyboard opened with a touch file", () => {
  it("is understated: behind a closed native disclosure, reachable by keyboard and labelled; the step leads with its own controls", async () => {
    seedOpen(TOUCH);
    await mount();
    const more = screen.getByTestId("touch-open-more") as HTMLDetailsElement;
    expect(more.tagName).toBe("DETAILS");
    expect(more.open).toBe(false);
    const summary = more.querySelector("summary")!;
    expect(summary.textContent).toMatch(/More touch options/);
    // Native controls: nothing needs a tabindex to be reachable, and nothing steals the tab order up front.
    expect(summary.getAttribute("tabindex")).toBeNull();
    const button = screen.getByTestId("touch-open-reseed");
    expect(button.tagName).toBe("BUTTON");
    expect(button.textContent).toMatch(/Reseed touch from desktop/);
    expect(button.getAttribute("tabindex")).toBeNull();
    expect(screen.queryByTestId("touch-open-create")).toBeNull();
  });

  it("asks first naming the file and what changes; declining leaves everything as it was", async () => {
    seedOpen(TOUCH);
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-open-reseed"));
    });
    const dialog = await screen.findByTestId("reformat-consent-dialog");
    expect(dialog.textContent).toContain(PATH);
    expect(screen.getByTestId("touch-replace-keys").textContent).toMatch(/2 now, 5 after/);
    expect(screen.getByTestId("touch-replace-layers-added").textContent).toMatch(/shift and numeric/);
    expect(fileText()).toBe(TOUCH);
    await act(async () => {
      fireEvent.click(screen.getByTestId("reformat-consent-keep"));
    });
    await waitFor(() => expect(screen.queryByTestId("reformat-consent-dialog")).toBeNull());
    expect(fileText()).toBe(TOUCH);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(screen.getByTestId("open-apply-notice").textContent).toMatch(/not applied/);
  });

  it("on agreement replaces the file as one change; undo restores the bytes", async () => {
    seedOpen(TOUCH);
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-open-reseed"));
    });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => {
      fireEvent.click(screen.getByTestId("reformat-consent-agree"));
    });
    await waitFor(() => expect(fileText()).not.toBe(TOUCH));
    expect(JSON.parse(fileText()!)).toEqual(JSON.parse(RESEEDED));
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    await act(async () => {
      expect(undoLastOpenApply().ok).toBe(true);
    });
    expect(fileText()).toBe(TOUCH);
  });
});

describe("a keyboard opened with no touch file", () => {
  it("leads with creating one; the editing surface is not offered and nothing is held or written", async () => {
    seedOpen(null);
    await mount();
    expect(screen.getByTestId("touch-open-no-file")).toBeTruthy();
    const create = screen.getByTestId("touch-open-create");
    expect(create.tagName).toBe("BUTTON");
    expect(create.textContent).toMatch(/Create a touch layout/);
    expect(screen.queryByTestId("touch-mode-tabs")).toBeNull();
    expect(screen.queryByTestId("touch-open-more")).toBeNull();
    expect(fileText()).toBeUndefined();
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
  });

  it("Continue without creating ships it as opened: no file, nothing built, nothing held", async () => {
    seedOpen(null);
    const onComplete = await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-key-mode-continue"));
    });
    expect(onComplete).toHaveBeenCalledWith([]);
    expect(fileText()).toBeUndefined();
    expect(useWorkingCopyStore.getState().touchLayoutJson).toBeNull();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("creating asks first (declining changes nothing); agreeing creates the file as one undoable change and the editor appears; undo removes it", async () => {
    seedOpen(null);
    await mount();
    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-open-create"));
    });
    const dialog = await screen.findByTestId("reformat-consent-dialog");
    expect(dialog.textContent).toContain(PATH);
    expect(screen.getByTestId("touch-replace-keys").textContent).toMatch(/5 keys will be created/);
    await act(async () => {
      fireEvent.click(screen.getByTestId("reformat-consent-keep"));
    });
    await waitFor(() => expect(screen.queryByTestId("reformat-consent-dialog")).toBeNull());
    expect(fileText()).toBeUndefined();
    expect(screen.getByTestId("touch-open-no-file")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("touch-open-create"));
    });
    await screen.findByTestId("reformat-consent-dialog");
    await act(async () => {
      fireEvent.click(screen.getByTestId("reformat-consent-agree"));
    });
    await waitFor(() => expect(fileText()).toBeDefined());
    expect(JSON.parse(fileText()!)).toEqual(JSON.parse(RESEEDED));
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    // Now an ordinary Open session with a touch file.
    await waitFor(() => expect(screen.getByTestId("touch-mode-tabs")).toBeTruthy());
    expect(screen.queryByTestId("touch-open-no-file")).toBeNull();
    expect(screen.getByTestId("touch-open-more")).toBeTruthy();

    await act(async () => {
      expect(undoLastOpenApply().ok).toBe(true);
    });
    expect(fileText()).toBeUndefined();
    await waitFor(() => expect(screen.getByTestId("touch-open-no-file")).toBeTruthy());
  });
});
