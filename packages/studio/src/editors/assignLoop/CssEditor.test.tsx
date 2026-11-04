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
// The compile pipeline and the KeymanWeb iframe are not under test here.
vi.mock("../../hooks/useKeyboardArtifact.ts", () => ({
  useKeyboardArtifact: () => ({ stage: { kind: "idle" }, retry: () => undefined }),
}));
vi.mock("../../components/OSKFrame.tsx", () => ({ OSKFrame: () => <div data-testid="osk-frame" /> }));
vi.mock("../../components/OskModeToggle.tsx", () => ({ OskModeToggle: () => null }));

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
  beforeEach(() => seedStore(null));
  afterEach(cleanup);

  it("opens on the keyboard's existing stylesheet instead of a blank editor", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    expect((await screen.findByTestId("seed")).textContent).toBe(".kmw-key { color: red; }");
  });

  it("shows the real preview pane in the right column", () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    expect(screen.getByTestId("osk-frame")).toBeTruthy();
  });

  it("leaves the working copy alone when the author applied nothing", () => {
    const onComplete = vi.fn();
    render(<CssEditor onComplete={onComplete} onBack={() => undefined} />);
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBeNull();
    expect(onComplete).toHaveBeenCalledWith({ css: ".kmw-key { color: red; }" });
  });

  it("records the applied text on Continue", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    fireEvent.click(await screen.findByTestId("apply-new"));
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBe(".new { color: blue; }");
  });

  it("records an empty string when the author applies an emptied editor", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    fireEvent.click(await screen.findByTestId("apply-empty"));
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBe("");
  });

  it("Discard changes drops this visit's edits and leaves the working copy untouched", async () => {
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    const discard = screen.getByRole("button", { name: "Discard changes" }) as HTMLButtonElement;
    expect(discard.disabled).toBe(true);
    fireEvent.click(await screen.findByTestId("apply-new"));
    expect(discard.disabled).toBe(false);
    fireEvent.click(discard);
    fireEvent.click(screen.getByTestId("css-continue"));
    expect(useWorkingCopyStore.getState().customCss).toBeNull();
  });

  it("reopens on what the author left here before", async () => {
    seedStore(".left { top: 1px; }");
    render(<CssEditor onComplete={() => undefined} onBack={() => undefined} />);
    expect((await screen.findByTestId("seed")).textContent).toBe(".left { top: 1px; }");
  });
});
