// DocumentationFindingsSummary — the collapsed documentation-notes row.
// Collapsed by default (one row, no push-down); expands to message + hint
// rows, with upstream findings muted under their own subheading. The toggle
// is a native button announced through the surrounding live region — no new
// timer, no second announcer.

import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../test/renderWithI18n.tsx";
import type { LintFinding } from "@keyboard-studio/contracts";
import { DocumentationFindingsSummary } from "./DocumentationFindingsSummary.tsx";

afterEach(cleanup);

function finding(overrides: Partial<LintFinding> = {}): LintFinding {
  return {
    code: "KM_LINT_README_MISSING",
    severity: "warning",
    layer: "C",
    message: "README is missing a version line",
    ...overrides,
  };
}

describe("DocumentationFindingsSummary", () => {
  it("renders nothing for an empty findings list", () => {
    const { container } = render(<DocumentationFindingsSummary findings={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("starts collapsed with a neutral pluralised count label", () => {
    render(
      <DocumentationFindingsSummary
        findings={[
          finding({ message: "first" }),
          finding({ code: "KM_LINT_WELCOME_STALE", message: "second", hint: "a hint" }),
        ]}
      />,
    );
    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    expect(toggle.textContent).toContain("2 documentation notes");
    expect(toggle.textContent).toContain("Show notes");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // Messages stay hidden until the author expands the row.
    expect(screen.queryByText("first")).toBeNull();
    expect(screen.queryByText("second")).toBeNull();
  });

  it("uses the singular form for one finding", () => {
    render(<DocumentationFindingsSummary findings={[finding()]} />);
    expect(
      screen.getByTestId("doc-findings-summary-toggle").textContent,
    ).toContain("1 documentation note");
  });

  it("expands to show message and hint rows on toggle", () => {
    render(
      <DocumentationFindingsSummary
        findings={[finding({ message: "the message", hint: "the hint" })]}
      />,
    );
    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    expect(toggle.tagName).toBe("BUTTON");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toContain("Hide notes");
    const regionId = toggle.getAttribute("aria-controls");
    expect(regionId).not.toBeNull();
    expect(document.getElementById(regionId!)).not.toBeNull();
    expect(screen.getByText("the message")).toBeTruthy();
    expect(screen.getByText("the hint")).toBeTruthy();
    // Collapse again.
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("the message")).toBeNull();
  });

  it("groups upstream findings muted under the inherited subheading", () => {
    render(
      <DocumentationFindingsSummary
        findings={[
          finding({ message: "authored note" }),
          finding({
            code: "KM_LINT_HELP_DRIFT",
            message: "inherited note",
            hint: "inherited hint",
            origin: "upstream",
          }),
        ]}
      />,
    );
    fireEvent.click(screen.getByTestId("doc-findings-summary-toggle"));
    // Authored note renders above, ungrouped.
    expect(screen.getByText("authored note")).toBeTruthy();
    const group = screen.getByTestId("doc-findings-summary-upstream-group");
    expect(
      group.textContent?.includes("Inherited from the base keyboard"),
    ).toBe(true);
    expect(group.textContent?.includes("inherited note")).toBe(true);
    expect(group.textContent?.includes("inherited hint")).toBe(true);
    expect(group.style.opacity).toBe("0.5");
    // Authored findings never land inside the inherited group.
    expect(group.textContent?.includes("authored note")).toBe(false);
  });

  it("renders only the inherited group when every finding is upstream", () => {
    render(
      <DocumentationFindingsSummary
        findings={[
          finding({
            message: "upstream one",
            origin: "upstream",
          }),
          finding({
            code: "KM_LINT_HELP_DRIFT",
            message: "upstream two",
            origin: "upstream",
          }),
        ]}
      />,
    );
    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    expect(toggle.textContent).toContain("2 documentation notes");
    fireEvent.click(toggle);
    const group = screen.getByTestId("doc-findings-summary-upstream-group");
    expect(group.textContent?.includes("upstream one")).toBe(true);
    expect(group.textContent?.includes("upstream two")).toBe(true);
    expect(group.style.opacity).toBe("0.5");
    // Nothing ungrouped above it: the region's only child is the group.
    const regionId = toggle.getAttribute("aria-controls");
    expect(regionId).not.toBeNull();
    const region = document.getElementById(regionId!);
    expect(region).not.toBeNull();
    expect(region!.children).toHaveLength(1);
    expect(region!.children[0]).toBe(group);
  });

  it("omits the inherited group when there are no upstream findings", () => {
    render(<DocumentationFindingsSummary findings={[finding()]} />);
    fireEvent.click(screen.getByTestId("doc-findings-summary-toggle"));
    expect(
      screen.queryByTestId("doc-findings-summary-upstream-group"),
    ).toBeNull();
  });

  it("omits the hint row when a finding has no hint", () => {
    render(
      <DocumentationFindingsSummary
        findings={[finding({ message: "no hint note" })]}
      />,
    );
    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    fireEvent.click(toggle);
    const regionId = toggle.getAttribute("aria-controls");
    expect(regionId).not.toBeNull();
    const region = document.getElementById(regionId!);
    expect(region).not.toBeNull();
    expect(screen.getByText("no hint note")).toBeTruthy();
    // Exactly one paragraph: the message; no hint row rendered.
    expect(region!.querySelectorAll("p")).toHaveLength(1);
  });

  it("toggles via keyboard: Enter opens, Space closes", async () => {
    render(
      <DocumentationFindingsSummary
        findings={[finding({ message: "keyboard note" })]}
      />,
    );
    const toggle = screen.getByTestId("doc-findings-summary-toggle");
    const user = userEvent.setup();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("keyboard note")).toBeTruthy();
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("keyboard note")).toBeNull();
  });

  describe("narrow viewport", () => {
    afterEach(() => {
      // Restore the default jsdom width so later tests are unaffected.
      Object.defineProperty(window, "innerWidth", {
        value: 1024,
        configurable: true,
        writable: true,
      });
    });

    function setNarrow(): void {
      Object.defineProperty(window, "innerWidth", {
        value: 390,
        configurable: true,
        writable: true,
      });
      window.dispatchEvent(new window.Event("resize"));
    }

    it("renders the identical collapsed row at 390px and still toggles", () => {
      const props = {
        findings: [
          finding({ message: "narrow note one" }),
          finding({ message: "narrow note two" }),
        ],
      };
      // Wide baseline label.
      const { unmount } = render(<DocumentationFindingsSummary {...props} />);
      const wideLabel = screen.getByTestId("doc-findings-summary-toggle")
        .textContent;
      unmount();
      // Narrow: the summary renders byte-identical, collapsed, and still
      // expands/collapses on click (acceptance criterion 1 at 390px).
      setNarrow();
      render(<DocumentationFindingsSummary {...props} />);
      const narrowToggle = screen.getByTestId("doc-findings-summary-toggle");
      expect(narrowToggle.textContent).toBe(wideLabel);
      expect(narrowToggle.textContent).toContain("2 documentation notes");
      expect(narrowToggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText("narrow note one")).toBeNull();
      fireEvent.click(narrowToggle);
      expect(narrowToggle.getAttribute("aria-expanded")).toBe("true");
      expect(screen.getByText("narrow note one")).toBeTruthy();
      fireEvent.click(narrowToggle);
      expect(narrowToggle.getAttribute("aria-expanded")).toBe("false");
      expect(screen.queryByText("narrow note one")).toBeNull();
    });
  });
});
