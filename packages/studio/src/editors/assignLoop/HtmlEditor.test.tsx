// HtmlEditor — file selector over all six doc members, TipTap WYSIWYG as the
// primary mode, per-file seeding, and edits that reach the working-copy store
// on Continue (specs/html-editor). The rich-text and code panes are stubbed
// the way CssEditor.test.tsx stubs Monaco: the stub contract is value in,
// onChange/onApply out.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup, act, waitFor } from "@testing-library/react";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { HtmlEditor } from "./HtmlEditor.tsx";
import { useWorkingCopyStore } from "../../stores/workingCopyStore.ts";
import { applyOpenChange, undoLastOpenApply } from "../../lib/openApply.ts";
import { useOpenUndoStore } from "../../stores/openUndoStore.ts";
import { readVfsText } from "../../lib/vfsText.ts";

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
// The apply host is mounted by the shell; here a controllable stand-in (default: the real apply).
const host = vi.hoisted(() => ({ apply: undefined as undefined | ((c: unknown) => Promise<unknown>) }));
vi.mock("../../components/OpenApplyHost.tsx", () => ({
  useApplyOnOpen: () => (c: unknown) => host.apply!(c),
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
// The preview's assets come from the output projection; none are needed here.
vi.mock("../../hooks/useDocPreviewAssets.ts", () => ({
  useDocPreviewAssets: () => ({ lookup: () => undefined, welcomePath: null, helpCssPaths: [], ready: true }),
}));

/** The "as installed" preview document the frame renders. */
function previewDoc(): string {
  return screen.getByTestId("html-preview-frame").getAttribute("srcdoc") ?? "";
}

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

  it("a welcome body that already carries a data-doc-fragment span opens code-only, not in a rich mode that refuses every edit", async () => {
    seedStore({
      authoredWelcomeHtm:
        '<!DOCTYPE html><html><head><title>T</title></head><body><p>Hi</p><span data-doc-fragment="0">x</span></body></html>',
    });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect(await screen.findByTestId("code-seed")).toBeTruthy();
    expect(screen.queryByTestId("rich-seed")).toBeNull();
    expect(screen.getByText(/cannot be preserved exactly, so it is code-only/)).toBeTruthy();
  });

  it("a read-only history tab shows the carried text with no editor", async () => {
    const startVfs = createVirtualFS();
    startVfs.set("HISTORY.md", "# Version history here", false);
    seedStore({ startVfs });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("html-file-history-md"));
    expect(screen.queryByTestId("rich-seed")).toBeNull();
    expect(screen.queryByTestId("code-seed")).toBeNull();
    expect(previewDoc()).toContain("Version history here");
    expect(screen.queryByRole("button", { name: "Write" })).toBeNull();
  });

  it("desktop: editor and preview frame are shown together, with no Preview toggle", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("html-file-welcome-htm"));
    expect(screen.getByRole("button", { name: "Write" })).toBeTruthy();
    expect(await screen.findByTestId("rich-seed")).toBeTruthy();
    const frame = screen.getByTestId("html-preview-frame");
    expect(frame.getAttribute("title")).toContain("welcome.htm");
    expect(frame.getAttribute("sandbox")).toBe("");
    expect(previewDoc()).toContain("Generated welcome.");
    expect(screen.queryByRole("button", { name: "Preview" })).toBeNull();
  });

  it("desktop: the preview follows an edit", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    // The preview reloads once typing pauses (DocPreviewFrame's settle delay).
    await waitFor(() => expect(previewDoc()).toContain("Edited paragraph."));
  });

  it("desktop: README.md previews as rendered Markdown", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("html-file-readme-md"));
    expect(previewDoc()).toMatch(/<h1[^>]*>Test KB<\/h1>/);
  });

  it("desktop: read-only files show only the preview frame", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("html-file-history-md"));
    expect(screen.getByTestId("html-preview-frame")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Write" })).toBeNull();
  });

  it("narrow: the Write / Code / Preview toggle is unchanged", async () => {
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    try {
      render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
      expect(await screen.findByTestId("rich-seed")).toBeTruthy();
      expect(screen.queryByTestId("html-preview-frame")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Preview" }));
      expect(previewDoc()).toContain("Generated welcome.");
      expect(screen.queryByTestId("rich-seed")).toBeNull();
    } finally {
      Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
      window.dispatchEvent(new Event("resize"));
    }
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

  it("shows a narrow folder-grouped tree on desktop, with the tabs gone", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect(screen.getByRole("tree")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByText("source/")).toBeTruthy();
    const welcome = screen.getByTestId("html-file-welcome-htm");
    expect(welcome.textContent).toContain("welcome/welcome.htm");
    expect(welcome.textContent).toContain("Welcome page");
    expect(welcome.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("html-file-help-php").textContent).toContain("help/t.php");
    expect(screen.getByTestId("html-file-readme-md").textContent).toContain("README.md");
    expect(screen.getByTestId("html-file-history-md").textContent).toContain("HISTORY.md");
    expect(screen.getByTestId("html-file-license-md").textContent).toContain("LICENSE.md");
    // Selecting a tree row moves the selection and the editor follows.
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    expect(screen.getByTestId("html-file-readme-md").getAttribute("aria-selected")).toBe("true");
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Generated readme.");
  });

  it("falls back to the tab row on narrow viewports", () => {
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    try {
      render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
      expect(screen.queryByRole("tree")).toBeNull();
      expect(screen.getByRole("tablist")).toBeTruthy();
      expect(screen.getByTestId("html-file-welcome-htm")).toBeTruthy();
    } finally {
      Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
      window.dispatchEvent(new Event("resize"));
    }
  });

  it("on the open track, history and license carried only as slices are present, not absent", async () => {
    const startVfs = createVirtualFS();
    startVfs.set("source/t.kps", "<Package></Package>", false);
    seedStore({
      instantiationMode: "adapt-existing",
      startVfs,
      startHistoryMdText: "# History from slice",
      startLicenseText: "License from slice",
    });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    const history = await screen.findByTestId("html-file-history-md");
    const license = screen.getByTestId("html-file-license-md");
    expect((history as HTMLButtonElement).disabled).toBe(false);
    expect((license as HTMLButtonElement).disabled).toBe(false);
    expect(history.textContent).not.toContain("absent");
    expect(license.textContent).not.toContain("absent");
    fireEvent.click(history);
    expect(previewDoc()).toContain("History from slice");
    fireEvent.click(license);
    expect(previewDoc()).toContain("License from slice");
  });

  it("on the open track with nothing carried, history and license preview the generated render", async () => {
    const startVfs = createVirtualFS();
    startVfs.set("source/t.kps", "<Package></Package>", false);
    seedStore({ instantiationMode: "adapt-existing", startVfs });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    const history = await screen.findByTestId("html-file-history-md");
    const license = screen.getByTestId("html-file-license-md");
    expect((history as HTMLButtonElement).disabled).toBe(false);
    expect((license as HTMLButtonElement).disabled).toBe(false);
    expect(history.textContent).not.toContain("absent");
    expect(license.textContent).not.toContain("absent");
    fireEvent.click(history);
    expect(previewDoc()).toContain("Updated via keyboard-studio.");
    fireEvent.click(license);
    expect(previewDoc()).toContain("MIT License");
  });
});

