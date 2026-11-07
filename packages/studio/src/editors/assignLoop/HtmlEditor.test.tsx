// HtmlEditor — file selector over all six doc members, TipTap WYSIWYG as the
// primary mode, per-file seeding, and edits that reach the working-copy store
// on Continue (specs/html-editor). The rich-text and code panes are stubbed
// the way CssEditor.test.tsx stubs Monaco: the stub contract is value in,
// onChange/onApply out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { HtmlEditor } from "./HtmlEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";

// TipTap and Monaco cannot load under vitest; stubs stand in for the panes'
// contracts (value/initialText in, onChange/onApply out).
vi.mock("./HtmlRichTextPane.tsx", () => ({
  HtmlRichTextPane: ({
    value,
    onChange,
  }: {
    value: string;
    format: string;
    onChange: (next: string) => void;
  }) => (
    <div>
      <pre data-testid="rich-seed">{value}</pre>
      <button
        type="button"
        data-testid="rich-edit"
        onClick={() => onChange(`${value}<p>Edited paragraph.</p>`)}
      >
        edit
      </button>
    </div>
  ),
}));
vi.mock("./HtmlCodePane.tsx", () => ({
  HtmlCodePane: ({
    initialText,
    onApply,
  }: {
    initialText: string;
    language?: string;
    onApply: (next: string) => void;
  }) => (
    <div>
      <pre data-testid="code-seed">{initialText}</pre>
      <button type="button" data-testid="code-apply" onClick={() => onApply("<p>Code edited.</p>")}>
        apply
      </button>
    </div>
  ),
}));
// The live preview is deterministic in these tests: fixed generated text.
const preview = vi.hoisted(() => ({
  welcomeHtm:
    "<!DOCTYPE html><html><head><title>T</title></head><body><p>Generated welcome.</p></body></html>",
  readmeHtm:
    "<!DOCTYPE html><html><head><title>T</title></head><body><p>Generated details.</p></body></html>",
  readmeMd: "# Test KB\n\nGenerated readme.\n",
  helpPhp: "<?php $pagename = 't'; ?>\n<p>Generated help.</p>\n",
}));
vi.mock("../../hooks/useDocsPreview.ts", () => ({
  useDocsPreview: () => ({ ...preview, typingGuideSuppressed: false }),
}));
vi.mock("../../hooks/useDocMemberStates.ts", () => ({
  useDocMemberStates: () => [],
}));

function seedStore(overrides: Record<string, unknown> = {}) {
  const startVfs = createVirtualFS();
  useWorkingCopyStore.setState({
    instantiationMode: "new-from-base",
    startKeyboard: { id: "t", displayName: "T" } as never,
    startVfs,
    identity: null,
    startWelcomeHtmText: null,
    startHelpPhpText: null,
    startReadmeMdText: null,
    startHistoryMdText: null,
    startLicenseText: null,
    authoredWelcomeHtm: null,
    authoredReadmeHtm: null,
    authoredReadmeMd: null,
    authoredHelpPhp: null,
    ...overrides,
  });
}

describe("HtmlEditor", () => {
  beforeEach(() => {
    useWorkingCopyStore.getState().reset();
    seedStore();
  });
  afterEach(cleanup);

  it("opens on the generated welcome text, never a blank editor", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Generated welcome.");
  });

  it("lists all six doc members; history and license are read-only", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    for (const member of ["welcome-htm", "readme-htm", "readme-md", "help-php", "history-md", "license-md"]) {
      expect(await screen.findByTestId(`html-file-${member}`)).toBeTruthy();
    }
    expect(screen.getByTestId("html-file-history-md").textContent).toContain("read-only");
    expect(screen.getByTestId("html-file-license-md").textContent).toContain("read-only");
    expect(screen.getByTestId("html-file-welcome-htm").textContent).not.toContain("read-only");
  });

  it("a rich edit + Continue writes the authored text to the store and reports it", async () => {
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-continue"));
    const authored = useWorkingCopyStore.getState().authoredWelcomeHtm;
    expect(authored).toContain("Generated welcome.");
    expect(authored).toContain("Edited paragraph.");
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ welcomeHtm: expect.stringContaining("Edited paragraph.") }),
    );
  });

  it("switching files flushes the first file's edit to the store", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    expect(useWorkingCopyStore.getState().authoredWelcomeHtm).toContain("Edited paragraph.");
    // The newly selected file shows its own seed, not the welcome edit.
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Generated readme.");
  });

  it("reopens on the authored override instead of the generated text", async () => {
    seedStore({ authoredWelcomeHtm: "<p>Authored welcome.</p>" });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Authored welcome.");
  });

  it("a read-only history tab shows the carried text with no editor", async () => {
    const startVfs = createVirtualFS();
    startVfs.set("HISTORY.md", "# Version history here", false);
    seedStore({ startVfs });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("html-file-history-md"));
    expect(screen.queryByTestId("rich-seed")).toBeNull();
    expect(screen.queryByTestId("code-seed")).toBeNull();
    expect(screen.getByText("Version history here", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Write" })).toBeNull();
  });

  it("on the open track the welcome seed comes from the carried VFS text", async () => {
    const startVfs = createVirtualFS();
    startVfs.set("source/t.kps", "<Package></Package>", false);
    startVfs.set(
      "source/welcome/welcome.htm",
      "<!DOCTYPE html><html><head><title>T</title></head><body><p>OPEN-CARRIED-WELCOME</p></body></html>",
      false,
    );
    seedStore({ instantiationMode: "adapt-existing", startVfs });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("OPEN-CARRIED-WELCOME");
  });

  it("leaves the working copy alone when the author changed nothing", () => {
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(screen.getByTestId("html-continue"));
    expect(useWorkingCopyStore.getState().authoredWelcomeHtm).toBeNull();
    expect(onComplete).toHaveBeenCalledWith({});
  });
});
