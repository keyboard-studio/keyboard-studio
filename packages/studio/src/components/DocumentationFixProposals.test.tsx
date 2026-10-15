// DocumentationFixProposals — issue #1908: the adapt track's deterministic
// doc fixes as author-facing proposals at the docs step. Pins: rows appear
// only on an adaptation with inherited pages and live findings; accepting /
// declining records the answer in the working copy; undo clears it; the
// copy track never sees a proposal.

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { screen, fireEvent, cleanup, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { DocumentationFixProposals } from "./DocumentationFixProposals.tsx";

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
  useWorkingCopyStore.getState().reset();
});

afterEach(() => {
  cleanup();
});

describe("DocumentationFixProposals (issue #1908)", () => {
  it("offers the pagename and body-sync proposals on an adaptation, naming current and expected values", () => {
    instantiateAdaptation();
    render(<DocumentationFixProposals />);

    const pagename = screen.getByTestId("doc-fix-pagename");
    expect(pagename.textContent).toContain("Cameroon QWERTY (SIL) Keyboard Help");
    expect(pagename.textContent).toContain("US English (Basic) Keyboard Help");

    const bodySync = screen.getByTestId("doc-fix-body-sync");
    // The summary diff names the divergence (the copyright line).
    expect(bodySync.textContent).toContain("Copyright");
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

  it("records the author's canonical-side choice for the body sync", () => {
    instantiateAdaptation();
    render(<DocumentationFixProposals />);
    const bodySync = screen.getByTestId("doc-fix-body-sync");
    fireEvent.click(within(bodySync).getByText("Use the help page's text"));
    fireEvent.click(within(bodySync).getByText("Make both pages match"));
    expect(useWorkingCopyStore.getState().docFixProposals).toEqual({ bodySync: "help" });
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
