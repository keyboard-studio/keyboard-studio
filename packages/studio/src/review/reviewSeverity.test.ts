// Severity classification for the two report surfaces (reviewSeverity).
//
// The mappings are exercised through the REAL resolver over a small
// fixture catalog, so a change to resolution shows up here as a
// changed severity, not as a stale hand-built row.

import { describe, expect, it } from "vitest";

import type { Criterion, LintFinding } from "@keyboard-studio/contracts";

import { EMPTY_CRITERIA_RECORD } from "../criteria/criteriaTypes.ts";
import type {
  CriteriaInput,
  ResolvedRow,
} from "../criteria/criteriaTypes.ts";
import { resolveCriteria } from "../criteria/resolveCriteria.ts";
import {
  severityForAuthoredRow,
  severityForReviewRow,
} from "./reviewSeverity.ts";

const CRITERIA: Criterion[] = [
  {
    id: "fix.1-bake",
    section: "1. Fixture section",
    band: "scaffolder-bake",
    description: "Fixture bake criterion",
    scaffolderRule: "fixture-bake-rule",
  },
  {
    id: "fix.2-hard-failure",
    section: "3. Fixture history",
    band: "layer-c-enforce",
    description: "Fixture hard failure criterion",
    lintRuleId: "KM_LINT_HISTORY_ORDER",
  },
  {
    id: "fix.3-warn-failure",
    section: "3. Fixture history",
    band: "layer-c-enforce",
    description: "Fixture warning failure criterion",
    lintRuleId: "KM_WARN_TOUCH_ROW_COUNT",
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
    id: "fix.6-unimplemented",
    section: "3. Fixture history",
    band: "layer-c-enforce",
    description: "Fixture unimplemented criterion",
    lintRuleId: "KM_LINT_NO_SUCH_CHECK",
  },
  {
    id: "fix.7-font-license",
    section: "9. Fixture fonts",
    band: "layer-c-enforce",
    description: "Fixture font license criterion",
    lintRuleId: "KM_LINT_FONT_LICENSE_EMPTY",
  },
  {
    id: "fix.8-advisory",
    section: "3. Fixture history",
    band: "layer-c-enforce",
    description: "Fixture advisory criterion",
    lintRuleId: "KM_LINT_SIDED_CTRL_ADVISORY",
  },
];

const finding = (code: string): LintFinding => ({
  code,
  severity: "warning",
  layer: "C",
  message: `Fixture finding for ${code}.`,
});

function rowsFor(mode: "authored" | "foreign") {
  return resolveCriteria({
    criteria: CRITERIA,
    mode,
    lintFindings: [
      finding("KM_LINT_HISTORY_ORDER"),
      finding("KM_WARN_TOUCH_ROW_COUNT"),
      finding("KM_LINT_SIDED_CTRL_ADVISORY"),
    ],
    record: EMPTY_CRITERIA_RECORD,
    // No bundled font: the font row resolves Not applicable.
    facts: { fontBundled: false, deprecated: true, partnerPackage: true },
  } satisfies CriteriaInput).rows;
}

const byId = (
  rows: ReturnType<typeof rowsFor>,
  id: string,
) => rows.find((r) => r.criterion.id === id)!;

