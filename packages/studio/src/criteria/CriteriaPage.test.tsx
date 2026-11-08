// Component tests for the criteria page (spec 084, T4.6).
//
// Rendered through the real compiled English catalog (test/renderWithI18n)
// against CriteriaResults built by the REAL resolver — the page is props
// only, so a fixture result is the whole input. The header counts are
// asserted against the rows actually rendered (header == rows is the
// plan's core gate), the attestation / confirmation interactions assert
// the host callbacks fire with the criterion id, and the identifiers
// guard mirrors DecisionEntryRow.identifiers.test.tsx: no criterion id,
// no surveyQuestionId, and no band name may render anywhere; a lintRuleId
// may appear ONLY inside expanded evidence.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";

import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type { Criterion, LintFinding } from "@keyboard-studio/contracts";

import { EMPTY_CRITERIA_RECORD } from "./criteriaTypes.ts";
import type { CriteriaFacts, CriteriaInput } from "./criteriaTypes.ts";
import { resolveCriteria } from "./resolveCriteria.ts";
import { CriteriaPage } from "./CriteriaPage.tsx";
import type { FileTreeNode } from "../review/fileTree.ts";

afterEach(cleanup);

const BASELINE_FACTS: CriteriaFacts = {
  fontBundled: true,
  deprecated: true,
  partnerPackage: true,
};

const FIXTURE_CRITERIA: Criterion[] = [
  {
    id: "fix.1-bake",
    section: "1. Fixture section",
    band: "scaffolder-bake",
    description: "Fixture bake criterion",
    scaffolderRule: "fixture-bake-rule",
  },
  {
    id: "fix.2-history-order",
    section: "3. Fixture history",
    band: "layer-c-enforce",
    description: "Fixture history order criterion",
    lintRuleId: "KM_LINT_HISTORY_ORDER",
  },
  {
    id: "fix.3-unimplemented",
    section: "3. Fixture history",
    band: "layer-c-enforce",
    description: "Fixture unimplemented criterion",
    lintRuleId: "KM_LINT_NO_SUCH_CHECK",
  },
  {
    id: "fix.4-yellow",
    section: "4. Fixture questions",
    band: "yellow-survey",
    description: "Fixture yellow criterion",
    surveyQuestionId: "fixture_question_id",
  },
  {
    id: "fix.5-red",
    section: "5. Fixture checklist",
    band: "red-checklist",
    description: "Fixture red criterion",
    preSubmitChecklistText: "Fixture checklist text to confirm.",
  },
  {
    id: "fix.6-numeric-region",
    section: "12. Fixture tags",
    band: "layer-c-enforce",
    description: "Fixture numeric region criterion",
    lintRuleId: "KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE",
  },
  {
    id: "fix.7-font-license",
    section: "9. Fixture fonts",
    band: "layer-c-enforce",
    description: "Fixture font license criterion",
    lintRuleId: "KM_LINT_FONT_LICENSE_EMPTY",
  },
];

const HISTORY_FINDING: LintFinding = {
  code: "KM_LINT_HISTORY_ORDER",
  severity: "warning",
  layer: "C",
  message: "HISTORY.md entries are not newest-first.",
  hint: "Move the most recent entry to the top.",
};

function fixtureInput(overrides: Partial<CriteriaInput> = {}): CriteriaInput {
  return {
    criteria: FIXTURE_CRITERIA,
    mode: "authored",
    lintFindings: [HISTORY_FINDING],
    record: EMPTY_CRITERIA_RECORD,
    facts: BASELINE_FACTS,
    ...overrides,
  };
}

