// DocumentationChecklist — spec 076 US3 (T029): six rows, tier labels, the
// placeholder marker, "Go to" routing through the back-style jump (never
// `advance()`), per-row warnings, and the layout-chart preference control
// (US6 T053) on the welcome row.

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { screen, fireEvent, cleanup, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { basicKbdus, makeTestIR } from "@keyboard-studio/contracts/fixtures";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

const { jumpMock, navigateMock } = vi.hoisted(() => ({
  jumpMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock("../lib/jumpToLocation.ts", () => ({
  jumpToLocation: jumpMock,
}));

vi.mock("../lib/navigate.ts", () => ({
  navigateTo: navigateMock,
}));

import { DocumentationChecklist } from "./DocumentationChecklist.tsx";

function instantiateTrackOne() {
  const vfs = createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }]);
  useWorkingCopyStore.getState().instantiateFromBase(basicKbdus, { vfs, ir: makeTestIR([]) });
}

function instantiateAdaptation() {
  const vfs = createVirtualFS([{ path: "source/basic_kbdus.kmn", content: "c test\n", isBinary: false }]);
  useWorkingCopyStore.getState().instantiateFromExisting(basicKbdus, { vfs, ir: makeTestIR([]) });
}

const MEMBERS = ["readme-md", "history-md", "license-md", "readme-htm", "welcome-htm", "help-php"] as const;

beforeEach(() => {
  useWorkingCopyStore.getState().reset();
  jumpMock.mockReset();
  jumpMock.mockReturnValue({ kind: "arrived", at: { route: "survey", step: "help" } });
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("DocumentationChecklist — rows", () => {
  it("renders exactly six rows in member order, each with its projected path", () => {
    instantiateTrackOne();
    render(<DocumentationChecklist />);
    const list = screen.getByRole("list", { name: /documentation files/i });
    const rows = within(list).getAllByRole("listitem").filter((li) => li.dataset["tier"] !== undefined);
    expect(rows.map((r) => r.dataset["testid"])).toEqual(MEMBERS.map((m) => `doc-member-${m}`));
    expect(screen.getByText("source/welcome/welcome.htm")).toBeTruthy();
    expect(screen.getByText("source/help/basic_kbdus.php")).toBeTruthy();
  });

  it("shows derived + placeholder on every prose row before Phase F, and derived without a marker on LICENSE", () => {
    instantiateTrackOne();
    render(<DocumentationChecklist />);
    for (const m of ["readme-md", "history-md", "readme-htm", "welcome-htm", "help-php"] as const) {
      const row = screen.getByTestId(`doc-member-${m}`);
      expect(row.dataset["tier"]).toBe("derived");
      expect(within(row).getByText("placeholder")).toBeTruthy();
    }
    const license = screen.getByTestId("doc-member-license-md");
    expect(license.dataset["tier"]).toBe("derived");
    expect(within(license).queryByText("placeholder")).toBeNull();
    expect(screen.getByText(/5 of six files still ship placeholder text/i)).toBeTruthy();
  });

  it("flips the description-fed rows to authored once helpDocs is answered", () => {
    instantiateTrackOne();
    useWorkingCopyStore.getState().setHelpDocs({ description: "A keyboard for testing.", usageTips: [] });
    render(<DocumentationChecklist />);
    const welcome = screen.getByTestId("doc-member-welcome-htm");
    expect(welcome.dataset["tier"]).toBe("authored");
    expect(within(welcome).queryByText("placeholder")).toBeNull();
    expect(within(welcome).getByText("authored")).toBeTruthy();
    // HISTORY is still governed by its own proposal.
    expect(screen.getByTestId("doc-member-history-md").dataset["tier"]).toBe("derived");
  });

  it("shows inherited on an adaptation whose base ships the member (FR-006), never on a copy (FR-007)", () => {
    instantiateAdaptation();
    useWorkingCopyStore.getState().setBaseWelcomeHtmText("<html><body><p>Base welcome.</p></body></html>");
    const { unmount } = render(<DocumentationChecklist />);
    expect(screen.getByTestId("doc-member-welcome-htm").dataset["tier"]).toBe("inherited");
    unmount();

    useWorkingCopyStore.getState().reset();
    instantiateTrackOne();
    useWorkingCopyStore.getState().setBaseWelcomeHtmText("<html><body><p>Base welcome.</p></body></html>");
    render(<DocumentationChecklist />);
    expect(screen.getByTestId("doc-member-welcome-htm").dataset["tier"]).toBe("derived");
  });

  it("marks HISTORY authored once the proposal is confirmed, and placeholder again when dismissed", () => {
    instantiateTrackOne();
    const proposal = { version: "1.0", dateIso: "2026-09-12", bullets: ["Initial release."] };
    useWorkingCopyStore.getState().setHistoryEntryState({ status: "confirmed", proposal, editedBullets: null });
    const { rerender } = render(<DocumentationChecklist />);
    let row = screen.getByTestId("doc-member-history-md");
    expect(row.dataset["tier"]).toBe("authored");
    expect(within(row).queryByText("placeholder")).toBeNull();

    useWorkingCopyStore.getState().setHistoryEntryState({ status: "dismissed", proposal, editedBullets: null });
    rerender(<DocumentationChecklist />);
    row = screen.getByTestId("doc-member-history-md");
    expect(within(row).getByText("placeholder")).toBeTruthy();
  });

  it("annotates the welcome row with the base page's missing images", () => {
    instantiateAdaptation();
    useWorkingCopyStore
      .getState()
      .setBaseWelcomeHtmText('<html><body><p>Base.</p><img src="desktop.png"><img src="phone.png"></body></html>');
    useWorkingCopyStore.getState().setBaseWelcomeImages([{ path: "welcome/desktop.png", bytes: new Uint8Array([1]) }]);
    render(<DocumentationChecklist />);
    const row = screen.getByTestId("doc-member-welcome-htm");
    expect(within(row).getByText(/missing inherited image: phone.png/)).toBeTruthy();
    expect(within(row).queryByText(/missing inherited image: desktop.png/)).toBeNull();
  });
});

describe("DocumentationChecklist — Go to (never advance)", () => {
  it("routes a placeholder row through jumpToLocation to the Phase F question, never through advance()", () => {
    instantiateTrackOne();
    const advanceSpy = vi.spyOn(useSurveySessionStore.getState(), "advance");
    render(<DocumentationChecklist />);
    const row = screen.getByTestId("doc-member-history-md");
    fireEvent.click(within(row).getByRole("button", { name: /go to help & tips/i }));
    expect(jumpMock).toHaveBeenCalledWith({ route: "survey", step: "help", question: "pf_history_entry" });
    expect(advanceSpy).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
    advanceSpy.mockRestore();
  });

  it("falls back to the plain survey route when the jump is refused", () => {
    instantiateTrackOne();
    jumpMock.mockReturnValue({ kind: "refused", reason: { kind: "beyond-gate" } });
    render(<DocumentationChecklist />);
    const row = screen.getByTestId("doc-member-welcome-htm");
    fireEvent.click(within(row).getByRole("button", { name: /go to help & tips/i }));
    expect(jumpMock).toHaveBeenCalledWith({ route: "survey", step: "help", question: "pf_welcome_paragraph" });
    expect(navigateMock).toHaveBeenCalledWith("survey");
  });

  it("offers no Go to on a row that is not a placeholder", () => {
    instantiateTrackOne();
    render(<DocumentationChecklist />);
    const license = screen.getByTestId("doc-member-license-md");
    expect(within(license).queryByRole("button")).toBeNull();
  });
});

describe("DocumentationChecklist — layout-chart preference (FR-015)", () => {
  it("renders the control only when the base ships welcome images, defaulting to keep", () => {
    instantiateTrackOne();
    const { unmount } = render(<DocumentationChecklist />);
    expect(screen.queryByRole("radiogroup", { name: /layout images/i })).toBeNull();
    unmount();

    useWorkingCopyStore.getState().setBaseWelcomeImages([{ path: "welcome/desktop.png", bytes: new Uint8Array([1]) }]);
    render(<DocumentationChecklist />);
    const group = screen.getByRole("radiogroup", { name: /layout images/i });
    expect((within(group).getByLabelText(/keep base images/i) as HTMLInputElement).checked).toBe(true);
    expect((within(group).getByLabelText(/regenerate layout charts/i) as HTMLInputElement).checked).toBe(false);
  });

  it("writes setChartPreference — a store write, not a gate", () => {
    instantiateTrackOne();
    useWorkingCopyStore.getState().setBaseWelcomeImages([{ path: "welcome/desktop.png", bytes: new Uint8Array([1]) }]);
    render(<DocumentationChecklist />);
    fireEvent.click(screen.getByLabelText(/regenerate layout charts/i));
    expect(useWorkingCopyStore.getState().chartPreference).toBe("regenerate");
    fireEvent.click(screen.getByLabelText(/keep base images/i));
    expect(useWorkingCopyStore.getState().chartPreference).toBe("keep-base-images");
  });
});

describe("DocumentationChecklist — disclosure", () => {
  it("is open by default (SC-006) and collapses on the summary toggle", () => {
    instantiateTrackOne();
    render(<DocumentationChecklist />);
    const toggle = screen.getByRole("button", { name: /documentation: 5 of six files/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("list", { name: /documentation files/i })).toBeTruthy();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list", { name: /documentation files/i })).toBeNull();
  });
});
