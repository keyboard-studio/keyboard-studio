/**
 * Target/device-mix classifier unit tests (spec 037 US3; FR-006/FR-014).
 *
 * The classifier's content tier is empty (device targets are declared metadata +
 * artifact presence, none in the parsed rule IR), so all work is in
 * `targetMixFallback(kb, def)`, exercised directly here with synthetic
 * `ScannedKeyboard` inputs (a `.kps` XML string + optional `.kmn` text + optional
 * touch-layout sibling).
 */

import { describe, it, expect } from "vitest";

import { classifyTargetMix, targetMixFallback } from "./target-mix-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const TARGET_FACET_DEF: FacetDefinition = {
  id: "target-mix",
  title: "Target device mix",
  description: "Device classes the keyboard supports.",
  valueType: "set",
  limits: { values: ["desktop", "touch", "web"], open: false },
  likelihoodSemantics: "membership per device class",
  derivation: {
    archetype: "declared-metadata",
    classifierId: "target-mix-classifier",
    fallbackChain: ["declared-metadata", "default-fallback"],
  },
  feedsSessionFacets: ["env.device-mix"],
  schemaVersion: 1,
};

function kpsXml(inner: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Package><Keyboards><Keyboard><Name>t</Name></Keyboard></Keyboards>${inner}</Package>`;
}

interface KbSpec {
  kps?: string;
  kmn?: string | null;
  touchLayout?: boolean;
}

function makeKb(spec: KbSpec): ScannedKeyboard {
  const kpsPath = "release/t/test/source/test.kps";
  const sources: ScannedSource[] = [];
  if (spec.kps !== undefined) sources.push({ path: kpsPath, bytes: Buffer.from(spec.kps, "utf8") });
  if (spec.touchLayout) {
    sources.push({ path: "release/t/test/source/test.keyman-touch-layout", bytes: Buffer.from("{}", "utf8") });
  }
  return {
    id: "test",
    kpsPath,
    kmnPath: spec.kmn != null ? "release/t/test/source/test.kmn" : null,
    kmnText: spec.kmn ?? null,
    sources,
  };
}

describe("classifyTargetMix", () => {
  it("has no content tier — always returns null (routes to the fallback path)", () => {
    // A non-null IR is irrelevant; the classifier reads none of it.
    expect(classifyTargetMix({} as never, TARGET_FACET_DEF)).toBeNull();
  });
});

describe("targetMixFallback", () => {
  it("desktop-only: no <Targets>, no &TARGETS, no artifact -> ['desktop'], default-fallback", () => {
    const kb = makeKb({ kps: kpsXml("") });
    const result = targetMixFallback(kb, TARGET_FACET_DEF);
    expect(result.value).toEqual(["desktop"]);
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.analysisOutcome).toBe("fully");
    expect(result.confidenceClass).toBe("confident");
  });

  it("touch-layout artifact present but not declared -> includes 'touch', mismatch flagged, declared-metadata tier", () => {
    const kb = makeKb({ kps: kpsXml("<Targets>windows</Targets>"), touchLayout: true });
    const result = targetMixFallback(kb, TARGET_FACET_DEF);
    expect(result.value).toEqual(["desktop", "touch"]);
    expect(result.provenanceTier).toBe("declared-metadata");
    expect(result.confidenceClass).toBe("mixed");
    expect(result.notes).toMatch(/artifact/i);
  });

  it("web-declaring keyboard -> includes 'web'", () => {
    const kb = makeKb({ kps: kpsXml("<Targets>windows web</Targets>") });
    const result = targetMixFallback(kb, TARGET_FACET_DEF);
    expect(result.value).toEqual(["desktop", "web"]);
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("&TARGETS 'any' sentinel expands to all device classes", () => {
    const kb = makeKb({ kps: kpsXml(""), kmn: "store(&TARGETS) 'any'\nbegin Unicode > use(main)\n" });
    const result = targetMixFallback(kb, TARGET_FACET_DEF);
    expect(result.value).toEqual(["desktop", "touch", "web"]);
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("mobile/tablet platforms map to 'touch'", () => {
    const kb = makeKb({ kps: kpsXml("<Targets>windows mobile tablet</Targets>") });
    const result = targetMixFallback(kb, TARGET_FACET_DEF);
    expect(result.value).toEqual(["desktop", "touch"]);
  });
});
