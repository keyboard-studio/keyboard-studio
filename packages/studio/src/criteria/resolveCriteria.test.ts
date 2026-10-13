// Tests for the criteria resolver (spec 084, Phase 1).
//
// These run against the real catalog (ALL_CRITERIA) with baseline facts
// that make every criterion applicable, so the counts pin the band logic
// itself: 40 scaffolder-bake + 39 implemented layer-c checks resolve Met
// in authored mode with no findings, 28 layer-c criteria are honestly
// Not yet checkable, and the yellow/red bands wait on the author/human.

import { describe, expect, it } from "vitest";

import { ALL_CRITERIA } from "@keyboard-studio/contracts";
import type { Criterion, LintFinding } from "@keyboard-studio/contracts";

import { EMPTY_CRITERIA_RECORD } from "./criteriaTypes.ts";
import type {
  CriteriaFacts,
  CriteriaInput,
  CriterionStatus,
} from "./criteriaTypes.ts";
import { resolveCriteria } from "./resolveCriteria.ts";

const BASELINE_FACTS: CriteriaFacts = {
  fontBundled: true,
  deprecated: true,
  partnerPackage: true,
};

function makeInput(overrides: Partial<CriteriaInput> = {}): CriteriaInput {
  return {
    criteria: ALL_CRITERIA,
    mode: "authored",
    lintFindings: [],
    record: EMPTY_CRITERIA_RECORD,
    facts: BASELINE_FACTS,
    ...overrides,
  };
}

function rowFor(criterionId: string, input: CriteriaInput) {
  const result = resolveCriteria(input);
  const row = result.rows.find((r) => r.criterion.id === criterionId);
  if (!row) throw new Error(`no row for ${criterionId}`);
  return row;
}

function criterionByLintRuleId(lintRuleId: string): Criterion {
  const criterion = ALL_CRITERIA.find(
    (c) => c.band === "layer-c-enforce" && c.lintRuleId === lintRuleId,
  );
  if (!criterion) throw new Error(`no criterion for ${lintRuleId}`);
  return criterion;
}

const ALL_STATUSES: readonly CriterionStatus[] = [
  "met",
  "not-met",
  "not-applicable",
  "needs-author",
  "needs-human",
  "not-yet-checkable",
];

describe("resolveCriteria — authored baseline", () => {
  it("resolves all 149 rows in catalog order with the pinned counts", () => {
    const result = resolveCriteria(makeInput());

    expect(result.rows).toHaveLength(149);
    expect(result.total).toBe(149);
    expect(result.rows.map((r) => r.criterion.id)).toEqual(
      ALL_CRITERIA.map((c) => c.id),
    );

    // 40 scaffolder-bake + 39 implemented layer-c checks pass; the other
    // 28 layer-c criteria have no check yet; yellow waits on the author
    // and red on a human.
    expect(result.counts).toEqual({
      met: 79,
      "not-met": 0,
      "not-applicable": 0,
      "needs-author": 32,
      "needs-human": 10,
      "not-yet-checkable": 28,
    });
    expect(result.resolvedCount).toBe(79);
  });

  it("gives every row exactly one status and bandCounts that agree with counts", () => {
    const result = resolveCriteria(makeInput());

    for (const row of result.rows) {
      expect(ALL_STATUSES).toContain(row.status);
    }
    const counted = Object.values(result.counts).reduce((a, b) => a + b, 0);
    expect(counted).toBe(149);

    for (const status of ALL_STATUSES) {
      const bandTotal = Object.values(result.bandCounts).reduce(
        (sum, perBand) => sum + perBand[status],
        0,
      );
      expect(bandTotal).toBe(result.counts[status]);
    }
    expect(result.bandCounts["scaffolder-bake"].met).toBe(40);
    expect(result.bandCounts["layer-c-enforce"].met).toBe(39);
    expect(result.bandCounts["layer-c-enforce"]["not-yet-checkable"]).toBe(28);
    expect(result.bandCounts["yellow-survey"]["needs-author"]).toBe(32);
    expect(result.bandCounts["red-checklist"]["needs-human"]).toBe(10);
  });

  it("keeps evidence lazy: a function on every row, not a prebuilt model", () => {
    const result = resolveCriteria(makeInput());
    for (const row of result.rows) {
      expect(typeof row.evidence).toBe("function");
    }
  });
});

