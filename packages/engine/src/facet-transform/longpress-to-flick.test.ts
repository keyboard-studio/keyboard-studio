// US2 — longpress-to-flick: exception preservation + gap + per-site refusal
// (T020 / SC-004) and partial acceptance (T021 / FR-012).

import { describe, it, expect } from "vitest";
import type { KeyboardIR, TouchKeyIR } from "@keyboard-studio/contracts";
import { proposeFacetTransform } from "./propose.js";
import { applyFacetTransform } from "./verify.js";
import { simulate } from "../simulator/index.js";
import { makeMeasurement, makeExceptionSite } from "./__fixtures__/measurements.js";
import {
  parseKeyboard,
  attachTouchLayout,
  touchKeyNodeId,
  MIXED_ENCODING_KMN,
} from "./__fixtures__/keyboards.js";
import type { TransformProposal } from "./types.js";

function findKey(ir: KeyboardIR, keyId: string): TouchKeyIR {
  for (const p of ir.touchLayout!.platforms)
    for (const l of p.layers) for (const r of l.rows) for (const k of r.keys)
      if (k.id === keyId) return k;
  throw new Error(`key ${keyId} not found`);
}

function fixtureWithMeasurement() {
  const ir = attachTouchLayout(parseKeyboard(MIXED_ENCODING_KMN, "TouchBase"));
  const measurement = makeMeasurement({
    facetId: "source.touch-combo-mechanism",
    dominantValue: "longpress",
    confidenceClass: "confident",
    exceptionSites: [
      makeExceptionSite(touchKeyNodeId(ir, "k_split"), "principled-split"),
      makeExceptionSite(touchKeyNodeId(ir, "k_gap"), "gap-omission"),
    ],
  });
  return { ir, measurement };
}

describe("US2 longpress → flick — exception preservation (T020 / SC-004)", () => {
  it("preserves principled-split, offers the gap, refuses over-budget, converts dominant, output unchanged", async () => {
    const { ir, measurement } = fixtureWithMeasurement();

    const proposal = proposeFacetTransform(ir, measurement, {
      facetId: "source.touch-combo-mechanism",
      toValue: "flick",
    });
    expect(proposal.kind).toBe("proposal");
    const p = proposal as TransformProposal;
    expect(p.previewKind).toBe("ux-description");
    expect(p.namedLosses.join(" ")).toMatch(/discoverab/i);
    // TODO(test-strengthen): assert actual value of derivedParameterReview, not just existence
    expect(p.derivedParameterReview, "flick-direction review table").toBeDefined();

    // Principled-split preserved by default; gap offered as a fix (SC-004).
    const split = p.affectedSites.find((s) => s.siteId === touchKeyNodeId(ir, "k_split"))!;
    const gap = p.affectedSites.find((s) => s.siteId === touchKeyNodeId(ir, "k_gap"))!;
    expect(split.defaultDisposition).toBe("preserve");
    expect(gap.defaultDisposition).toBe("fix-offered");

    // Commit with defaults (no opt-in): dominant converts, exceptions preserved.
    const result = await applyFacetTransform(ir, p, { simulate });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    const next = result.nextIr;
    // Dominant key converted to flick.
    // TODO(test-strengthen): assert actual flick value shape, not just existence
    expect(findKey(next, "k_dom").flick).toBeDefined();
    expect(findKey(next, "k_dom").sk).toBeUndefined();
    expect(findKey(next, "k_dom").provenance).toBe("physical-suggested");
    // Principled-split preserved (still a longpress).
    // TODO(test-strengthen): assert actual sk value shape for k_split, not just existence
    expect(findKey(next, "k_split").sk).toBeDefined();
    expect(findKey(next, "k_split").flick).toBeUndefined();
    // Over-budget key refused per-site with a reason (never truncated).
    // TODO(test-strengthen): assert actual sk value shape for k_over, not just existence
    expect(findKey(next, "k_over").sk).toBeDefined();
    const refused = result.ledger.find((l) => l.outcome === "refused");
    expect(refused?.reason).toMatch(/budget/i);
    // Output unchanged (only input UX changed).
    expect(result.producedSetChanged).toBe(false);
  }, 60_000);
});

describe("US2 partial acceptance (T021 / FR-012)", () => {
  it("converts an opted-in principled-split site while leaving the gap preserved", async () => {
    const { ir, measurement } = fixtureWithMeasurement();
    const proposal = proposeFacetTransform(ir, measurement, {
      facetId: "source.touch-combo-mechanism",
      toValue: "flick",
    }) as TransformProposal;

    // Opt in to convert the principled-split site only.
    const splitId = touchKeyNodeId(ir, "k_split");
    for (const s of proposal.affectedSites) {
      if (s.siteId === splitId) s.userDisposition = "accepted";
    }

    const result = await applyFacetTransform(ir, proposal, { simulate });
    expect(result.status).toBe("committed");
    if (result.status !== "committed") return;

    const next = result.nextIr;
    // The accepted split site is now converted.
    expect(findKey(next, "k_split").flick).toBeDefined();
    expect(findKey(next, "k_split").sk).toBeUndefined();
    // The gap (not accepted) is still preserved.
    expect(findKey(next, "k_gap").sk).toBeDefined();
  }, 60_000);
});
