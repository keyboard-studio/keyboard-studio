// ContextToleranceNotice (spec 078 T017): the finding's collapsed and expanded
// views, the could-not-check notice (FR-004), plain wording (FR-013), and that
// it adds no announcer of its own (FR-014 — it rides StudioShell's region).

import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { RuleToleranceFinding } from "@keyboard-studio/contracts";
import { render } from "../test/renderWithI18n.tsx";
import type { ContextToleranceState } from "../stores/workingCopyStore.ts";
import { ContextToleranceNotice, describeChar } from "./ContextToleranceNotice.tsx";

afterEach(cleanup);

const LOC = { file: "sil_yoruba8.kmn", line: 42 };
const NAMES = new Map<number, string>([
  [0x006f, "LATIN SMALL LETTER O"],
  [0x0323, "COMBINING DOT BELOW"],
  [0x0301, "COMBINING ACUTE ACCENT"],
  [0x1ecd, "LATIN SMALL LETTER O WITH DOT BELOW"],
  [0x00b4, "ACUTE ACCENT"],
]);
const loadNames = () => Promise.resolve(NAMES);

const gap = (ruleId: string, line = 42): RuleToleranceFinding => ({
  ruleId,
  location: { ...LOC, line },
  status: "not-analysed",
  failingKeystrokes: [{ vkey: "K_RBRKT", modifiers: [] }],
  precedingText: "ọ",
  precomposedOutput: "ọ́",
  decomposedOutput: "ọ´",
});

function ready(
  findings: RuleToleranceFinding[],
  classification: Record<string, "tolerant" | "made-tolerant" | "gap" | "not-analysed">,
  notAnalysedCount = 0,
): ContextToleranceState {
  return {
    status: "ready",
    runId: 1,
    report: { findings, notAnalysedCount },
    findings: [],
    classification,
    proposal: { ir: {} as never, variants: [], disclosures: {} },
    analysedIr: {} as never,
    fixableRuleIds: [],
    siteKeys: {},
    fingerprint: "0000000000000000",
  };
}

const FORBIDDEN = /\b(NFC|NFD|normali[sz]ation|canonical)\b/i;

describe("ContextToleranceNotice — finding", () => {
  it("collapsed: one line with the rule count, details hidden", () => {
    render(
      <ContextToleranceNotice
        state={ready([gap("r1"), gap("r2", 50)], { r1: "gap", r2: "gap" })}
        loadNames={loadNames}
      />,
    );
    expect(screen.getByText(/2 rules only work when the accent is already joined to the letter/)).toBeTruthy();
    const toggle = screen.getByRole("button", { name: /show the affected rules/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/U\+006F/)).toBeNull();
  });

  it("expanded: each case names every character by codepoint and Unicode name", async () => {
    render(<ContextToleranceNotice state={ready([gap("r1")], { r1: "gap" })} loadNames={loadNames} />);
    fireEvent.click(screen.getByRole("button", { name: /show the affected rules/i }));

    expect(screen.getByRole("button", { name: /hide the affected rules/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/Rule on line 42: pressing the \] key/)).toBeTruthy();
    await waitFor(() => expect(screen.getAllByText("U+006F LATIN SMALL LETTER O").length).toBeGreaterThan(0));
    expect(screen.getAllByText("U+0323 COMBINING DOT BELOW").length).toBeGreaterThan(0);
    expect(screen.getAllByText("U+1ECD LATIN SMALL LETTER O WITH DOT BELOW").length).toBeGreaterThan(0);
    // The typed text appears in both forms, so the case is reproducible.
    expect(screen.getByText(/After this text, with the accent joined to the letter/)).toBeTruthy();
    expect(screen.getByText(/After the same text stored as separate characters/)).toBeTruthy();
  });

  it("shows a combining mark on a dotted circle", async () => {
    const { container } = render(<ContextToleranceNotice state={ready([gap("r1")], { r1: "gap" })} loadNames={loadNames} />);
    fireEvent.click(screen.getByRole("button", { name: /show the affected rules/i }));
    expect(container.textContent).toContain("◌̣");
  });

  it("falls back to the bare codepoint when no name is available", async () => {
    const never = () => new Promise<ReadonlyMap<number, string>>(() => {});
    render(<ContextToleranceNotice state={ready([gap("r1")], { r1: "gap" })} loadNames={never} />);
    fireEvent.click(screen.getByRole("button", { name: /show the affected rules/i }));
    expect(screen.getAllByText("U+0323").length).toBeGreaterThan(0);
    expect(describeChar("̣", null)).toBe("U+0323");
  });

  it("uses no normalization vocabulary in any rendered text (FR-013)", async () => {
    const { container } = render(
      <ContextToleranceNotice
        state={ready([gap("r1"), { ruleId: "r9", location: LOC, status: "not-analysed", notAnalysedReason: "x" }], { r1: "gap", r9: "not-analysed" }, 2)}
        loadNames={loadNames}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /show the affected rules/i }));
    await waitFor(() => expect(screen.getAllByText("U+006F LATIN SMALL LETTER O").length).toBeGreaterThan(0));
    expect(container.textContent ?? "").not.toMatch(FORBIDDEN);
  });

  it("renders nothing for a clean report", () => {
    const { container } = render(
      <ContextToleranceNotice state={ready([{ ruleId: "r1", location: LOC, status: "tolerant" }], { r1: "tolerant" })} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders nothing while idle or analysing", () => {
    const { container, rerender } = render(<ContextToleranceNotice state={{ status: "idle" }} />);
    expect(container.textContent).toBe("");
    rerender(<ContextToleranceNotice state={{ status: "analysing", runId: 3 }} />);
    expect(container.textContent).toBe("");
  });
});

describe("ContextToleranceNotice — could not check (FR-004)", () => {
  it("a failed analysis renders as could-not-check with its reason, never as clean", () => {
    render(<ContextToleranceNotice state={{ status: "failed", runId: 2, reason: "worker crashed" }} />);
    expect(screen.getByTestId("context-tolerance-not-checked")).toBeTruthy();
    expect(screen.getByText(/could not run/)).toBeTruthy();
    expect(screen.getByText(/worker crashed/)).toBeTruthy();
  });

  it("a report whose compile failed renders a count and the reasons", () => {
    const reason = "keyboard failed to compile; behavioural comparison could not run";
    const state = ready(
      [
        { ruleId: "a", location: LOC, status: "not-analysed", notAnalysedReason: reason },
        { ruleId: "b", location: LOC, status: "not-analysed", notAnalysedReason: reason },
      ],
      { a: "not-analysed", b: "not-analysed" },
    );
    if (state.status === "ready") {
      state.report.compileDiagnostics = [{ severity: "error", code: "KM_ERROR", message: "boom", line: 1, file: "x.kmn" } as never];
    }
    render(<ContextToleranceNotice state={state} />);
    expect(screen.getByText(/2 rules could not be checked/)).toBeTruthy();
    expect(screen.getByText(`${reason} (2)`)).toBeTruthy();
  });

  it("counts opaque rules (notAnalysedCount) as could-not-check", () => {
    render(<ContextToleranceNotice state={ready([], {}, 3)} />);
    expect(screen.getByText(/3 rules could not be checked/)).toBeTruthy();
  });
});

describe("ContextToleranceNotice — live region (FR-014)", () => {
  it("adds no live region of its own, so it rides the existing one", () => {
    const { container } = render(
      <ContextToleranceNotice state={ready([gap("r1")], { r1: "gap" })} loadNames={loadNames} />,
    );
    expect(container.querySelector("[aria-live]")).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
});