describe("resolveCriteria — foreign baseline", () => {
  it("resolves only the 39 implemented layer-c checks and offers no controls", () => {
    const result = resolveCriteria(makeInput({ mode: "foreign" }));

    expect(result.rows).toHaveLength(149);
    expect(result.counts).toEqual({
      met: 39,
      "not-met": 0,
      "not-applicable": 0,
      "needs-author": 32,
      "needs-human": 10,
      // 40 foreign scaffolder-bake rows join the 28 unimplemented checks.
      "not-yet-checkable": 68,
    });
    expect(result.resolvedCount).toBe(39);
    for (const row of result.rows) {
      expect(row.controls).toBeNull();
    }

    const bake = result.rows.find((r) => r.criterion.band === "scaffolder-bake");
    expect(bake?.status).toBe("not-yet-checkable");
    expect(bake?.evidence().kind).toBe("foreign-bake");
    expect(bake?.evidence().lines).toEqual([
      "Guaranteed by the scaffolder for studio-created keyboards; not verified for this keyboard.",
    ]);
  });
});

describe("resolveCriteria — layer-c findings", () => {
  const historyOrder = criterionByLintRuleId("KM_LINT_HISTORY_ORDER");
  const finding: LintFinding = {
    code: "KM_LINT_HISTORY_ORDER",
    severity: "warning",
    layer: "C",
    message: "HISTORY.md entries are not newest-first.",
    hint: "Move the most recent entry to the top.",
  };

  it("marks the mapped criterion Not met and attaches the finding as evidence", () => {
    const row = rowFor(historyOrder.id, makeInput({ lintFindings: [finding] }));
    expect(row.status).toBe("not-met");

    const evidence = row.evidence();
    expect(evidence.kind).toBe("lint-finding");
    expect(evidence.lintRuleId).toBe("KM_LINT_HISTORY_ORDER");
    expect(evidence.findings).toEqual([finding]);
    expect(evidence.lines).toContain(finding.message);
    expect(evidence.lines).toContain(finding.hint);

    const result = resolveCriteria(makeInput({ lintFindings: [finding] }));
    expect(result.counts.met).toBe(78);
    expect(result.counts["not-met"]).toBe(1);
    expect(result.resolvedCount).toBe(79);
  });

  it("dedupes an identical finding reported twice (doc + engine)", () => {
    const single = rowFor(
      historyOrder.id,
      makeInput({ lintFindings: [finding] }),
    );
    const doubled = rowFor(
      historyOrder.id,
      makeInput({ lintFindings: [finding, { ...finding }] }),
    );
    expect(doubled.status).toBe("not-met");
    expect(doubled.evidence().findings).toHaveLength(1);
    expect(doubled.evidence().lines).toEqual(single.evidence().lines);
  });

  it("ignores findings whose code maps to no criterion", () => {
    const unmapped: LintFinding = {
      code: "KM_LINT_TOUCH_UNCOVERED",
      severity: "warning",
      layer: "C",
      message: "A touch key is not covered.",
    };
    const baseline = resolveCriteria(makeInput());
    const result = resolveCriteria(makeInput({ lintFindings: [unmapped] }));
    expect(result.counts).toEqual(baseline.counts);
    expect(result.bandCounts).toEqual(baseline.bandCounts);
    expect(result.rows.map((r) => r.status)).toEqual(
      baseline.rows.map((r) => r.status),
    );
  });
});

describe("resolveCriteria — missing lint context", () => {
  it("resolves the inventory criterion Not yet checkable, naming the missing input, and never Met", () => {
    const inventory = criterionByLintRuleId("KM_LINT_INVENTORY_UNCOVERED");
    const input = makeInput({
      contextMissing: {
        KM_LINT_INVENTORY_UNCOVERED:
          "the linguist inventory for this keyboard",
      },
    });
    const row = rowFor(inventory.id, input);
    expect(row.status).toBe("not-yet-checkable");
    expect(row.status).not.toBe("met");

    const evidence = row.evidence();
    expect(evidence.kind).toBe("context-missing");
    expect(evidence.lines.join(" ")).toContain(
      "the linguist inventory for this keyboard",
    );

    const result = resolveCriteria(input);
    expect(result.counts.met).toBe(78);
    expect(result.counts["not-yet-checkable"]).toBe(29);
  });
});

