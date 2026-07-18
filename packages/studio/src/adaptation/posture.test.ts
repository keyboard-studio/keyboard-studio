// T018 (US2) — inheritance-posture builder against a MOCKED index.
//
// buildPosture yields all-`default` entries on skip (never blank, US2 sc.4); one
// posture entry governs many proposal sites (SC-004); an individual override is
// LOCAL and does not rewrite the PostureEntry (FR-005); a base switch resets only
// entries whose evidence changed (mid-session base switch edge case).

import { describe, it, expect } from "vitest";
import {
  buildPosture,
  postureFor,
  reconcilePostureOnBaseSwitch,
  type InheritancePosture,
} from "./posture.ts";
import type { AdaptationEvidence } from "./evidence.ts";

function evidence(overrides: Partial<AdaptationEvidence> = {}): AdaptationEvidence {
  return {
    targetScript: "Latn",
    baseScriptDistribution: { Latn: 1.0 },
    siblingScriptSpread: { Latn: 3 },
    latinSubProfile: "plain",
    strategyFingerprint: { distribution: { "S-01": 0.7, "S-02": 0.2 }, residue: 0.1 },
    baseTargetMix: ["desktop", "touch"],
    statedDeviceMix: ["desktop"],
    provenanceTier: "content-derived",
    ...overrides,
  };
}

describe("buildPosture", () => {
  it("yields a full set of all-`default` entries on skip — never blank (US2 sc.4)", () => {
    const posture = buildPosture(evidence(), "base_x");
    expect(posture.baseId).toBe("base_x");
    expect(posture.entries).toHaveLength(4);
    expect(posture.entries.every((e) => e.source === "default")).toBe(true);
    expect(posture.entries.map((e) => e.facet).sort()).toEqual([
      "device-targets",
      "input-strategies",
      "script",
      "script-conventions",
    ]);
    // Every entry has a non-empty provenance (a §3c chip, not blank).
    expect(posture.entries.every((e) => e.provenance.length > 0)).toBe(true);
  });

  it("keeps input strategies when the base has a recognized fingerprint", () => {
    const p = buildPosture(evidence(), "base_x");
    expect(postureFor(p, "input-strategies").posture).toBe("keep");
  });

  it("proposes device targets when the base ships a different mix than stated", () => {
    const p = buildPosture(evidence(), "base_x");
    expect(postureFor(p, "device-targets").posture).toBe("propose");
  });

  it("threads the live TrustPolicy threshold for the script facet — agrees with classifyBaseScript", () => {
    // A base whose dominant script is 70% straddles the default 0.80 threshold.
    const ev = evidence({ baseScriptDistribution: { Latn: 0.7, Cyrl: 0.3 } });
    // Default policy (0.80): 0.7 < 0.80 → propose.
    expect(postureFor(buildPosture(ev, "base_x"), "script").posture).toBe("propose");
    // Lowered policy (0.60), as answered at Q-TP1: 0.7 ≥ 0.60 → keep.
    const lowered = buildPosture(ev, "base_x", {
      singleScriptThreshold: 0.6,
      allowFallbackTierPrefill: true,
      orthographyJoins: [],
      scope: "workflow",
    });
    expect(postureFor(lowered, "script").posture).toBe("keep");
  });
});

describe("postureFor — en-masse read (SC-004 / FR-005)", () => {
  it("one entry governs many proposal sites — every read returns the same decision", () => {
    const p = buildPosture(evidence(), "base_x");
    // Three independent proposal sites read the input-strategies posture.
    const site1 = postureFor(p, "input-strategies");
    const site2 = postureFor(p, "input-strategies");
    const site3 = postureFor(p, "input-strategies");
    expect(site1.posture).toBe(site2.posture);
    expect(site2.posture).toBe(site3.posture);
    expect(site1).toBe(site2); // same entry object — one lever, many sites
  });

  it("an individual site override is LOCAL — it does not rewrite the PostureEntry (FR-005)", () => {
    const p = buildPosture(evidence(), "base_x");
    const entry = postureFor(p, "input-strategies");
    const before = entry.posture;
    // A proposal site overrides locally: the override rides on the proposal.
    const localOverride = { ...entry, posture: "discard" as const, source: "overridden" as const };
    expect(localOverride.posture).toBe("discard");
    // The governing entry is untouched — later sites still see the original.
    expect(postureFor(p, "input-strategies").posture).toBe(before);
    expect(postureFor(p, "input-strategies").source).toBe("default");
  });
});

describe("reconcilePostureOnBaseSwitch — mid-session base switch", () => {
  it("resets only entries whose evidence changed; preserves confirmed unchanged entries", () => {
    // Author confirmed the input-strategies posture on base A.
    const base: InheritancePosture = buildPosture(evidence(), "base_a");
    const confirmed: InheritancePosture = {
      baseId: "base_a",
      entries: base.entries.map((e) =>
        e.facet === "input-strategies" ? { ...e, posture: "discard", source: "confirmed" } : e,
      ),
    };

    // Switch to base B: only the device mix changed (touch dropped); the strategy
    // fingerprint is identical, so its provenance is unchanged.
    const next = evidence({ baseTargetMix: ["desktop"] });
    const reconciled = reconcilePostureOnBaseSwitch(confirmed, next, "base_b");

    expect(reconciled.baseId).toBe("base_b");
    // Unchanged-evidence + confirmed → persists.
    const strat = postureFor(reconciled, "input-strategies");
    expect(strat.source).toBe("confirmed");
    expect(strat.posture).toBe("discard");
    // Changed-evidence → reset to default.
    const device = postureFor(reconciled, "device-targets");
    expect(device.source).toBe("default");
  });
});
