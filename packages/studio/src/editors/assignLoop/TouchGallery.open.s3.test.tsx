// TouchGallery on a keyboard opened for update (spec 111 phase 16, S3): a character placement, a delete and a restore are written into the touch file when applied, once, and the preview, grid and output follow the file.
//
// Shared module mocks: ../../test/touchGallery/mocks.tsx. Seeders and the
// lifecycle hooks every suite installs: ../../test/touchGallery/harness.ts.

import { describe, it, expect, vi, beforeAll } from "vitest";
import { screen, fireEvent, act, waitFor } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { TouchGallery } from "./TouchGallery.tsx";
import { commitTouchOpOnOpen } from "./touchOpenCommit.ts";
import { applyOpenChange, undoLastOpenApply } from "../../lib/openApply.ts";
import { setOpenApplyNotifier } from "../../lib/openApplyNotifier.ts";
import { projectWorkingCopyForOutput } from "../../lib/serializeWorkingCopy.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";
import { touchKeyAddress } from "@keyboard-studio/contracts";
import { capturedVfsTransformRef } from "../../test/touchGallery/mocks.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { changeSelectMenu } from "../../test/selectMenuTestUtils.ts";
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

const TOUCH = JSON.stringify(
  { phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a" }, { id: "K_B", text: "b" }] }] }] } },
  null,
  2,
);
const WITH_ZHONG = JSON.stringify(
  { phone: { layer: [{ id: "default", row: [{ id: 1, key: [{ id: "K_A", text: "a", sk: [{ id: "U_4E2D", text: "中" }] }, { id: "K_B", text: "b" }] }] }] } },
  null,
  2,
);
const UNPATCHABLE = TOUCH.replace('"text": "b"', '"text": "b",\n          "text": "b"');

function seedOpen(touch: string): void {
  useOpenUndoStore.getState().clear();
  const vfs = createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
    { path: "source/basic_kbdus.kps", content: "<Package/>", isBinary: false },
    { path: "source/basic_kbdus.keyman-touch-layout", content: touch, isBinary: false },
  ]);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
  useWorkingCopyStore.getState().recordPhase({ phase: "B", answers: [], confirmedInventory: ["中"] });
  useWorkingCopyStore.getState().markGalleryIntroSeen("touch");
  useDecisionStore.getState().record({ id: "touch-seed-source", value: "import-adapt", provenance: "asked", step: "touch_seed_source" });
}

function previewTouchText(): string | undefined {
  const fn = capturedVfsTransformRef.current;
  if (fn === null) throw new Error("no transform captured");
  const vfs = createVirtualFS(useWorkingCopyStore.getState().startVfs!.entries());
  fn(vfs, "basic_kbdus");
  return readVfsText(vfs, "source/basic_kbdus.keyman-touch-layout");
}


const count = (text: string, needle: string): number => text.split(needle).length - 1;
const fileText = (): string => readVfsText(useWorkingCopyStore.getState().startVfs!, "source/basic_kbdus.keyman-touch-layout")!;

async function applyZhongOnKA(): Promise<void> {
  await changeSelectMenu(screen.getByLabelText(/Host key for long-press/i), "K_A");
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Apply touch method for/i }));
  });
}

async function mount(touch: string): Promise<void> {
  seedOpen(touch);
  await act(async () => {
    render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
  });
}

