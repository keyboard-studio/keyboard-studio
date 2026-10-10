// Tests for outputBlockers (spec 094 research R5, contracts C6).

import { describe, it, expect } from "vitest";
import { outputBlockers, type OutputBlockersInput } from "./outputBlockers.ts";

const CLEAR: OutputBlockersInput = {
  touchStale: false,
  coverageBlocked: false,
  licenseUnparseable: false,
  attributionMissing: false,
  stageReady: true,
};

describe("outputBlockers", () => {
  it("is unblocked only when every input is clear", () => {
    expect(outputBlockers(CLEAR)).toEqual({ blocked: false, testBuildBlocked: false, blockers: [] });
  });

  it("orders blockers touchStale > coverage > license > attribution > notReady", () => {
    const r = outputBlockers({
      touchStale: true,
      coverageBlocked: true,
      licenseUnparseable: true,
      attributionMissing: true,
      stageReady: false,
    });
    expect(r.blocked).toBe(true);
    expect(r.blockers.map((b) => b.kind)).toEqual(["touchStale", "coverage", "license", "attribution", "notReady"]);
  });

  it.each([
    ["touchStale", { touchStale: true }, "touch"],
    ["attribution", { attributionMissing: true }, "identity"],
    ["coverage", { coverageBlocked: true }, undefined],
    ["license", { licenseUnparseable: true }, undefined],
    ["notReady", { stageReady: false }, undefined],
  ] as const)("%s names step %s", (kind, patch, stepId) => {
    const [first] = outputBlockers({ ...CLEAR, ...patch }).blockers;
    expect(first?.kind).toBe(kind);
    expect(first?.stepId).toBe(stepId);
  });

  it("gives every blocker but notReady a reason clause", () => {
    const r = outputBlockers({
      touchStale: true,
      coverageBlocked: true,
      licenseUnparseable: true,
      attributionMissing: true,
      stageReady: false,
      testVersionUnsupported: true,
    });
    for (const b of r.blockers) {
      expect(b.downloadAria.id).toMatch(/\S/);
      if (b.kind === "notReady") expect(b.reason).toBeUndefined();
      else expect(b.reason?.id).toMatch(/\S/);
    }
  });

  it("versionUnsupported blocks only the test build and names no step", () => {
    const r = outputBlockers({ ...CLEAR, testVersionUnsupported: true });
    expect(r.blocked).toBe(false);
    expect(r.testBuildBlocked).toBe(true);
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]?.kind).toBe("versionUnsupported");
    expect(r.blockers[0]?.stepId).toBeUndefined();
  });

  it("puts versionUnsupported after every download blocker", () => {
    const r = outputBlockers({ ...CLEAR, touchStale: true, testVersionUnsupported: true });
    expect(r.blockers.map((b) => b.kind)).toEqual(["touchStale", "versionUnsupported"]);
  });
});
