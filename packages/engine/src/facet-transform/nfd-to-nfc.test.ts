// US3 — nfd-to-nfc: output-diff + companion backspace-rewrite (T027 / SC-006).

import { describe, it, expect } from "vitest";
import { proposeFacetTransform } from "./propose.js";
import { applyFacetTransform } from "./verify.js";
import { makeMeasurement } from "./__fixtures__/measurements.js";
import { parseKeyboard, NFD_WITH_BACKSPACE_KMN } from "./__fixtures__/keyboards.js";
import type { TransformProposal } from "./types.js";

describe("US3 NFD → NFC — output diff + companion backspace rewrite (T027)", () => {
  const ir = parseKeyboard(NFD_WITH_BACKSPACE_KMN, "NfdBackspace");
  const measurement = makeMeasurement({
    facetId: "source.normalization-posture",
    dominantValue: "nfd",
    confidenceClass: "confident",
  });

  it("proposes an output-diff showing byte changes AND the backspace removal", () => {
    const p = proposeFacetTransform(ir, measurement, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    }) as TransformProposal;
    expect(p.kind).toBe("proposal");
    expect(p.previewKind).toBe("output-diff");
    // The emitted-byte change is shown (a + combining → composed).
    expect(p.preview.outputDiff?.length).toBeGreaterThan(0);
    const diff = p.preview.outputDiff![0]!;
    expect(diff.before).not.toBe(diff.after);
    expect(diff.after.normalize("NFC")).toBe(diff.after);
    // The companion backspace-rule removal is surfaced in the preview.
    expect(p.companionRewrites?.some((c) => c.kind === "backspace-rule-removal")).toBe(true);
  });

  it("commits: output composed, backspace override removed, still compiles", async () => {
    const p = proposeFacetTransform(ir, measurement, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    }) as TransformProposal;

    const result = await applyFacetTransform(ir, p);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    // The K_A rule now outputs a single composed codepoint.
    const kaRule = result.nextIr.groups[0]!.rules.find((r) =>
      r.context.some((c) => c.kind === "vkey" && c.name === "K_A"),
    )!;
    expect(kaRule.output).toHaveLength(1);
    expect(kaRule.output[0]).toEqual({ kind: "char", value: "á" });

    // The two-codepoint backspace override is gone (now unreachable).
    const bkspRule = result.nextIr.groups[0]!.rules.find((r) =>
      r.context.some((c) => c.kind === "vkey" && c.name === "K_BKSP"),
    );
    expect(bkspRule).toBeUndefined();

    // Produced-set unchanged (buildProducedSet already NFC-composes) — the change
    // is in emitted bytes, which the output-diff surfaces.
    expect(result.producedSetChanged).toBe(false);
  }, 60_000);
});
