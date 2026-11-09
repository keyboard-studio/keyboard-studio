// Tests for the criteria resolver (spec 084, Phase 1).
//
// These run against the real catalog (ALL_CRITERIA) with baseline facts
// that make every criterion applicable. Counts are asserted RELATIONALLY
// (derived from the catalog), never as a pinned census: Matthew's
// 2026-10-31 ruling — lists grow, so a new row must not require a
// count bump here. What these tests pin is the band logic itself: every
// scaffolder-bake row resolves Met in authored mode with no findings,
// implemented layer-c checks resolve Met (the repo-context codes need a
// reviewContext), and the yellow/red bands wait on the author/human.

import { describe, expect, it } from "vitest";

import { ALL_CRITERIA, makeCompileResult } from "@keyboard-studio/contracts";
import type { Criterion, LintFinding } from "@keyboard-studio/contracts";

import { EMPTY_CRITERIA_RECORD } from "./criteriaTypes.ts";
import type {
  CriteriaFacts,
  CriteriaInput,
  CriterionStatus,
} from "./criteriaTypes.ts";
import { bakeTwinsOf, resolveCriteria } from "./resolveCriteria.ts";

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
  it("resolves every catalog row in catalog order (counts derived from the catalog, not a pinned census)", () => {
    const result = resolveCriteria(makeInput());

    expect(result.rows).toHaveLength(ALL_CRITERIA.length);
    expect(result.total).toBe(ALL_CRITERIA.length);
    expect(result.rows.map((r) => r.criterion.id)).toEqual(
      ALL_CRITERIA.map((c) => c.id),
    );

    // The counts partition the catalog: every row has exactly one status.
    const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(ALL_CRITERIA.length);
    expect(result.resolvedCount).toBe(
      result.counts.met + result.counts["not-applicable"],
    );
    // The §19 twin rows (19.1b/19.2b) concern adaptations; the baseline
    // carries no adaptation signal, so they are the only Not applicable rows.
    expect(result.counts["not-applicable"]).toBe(2);
    // Yellow rows wait on the author, red rows on a human — every row of
    // those bands, in the baseline with no record.
    expect(result.counts["needs-author"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "yellow-survey").length,
    );
    expect(result.counts["needs-human"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "red-checklist").length,
    );
    // The 18.13 row resolves Met: implemented check, no findings in the
    // synthetic baseline (no contextMissing), so it joins the met set.
    expect(
      result.rows.find(
        (r) => r.criterion.id === "18.13-packaged-fonts-cover-typed-characters",
      )?.status,
    ).toBe("met");
  });

  it("gives every row exactly one status and bandCounts that agree with counts", () => {
    const result = resolveCriteria(makeInput());

    for (const row of result.rows) {
      expect(ALL_STATUSES).toContain(row.status);
    }
    const counted = Object.values(result.counts).reduce((a, b) => a + b, 0);
    expect(counted).toBe(result.total);

    for (const status of ALL_STATUSES) {
      const bandTotal = Object.values(result.bandCounts).reduce(
        (sum, perBand) => sum + perBand[status],
        0,
      );
      expect(bandTotal).toBe(result.counts[status]);
    }
    // Every scaffolder-bake row resolves Met in the synthetic baseline.
    expect(result.bandCounts["scaffolder-bake"].met).toBe(
      ALL_CRITERIA.filter((c) => c.band === "scaffolder-bake").length,
    );
    // Layer-c Met is every layer-c row except the ones honestly Not yet
    // checkable (no implemented check / missing context) and the two
    // §19 twins (Not applicable without an adaptation signal).
    const layerC = ALL_CRITERIA.filter((c) => c.band === "layer-c-enforce").length;
    expect(result.bandCounts["layer-c-enforce"].met).toBe(
      layerC -
        result.bandCounts["layer-c-enforce"]["not-yet-checkable"] -
        result.bandCounts["layer-c-enforce"]["not-applicable"],
    );
    expect(result.bandCounts["yellow-survey"]["needs-author"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "yellow-survey").length,
    );
    expect(result.bandCounts["red-checklist"]["needs-human"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "red-checklist").length,
    );
  });

  it("keeps evidence lazy: a function on every row, not a prebuilt model", () => {
    const result = resolveCriteria(makeInput());
    for (const row of result.rows) {
      expect(typeof row.evidence).toBe("function");
    }
  });
});