describe("severityForReviewRow (foreign)", () => {
  it("hides bake and not-applicable rows; met is met, hard failures are errors, the rest are warnings", () => {
    const rows = rowsFor("foreign");
    // No "1b-" twin exists in the fixture, so the foreign bake row is
    // Not yet checkable — still hidden behind the (absent) twin.
    expect(byId(rows, "fix.1-bake").status).toBe("not-yet-checkable");
    expect(severityForReviewRow(byId(rows, "fix.1-bake"))).toBe("hidden");
    expect(severityForReviewRow(byId(rows, "fix.7-font-license"))).toBe("hidden");
    expect(byId(rows, "fix.2-hard-failure").status).toBe("not-met");
    expect(severityForReviewRow(byId(rows, "fix.2-hard-failure"))).toBe("error");
    expect(byId(rows, "fix.3-warn-failure").status).toBe("not-met");
    expect(severityForReviewRow(byId(rows, "fix.3-warn-failure"))).toBe("warning");
    // The resolver flags the advisory kind on the row itself.
    expect(byId(rows, "fix.8-advisory").status).toBe("not-met");
    expect(byId(rows, "fix.8-advisory").advisory).toBe(true);
    expect(severityForReviewRow(byId(rows, "fix.8-advisory"))).toBe("warning");
    expect(severityForReviewRow(byId(rows, "fix.4-yellow"))).toBe("warning");
    expect(severityForReviewRow(byId(rows, "fix.5-red"))).toBe("warning");
    expect(severityForReviewRow(byId(rows, "fix.6-unimplemented"))).toBe("warning");
  });

  it("a met layer-c row is met", () => {
    const rows = resolveCriteria({
      criteria: CRITERIA,
      mode: "foreign",
      lintFindings: [],
      record: EMPTY_CRITERIA_RECORD,
      facts: { fontBundled: true, deprecated: true, partnerPackage: true },
    } satisfies CriteriaInput).rows;
    expect(byId(rows, "fix.2-hard-failure").status).toBe("met");
    expect(severityForReviewRow(byId(rows, "fix.2-hard-failure"))).toBe("met");
  });
});

describe("severityForAuthoredRow (Criteria page)", () => {
  it("classifies bake rows as met — the guarantee is the verdict here, not a twin's shadow", () => {
    const rows = rowsFor("authored");
    expect(byId(rows, "fix.1-bake").status).toBe("met");
    expect(severityForAuthoredRow(byId(rows, "fix.1-bake"))).toBe("met");
  });

  it("hard failures are errors, KM_WARN failures and needs-* rows are warnings", () => {
    const rows = rowsFor("authored");
    expect(severityForAuthoredRow(byId(rows, "fix.2-hard-failure"))).toBe("error");
    expect(severityForAuthoredRow(byId(rows, "fix.3-warn-failure"))).toBe("warning");
    expect(severityForAuthoredRow(byId(rows, "fix.4-yellow"))).toBe("warning");
    expect(severityForAuthoredRow(byId(rows, "fix.5-red"))).toBe("warning");
    expect(severityForAuthoredRow(byId(rows, "fix.6-unimplemented"))).toBe("warning");
  });

  it("an advisory failure is a warning here too — it only advises, never blocks", () => {
    const rows = rowsFor("authored");
    expect(byId(rows, "fix.8-advisory").status).toBe("not-met");
    expect(byId(rows, "fix.8-advisory").advisory).toBe(true);
    expect(severityForAuthoredRow(byId(rows, "fix.8-advisory"))).toBe("warning");
  });

  it("not-applicable rows classify as nothing: shown under All, in no bucket", () => {
    const rows = rowsFor("authored");
    expect(byId(rows, "fix.7-font-license").status).toBe("not-applicable");
    expect(severityForAuthoredRow(byId(rows, "fix.7-font-license"))).toBeUndefined();
  });
});

// Merged from spec 114 (#2524): the advisory row kind, which the
// resolver flags on the row itself — kept here with hand-built rows,
// as on main. The fixture catalog above covers it through the
// resolver as well (fix.8-advisory), for the authored mapping.
function notMet(lintRuleId: string, advisory?: true): ResolvedRow {
  return {
    criterion: { id: "x", band: "layer-c-enforce", lintRuleId } as ResolvedRow["criterion"],
    status: "not-met",
    controls: null,
    ...(advisory ? { advisory } : {}),
    evidence: () => ({ kind: "lint-finding", lines: [] }),
  };
}

describe("severityForReviewRow", () => {
  it("shows an advisory row as a warning and a raw-Ctrl failure as an error", () => {
    expect(severityForReviewRow(notMet("KM_LINT_SIDED_CTRL_ADVISORY", true))).toBe("warning");
    expect(severityForReviewRow(notMet("KM_LINT_RAW_CTRL"))).toBe("error");
  });
});