describe("TouchGallery character placements on a keyboard opened for update (S3)", () => {
  it("Apply writes the placement into the file at once: one record, nothing left in charTouch, one copy in the preview, same text in the output; undo is byte-identical", async () => {
    await mount(TOUCH);
    const before = fileText();
    await applyZhongOnKA();
    await waitFor(() => expect(fileText()).toContain("中"));
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);
    // The preview is the file alone: the placement appears exactly once.
    expect(count(previewTouchText()!, "中")).toBe(1);
    expect(previewTouchText()).toBe(fileText());
    const projected = await projectWorkingCopyForOutput();
    expect(readVfsText(projected!.vfs, "source/basic_kbdus.keyman-touch-layout")).toBe(fileText());
    await act(async () => {
      expect(undoLastOpenApply().ok).toBe(true);
    });
    expect(fileText()).toBe(before);
    expect(previewTouchText()).toBe(before);
  });

  it("a key-grid edit and then a character placement on another key are both in the file, preview and output (SC-013)", async () => {
    await mount(TOUCH);
    await act(async () => {
      commitTouchOpOnOpen(
        { op: { kind: "set", address: touchKeyAddress("phone", "default", "K_B"), fields: { text: "ɛ" } } },
        "touch layout edit",
      );
    });
    await applyZhongOnKA();
    await waitFor(() => expect(fileText()).toContain("中"));
    expect(fileText()).toContain("ɛ");
    expect(useOpenUndoStore.getState().records).toHaveLength(2);
    const preview = previewTouchText()!;
    expect(preview).toBe(fileText());
    expect(count(preview, "ɛ")).toBe(1);
    expect(count(preview, "中")).toBe(1);
    const projected = await projectWorkingCopyForOutput();
    expect(readVfsText(projected!.vfs, "source/basic_kbdus.keyman-touch-layout")).toBe(fileText());
    // The footer's one Undo covers the placement and the edit; this gallery's own Undo is not shown.
    expect(screen.queryByTestId("touch-undo-button")).toBeNull();
  });

  it("asked first: nothing is written or recorded until the author agrees; declining leaves file, grid and charTouch as they were", async () => {
    await mount(UNPATCHABLE);
    const before = fileText();
    let item: Parameters<NonNullable<Parameters<typeof setOpenApplyNotifier>[0]>>[0] | undefined;
    setOpenApplyNotifier((i) => {
      item = i;
    });
    await applyZhongOnKA();
    expect(item).toBeDefined();
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);
    // Decline.
    await act(async () => {
      item!.onNotApplied();
    });
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    // Agree: the host writes it, then reports it applied.
    await act(async () => {
      expect(applyOpenChange(item!.build()!, { consentedReemit: true }).status).toBe("applied");
      item!.onApplied!();
    });
    expect(fileText()).toContain("中");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(useWorkingCopyStore.getState().touchDraft?.charTouchEntries ?? []).toHaveLength(0);
  });
});

describe("TouchGallery deleting and restoring an existing method on a keyboard opened for update (S3)", () => {
  async function pickZhong(): Promise<void> {
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /中/ }));
    });
  }

  it("delete is a file change with one record (no overlay entry); the method is then in the restore list; restore writes it back; refused after the key changed", async () => {
    await mount(WITH_ZHONG);
    const original = fileText();
    await pickZhong();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Remove existing touch method/i }));
    });
    expect(fileText()).not.toContain("中");
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(useWorkingCopyStore.getState().deletedTouchKeyIds.size).toBe(0);
    expect(useWorkingCopyStore.getState().undoStack).toHaveLength(0);
    expect(previewTouchText()).toBe(fileText());

    // Restore list from the session log: put it back.
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Restore deleted touch method/i }));
    });
    expect(JSON.parse(fileText())).toEqual(JSON.parse(original));
    expect(useOpenUndoStore.getState().records).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /Restore deleted touch method/i })).toBeNull();

    // Delete again, change the host key, and the restore is refused.
    await pickZhong();
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Remove existing touch method/i }));
    });
    expect(fileText()).not.toContain("中");
    await act(async () => {
      commitTouchOpOnOpen(
        { op: { kind: "set", address: touchKeyAddress("phone", "default", "K_A"), fields: { text: "A!" } } },
        "touch layout edit",
      );
    });
    const changed = fileText();
    const nRecords = useOpenUndoStore.getState().records.length;
    const handed: unknown[] = [];
    setOpenApplyNotifier((i) => handed.push(i));
    await act(async () => {
      fireEvent.click(await screen.findByRole("button", { name: /Restore deleted touch method/i }));
    });
    expect(fileText()).toBe(changed);
    expect(useOpenUndoStore.getState().records).toHaveLength(nRecords);
    expect(handed).toHaveLength(1);
  });
});

describe("desktop-placed letters on Open stay touch suggestions", () => {
  it("a Phase C desktop placement is offered as a suggestion and writes no touch key", async () => {
    seedOpen(TOUCH);
    useWorkingCopyStore.getState().recordPhase({
      phase: "C",
      answers: [],
      assignments: [
        { scope: "individual", target: "中", modality: "physical", mechanisms: [{ patternId: "simple_swap", slotValues: { kmnRules: "+ [K_B] > '中'" } }], source: "user" },
      ],
    });
    const before = fileText();
    await act(async () => {
      render(<TouchGallery onComplete={vi.fn()} onBack={vi.fn()} />, { withStepNav: true });
    });
    expect(await screen.findByText(/Suggested: replace/i)).toBeTruthy();
    expect(fileText()).toBe(before);
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});