describe("resolveCriteria — foreign baseline", () => {
  it("resolves the implemented layer-c checks, points bake rows at their twins, and offers no controls", () => {
    const result = resolveCriteria(makeInput({ mode: "foreign" }));

    expect(result.rows).toHaveLength(ALL_CRITERIA.length);
    // The counts partition the catalog (no pinned census: lists grow).
    const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(ALL_CRITERIA.length);
    // In foreign mode every scaffolder-bake row resolves Not applicable
    // (the twin gives the verdict) plus the 2 §19 twins.
    expect(result.counts["not-applicable"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "scaffolder-bake").length + 2,
    );
    expect(result.counts["needs-author"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "yellow-survey").length,
    );
    expect(result.counts["needs-human"]).toBe(
      ALL_CRITERIA.filter((c) => c.band === "red-checklist").length,
    );
    expect(result.counts["not-met"]).toBe(0);
    expect(result.resolvedCount).toBe(
      result.counts.met + result.counts["not-applicable"],
    );
    for (const row of result.rows) {
      expect(row.controls).toBeNull();
    }

    const bake = result.rows.find((r) => r.criterion.id.startsWith("1.2-"));
    expect(bake?.criterion.band).toBe("scaffolder-bake");
    expect(bake?.status).toBe("not-applicable");
    expect(bake?.evidence().kind).toBe("foreign-bake");
    expect(bake?.evidence().lines).toEqual([
      `For keyboards not built by the studio this is checked by ${ALL_CRITERIA.find((c) => c.id.startsWith("1.2b-"))?.id}.`,
    ]);
  });

  it("every scaffolder-bake row has exactly one lint twin (id prefix NUMb-)", () => {
    const bakes = ALL_CRITERIA.filter((c) => c.band === "scaffolder-bake");
    expect(bakes.length).toBeGreaterThan(0);
    for (const bake of bakes) {
      const twins = bakeTwinsOf(bake, ALL_CRITERIA);
      expect(twins.map((t) => t.id), bake.id).toHaveLength(1);
      expect(twins[0]?.band).toBe("layer-c-enforce");
    }
    // 1.1 must not capture 1.10's twin, nor 1.10 capture 1.1's.
    const kpj = ALL_CRITERIA.find((c) => c.id.startsWith("1.10-"));
    expect(kpj && bakeTwinsOf(kpj, ALL_CRITERIA)[0]?.id).toBe(
      "1.10b-kpj-format-adapted",
    );
  });

  it("does not copy a twin status onto the bake row (a twin failure counts once)", () => {
    const twin = ALL_CRITERIA.find((c) => c.id.startsWith("1.2b-"));
    const bake = ALL_CRITERIA.find((c) => c.id.startsWith("1.2-"));
    if (!twin || twin.band !== "layer-c-enforce" || !bake) throw new Error("no 1.2/1.2b");
    const finding: LintFinding = {
      code: twin.lintRuleId,
      severity: "warning",
      layer: "C",
      message: "bad placement",
    };
    const input = makeInput({ mode: "foreign", lintFindings: [finding] });
    expect(rowFor(twin.id, input).status).toBe("not-met");
    expect(rowFor(bake.id, input).status).toBe("not-applicable");
  });

  it("authored mode still resolves bake rows Met (the bake carve-out is authored-only)", () => {
    const bake = ALL_CRITERIA.find((c) => c.id.startsWith("1.2-"))!;
    expect(rowFor(bake.id, makeInput({ mode: "authored" })).status).toBe("met");
  });

  it("foreign needs-author rows say reviewer judgment, not an unrecorded attestation", () => {
    const yellow = ALL_CRITERIA.find((c) => c.band === "yellow-survey")!;
    const foreign = rowFor(yellow.id, makeInput({ mode: "foreign" })).evidence();
    expect(foreign.lines[0]).toBe("Reviewer judgment needed.");
    const authored = rowFor(yellow.id, makeInput({ mode: "authored" })).evidence();
    expect(authored.lines[0]).toBe(
      "No attestation has been recorded for this criterion yet.",
    );
  });

  it("foreign 18.6 and 7.6 give reviewer-facing reasons instead of the generic one", () => {
    const inventory = criterionByLintRuleId("KM_LINT_INVENTORY_UNCOVERED");
    const input = makeInput({
      mode: "foreign",
      contextMissing: {
        KM_LINT_INVENTORY_UNCOVERED: "the linguist inventory",
      },
    });
    const row = rowFor(inventory.id, input);
    expect(row.status).toBe("not-yet-checkable");
    expect(row.evidence().lines).toEqual([
      "Needs the studio's confirmed character inventory, which PR keyboards don't have; check by hand that every character the language needs can be typed.",
    ]);
    const warn = rowFor(
      criterionByLintRuleId("KM_LINT_COMPILE_HAS_WARNINGS").id,
      makeInput({ mode: "foreign" }),
    );
    expect(warn.evidence().lines).toEqual([
      "/review does not compile keyboards; check the PR's CI build for errors (7.21) and warnings (7.6).",
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

  it("renders File: path#L<line> for a positive line and no #L for line 0 (whole file)", () => {
    const at = (line: number): string[] =>
      rowFor(
        historyOrder.id,
        makeInput({
          lintFindings: [{ ...finding, location: { file: "HISTORY.md", line, column: 1 } }],
        }),
      ).evidence().lines;
    expect(at(12)).toContain("File: HISTORY.md#L12");
    expect(at(0)).toContain("File: HISTORY.md");
    expect(at(0).some((l) => l.includes("#L"))).toBe(false);
  });

  it("marks the mapped criterion Not met and attaches the finding as evidence", () => {
    const row = rowFor(historyOrder.id, makeInput({ lintFindings: [finding] }));
    expect(row.status).toBe("not-met");

    const evidence = row.evidence();
    expect(evidence.kind).toBe("lint-finding");
    expect(evidence.lintRuleId).toBe("KM_LINT_HISTORY_ORDER");
    expect(evidence.findings).toEqual([finding]);
    expect(evidence.lines).toContain(finding.message);
    expect(evidence.lines).toContain(finding.hint);

    const baseline = resolveCriteria(makeInput());
    const result = resolveCriteria(makeInput({ lintFindings: [finding] }));
    expect(result.counts.met).toBe(baseline.counts.met - 1); // one row flips Met -> Not met
    expect(result.counts["not-met"]).toBe(1);
    expect(result.resolvedCount).toBe(baseline.resolvedCount); // 148 + 1 + 2 = 149 + 2
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
        KM_LINT_INVENTORY_UNCOVERED: "the linguist inventory",
      },
    });
    const row = rowFor(inventory.id, input);
    expect(row.status).toBe("not-yet-checkable");
    expect(row.status).not.toBe("met");

    const evidence = row.evidence();
    expect(evidence.kind).toBe("context-missing");
    expect(evidence.lines).toEqual([
      "Cannot be checked yet: the linguist inventory is not available.",
    ]);

    const baseline = resolveCriteria(makeInput());
    const result = resolveCriteria(input);
    expect(result.counts.met).toBe(baseline.counts.met - 1); // one row flips Met -> Not yet checkable
    expect(result.counts["not-yet-checkable"]).toBe(
      baseline.counts["not-yet-checkable"] + 1,
    );
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

describe("resolveCriteria — compile-result mapping (Batch 1, §§7.6/7.21)", () => {
  const compileErrors = criterionByLintRuleId("KM_LINT_COMPILE_ERRORS");
  const compileWarnings = criterionByLintRuleId("KM_LINT_COMPILE_HAS_WARNINGS");

  function compileResult(
    diagnostics: Array<{ severity: "warning" | "error" | "fatal" | "info" | "hint"; message: string }>,
    success = true,
  ) {
    return makeCompileResult({
      success,
      artifacts: [],
      diagnostics: diagnostics.map((d) => ({
        code: "KM_ERROR_TEST" as const,
        layer: "A" as const,
        severity: d.severity,
        message: d.message,
      })),
      compileMs: 1,
      isWarmCompile: true,
    });
  }

  it("with no compile result, both rows are Not yet checkable — never Met", () => {
    for (const mode of ["authored", "foreign"] as const) {
      const input = makeInput({ mode });
      for (const row of [compileErrors, compileWarnings]) {
        const resolved = rowFor(row.id, input);
        expect(resolved.status).toBe("not-yet-checkable");
        expect(resolved.evidence().kind).toBe("context-missing");
        expect(resolved.evidence().lines.join(" ")).toContain(
          mode === "foreign" ? "does not compile keyboards" : "no compile result",
        );
      }
    }
  });

  it("a clean compile resolves both rows Met", () => {
    const input = makeInput({ compileResult: compileResult([]) });
    expect(rowFor(compileErrors.id, input).status).toBe("met");
    const warnings = rowFor(compileWarnings.id, input);
    expect(warnings.status).toBe("met");
    expect(warnings.evidence().kind).toBe("compile");
  });

  it("a warning-only compile fails 7.6 but passes 7.21", () => {
    const input = makeInput({
      compileResult: compileResult([
        { severity: "warning", message: "Something is off." },
      ]),
    });
    expect(rowFor(compileErrors.id, input).status).toBe("met");
    const warnings = rowFor(compileWarnings.id, input);
    expect(warnings.status).toBe("not-met");
    expect(warnings.evidence().lines).toContain("Something is off.");
  });

  it("an error compile fails both rows, naming the diagnostic", () => {
    const input = makeInput({
      compileResult: compileResult(
        [{ severity: "error", message: "Bad rule." }],
        false,
      ),
    });
    for (const row of [compileErrors, compileWarnings]) {
      const resolved = rowFor(row.id, input);
      expect(resolved.status).toBe("not-met");
      expect(resolved.evidence().lines).toContain("Bad rule.");
    }
  });

  it("success === false with no diagnostics still fails both rows", () => {
    const input = makeInput({ compileResult: compileResult([], false) });
    expect(rowFor(compileErrors.id, input).status).toBe("not-met");
    expect(rowFor(compileWarnings.id, input).status).toBe("not-met");
  });

  it("the mapping applies identically in foreign mode", () => {
    const input = makeInput({
      mode: "foreign",
      compileResult: compileResult([
        { severity: "fatal", message: "Parse fatal." },
      ]),
    });
    expect(rowFor(compileErrors.id, input).status).toBe("not-met");
    expect(rowFor(compileWarnings.id, input).status).toBe("not-met");
  });
});

describe("resolveCriteria — precertification (Batch 1)", () => {
  const precertified = new Set([
    "KM_LINT_FILES_OUTSIDE_FOLDER",
    "KM_LINT_STRAY_SCRATCH_FILES",
  ]);
  const filesOutside = criterionByLintRuleId("KM_LINT_FILES_OUTSIDE_FOLDER");
  const strayScratch = criterionByLintRuleId("KM_LINT_STRAY_SCRATCH_FILES");

  it("resolves 1.1 Met in authored mode from precertification, with generation evidence", () => {
    const row = rowFor(filesOutside.id, makeInput({ precertified }));
    expect(row.status).toBe("met");
    const evidence = row.evidence();
    expect(evidence.kind).toBe("precertified");
    expect(evidence.lines.join(" ")).toContain("Precertified by generation");
    expect(evidence.lines.join(" ")).toContain("closed manifest");
  });

  it("resolves 1.13 Met in authored mode via precertification, not the lint-pass path", () => {
    const row = rowFor(strayScratch.id, makeInput({ precertified }));
    expect(row.status).toBe("met");
    expect(row.evidence().kind).toBe("precertified");
  });

  it("without the precertified set, authored 1.1 resolves via its lint check (Batch 5)", () => {
    // Batch 5 implemented the Group C extraneous-files check for 1.1, so
    // without precertification it falls through to the lint gate: with no
    // findings it is a lint pass, never Not yet checkable.
    const row = rowFor(filesOutside.id, makeInput());
    expect(row.status).toBe("met");
    expect(row.evidence().kind).toBe("lint-pass");
  });

  it("foreign mode can never claim precertification, even if the set is passed by mistake", () => {
    const input = makeInput({ mode: "foreign", precertified });
    // 1.1 foreign resolves through its real Batch 5 check instead: with
    // no findings it is a lint pass, never a precertification.
    const outside = rowFor(filesOutside.id, input);
    expect(outside.status).toBe("met");
    expect(outside.evidence().kind).toBe("lint-pass");
    // 1.13 foreign resolves through its real scan check instead: with
    // no findings it is a lint pass, never a precertification.
    const stray = rowFor(strayScratch.id, input);
    expect(stray.status).toBe("met");
    expect(stray.evidence().kind).toBe("lint-pass");
  });

  it("a foreign scratch finding marks 1.13 Not met through the scan arm", () => {
    const finding: LintFinding = {
      code: "KM_LINT_STRAY_SCRATCH_FILES",
      severity: "warning",
      layer: "C",
      message: "The keyboard folder contains stray scratch/test file(s): test.txt.",
    };
    const row = rowFor(
      strayScratch.id,
      makeInput({ mode: "foreign", lintFindings: [finding] }),
    );
    expect(row.status).toBe("not-met");
    expect(row.evidence().kind).toBe("lint-finding");
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
      // 14 (sections 9/15/16) + 2 (§19 twins, no adaptation signal in
      // baseline); foreign mode adds the 40 scaffolder-bake rows, which
      // resolve Not applicable in favour of their lint twin.
      expect(result.counts["not-applicable"]).toBe(mode === "foreign" ? 56 : 16);

      // A section-1 row is untouched by the three predicates.
      const section1 = result.rows.find((r) =>
        r.criterion.section.startsWith("1."),
      );
      expect(section1).toBeDefined();
      expect(section1?.status).not.toBe("not-applicable");
    }
  });
});

describe("resolveCriteria — copyright-year and PR-comment facts", () => {
  const licenseLine = (line: string) =>
    new Map([["KM_LINT_COPYRIGHT_ABSENT", [`Found: "${line}"`]]]);
  const status = (id: string, input: CriteriaInput) => rowFor(id, input).status;

  it("a single LICENSE year makes 4.8 Not applicable; a range does not", () => {
    const single = makeInput({
      mode: "foreign",
      verifiedByCode: licenseLine("Copyright © 2026 GemaGemia"),
    });
    expect(status("4.8-year-range-starts-at-original", single)).toBe("not-applicable");
    const range = makeInput({
      mode: "foreign",
      verifiedByCode: licenseLine("Copyright (C) 2015-2026 SIL"),
    });
    expect(status("4.8-year-range-starts-at-original", range)).toBe("needs-author");
    for (const open of ["Copyright (C) 2024-present SIL", "Copyright (C) 2024– SIL"]) {
      const input = makeInput({ mode: "foreign", verifiedByCode: licenseLine(open) });
      expect(status("4.8-year-range-starts-at-original", input)).toBe("needs-author");
    }
  });

  it("4.2 is Not applicable only when LICENSE and every HISTORY entry share one year", () => {
    const withHistory = (earliest: number, latest: number) =>
      makeInput({
        mode: "foreign",
        verifiedByCode: licenseLine("Copyright © 2026 GemaGemia"),
        reviewerSource: { historyYears: { earliest, latest } },
      });
    expect(status("4.2-copyright-year-range-if-multiyear", withHistory(2026, 2026))).toBe(
      "not-applicable",
    );
    expect(status("4.2-copyright-year-range-if-multiyear", withHistory(2015, 2026))).toBe(
      "needs-author",
    );
    // No HISTORY years: nothing shows the keyboard stayed in one year.
    expect(
      status(
        "4.2-copyright-year-range-if-multiyear",
        makeInput({ mode: "foreign", verifiedByCode: licenseLine("Copyright © 2026 X") }),
      ),
    ).toBe("needs-author");
  });

  it("17.1 is Not applicable off a PR or on a PR with no comments, else shows the counts", () => {
    const id = "17.1-build-trigger-pr-comments-resolved";
    const facts = { ...BASELINE_FACTS };
    expect(
      status(id, makeInput({ mode: "foreign", facts: { ...facts, notAPullRequest: true } })),
    ).toBe("not-applicable");
    expect(
      status(id, makeInput({ mode: "foreign", facts: { ...facts, noPrComments: true } })),
    ).toBe("not-applicable");
    const row = rowFor(
      id,
      makeInput({
        mode: "foreign",
        reviewerSource: { prCommentCounts: { diff: 3, conversation: 1, reviews: 2 } },
      }),
    );
    expect(row.status).toBe("needs-human");
    expect(row.evidence().lines).toContain(
      "This PR has 3 comment(s) on the diff, 1 conversation comment(s) and 2 review(s) requesting changes or commenting.",
    );
  });
});

describe("resolveCriteria — advisory (sided Ctrl)", () => {
  const finding = (code: string): LintFinding => ({
    code,
    severity: "warning",
    layer: "C",
    message: `m ${code}`,
    location: { file: "source/k.kmn", line: 0 },
    hint: "h",
  });

  it("flags the sided-Ctrl advisory row as advisory, and the raw-Ctrl row not", () => {
    const input = makeInput({
      lintFindings: [finding("KM_LINT_SIDED_CTRL_ADVISORY"), finding("KM_LINT_RAW_CTRL")],
    });
    const advisory = rowFor("7.30-sided-ctrl-advisory", input);
    expect(advisory.status).toBe("not-met");
    expect(advisory.advisory).toBe(true);
    const raw = rowFor("7.29-no-raw-ctrl-rules", input);
    expect(raw.status).toBe("not-met");
    expect(raw.advisory).toBeUndefined();
  });

  it("does not flag the advisory row when it has no findings", () => {
    const row = rowFor("7.30-sided-ctrl-advisory", makeInput());
    expect(row.status).toBe("met");
    expect(row.advisory).toBeUndefined();
  });
});
