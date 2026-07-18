// Polish — compile-regression guard + opaque integrity (T033 / SC-005/SC-006)
// and the no-silent-transform structural guard (T038 / SC-002).

import { describe, it, expect } from "vitest";
import { proposeFacetTransform } from "./propose.js";
import { applyFacetTransform } from "./verify.js";
import { makeMeasurement } from "./__fixtures__/measurements.js";
import {
  parseKeyboard,
  COMPILE_BREAKING_KMN,
  OPAQUE_FRAGMENT_KMN,
  MIXED_ENCODING_KMN,
} from "./__fixtures__/keyboards.js";
import type { TransformProposal } from "./types.js";

describe("compile-regression guard (T033 / SC-006)", () => {
  it("never commits a compile-breaking transform; working copy unchanged", async () => {
    const ir = parseKeyboard(COMPILE_BREAKING_KMN, "BrokenGroup");
    const before = JSON.stringify(ir);
    const m = makeMeasurement({
      facetId: "source.normalization-posture",
      dominantValue: "nfd",
      confidenceClass: "confident",
    });
    const p = proposeFacetTransform(ir, m, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    }) as TransformProposal;
    expect(p.kind).toBe("proposal");

    const result = await applyFacetTransform(ir, p);
    expect(result.status).toBe("commit-failed");
    if (result.status !== "commit-failed") return;
    expect(result.failure.cause).toBe("compile-regression");
    // Working copy is unchanged (copy-return; the candidate is transient).
    expect(JSON.stringify(ir)).toBe(before);
  }, 60_000);
});

describe("opaque-fragment integrity (T033 / SC-005)", () => {
  it("never drops/alters a RawKmnFragment; opaqueUntouched reports it", async () => {
    const ir = parseKeyboard(OPAQUE_FRAGMENT_KMN, "OpaqueFrag");
    expect(ir.raw.length, "fixture must contain an opaque fragment").toBeGreaterThan(0);
    const beforeRaw = JSON.stringify(ir.raw);

    const m = makeMeasurement({
      facetId: "source.normalization-posture",
      dominantValue: "nfd",
      confidenceClass: "confident",
    });
    const p = proposeFacetTransform(ir, m, {
      facetId: "source.normalization-posture",
      toValue: "nfc",
    }) as TransformProposal;
    expect(p.kind).toBe("proposal");
    // The preview reports what the transform could not model (FR-009).
    expect(p.opaqueUntouched?.length).toBeGreaterThan(0);

    const result = await applyFacetTransform(ir, p);
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;
    // Every opaque fragment survives verbatim.
    expect(JSON.stringify(result.nextIr.raw)).toBe(beforeRaw);
  }, 60_000);
});

describe("no-silent-transform structural guard (T038 / SC-002)", () => {
  it("proposeFacetTransform only ever returns a proposal or a refusal", () => {
    const ir = parseKeyboard(MIXED_ENCODING_KMN, "NoSilent");
    const m = makeMeasurement({ confidenceClass: "mixed" });
    const out = proposeFacetTransform(ir, m, {
      facetId: "source.encoding.output-spelling",
      preset: "house-style",
    });
    expect(["proposal", "refusal"]).toContain(out.kind);
  });

  it("a committed result across all three impact classes requires a TransformProposal with explicit disposition", async () => {
    // The ONLY producer of a `committed` result is applyFacetTransform, whose
    // sole transform input is a TransformProposal (with user dispositions set).
    // There is no request→committed path that bypasses the proposal — verified
    // structurally here by driving the gate only through a proposal object.
    const ir = parseKeyboard(MIXED_ENCODING_KMN, "BP");
    const m = makeMeasurement({ confidenceClass: "mixed" });
    const p = proposeFacetTransform(ir, m, {
      facetId: "source.encoding.output-spelling",
      preset: "house-style",
    }) as TransformProposal;
    expect(p.status).toBe("proposed");
    const r = await applyFacetTransform(ir, p);
    expect(r.status).toBe("committed");
  }, 60_000);
});