function rowByDescription(description: string): HTMLElement {
  const el = screen.getByText(description);
  const row = el.closest('[data-testid="criteria-row"]');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${description}`);
  return row;
}

function expandRow(row: HTMLElement): void {
  fireEvent.click(within(row).getByTestId("criteria-row-expand"));
}

describe("CriteriaPage — header and rows agree", () => {
  it("renders the resolver's counts in the header and one row per criterion", () => {
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" />);

    // Header, from the result — never recomputed by the page.
    expect(screen.getByTestId("criteria-summary-resolved").textContent).toContain(
      `${result.resolvedCount} of ${result.total} criteria resolved`,
    );
    for (const [status, count] of Object.entries(result.counts)) {
      expect(
        screen.getByTestId(`criteria-summary-count-${status}`).textContent,
      ).toContain(`${count}`);
    }
    expect(screen.getByTestId("criteria-summary-not-yet-checkable")).toBeTruthy();

    // Rows: one per criterion, statuses matching the same result.
    const rows = screen.getAllByTestId("criteria-row");
    expect(rows).toHaveLength(result.rows.length);
    const renderedPerStatus = new Map<string, number>();
    for (const rowEl of rows) {
      const status = rowEl.getAttribute("data-status");
      if (status === null) throw new Error("row without data-status");
      renderedPerStatus.set(status, (renderedPerStatus.get(status) ?? 0) + 1);
    }
    for (const [status, count] of Object.entries(result.counts)) {
      expect(renderedPerStatus.get(status) ?? 0).toBe(count);
    }

    // Section groups in row (catalog) order: 4 distinct fixture sections.
    const headings = screen
      .getAllByTestId("criteria-section-heading")
      .map((h) => h.textContent);
    expect(headings).toEqual([
      "1. Fixture section",
      "3. Fixture history",
      "4. Fixture questions",
      "5. Fixture checklist",
      "12. Fixture tags",
      "9. Fixture fonts",
    ]);
  });

  it("moves Not applicable rows to the bottom, still under their section", () => {
    const byId = (id: string) => FIXTURE_CRITERIA.find((c) => c.id === id)!;
    const result = resolveCriteria(
      fixtureInput({
        // §9 font row first in catalog order; no bundled font makes it N/A.
        criteria: [byId("fix.7-font-license"), byId("fix.4-yellow"), byId("fix.2-history-order")],
        facts: { ...BASELINE_FACTS, fontBundled: false },
      }),
    );
    render(<CriteriaPage result={result} mode="authored" />);

    expect(
      screen.getAllByTestId("criteria-section-heading").map((h) => h.textContent),
    ).toEqual(["4. Fixture questions", "3. Fixture history", "9. Fixture fonts"]);
    const statuses = screen
      .getAllByTestId("criteria-row")
      .map((r) => r.getAttribute("data-status"));
    expect(statuses.at(-1)).toBe("not-applicable");
    expect(statuses.slice(0, -1)).not.toContain("not-applicable");
  });

  it("over the real catalog: every row renders, header counts sum to the rows", () => {
    const result = resolveCriteria({
      criteria: ALL_CRITERIA,
      mode: "authored",
      lintFindings: [],
      record: EMPTY_CRITERIA_RECORD,
      facts: BASELINE_FACTS,
    });
    render(<CriteriaPage result={result} mode="authored" />);

    // No pinned census (lists grow): the rendered rows are the catalog rows.
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(ALL_CRITERIA.length);
    expect(screen.getByTestId("criteria-summary-resolved").textContent).toContain(
      // With no findings supplied, each implemented layer-c row resolves
      // Met, so the resolved count is met + not-applicable.
      `${result.resolvedCount} of ${ALL_CRITERIA.length} criteria resolved`,
    );
    const counted = Object.entries(result.counts).reduce((a, [, n]) => a + n, 0);
    expect(counted).toBe(ALL_CRITERIA.length);
  });
});

describe("CriteriaPage — lazy evidence", () => {
  it("shows no evidence collapsed; expanding a lint row shows the finding and its check id inside the evidence only", () => {
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" />);

    // Collapsed: no evidence regions at all, and the lintRuleId appears nowhere.
    expect(screen.queryAllByTestId("criteria-row-evidence")).toHaveLength(0);
    expect(document.body.textContent ?? "").not.toContain("KM_LINT_HISTORY_ORDER");

    const row = rowByDescription("Fixture history order criterion");
    expandRow(row);

    const evidence = within(row).getByTestId("criteria-row-evidence");
    expect(evidence.textContent).toContain("HISTORY.md entries are not newest-first.");
    expect(evidence.textContent).toContain("Move the most recent entry to the top.");
    expect(within(evidence).getByTestId("criteria-evidence-check").textContent).toContain(
      "KM_LINT_HISTORY_ORDER",
    );
    // The row's own collapsed surface (description + status) still carries no id.
    expect(within(row).getByTestId("criteria-row-description").textContent).not.toContain(
      "KM_LINT_HISTORY_ORDER",
    );
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe("Not met");
  });

  it("an unimplemented check expands to its not-yet-checkable statement", () => {
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" />);

    const row = rowByDescription("Fixture unimplemented criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe(
      "Not yet checkable",
    );
    expandRow(row);
    expect(within(row).getByTestId("criteria-row-evidence").textContent).toContain(
      "Specified but not yet enforced",
    );
  });
});

describe("CriteriaPage — authored controls (US4)", () => {
  it("attest Yes calls onAttest with the criterion id and 'yes'", () => {
    const onAttest = vi.fn();
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" onAttest={onAttest} />);

    const row = rowByDescription("Fixture yellow criterion");
    expandRow(row);
    fireEvent.click(within(row).getByTestId("criteria-attest-yes"));
    expect(onAttest).toHaveBeenCalledTimes(1);
    expect(onAttest).toHaveBeenCalledWith("fix.4-yellow", "yes");
  });

  it("a recorded attestation shows in the evidence and can be cleared", () => {
    const onClearAttestation = vi.fn();
    const result = resolveCriteria(
      fixtureInput({
        record: {
          attestations: {
            "fix.4-yellow": { answer: "no", at: "2026-10-13T00:00:00.000Z" },
          },
          confirmations: {},
        },
      }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        onAttest={vi.fn()}
        onClearAttestation={onClearAttestation}
      />,
    );

    const row = rowByDescription("Fixture yellow criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe("Not met");
    expandRow(row);
    expect(within(row).getByTestId("criteria-row-evidence").textContent).toContain(
      "Recorded answer: no",
    );
    fireEvent.click(within(row).getByTestId("criteria-attest-clear"));
    expect(onClearAttestation).toHaveBeenCalledWith("fix.4-yellow");
  });

  it("confirm calls onConfirm; a confirmed row offers Unconfirm instead", () => {
    const onConfirm = vi.fn();
    const unconfirmed = resolveCriteria(fixtureInput());
    const { unmount } = render(
      <CriteriaPage result={unconfirmed} mode="authored" onConfirm={onConfirm} />,
    );
    const row = rowByDescription("Fixture red criterion");
    expandRow(row);
    expect(within(row).getByTestId("criteria-row-evidence").textContent).toContain(
      "Fixture checklist text to confirm.",
    );
    fireEvent.click(within(row).getByTestId("criteria-confirm"));
    expect(onConfirm).toHaveBeenCalledWith("fix.5-red");
    unmount();

    const onUnconfirm = vi.fn();
    const confirmed = resolveCriteria(
      fixtureInput({
        record: {
          attestations: {},
          confirmations: { "fix.5-red": { at: "2026-10-13T00:00:00.000Z" } },
        },
      }),
    );
    render(
      <CriteriaPage result={confirmed} mode="authored" onUnconfirm={onUnconfirm} />,
    );
    const confirmedRow = rowByDescription("Fixture red criterion");
    expect(within(confirmedRow).getByTestId("criteria-row-status").textContent).toBe("Met");
    expandRow(confirmedRow);
    fireEvent.click(within(confirmedRow).getByTestId("criteria-confirm-unconfirm"));
    expect(onUnconfirm).toHaveBeenCalledWith("fix.5-red");
  });

  it("foreign mode renders no attestation or confirmation controls", () => {
    const result = resolveCriteria(fixtureInput({ mode: "foreign" }));
    render(
      <CriteriaPage
        result={result}
        mode="foreign"
        onAttest={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );
    for (const row of screen.getAllByTestId("criteria-row")) expandRow(row);
    expect(screen.queryByTestId("criteria-attest-controls")).toBeNull();
    expect(screen.queryByTestId("criteria-confirm-controls")).toBeNull();
  });
});

describe("CriteriaPage — §12.3 contrastive-region control (Batch 3)", () => {
  const NUMERIC_FINDING: LintFinding = {
    code: "KM_LINT_NUMERIC_REGION_NON_CONTRASTIVE",
    severity: "warning",
    layer: "C",
    message: "BCP47 tag(s) use a numeric region subtag that is not attested as explicitly contrastive: es-419.",
    hint: "Use the alpha-2 region code, or attest it.",
  };

  it("an unattested numeric region offers the attestation control on the Not-met row", () => {
    const onAttestContrastive = vi.fn();
    const result = resolveCriteria(
      fixtureInput({ lintFindings: [NUMERIC_FINDING] }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        onAttestContrastive={onAttestContrastive}
        onClearContrastive={vi.fn()}
      />,
    );
    const row = rowByDescription("Fixture numeric region criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe("Not met");
    expandRow(row);
    fireEvent.click(within(row).getByTestId("criteria-contrastive-attest"));
    expect(onAttestContrastive).toHaveBeenCalledTimes(1);
  });

  it("an attested keyboard shows the withdrawal control on the Met row", () => {
    const onClearContrastive = vi.fn();
    const result = resolveCriteria(
      fixtureInput({ lintFindings: [], contrastiveRegionAttested: true }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        onAttestContrastive={vi.fn()}
        onClearContrastive={onClearContrastive}
      />,
    );
    const row = rowByDescription("Fixture numeric region criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe("Met");
    expandRow(row);
    expect(
      within(row).getByTestId("criteria-contrastive-controls").textContent,
    ).toContain("attested the numeric region");
    fireEvent.click(within(row).getByTestId("criteria-contrastive-clear"));
    expect(onClearContrastive).toHaveBeenCalledTimes(1);
  });

  it("foreign mode offers no contrastive control", () => {
    const result = resolveCriteria(
      fixtureInput({ mode: "foreign", lintFindings: [NUMERIC_FINDING] }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="foreign"
        onAttestContrastive={vi.fn()}
        onClearContrastive={vi.fn()}
      />,
    );
    const row = rowByDescription("Fixture numeric region criterion");
    expandRow(row);
    expect(within(row).queryByTestId("criteria-contrastive-controls")).toBeNull();
  });
});

describe("CriteriaPage — §9 font license attestation editor (Batch 5)", () => {
  const FONT_FACTS: CriteriaFacts = {
    ...BASELINE_FACTS,
    bundledFonts: ["Fixture.ttf"],
  };

  it("an unattested font resolves Needs human and the editor saves license + open confirmation", () => {
    const onAttestFontLicense = vi.fn();
    const result = resolveCriteria(
      fixtureInput({ facts: FONT_FACTS, lintFindings: [] }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        onAttestFontLicense={onAttestFontLicense}
        onClearFontLicense={vi.fn()}
      />,
    );
    const row = rowByDescription("Fixture font license criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe(
      "Needs human",
    );
    expandRow(row);
    fireEvent.change(within(row).getByTestId("criteria-font-license-Fixture.ttf"), {
      target: { value: "OFL-1.1" },
    });
    fireEvent.click(within(row).getByTestId("criteria-font-open-Fixture.ttf"));
    fireEvent.click(within(row).getByTestId("criteria-font-save-Fixture.ttf"));
    expect(onAttestFontLicense).toHaveBeenCalledTimes(1);
    expect(onAttestFontLicense).toHaveBeenCalledWith("Fixture.ttf", "OFL-1.1", true);
  });

  it("an attested font resolves Met and the editor offers Clear", () => {
    const onClearFontLicense = vi.fn();
    const result = resolveCriteria(
      fixtureInput({
        facts: FONT_FACTS,
        lintFindings: [],
        record: {
          attestations: {},
          confirmations: {},
          fontLicenseAttestations: {
            "Fixture.ttf": {
              license: "OFL-1.1",
              openConfirmed: true,
              at: "2026-10-14T00:00:00.000Z",
            },
          },
        },
      }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        onAttestFontLicense={vi.fn()}
        onClearFontLicense={onClearFontLicense}
      />,
    );
    const row = rowByDescription("Fixture font license criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe("Met");
    expandRow(row);
    fireEvent.click(within(row).getByTestId("criteria-font-clear-Fixture.ttf"));
    expect(onClearFontLicense).toHaveBeenCalledWith("Fixture.ttf");
  });

  it("foreign mode shows no font editor", () => {
    const result = resolveCriteria(
      fixtureInput({ mode: "foreign", facts: FONT_FACTS, lintFindings: [] }),
    );
    render(
      <CriteriaPage
        result={result}
        mode="foreign"
        onAttestFontLicense={vi.fn()}
        onClearFontLicense={vi.fn()}
      />,
    );
    const row = rowByDescription("Fixture font license criterion");
    expect(within(row).getByTestId("criteria-row-status").textContent).toBe(
      "Needs human",
    );
    expandRow(row);
    expect(within(row).queryByTestId("criteria-font-controls")).toBeNull();
  });
});

describe("CriteriaPage — identifiers guard", () => {
  it("no criterion id, surveyQuestionId, or band name renders, collapsed or expanded; lintRuleIds stay inside evidence", () => {
    const result = resolveCriteria({
      criteria: ALL_CRITERIA,
      mode: "authored",
      lintFindings: [],
      record: EMPTY_CRITERIA_RECORD,
      facts: BASELINE_FACTS,
    });
    render(<CriteriaPage result={result} mode="authored" />);

    const forbidden: string[] = [
      ...ALL_CRITERIA.map((c) => c.id),
      ...ALL_CRITERIA.flatMap((c) =>
        c.band === "yellow-survey" ? [c.surveyQuestionId] : [],
      ),
      "scaffolder-bake",
      "layer-c-enforce",
      "yellow-survey",
      "red-checklist",
    ];
    const lintRuleIds = ALL_CRITERIA.flatMap((c) =>
      c.band === "layer-c-enforce" ? [c.lintRuleId] : [],
    );

    const assertClean = (phase: string) => {
      // Text outside every expanded evidence region.
      const rows = screen.getAllByTestId("criteria-row");
      let outsideText = screen.getByTestId("criteria-summary").textContent ?? "";
      for (const row of rows) {
        const clone = row.cloneNode(true) as HTMLElement;
        clone.querySelector('[data-testid="criteria-row-evidence"]')?.remove();
        outsideText += `\n${clone.textContent ?? ""}`;
      }
      for (const token of forbidden) {
        expect(outsideText, `${phase}: leaked ${token}`).not.toContain(token);
      }
      for (const ruleId of lintRuleIds) {
        expect(outsideText, `${phase}: lintRuleId outside evidence: ${ruleId}`).not.toContain(
          ruleId,
        );
      }
      // Inside evidence, identifiers other than lintRuleId are still banned.
      for (const evidence of screen.queryAllByTestId("criteria-row-evidence")) {
        const text = evidence.textContent ?? "";
        for (const token of forbidden) {
          expect(text, `${phase}: leaked ${token} in evidence`).not.toContain(token);
        }
      }
    };

    assertClean("collapsed");

    for (const row of screen.getAllByTestId("criteria-row")) expandRow(row);
    expect(screen.getAllByTestId("criteria-row-evidence")).toHaveLength(
      ALL_CRITERIA.length,
    );
    assertClean("expanded");

    // Sanity: the exception is real — at least one implemented check's id
    // IS visible, inside its evidence.
    const evidenceText = screen
      .getAllByTestId("criteria-row-evidence")
      .map((e) => e.textContent ?? "")
      .join("\n");
    expect(evidenceText).toContain("KM_LINT_HISTORY_ORDER");
  });
});

describe("CriteriaPage — cited text renders as a code block", () => {
  it("a finding's Found:/Line: values sit in pre > code, their labels outside", () => {
    const finding: LintFinding = {
      ...HISTORY_FINDING,
      message:
        'HISTORY.md entries are not newest-first. Found: "1.0 (2019)"\nLine: "## 1.0 (2019) first release"',
    };
    const result = resolveCriteria(fixtureInput({ lintFindings: [finding] }));
    render(<CriteriaPage result={result} mode="authored" />);

    const row = rowByDescription("Fixture history order criterion");
    expandRow(row);
    const citations = within(row).getAllByTestId("criteria-evidence-citation");
    expect(citations).toHaveLength(2);

    const [found, line] = citations as [HTMLElement, HTMLElement];
    expect(found.querySelector("pre > code")?.textContent).toBe("1.0 (2019)");
    expect(found.querySelector("p")?.textContent).toBe(
      "HISTORY.md entries are not newest-first. Found:",
    );
    expect(line.querySelector("pre > code")?.textContent).toBe(
      "## 1.0 (2019) first release",
    );
    expect(line.querySelector("p")?.textContent).toBe("Line:");
  });

  it("a plain evidence line renders no code block", () => {
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" />);

    const row = rowByDescription("Fixture history order criterion");
    expandRow(row);
    expect(within(row).queryAllByTestId("criteria-evidence-citation")).toHaveLength(0);
    expect(within(row).getByTestId("criteria-row-evidence").querySelector("pre")).toBeNull();
  });
});

describe("CriteriaPage expected-characters coverage (spec 111 FR-018a)", () => {
  it("states how many listed languages had exemplar data, only when supplied", () => {
    const base = resolveCriteria(fixtureInput());
    const { rerender } = render(<CriteriaPage result={base} mode="authored" />);
    expect(screen.queryByTestId("criteria-expected-coverage")).toBeNull();

    rerender(
      <CriteriaPage result={{ ...base, expectedCoverage: { withData: 3, total: 5 } }} mode="authored" />,
    );
    expect(screen.getByTestId("criteria-expected-coverage").textContent).toContain(
      "3 of 5 had exemplar data",
    );
  });
});

describe("CriteriaPage — severity filter and file inventory (/review parity)", () => {
  // The fixture's authored statuses: bake met, history not-met (hard),
  // unimplemented not-yet-checkable, yellow needs-author, red
  // needs-human, numeric met, font needs-human. The map is the
  // authored mapping: bake met, hard failure error, needs-* warning,
  // font hidden (the twin-style exclusion, exercised here as a map
  // value, not a mode rule).
  const SEVERITY_MAP = {
    "fix.1-bake": "met",
    "fix.2-history-order": "error",
    "fix.3-unimplemented": "warning",
    "fix.4-yellow": "warning",
    "fix.5-red": "warning",
    "fix.6-numeric-region": "met",
    "fix.7-font-license": "hidden",
  } as const;

  it("with no severity map there is no filter and every row renders", () => {
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" />);
    expect(screen.queryByTestId("criteria-severity-filter")).toBeNull();
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(7);
    expect(screen.queryByTestId("file-tree")).toBeNull();
  });

  it("the filter counts per severity, narrows the list, and the summary counts the rows shown", () => {
    const result = resolveCriteria(fixtureInput());
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        severityMap={{ ...SEVERITY_MAP }}
      />,
    );

    // Counts from the map: met 2, warning 3, error 1; hidden is uncounted.
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("✓ 2 met")).toBeTruthy();
    expect(screen.getByText("⚠ 3 warnings")).toBeTruthy();
    expect(screen.getByText("✖ 1 errors")).toBeTruthy();

    // All: every non-hidden row; the summary counts those six.
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(6);
    expect(screen.getByTestId("criteria-summary-resolved").textContent).toContain(
      "3 of 6 criteria resolved",
    );

    // Errors: the one hard failure; the summary follows the list.
    fireEvent.click(screen.getByText("✖ 1 errors"));
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(1);
    expect(screen.getByTestId("criteria-summary-resolved").textContent).toContain(
      "1 of 1 criteria resolved",
    );
    expect(
      screen.getByTestId("criteria-summary-count-not-met").textContent,
    ).toContain("Not met: 1");
    expect(
      screen.getByTestId("criteria-summary-count-met").textContent,
    ).toContain("Met: 0");

    // Met: the bake guarantee and the numeric pass.
    fireEvent.click(screen.getByText("✓ 2 met"));
    const descriptions = screen
      .getAllByTestId("criteria-row-description")
      .map((d) => d.textContent);
    expect(descriptions).toEqual([
      "Fixture bake criterion",
      "Fixture numeric region criterion",
    ]);
  });

  it("rows with no map entry show only under All", () => {
    const result = resolveCriteria(fixtureInput());
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        severityMap={{ "fix.2-history-order": "error" }}
      />,
    );
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(7);
    fireEvent.click(screen.getByText("✖ 1 errors"));
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(1);
  });

  it("the file inventory renders above the list when passed", () => {
    const tree: FileTreeNode[] = [
      {
        name: "fixkb",
        path: "",
        status: "other",
        detail: "The keyboard folder as published.",
        children: [
          {
            name: "README.md",
            path: "README.md",
            status: "ok",
            detail: "Present at README.md.",
            criterionId: "fix.2-history-order",
          },
          {
            name: "HISTORY.md",
            path: "HISTORY.md",
            status: "missing",
            detail: "Missing — reported by fix.2-history-order.",
            criterionId: "fix.2-history-order",
          },
        ],
      },
    ];
    const result = resolveCriteria(fixtureInput());
    render(<CriteriaPage result={result} mode="authored" fileTree={tree} />);
    expect(screen.getByTestId("file-tree")).toBeTruthy();
    expect(screen.getByTestId("file-tree").textContent).toContain("File inventory");
    expect(screen.getByTestId("file-tree").textContent).toContain("README.md");
  });

  it("the banner replaces the plain heading block", () => {
    const result = resolveCriteria(fixtureInput());
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        keyboardLabel="fixkb"
        judgedNote="This judged note stays out of the banner page."
        banner={{
          eyebrow: "Keyboard Studio",
          title: "Criteria banner title",
          meta: "Keyboard: fixkb · Judging the keyboard as it would be downloaded.",
        }}
      />,
    );
    expect(screen.getByText("Criteria banner title")).toBeTruthy();
    expect(screen.queryByTestId("criteria-judged-note")).toBeNull();
    expect(screen.queryByTestId("criteria-keyboard")).toBeNull();
    // The list itself is untouched by the banner.
    expect(screen.getAllByTestId("criteria-row")).toHaveLength(7);
  });

  it("without a banner the plain heading block renders as before", () => {
    const result = resolveCriteria(fixtureInput());
    render(
      <CriteriaPage
        result={result}
        mode="authored"
        keyboardLabel="fixkb"
        judgedNote="Judging the keyboard as it would be downloaded."
      />,
    );
    expect(screen.getByTestId("criteria-judged-note").textContent).toContain(
      "Judging the keyboard as it would be downloaded.",
    );
    expect(screen.getByTestId("criteria-keyboard").textContent).toContain("fixkb");
  });
});
