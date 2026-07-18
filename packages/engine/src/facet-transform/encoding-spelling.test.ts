// US1 — encoding-spelling: parity + invertibility (T011) and the modifier-fold
// precondition (T013). Behavior-preserving normalization to house style.

import { describe, it, expect } from "vitest";
import { buildProducedSet } from "@keyboard-studio/contracts";
import { proposeFacetTransform } from "./propose.js";
import { applyFacetTransform } from "./verify.js";
import { foldSplitModifiersToNamed } from "./migrations/encoding-spelling.js";
import { makeMeasurement } from "./__fixtures__/measurements.js";
import {
  parseKeyboard,
  MIXED_ENCODING_KMN,
  SPLIT_SHIFT_FOLDABLE_KMN,
  SPLIT_SHIFT_UNFOLDABLE_KMN,
} from "./__fixtures__/keyboards.js";
import type { TransformProposal } from "./types.js";

describe("US1 encoding-spelling — parity + invertibility (T011 / SC-001)", () => {
  it("normalizes mixed encoding to house style: committed, produced-set unchanged, invertible", async () => {
    const ir = parseKeyboard(MIXED_ENCODING_KMN, "MixedEncoding");
    const measurement = makeMeasurement({
      facetId: "source.encoding.output-spelling",
      dominantValue: "quoted-literal",
      confidenceClass: "mixed",
    });

    const proposal = proposeFacetTransform(ir, measurement, {
      facetId: "source.encoding.output-spelling",
      preset: "house-style",
    });
    expect(proposal.kind).toBe("proposal");
    const p = proposal as TransformProposal;
    expect(p.previewKind).toBe("source-diff");
    expect(p.preview.sourceDiff, "per-role before/after present").toBeDefined();
    expect(p.transformImpactClass).toBe("behavior-preserving");

    // The commit gate runs parity (compile+simulate over the corpus) AND
    // invertibility (assertSemanticEquivalence). A `committed` result IS the
    // proof that both held (SC-001).
    const result = await applyFacetTransform(ir, p);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    // Produced-set is unchanged (behavior-preserving).
    expect([...buildProducedSet(result.nextIr)].sort()).toEqual([...buildProducedSet(ir)].sort());
    expect(result.producedSetChanged).toBe(false);
  }, 60_000);
});

describe("US1 modifier-fold precondition (T013)", () => {
  it("folds LCTRL+RCTRL rules with identical outputs into one CTRL rule", () => {
    const ir = parseKeyboard(SPLIT_SHIFT_FOLDABLE_KMN, "SplitCtrl");
    const rules = ir.groups[0]!.rules;
    const accepted = new Set(rules.map((r) => r.nodeId));

    const { ir: folded, ledger } = foldSplitModifiersToNamed(ir, accepted);

    // Two split rules → one folded CTRL rule.
    const foldedRules = folded.groups[0]!.rules;
    expect(foldedRules).toHaveLength(1);
    const vk = foldedRules[0]!.context[0];
    expect(vk?.kind).toBe("vkey");
    if (vk?.kind === "vkey") {
      expect(vk.modifiers).toContain("CTRL");
      expect(vk.modifiers).not.toContain("LCTRL");
      expect(vk.modifiers).not.toContain("RCTRL");
    }
    expect(ledger.filter((l) => l.outcome === "applied")).toHaveLength(2);
    // The source IR is never mutated (copy-return).
    expect(ir.groups[0]!.rules).toHaveLength(2);
  });

  it("refuses the fold per-site when the split outputs differ (precondition fails)", () => {
    const ir = parseKeyboard(SPLIT_SHIFT_UNFOLDABLE_KMN, "SplitCtrlDiff");
    const rules = ir.groups[0]!.rules;
    const accepted = new Set(rules.map((r) => r.nodeId));

    const { ir: folded, ledger } = foldSplitModifiersToNamed(ir, accepted);

    // No fold happened — both rules survive.
    expect(folded.groups[0]!.rules).toHaveLength(2);
    const refused = ledger.filter((l) => l.outcome === "refused");
    expect(refused.length).toBeGreaterThan(0);
    expect(refused[0]!.reason).toMatch(/different outputs/i);
  });
});
