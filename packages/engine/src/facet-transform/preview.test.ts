// Polish — preview completeness + fall-through (T039 / SC-003 / FR-011).
// Each previewKind surfaces every namedLoss, companion rewrite, and opaqueUntouched;
// producedSetDelta drives the FR-011 fall-through path.

import { describe, it, expect } from "vitest";
import { proposeFacetTransform } from "./propose.js";
import { producedSetDelta } from "./verify.js";
import { makeMeasurement, makeExceptionSite } from "./__fixtures__/measurements.js";
import {
  parseKeyboard,
  attachTouchLayout,
  touchKeyNodeId,
  MIXED_ENCODING_KMN,
  NFD_WITH_BACKSPACE_KMN,
  OPAQUE_FRAGMENT_KMN,
} from "./__fixtures__/keyboards.js";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import type { TransformProposal } from "./types.js";

describe("preview completeness (T039 / SC-003)", () => {
  it("ux-description preview surfaces every namedLoss + the derived-parameter table", () => {
    const ir = attachTouchLayout(parseKeyboard(MIXED_ENCODING_KMN, "PrevUx"));
    const m = makeMeasurement({
      facetId: "source.touch-combo-mechanism",
      dominantValue: "longpress",
      confidenceClass: "confident",
      exceptionSites: [makeExceptionSite(touchKeyNodeId(ir, "k_split"), "principled-split")],
    });
    const p = proposeFacetTransform(ir, m, {
      facetId: "source.touch-combo-mechanism",
      toValue: "flick",
    }) as TransformProposal;
    expect(p.previewKind).toBe("ux-description");
    expect(p.namedLosses.length).toBeGreaterThan(0);
    expect(p.preview.uxDescription).toBeTruthy();
    expect(p.derivedParameterReview?.rows.length).toBeGreaterThan(0);
  });

  it("output-diff preview surfaces the byte change + every companion rewrite", () => {
    const ir = parseKeyboard(NFD_WITH_BACKSPACE_KMN, "PrevOut");
    const m = makeMeasurement({
      facetId: "source.normalization-posture",
      dominantValue: "nfd",
      confidenceClass: "confident",
    });
    const p = proposeFacetTransform(ir, m, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    }) as TransformProposal;
    expect(p.previewKind).toBe("output-diff");
    expect(p.preview.outputDiff?.length).toBeGreaterThan(0);
    expect(p.companionRewrites?.length).toBeGreaterThan(0);
  });

  it("every preview reports opaqueUntouched when the source has opaque regions", () => {
    const ir = parseKeyboard(OPAQUE_FRAGMENT_KMN, "PrevOpaque");
    const m = makeMeasurement({
      facetId: "source.normalization-posture",
      dominantValue: "nfd",
      confidenceClass: "confident",
    });
    const p = proposeFacetTransform(ir, m, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    }) as TransformProposal;
    expect(p.opaqueUntouched?.length).toBeGreaterThan(0);
  });
});

describe("fall-through / produced-set delta (T039 / FR-011)", () => {
  it("producedSetDelta reports characters added/removed by a produced-set change", () => {
    const base = parseKeyboard(MIXED_ENCODING_KMN, "FallBase");
    // Synthetic produced-set-changing IR: add a rule that emits a new char 'z'.
    const changed: KeyboardIR = {
      ...base,
      groups: base.groups.map((g, i) =>
        i === 0
          ? {
              ...g,
              rules: [
                ...g.rules,
                {
                  nodeId: "synthetic#z",
                  context: [{ kind: "vkey", name: "K_Z", modifiers: [] }],
                  output: [{ kind: "char", value: "z" }],
                },
              ],
            }
          : g,
      ),
    };
    const delta = producedSetDelta(base, changed);
    expect(delta.added).toContain("z");
    expect(delta.removed).toHaveLength(0);
  });
});
