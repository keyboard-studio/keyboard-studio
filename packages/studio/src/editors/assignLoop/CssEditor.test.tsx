// CssEditor — opens on the keyboard's own stylesheet, previews through the shared pane, and records the result in the working copy.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { CssEditor } from "./CssEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { clearOpenSession, useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { undoLastOpenApply } from "../../lib/openApply.ts";

// Monaco cannot load under vitest; a stub stands in for the pane's contract (initialText in, onApply out).
vi.mock("./CssCodePane.tsx", () => ({
  CssCodePane: ({ initialText, onApply }: { initialText: string; onApply: (css: string) => void }) => (
    <div>
      <pre data-testid="seed">{initialText}</pre>
      <button type="button" data-testid="apply-new" onClick={() => onApply(".new { color: blue; }")}>
        apply
      </button>
      <button type="button" data-testid="apply-relinked" onClick={() => onApply(".kmw-keyboard-newkb .kmw-key { top: 0; }")}>
        apply relinked
      </button>
      <button type="button" data-testid="apply-empty" onClick={() => onApply("")}>
        apply empty
      </button>
    </div>
  ),
}));
// The compile pipeline and the preview pane (KeymanWeb iframe) are not under test here.
const artifact = vi.hoisted(() => ({ stage: { kind: "idle" } as unknown }));
vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: artifact.stage, retry: () => undefined }),
}));
vi.mock("./PreviewPane.tsx", () => ({ GalleryPreviewPane: () => <div data-testid="osk-frame" /> }));

const KMN = "store(&NAME) 'T'\nstore(&KMW_EMBEDCSS) 'kb.css'\n\nbegin Unicode > use(main)\ngroup(main) using keys\n";

function seedStore(customCss: string | null) {
  const startVfs = createVirtualFS();
  startVfs.set("source/t.kmn", KMN, false);
  startVfs.set("source/kb.css", ".kmw-key { color: red; }", false);
  useWorkingCopyStore.setState({
    startKeyboard: { id: "t", displayName: "T" } as never,
    startVfs,
    identity: null,
    customCss,
  });
}

function renameTo(keyboardId: string) {
  useWorkingCopyStore.setState({ identity: { keyboardId, displayName: "T" } as never });
}

describe("CssEditor", () => {
  beforeEach(() => {
    artifact.stage = { kind: "idle" };
    seedStore(null);
  });
  afterEach(cleanup);

  it("opens on the keyboard's existing stylesheet instead of a blank editor", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("seed")).textContent).toBe(".kmw-key { color: red; }");
  });

  it("shows the real preview pane in the right column", () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
  });

  it("leaves the working copy alone when the author applied nothing", () => {
    const onComplete = vi.fn();
    render(<CssEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBeNull();
    expect(onComplete).toHaveBeenCalledWith({ css: ".kmw-key { color: red; }" });
  });

  it("records the applied text on Continue", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-new"));
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBe(".new { color: blue; }");
  });

  it("records an empty string when the author applies an emptied editor", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-empty"));
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBe("");
  });

  it("Discard changes drops this visit's edits and leaves the working copy untouched", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    const discard = screen.getByRole("button", { name: "Discard changes" }) as HTMLButtonElement;
    expect(discard.disabled).toBe(true);
    fireEvent.click(await screen.findByTestId("apply-new"));
    expect(discard.disabled).toBe(false);
    fireEvent.click(discard);
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBeNull();
  });

  it("opens on the stylesheet the preview shows when the working copy's start files lack it", async () => {
    const startVfs = createVirtualFS();
    startVfs.set("source/t.kmn", "store(&NAME) 'T'\n\nbegin Unicode > use(main)\n", false);
    useWorkingCopyStore.setState({ startVfs });
    const previewVfs = createVirtualFS();
    previewVfs.set("source/t.kmn", KMN, false);
    previewVfs.set("source/kb.css", ".from-preview { top: 2px; }", false);
    artifact.stage = { kind: "ready", vfs: previewVfs, keyboardId: "t", scaffoldWarnings: [] };
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("seed")).textContent).toBe(".from-preview { top: 2px; }");
  });

  it("waits for the preview before opening the editor blank", () => {
    useWorkingCopyStore.setState({ startVfs: createVirtualFS() });
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect(screen.queryByTestId("seed")).toBeNull();
    expect(screen.getByText("Loading editor…")).toBeTruthy();
  });

  it("reopens on what the author left here before", async () => {
    seedStore(".left { top: 1px; }");
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("seed")).textContent).toBe(".left { top: 1px; }");
  });

  it("shows the start stylesheet relinked to the author's new keyboard id", async () => {
    useWorkingCopyStore.getState().startVfs?.set("source/kb.css", ".kmw-keyboard-t .kmw-key { color: red; }", false);
    renameTo("newkb");
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("seed")).textContent).toBe(".kmw-keyboard-newkb .kmw-key { color: red; }");
  });

  it("reopens an earlier result relinked to the current keyboard id", async () => {
    seedStore(".kmw-keyboard-t .left { top: 1px; }");
    renameTo("newkb");
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("seed")).textContent).toBe(".kmw-keyboard-newkb .left { top: 1px; }");
  });

  it("stores the applied text under the start id so a later rename still relinks it", async () => {
    renameTo("newkb");
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-relinked"));
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBe(".kmw-keyboard-t .kmw-key { top: 0; }");
  });
});

