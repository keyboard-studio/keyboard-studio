// spec 062 (FR-011, T022): running proposeContextVariants + commit twice
// against the same starting IR produces byte-identical resulting IR.
// context-variants.test.ts already proves this for proposeContextVariants()
// in isolation; this test exercises the SAME invariant end-to-end through
// the commit path (createContextToleranceMigrationRule.apply()), since a
// re-run must recognize and replace its own previously-committed rules, not
// just its own previously-PROPOSED (never-committed) ones.

import { describe, it, expect } from "vitest";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { parse } from "../codec/parse.js";
import { computeContextTolerance } from "../validator/context-tolerance.js";
import { proposeContextVariants } from "./context-variants.js";
import type { ContextVariantsResult } from "./context-variants.js";
import { createContextToleranceMigrationRule, type ContextToleranceWriteBackPolicy } from "../facet-transform/migrations/context-tolerance.js";

const HEADER = [
  "store(&NAME) 'ContextVariantsIdempotency'",
  "store(&VERSION) '14.0'",
  "store(&KEYBOARDVERSION) '1.0'",
  "store(&TARGETS) 'any'",
  "store(&mnemoniclayout) '1'",
  "",
  "begin Unicode > use(main)",
  "",
].join("\n");

const GAP_KMN = [
  HEADER,
  "group(main) using keys",
  "",
  "store(base) U+00E0",
  "store(acute) U+00E2",
  "store(key.act) ']'",
  "",
  "any(base) + any(key.act) > index(acute,1)",
  "+ ']' > U+00B4",
  "",
].join("\n");

const MEASUREMENT = {
  facetId: "context-tolerance",
  dominantValue: "not-tolerant",
  confidenceClass: "confident" as const,
  consistency: 1,
  exceptionSites: [],
  evidenceSize: 1,
};

async function proposeAndCommit(
  ir: KeyboardIR,
  writeBackPolicy?: ContextToleranceWriteBackPolicy,
): Promise<{ ir: KeyboardIR; result: ContextVariantsResult }> {
  const report = await computeContextTolerance(ir);
  const result = await proposeContextVariants(ir, report);
  const acceptedSiteIds = result.variants.map((v) => v.sourceRuleId);
  const rule = createContextToleranceMigrationRule(result, writeBackPolicy);
  return { ir: rule.apply(result.ir, acceptedSiteIds, MEASUREMENT).candidateIr, result };
}

async function commitOnce(ir: KeyboardIR): Promise<KeyboardIR> {
  return (await proposeAndCommit(ir)).ir;
}

describe("context-tolerance commit idempotency (spec 062 FR-011, T022)", () => {
  it("committing twice against the same starting IR produces byte-identical IR", async () => {
    const { ir } = parse(GAP_KMN, "idempotent_commit");
    const once = await commitOnce(ir);
    const twice = await commitOnce(once);
    expect(twice).toEqual(once);
  }, 30_000);

  it('re-diagnosing after an "own-form" commit reports the fixed diacritic rule as tolerant again', async () => {
    const { ir } = parse(GAP_KMN, "idempotent_report_own_form");
    const firstReport = await computeContextTolerance(ir);
    const diacriticRuleId = firstReport.findings.find((f) => f.failingKeystrokes !== undefined)?.ruleId;
    expect(diacriticRuleId).toBeDefined();

    const { ir: committed } = await proposeAndCommit(ir, "own-form");
    const secondReport = await computeContextTolerance(committed);
    // "own-form" rewrites the decomposed path's output to be byte-identical
    // to the precomposed path's — the diagnostic's plain byte-equality check
    // (computeContextTolerance never re-derives canonical equivalence, only
    // exact-match) sees the rule as tolerant again.
    expect(secondReport.findings.find((f) => f.ruleId === diacriticRuleId)?.status).toBe("tolerant");
  }, 30_000);

  it('re-diagnosing after the default ("echo") commit still reports a byte-level gap, canonically equivalent by design', async () => {
    const { ir } = parse(GAP_KMN, "idempotent_report_echo");
    const firstReport = await computeContextTolerance(ir);
    const diacriticRuleId = firstReport.findings.find((f) => f.failingKeystrokes !== undefined)?.ruleId;
    expect(diacriticRuleId).toBeDefined();

    const { ir: committed } = await proposeAndCommit(ir); // default: "echo"
    const secondReport = await computeContextTolerance(committed);
    const finding = secondReport.findings.find((f) => f.ruleId === diacriticRuleId);
    // "echo" deliberately keeps the decomposed path's output decomposed
    // (FR-007) rather than rewriting it to match the precomposed path's own
    // form — so computeContextTolerance's byte-exact comparison (it has no
    // notion of canonical equivalence; that's this feature's own job, one
    // layer up) still reports a gap. The two outputs are nonetheless
    // canonically equivalent — the actual guarantee Story 1 makes — which is
    // the property this assertion checks instead of byte identity.
    expect(finding?.status).toBe("not-analysed");
    expect(finding?.failingKeystrokes).toBeDefined();
    expect(finding?.precomposedOutput?.normalize("NFC")).toBe(finding?.decomposedOutput?.normalize("NFC"));
  }, 30_000);
});
