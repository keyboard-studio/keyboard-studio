// The facet-transform commit gate accepts the context-tolerance fix on a real
// imported keyboard (spec 078). sil_yoruba8 declares packaging assets
// (&LAYOUTFILE, &BITMAP, …) that the gate's minimal VFS does not hold; the gate
// must verify the rules, not trip over the missing files.

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { parse } from "../codec/parse.js";
import { classifyToleranceFinding, computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants } from "../pattern-apply/context-variants.js";
import { createContextToleranceMigrationRule } from "./migrations/context-tolerance.js";
import { applyFacetTransform } from "./verify.js";
import type { TransformProposal } from "./types.js";

const YORUBA8 = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../../keyboards/release/sil/sil_yoruba8/source/sil_yoruba8.kmn",
);

describe("applyFacetTransform — context tolerance on an imported keyboard (spec 078)", () => {
  it.skipIf(!existsSync(YORUBA8))("commits the accepted fix for sil_yoruba8", async () => {
    const ir = parse(readFileSync(YORUBA8, "utf-8"), "sil_yoruba8").ir;
    const report = await computeContextTolerance(ir);
    const result = await proposeContextVariants(ir, report);
    const gaps = new Set(report.findings.filter((f) => classifyToleranceFinding(f) === "gap").map((f) => f.ruleId));
    const fixable = [...new Set(result.variants.map((v) => v.sourceRuleId))].filter((id) => gaps.has(id));
    expect(fixable.length).toBeGreaterThan(0);

    const proposal: TransformProposal = {
      kind: "proposal",
      transitionId: { facetId: "context-tolerance", fromValue: "joined-only", toValue: "joined-or-separate" },
      transformImpactClass: "ux-changing",
      measurement: {
        facetId: "context-tolerance",
        dominantValue: "joined-only",
        confidenceClass: "confident",
        consistency: 1,
        exceptionSites: [],
        evidenceSize: fixable.length,
      },
      affectedSites: fixable.map((siteId) => ({
        siteId,
        causeTag: "gap-omission",
        defaultDisposition: "fix-offered",
        userDisposition: "accepted",
      })),
      implications: [],
      previewKind: "ux-description",
      preview: { previewKind: "ux-description", uxDescription: "" },
      status: "proposed",
      migrationRuleId: "context-tolerance",
      namedLosses: [],
    };
    const commit = await applyFacetTransform(ir, proposal, {
      ruleOverride: createContextToleranceMigrationRule(result, "echo"),
    });
    if (commit.status !== "committed") throw new Error(`${commit.failure.reason}\n${(commit.failure.detail ?? []).join("\n")}`);
    expect(commit.status).toBe("committed");
  }, 120_000);
});