describe("HtmlEditor on a keyboard opened for update", () => {
  const WELCOME = "<!DOCTYPE html><html><head><title>T</title></head><body><p>FILE-WELCOME</p></body></html>";
  beforeEach(() => {
    host.apply = (c) => Promise.resolve(applyOpenChange(c as Parameters<typeof applyOpenChange>[0]));
    useWorkingCopyStore.getState().reset();
    useOpenUndoStore.getState().replace([]);
    const startVfs = createVirtualFS();
    startVfs.set("source/t.kps", "<Package></Package>", false);
    startVfs.set("source/welcome/welcome.htm", WELCOME, false);
    startVfs.set("README.md", "FILE-README", false);
    seedStore({ instantiationMode: "adapt-existing", startVfs });
  });
  afterEach(cleanup);

  it("switching file writes the page into its file, one undo record, nothing held in the store", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    await waitFor(() => expect(useOpenUndoStore.getState().records).toHaveLength(1));
    const wc = useWorkingCopyStore.getState();
    expect(readVfsText(wc.startVfs!, "source/welcome/welcome.htm")).toContain("Edited paragraph.");
    expect(wc.authoredWelcomeHtm).toBeNull();
    const records = useOpenUndoStore.getState().records;
    expect(records).toHaveLength(1);
    expect(records[0]?.labelKey).toBe("docs-edit");
  });

  it("an undo restores the file and the editor reseeds from it", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    await waitFor(() => expect(useOpenUndoStore.getState().records).toHaveLength(1));
    fireEvent.click(screen.getByTestId("html-file-welcome-htm"));
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Edited paragraph.");
    act(() => {
      expect(undoLastOpenApply().ok).toBe(true);
    });
    const seed = (await screen.findByTestId("rich-seed")).textContent ?? "";
    expect(seed).toContain("FILE-WELCOME");
    expect(seed).not.toContain("Edited paragraph.");
  });

  it("Continue writes the page, records only its name, and holds no text", async () => {
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-continue"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const wc = useWorkingCopyStore.getState();
    expect(readVfsText(wc.startVfs!, "source/welcome/welcome.htm")).toContain("Edited paragraph.");
    expect(wc.authoredWelcomeHtm).toBeNull();
  });

  it("a refused write keeps the text and Continue does not complete", async () => {
    host.apply = () => Promise.resolve({ status: "failed", reason: "no" });
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-continue"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onComplete).not.toHaveBeenCalled();
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, "source/welcome/welcome.htm")).toBe(WELCOME);
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Edited paragraph.");
  });

  it("a page with no file is not editable: a note, no editor, nothing written", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect(screen.getByTestId("html-file-readme-htm").hasAttribute("disabled")).toBe(true);
    expect((screen.getByTestId("html-file-help-php") as HTMLButtonElement).disabled).toBe(true);
    // The welcome page is selected and present: no note. Remove it and the note shows.
    expect(screen.queryByTestId("html-absent-note")).toBeNull();
    cleanup();
    const noWelcome = createVirtualFS();
    noWelcome.set("source/t.kps", "<Package></Package>", false);
    noWelcome.set("README.md", "FILE-README", false);
    seedStore({ instantiationMode: "adapt-existing", startVfs: noWelcome, startWelcomeHtmText: "<p>slice</p>" });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    // The note points at the suggested fix that creates the page; nothing is editable until then.
    expect((await screen.findByTestId("html-absent-note")).textContent).toMatch(/suggested fix.*creates it/);
    expect(screen.queryByTestId("rich-seed")).toBeNull();
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("a flat-convention welcome page seeds from, and writes to, the flat file", async () => {
    const flat = createVirtualFS();
    flat.set("source/t.kps", "<Package></Package>", false);
    flat.set("source/welcome.htm", WELCOME.replace("FILE-WELCOME", "FLAT-WELCOME"), false);
    seedStore({ instantiationMode: "adapt-existing", startVfs: flat, startWelcomeConvention: "flat" });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("FLAT-WELCOME");
    fireEvent.click(screen.getByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-history-md"));
    await waitFor(() => expect(useOpenUndoStore.getState().records).toHaveLength(1));
    const vfs = useWorkingCopyStore.getState().startVfs!;
    expect(readVfsText(vfs, "source/welcome.htm")).toContain("Edited paragraph.");
    expect(vfs.get("source/welcome/welcome.htm")).toBeUndefined();
  });

  it("an edit goes stale when the file changes underneath it, with a note naming the page", async () => {
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    act(() => {
      useWorkingCopyStore.getState().replaceStartingPointFiles({ "source/welcome/welcome.htm": WELCOME.replace("FILE-WELCOME", "CHANGED-UNDER") });
    });
    const seed = (await screen.findByTestId("rich-seed")).textContent ?? "";
    expect(seed).toContain("CHANGED-UNDER");
    expect(seed).not.toContain("Edited paragraph.");
    await waitFor(() => expect(screen.getByTestId("html-dropped-note").textContent).toContain("Welcome page"));
    // Nothing is written from the dropped edit.
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    expect(useOpenUndoStore.getState().records).toHaveLength(0);
  });

  it("no dropped-edit note after a good write on a switch or on Continue", async () => {
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    await waitFor(() => expect(useOpenUndoStore.getState().records).toHaveLength(1));
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("html-dropped-note").textContent).toBe("");
    fireEvent.click(screen.getByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-continue"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(screen.getByTestId("html-dropped-note").textContent).toBe("");
  });

  it("a refused write on a file switch keeps the text, marks the page unsaved, and shows it on return", async () => {
    host.apply = () => Promise.resolve({ status: "failed", reason: "no" });
    render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    await waitFor(() => expect(screen.getByTestId("html-file-welcome-htm").textContent).toContain("unsaved"));
    fireEvent.click(screen.getByTestId("html-file-welcome-htm"));
    expect((await screen.findByTestId("rich-seed")).textContent).toContain("Edited paragraph.");
    expect(readVfsText(useWorkingCopyStore.getState().startVfs!, "source/welcome/welcome.htm")).toBe(WELCOME);
  });

  it("Continue right after a switch waits for that write and does not send the page twice", async () => {
    let inFlight = false;
    const applied: unknown[] = [];
    host.apply = async (c) => {
      // The host refuses a second apply while one is waiting.
      if (inFlight) return { status: "failed", reason: "busy" };
      inFlight = true;
      applied.push(c);
      await Promise.resolve();
      await Promise.resolve();
      const r = applyOpenChange(c as Parameters<typeof applyOpenChange>[0]);
      inFlight = false;
      return r;
    };
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    fireEvent.click(screen.getByTestId("html-continue"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(applied).toHaveLength(1);
    expect(useOpenUndoStore.getState().records).toHaveLength(1);
    expect(screen.getByTestId("html-dropped-note").textContent).toBe("");
  });

  it("an edit typed while its page is being written is kept, rebased, and written by Continue", async () => {
    let release: () => void = () => undefined;
    let first = true;
    host.apply = async (c) => {
      if (first) {
        first = false;
        await new Promise<void>((r) => {
          release = r;
        });
      }
      return applyOpenChange(c as Parameters<typeof applyOpenChange>[0]);
    };
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-file-readme-md"));
    await waitFor(() => expect(first).toBe(false));
    // Back on the welcome page while its write is pending, the author types again.
    fireEvent.click(screen.getByTestId("html-file-welcome-htm"));
    fireEvent.click(await screen.findByTestId("code-apply").catch(() => screen.getByTestId("rich-edit")));
    await act(async () => {
      release();
      await Promise.resolve();
    });
    await waitFor(() => expect(useOpenUndoStore.getState().records.length).toBeGreaterThanOrEqual(1));
    expect(screen.getByTestId("html-dropped-note").textContent).toBe("");
    fireEvent.click(screen.getByTestId("html-continue"));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    const file = readVfsText(useWorkingCopyStore.getState().startVfs!, "source/welcome/welcome.htm")!;
    expect(file.match(/Edited paragraph\./g)?.length).toBe(2);
  });

  it("a host that throws is a refusal: Continue stays and the text is kept", async () => {
    host.apply = () => Promise.reject(new Error("boom"));
    const onComplete = vi.fn();
    render(<HtmlEditor onComplete={onComplete} onBack={() => undefined} />, { withStepNav: true });
    fireEvent.click(await screen.findByTestId("rich-edit"));
    fireEvent.click(screen.getByTestId("html-continue"));
    await waitFor(() => expect(screen.getByTestId("html-file-welcome-htm").textContent).toContain("unsaved"));
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("the unsaved marker shows on the tab row of a narrow viewport", async () => {
    Object.defineProperty(window, "innerWidth", { value: 400, configurable: true });
    try {
      host.apply = () => Promise.resolve({ status: "failed", reason: "no" });
      render(<HtmlEditor onComplete={() => undefined} onBack={() => undefined} />, { withStepNav: true });
      expect(screen.getByRole("tablist")).toBeTruthy();
      fireEvent.click(await screen.findByTestId("rich-edit"));
      fireEvent.click(screen.getByTestId("html-file-readme-md"));
      await waitFor(() => expect(screen.getByTestId("html-file-welcome-htm").textContent).toContain("unsaved"));
    } finally {
      Object.defineProperty(window, "innerWidth", { value: 1024, configurable: true });
      window.dispatchEvent(new Event("resize"));
    }
  });
});
