// DocumentationFixProposals — issue #1908: the adapt track's deterministic
// doc fixes as author-facing proposals at the docs step. Pins: rows appear
// only on an adaptation with inherited pages and live findings; accepting /
// declining records the answer in the working copy; undo clears it; the
// copy track never sees a proposal.
//
// Issue #2530: the body-parity choice (11.9) is NOT a row here any more —
// it is the pf_body_parity flow question. These tests pin that no body-sync
// row renders even while the 11.9 finding is live, and that a recorded
// legacy bodySync answer renders no row either.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, fireEvent, cleanup, within, renderHook } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useDocumentationFindings } from "../hooks/useDocumentationFindings.ts";
import { DocumentationFixProposals } from "./DocumentationFixProposals.tsx";
import { applyOpenChange, undoLastOpenApply } from "../lib/openApply.ts";
import { clearOpenSession } from "../stores/openUndoStore.ts";

const CAMEROON_HELP =
  "<?php\n  $pagename = 'Cameroon QWERTY (SIL) Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Copyright SIL Cameroon</p></body></html>";
const CAMEROON_WELCOME = "<html><body><p>Copyright 2018-2022 SIL Cameroon</p></body></html>";

function vfs() {
  return createVirtualFS([
    { path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false },
  ]);
}

function instantiateAdaptation() {
  const ir = makeTestIR([]);
  ir.header.version = "1.0";
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: vfs(), ir });
  const wc = useWorkingCopyStore.getState();
  wc.setStartWelcomeHtmText(CAMEROON_WELCOME);
  wc.setStartHelpPhpText(CAMEROON_HELP);
}

