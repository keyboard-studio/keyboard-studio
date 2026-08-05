// Matrix invariant + drift-guard test (T006) — asserts contract invariants 1–5.

import { describe, it, expect } from "vitest";
import {
  TRANSITION_MATRIX,
  FACET_IMPACT_CLASS,
  GATE_FACETS,
} from "./transition-matrix.js";

describe("transition matrix invariants (contract §Matrix invariants)", () => {
  it("(1) every requestable pair has a row with a rule or a decline reason", () => {
    for (const row of TRANSITION_MATRIX) {
      if (row.supported) {
        expect(row.migrationRuleId, `${row.facetId} ${row.fromValue}→${row.toValue}`).not.toBeNull();
      } else {
        expect(row.declineReason, `${row.facetId} ${row.fromValue}→${row.toValue}`).toBeTruthy();
        expect(row.migrationRuleId).toBeNull();
      }
    }
  });

  it("(2) lossless ⇒ behavior-preserving", () => {
    for (const row of TRANSITION_MATRIX) {
      if (row.lossProfile === "lossless") {
        expect(row.transformImpactClass, `${row.facetId} ${row.fromValue}→${row.toValue}`).toBe(
          "behavior-preserving",
        );
      }
    }
  });

  it("(3) impact-class drift guard: each row matches its facet's declared class", () => {
    for (const row of TRANSITION_MATRIX) {
      expect(
        row.transformImpactClass,
        `${row.facetId} ${row.fromValue}→${row.toValue}`,
      ).toBe(FACET_IMPACT_CLASS[row.facetId]);
    }
  });

  it("(4) gate facets produce no rows", () => {
    for (const gate of GATE_FACETS.keys()) {
      const rows = TRANSITION_MATRIX.filter((r) => r.facetId === gate);
      expect(rows, `gate facet ${gate} must have no matrix rows`).toHaveLength(0);
    }
  });

  it("(5) `mixed` is a valid fromValue", () => {
    const mixedRows = TRANSITION_MATRIX.filter((r) => r.fromValue === "mixed");
    expect(mixedRows.length).toBeGreaterThan(0);
    for (const row of mixedRows) {
      expect(row.supported).toBe(true);
    }
  });

  it("supported rows carry a lossless profile only when behavior-preserving; others name losses", () => {
    for (const row of TRANSITION_MATRIX) {
      if (row.supported && row.lossProfile === "lossy-with-named-loss") {
        expect(row.namedLosses.length, `${row.facetId} ${row.fromValue}→${row.toValue}`).toBeGreaterThan(0);
      }
    }
  });
});