describe("resolveCriteria — attestations and confirmations", () => {
  const yellow = ALL_CRITERIA.filter((c) => c.band === "yellow-survey");
  const at = "2026-10-13T12:00:00.000Z";

  it("resolves each attestation answer to its status, with the attest control kept", () => {
    const [yesRow, noRow, naRow] = yellow;
    if (!yesRow || !noRow || !naRow) throw new Error("need 3 yellow criteria");
    const input = makeInput({
      record: {
        attestations: {
          [yesRow.id]: { answer: "yes", at },
          [noRow.id]: { answer: "no", at },
          [naRow.id]: { answer: "not-applicable", at },
        },
        confirmations: {},
      },
    });

    const yes = rowFor(yesRow.id, input);
    expect(yes.status).toBe("met");
    expect(yes.controls).toBe("attest");
    expect(yes.evidence().kind).toBe("attested");
    expect(yes.evidence().lines.join(" ")).toContain("yes");
    expect(yes.evidence().lines.join(" ")).toContain(at);

    const no = rowFor(noRow.id, input);
    expect(no.status).toBe("not-met");
    expect(no.controls).toBe("attest");
    expect(no.evidence().kind).toBe("attested");

    const na = rowFor(naRow.id, input);
    expect(na.status).toBe("not-applicable");
    expect(na.controls).toBe("attest");
    expect(na.evidence().kind).toBe("attested");
  });

  it("leaves an unattested yellow row Needs author with the attest control", () => {
    const first = yellow[0];
    if (!first) throw new Error("need a yellow criterion");
    const row = rowFor(first.id, makeInput());
    expect(row.status).toBe("needs-author");
    expect(row.controls).toBe("attest");
    expect(row.evidence().kind).toBe("needs-author");
  });

  it("resolves a confirmed red row Met, and an unconfirmed one Needs human with its checklist text", () => {
    const red = ALL_CRITERIA.filter((c) => c.band === "red-checklist");
    const [confirmedRow, unconfirmedRow] = red;
    if (!confirmedRow || !unconfirmedRow || confirmedRow.band !== "red-checklist")
      throw new Error("need 2 red criteria");

    const input = makeInput({
      record: {
        attestations: {},
        confirmations: { [confirmedRow.id]: { at } },
      },
    });

    const confirmed = rowFor(confirmedRow.id, input);
    expect(confirmed.status).toBe("met");
    expect(confirmed.controls).toBe("confirm");
    expect(confirmed.evidence().kind).toBe("confirmed");
    expect(confirmed.evidence().lines.join(" ")).toContain(at);

    const unconfirmed = rowFor(unconfirmedRow.id, makeInput());
    expect(unconfirmed.status).toBe("needs-human");
    expect(unconfirmed.controls).toBe("confirm");
    expect(unconfirmed.evidence().kind).toBe("needs-human");
    if (unconfirmedRow.band === "red-checklist") {
      expect(unconfirmed.evidence().lines).toEqual([
        unconfirmedRow.preSubmitChecklistText,
      ]);
    }
  });

  it("ignores the record in foreign mode: yellow stays Needs author, red stays Needs human", () => {
    const firstYellow = yellow[0];
    const firstRed = ALL_CRITERIA.find((c) => c.band === "red-checklist");
    if (!firstYellow || !firstRed) throw new Error("need yellow and red criteria");
    const input = makeInput({
      mode: "foreign",
      record: {
        attestations: { [firstYellow.id]: { answer: "yes", at } },
        confirmations: { [firstRed.id]: { at } },
      },
    });
    const yellowRow = rowFor(firstYellow.id, input);
    expect(yellowRow.status).toBe("needs-author");
    expect(yellowRow.controls).toBeNull();
    const redRow = rowFor(firstRed.id, input);
    expect(redRow.status).toBe("needs-human");
    expect(redRow.controls).toBeNull();
  });
});

describe("resolveCriteria — applicability", () => {
  const noFacts: CriteriaFacts = {
    fontBundled: false,
    deprecated: false,
    partnerPackage: false,
  };

  it("marks sections 9, 15 and 16 Not applicable in both modes when the facts say so", () => {
    for (const mode of ["authored", "foreign"] as const) {
      const result = resolveCriteria(makeInput({ mode, facts: noFacts }));
      const bySectionPrefix = (prefix: string) =>
        result.rows.filter((r) => r.criterion.section.startsWith(prefix));

      for (const [prefix, expected] of [
        ["9.", 7],
        ["15.", 5],
        ["16.", 2],
      ] as const) {
        const rows = bySectionPrefix(prefix);
        expect(rows).toHaveLength(expected);
        for (const row of rows) {
          expect(row.status).toBe("not-applicable");
          expect(row.controls).toBeNull();
          expect(row.evidence().kind).toBe("not-applicable");
          expect(row.evidence().lines[0]?.length).toBeGreaterThan(0);
        }
      }
      expect(result.counts["not-applicable"]).toBe(14);

      // A section-1 row is untouched by the three predicates.
      const section1 = result.rows.find((r) =>
        r.criterion.section.startsWith("1."),
      );
      expect(section1).toBeDefined();
      expect(section1?.status).not.toBe("not-applicable");
    }
  });
});
