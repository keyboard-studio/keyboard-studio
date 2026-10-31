// PR-set manifest invariants (spec 107 FR-031, data-model PrSetEntry, research
// R1). A unit test: it reads prSet.json only, never the corpus.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PrSetEntry, Shape } from "./caseTypes.ts";
import { CANONICAL_CASES_PATH, PR_SET_PATH } from "./loadCases.ts";

const entries = JSON.parse(readFileSync(PR_SET_PATH, "utf8")) as PrSetEntry[];
const canonicalIds = new Set(
  (JSON.parse(readFileSync(CANONICAL_CASES_PATH, "utf8")) as { id: string }[]).map((r) => r.id),
);

// Every shape FR-031 names (non-latin is named in the bj_cree_woods row).
const FR031_SHAPES: readonly Shape[] = [
  "simple",
  "deadkey-heavy",
  "touch-layout",
  "any-index",
  "readonly-group",
  "opaque-group",
  "mixed-case-group",
  "non-latin",
  "regression-guard",
];

describe("prSet.json manifest", () => {
  it("covers every FR-031 shape", () => {
    const covered = new Set(entries.flatMap((e) => e.shape));
    expect(FR031_SHAPES.filter((s) => !covered.has(s))).toEqual([]);
  });

  it("every regression-guard entry says what it guards", () => {
    for (const e of entries.filter((x) => x.shape.includes("regression-guard"))) {
      expect(e.guards?.trim(), `${e.caseId ?? e.case?.id} needs guards`).toBeTruthy();
    }
  });

  it("has at most 6 entries (R1 budget)", () => {
    expect(entries.length).toBeLessThanOrEqual(6);
  });

  it("each entry has exactly one of caseId or case, a shape and a reason", () => {
    for (const e of entries) {
      const name = e.caseId ?? e.case?.id ?? "<unnamed>";
      expect((e.caseId === undefined) !== (e.case === undefined), `${name}: caseId xor case`).toBe(true);
      expect(e.shape.length, `${name}: shape`).toBeGreaterThan(0);
      expect(e.reason.trim(), `${name}: reason`).not.toBe("");
    }
  });

  it("a caseId references the canonical harness file; an inline case is outside it", () => {
    for (const e of entries) {
      if (e.caseId !== undefined) expect(canonicalIds.has(e.caseId), e.caseId).toBe(true);
      if (e.case !== undefined) expect(canonicalIds.has(e.case.id), e.case.id).toBe(false);
    }
  });
});
