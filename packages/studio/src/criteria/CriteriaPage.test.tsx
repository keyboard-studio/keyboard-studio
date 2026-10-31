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

  it("over the real catalog: 188 rows, header counts sum to the rows", () => {
    const result = resolveCriteria({
      criteria: ALL_CRITERIA,
      mode: "authored",
      lintFindings: [],
      record: EMPTY_CRITERIA_RECORD,
      facts: BASELINE_FACTS,
    });
    render(<CriteriaPage result={result} mode="authored" />);

    expect(screen.getAllByTestId("criteria-row")).toHaveLength(188);
    expect(screen.getByTestId("criteria-summary-resolved").textContent).toContain(
      // 133 = the pre-KPJ-pair 91 plus 1.10b/2.7 (Matthew's 2026-10-14
      // ruling) plus the /review Group A2 file-inventory twins' 7 checks
      // plus the .kps-listing twins' 10 plus the .kps-metadata twins' 5
      // plus the text-content twins' 12 plus the repo-context twins' 5
      // plus the Group C extraneous-files check: with no findings
      // supplied, each implemented layer-c row resolves Met.
      "133 of 188 criteria resolved",
    );
    const counted = Object.entries(result.counts).reduce((a, [, n]) => a + n, 0);
    expect(counted).toBe(188);
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
    expect(screen.getAllByTestId("criteria-row-evidence")).toHaveLength(188);
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