beforeEach(() => {
  clearOpenSession();
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("DocumentationFixProposals (issue #1908)", () => {
  it("offers the pagename proposal on an adaptation, naming current and expected values", () => {
    instantiateAdaptation();
    render(<DocumentationFixProposals />);

    const pagename = screen.getByTestId("doc-fix-pagename");
    expect(pagename.textContent).toContain("Cameroon QWERTY (SIL) Keyboard Help");
    expect(pagename.textContent).toContain("US English (Basic) Keyboard Help");

    // Issue #2530: the bodies differ (a live 11.9 finding), but the
    // body-parity choice is a flow question now — no row renders for it.
    expect(screen.queryByTestId("doc-fix-body-sync")).toBeNull();
  });

  it("records acceptance, and undo clears the record", () => {
    instantiateAdaptation();
    render(<DocumentationFixProposals />);
    fireEvent.click(within(screen.getByTestId("doc-fix-pagename")).getByText("Use the expected name"));
    expect(useWorkingCopyStore.getState().docFixProposals).toEqual({ pagename: "accepted" });

    fireEvent.click(within(screen.getByTestId("doc-fix-pagename")).getByText("Undo"));
    expect(useWorkingCopyStore.getState().docFixProposals).toBeNull();
  });

  it("records a decline and lets the author change the answer", () => {
    instantiateAdaptation();
    render(<DocumentationFixProposals />);
    fireEvent.click(within(screen.getByTestId("doc-fix-pagename")).getByText("Decline"));
    expect(useWorkingCopyStore.getState().docFixProposals).toEqual({ pagename: "declined" });

    fireEvent.click(within(screen.getByTestId("doc-fix-pagename")).getByText("Change answer"));
    expect(useWorkingCopyStore.getState().docFixProposals).toBeNull();
  });

  it("renders no body-sync row for a recorded legacy bodySync answer", () => {
    instantiateAdaptation();
    // A persisted draft's answer: the flow question owns it now, and the
    // row must not come back to re-ask it.
    useWorkingCopyStore.getState().setDocFixProposals({ bodySync: "help" });
    render(<DocumentationFixProposals />);
    expect(screen.queryByTestId("doc-fix-body-sync")).toBeNull();
    // The pagename row is unaffected by the legacy answer.
    expect(screen.getByTestId("doc-fix-pagename")).not.toBeNull();
  });

  it("offers the image-width proposal when kb.css rides only in the startDocCssTexts slice, naming its path", () => {
    instantiateAdaptation();
    const wc = useWorkingCopyStore.getState();
    const helpWithImage =
      "<?php\n  $pagename = 'Cameroon QWERTY (SIL) Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Copyright SIL Cameroon</p><p><img src=\"globe.png\"></p></body></html>";
    wc.setStartHelpPhpText(helpWithImage);
    // The loader's real adapt path: kb.css is fetch-don't-write, carried by
    // the slice and never present in the start VFS.
    wc.setStartDocCssTexts([{ path: "source/help/kb.css", text: ".full { width: 98%; }" }]);
    render(<DocumentationFixProposals />);

    const row = screen.getByTestId("doc-fix-image-width");
    expect(row.textContent).toContain("source/help/kb.css");
    fireEvent.click(within(row).getByText("Add the width rule"));
    expect(useWorkingCopyStore.getState().docFixProposals).toEqual({ imageWidth: "accepted" });
  });

  function openWithWidthFinding(): void {
    instantiateAdaptation();
    const wc = useWorkingCopyStore.getState();
    wc.startVfs!.set(`source/${wc.startKeyboard!.id}.kps`, "<Package/>", false);
    wc.setStartHelpPhpText(
      "<?php\n  $pagename = 'Cameroon QWERTY (SIL) Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p><img src=\"globe.png\"></p></body></html>",
    );
    wc.setStartDocCssTexts([{ path: "source/help/kb.css", text: ".full { width: 98%; }" }]);
  }
  const kbCss = () => useWorkingCopyStore.getState().startVfs!.get("source/help/kb.css")?.content;

  it("on a keyboard opened for update, accepting the width fix writes kb.css; the row's Undo takes it back", async () => {
    openWithWidthFinding();
    render(<DocumentationFixProposals />);
    fireEvent.click(within(screen.getByTestId("doc-fix-image-width")).getByText("Add the width rule"));
    expect(await screen.findByText(/Applied/)).toBeTruthy();
    expect(kbCss()).toBe(".full { width: 98%; }\nimg { max-width: 100%; }\n");
    fireEvent.click(within(screen.getByTestId("doc-fix-image-width")).getByText("Undo"));
    expect(kbCss()).toBeUndefined();
    expect(useWorkingCopyStore.getState().docFixProposals).toBeNull();
  });

  it("on Open the footer Undo brings the finding and the offer back (the row reads the file, not the record)", async () => {
    openWithWidthFinding();
    render(<DocumentationFixProposals />);
    fireEvent.click(within(screen.getByTestId("doc-fix-image-width")).getByText("Add the width rule"));
    await screen.findByText(/Applied/);
    expect(undoLastOpenApply().ok).toBe(true);
    const row = await screen.findByTestId("doc-fix-image-width");
    expect(within(row).getByText("Add the width rule")).toBeTruthy();
    // The finding is judged on the file again, so it is back even though the answer is "accepted".
    const found = renderHook(() => useDocumentationFindings());
    expect(found.result.current.some((f) => f.code === "KM_LINT_PHP_OSK_IMAGE_UNCONSTRAINED")).toBe(true);
    expect(within(row).queryByText(/Applied/)).toBeNull();
    expect(useWorkingCopyStore.getState().docFixProposals).toEqual({ imageWidth: "accepted" });
  });

  it("on Open a width fix that was not applied records no answer", async () => {
    openWithWidthFinding();
    const spy = vi
      .spyOn(useWorkingCopyStore.getState(), "replaceStartingPointFiles")
      .mockReturnValue({ ok: false, error: "disk" });
    render(<DocumentationFixProposals />);
    fireEvent.click(within(screen.getByTestId("doc-fix-image-width")).getByText("Add the width rule"));
    await new Promise((r) => setTimeout(r, 0));
    spy.mockRestore();
    expect(useWorkingCopyStore.getState().docFixProposals).toBeNull();
    expect(kbCss()).toBeUndefined();
  });

  it("on Open, once a later change is made the row's Undo points at the footer and clears nothing", async () => {
    openWithWidthFinding();
    render(<DocumentationFixProposals />);
    fireEvent.click(within(screen.getByTestId("doc-fix-image-width")).getByText("Add the width rule"));
    await screen.findByText(/Applied/);
    const wc = useWorkingCopyStore.getState();
    expect(applyOpenChange({ kind: "files", files: { "source/loose.txt": "x" }, label: "Other" }).status).toBe("applied");
    expect(wc.startVfs).not.toBeNull();
    const row = await screen.findByTestId("doc-fix-image-width");
    expect(within(row).queryByText("Undo")).toBeNull();
    expect(within(row).getByText(/Use Undo in the footer/)).toBeTruthy();
    expect(kbCss()).toContain("max-width");
  });

  it("renders nothing on the copy track, even with the same store texts set", () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromStart(basicKbdus, { vfs: vfs(), ir });
    const wc = useWorkingCopyStore.getState();
    wc.setStartWelcomeHtmText(CAMEROON_WELCOME);
    wc.setStartHelpPhpText(CAMEROON_HELP);
    const { container } = render(<DocumentationFixProposals />);
    expect(container.textContent).toBe("");
  });

  it("renders nothing on an adaptation with no live findings and no recorded answers", () => {
    const ir = makeTestIR([]);
    ir.header.version = "1.0";
    useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs: vfs(), ir });
    const wc = useWorkingCopyStore.getState();
    const goodHelp =
      "<?php\n  $pagename = 'US English (Basic) Keyboard Help';\n  $pagetitle = $pagename;\n  require_once('header.php');\n?>\n<html><body><p>Same body.</p></body></html>";
    wc.setStartWelcomeHtmText("<html><body><p>Same body.</p></body></html>");
    wc.setStartHelpPhpText(goodHelp);
    const { container } = render(<DocumentationFixProposals />);
    expect(screen.queryByTestId("doc-fix-pagename")).toBeNull();
    expect(screen.queryByTestId("doc-fix-body-sync")).toBeNull();
    expect(container.querySelector("section")).toBeNull();
  });
});