describe("CssEditor on a keyboard opened for update", () => {
  beforeEach(() => {
    clearOpenSession();
    artifact.stage = { kind: "idle" };
    seedStore(null);
    useWorkingCopyStore.getState().startVfs?.set("source/t.kps", "<Package/>", false);
    useWorkingCopyStore.setState({ instantiationMode: "adapt-existing" });
  });
  afterEach(() => {
    cleanup();
    useWorkingCopyStore.setState({ instantiationMode: null });
  });
  const file = (path: string) => useWorkingCopyStore.getState().startVfs!.get(path)?.content;

  it("Apply writes the file at once, holds nothing in the store, and offers no Discard", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect(screen.queryByText("Discard changes")).toBeNull();
    fireEvent.click(await screen.findByTestId("apply-new"));
    await waitFor(() => expect(file("source/kb.css")).toBe(".new { color: blue; }"));
    expect(useWorkingCopyStore.getState().customCss).toBeNull();
    expect((await screen.findByTestId("seed")).textContent).toBe(".new { color: blue; }");
  });

  it("the footer Undo reseeds the editor with the old text", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-new"));
    await waitFor(() => expect(screen.getByTestId("seed").textContent).toBe(".new { color: blue; }"));
    act(() => {
      expect(undoLastOpenApply().ok).toBe(true);
    });
    await waitFor(() => expect(screen.getByTestId("seed").textContent).toBe(".kmw-key { color: red; }"));
  });

  it("Apply of empty text removes the file", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-empty"));
    await waitFor(() => expect(file("source/kb.css")).toBeUndefined());
    expect(String(file("source/t.kmn"))).not.toContain("KMW_EMBEDCSS");
  });

  it("Apply of the text the file already holds is silent: no record, no alert", async () => {
    useWorkingCopyStore.getState().startVfs!.set("source/kb.css", ".new { color: blue; }", false);
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-new"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a keyboard source with no place for the store line is not written, and the author is told", async () => {
    const vfs = useWorkingCopyStore.getState().startVfs!;
    vfs.delete("source/kb.css");
    vfs.set("source/t.kmn", "store(&NAME) 'T'\n", false);
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("apply-new"));
    expect((await screen.findByRole("alert")).textContent).toContain("not saved");
    expect(file("source/kb.css")).toBeUndefined();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });
});

describe("CssEditor on the Copy track with a held stylesheet", () => {
  afterEach(cleanup);
  it("an adapt-track draft without a descriptor keeps the held-text behaviour: Apply is not written to the files", async () => {
    artifact.stage = { kind: "idle" };
    seedStore(".held { top: 0; }");
    useWorkingCopyStore.setState({ instantiationMode: "adapt-existing" });
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("seed")).textContent).toBe(".held { top: 0; }");
    fireEvent.click(screen.getByTestId("apply-new"));
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBe(".new { color: blue; }");
    expect(useWorkingCopyStore.getState().startVfs!.get("source/kb.css")?.content).toBe(".kmw-key { color: red; }");
    useWorkingCopyStore.setState({ instantiationMode: null });
  });
});
