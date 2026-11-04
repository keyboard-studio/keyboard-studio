// LintSummary groupByCode (spec 108 FR-018): one row per code with its translated title, count
// and severity, expanding to the individual chips, each with its line.

import { describe, it, expect, afterEach } from "vitest";
import { screen, within, cleanup } from "@testing-library/react";
import type { LintCode, LintFinding } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import { LintSummary } from "./LintSummary.tsx";

afterEach(cleanup);

const f = (code: string, line: number | null, severity: LintFinding["severity"] = "warning"): LintFinding => ({
  code: code as LintCode,
  severity,
  layer: "C",
  message: `${code} message`,
  ...(line === null ? {} : { location: { file: "source/kb.kmn", line } }),
});

describe("LintSummary groupByCode", () => {
  const findings = [
    ...Array.from({ length: 300 }, (_, i) => f("KM_LINT_LDML_OPTION_STATE", i + 1)),
    f("KM_LINT_LDML_CALL", 5),
    f("KM_LINT_LDML_CALL", null, "hint"),
  ];

  it("renders one row per code with its title, count and severity", () => {
    render(<LintSummary findings={findings} groupByCode />);
    const rows = screen.getAllByTestId("lint-summary-group");
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText("Option state is fixed at export")).toBeTruthy();
    expect(within(rows[0]!).getByText("300 warnings")).toBeTruthy();
    expect(within(rows[1]!).getByText("call() is not exported")).toBeTruthy();
    // The group takes its most severe finding's severity.
    expect(within(rows[1]!).getByText("2 warnings")).toBeTruthy();
  });

  it("keeps all 300 findings locatable inside their group, each with its line", () => {
    const { container } = render(<LintSummary findings={findings} groupByCode />);
    const rows = screen.getAllByTestId("lint-summary-group");
    expect(within(rows[0]!).getAllByText(/^Line \d+$/)).toHaveLength(300);
    expect(within(rows[0]!).getByText("Line 300")).toBeTruthy();
    // A finding with no location shows no line.
    expect(within(rows[1]!).getAllByText(/^Line \d+$/)).toHaveLength(1);
    expect(container.querySelectorAll("details")).toHaveLength(2);
  });

  it("expands from a native summary element, so it is keyboard operable", () => {
    const { container } = render(<LintSummary findings={findings} groupByCode />);
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")).not.toBeNull();
  });

  it("leaves the flat list unchanged when groupByCode is off", () => {
    render(<LintSummary findings={findings.slice(0, 3)} />);
    expect(screen.queryAllByTestId("lint-summary-group")).toHaveLength(0);
  });
});
