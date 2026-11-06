// CssEditor — opens on the keyboard's own stylesheet, previews through the shared pane, and records the result in the working copy.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { CssEditor } from "./CssEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

// Monaco cannot load under vitest; a stub stands in for the pane's contract (initialText in, onApply out).
vi.mock("./CssCodePane.tsx", () => ({
  CssCodePane: ({ initialText, onApply }: { initialText: string; onApply: (css: string) => void }) => (
    <div>
      <pre data-testid="seed">{initialText}</pre>
      <button type="button" data-testid="apply-new" onClick={() => onApply(".new { color: blue; }")}>
        apply
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
    customCss,
  });
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
});
