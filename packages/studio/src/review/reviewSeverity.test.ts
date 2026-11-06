import { describe, expect, it } from "vitest";

import type { ResolvedRow } from "../criteria/criteriaTypes.ts";
import { severityForReviewRow } from "./reviewSeverity.ts";

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
