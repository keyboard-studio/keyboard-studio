/**
 * License-fork-eligibility classifier unit tests (spec 043 US3; FR-030; AS #1,
 * Edge Cases). Known permissive/copyleft headers map to their category; a
 * missing or off-template license reads `unspecified`, never inferred.
 */

import { describe, it, expect } from "vitest";

import { classifyLicenseForkEligibility, licenseForkEligibilityFallback } from "./license-fork-eligibility-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "license-fork-eligibility",
  title: "License fork eligibility",
  description: "Whether the base license permits forking.",
  valueType: "enum",
  limits: { values: ["permissive", "copyleft", "proprietary-restricted", "unspecified"], open: false },
  likelihoodSemantics: "license category from a known-signature match; unspecified when none",
  derivation: { archetype: "declared-metadata", classifierId: "license-fork-eligibility-classifier", fallbackChain: ["declared-metadata", "default-fallback"] },
  feedsSessionFacets: ["env.license-fork-eligibility"],
  schemaVersion: 1,
};

const KPS_PATH = "release/t/test/source/test.kps";
const LICENSE_PATH = "release/t/test/LICENSE.md";
const MINIMAL_KPS = `<?xml version="1.0"?><Package><Keyboards><Keyboard><ID>test</ID></Keyboard></Keyboards></Package>`;

function makeKb(licenseText: string | null, kpsXml: string | null = MINIMAL_KPS): ScannedKeyboard {
  const sources: ScannedSource[] = [];
  if (kpsXml !== null) sources.push({ path: KPS_PATH, bytes: Buffer.from(kpsXml, "utf8") });
  if (licenseText !== null) sources.push({ path: LICENSE_PATH, bytes: Buffer.from(licenseText, "utf8") });
  return { id: "test", kpsPath: KPS_PATH, kmnPath: null, kmnText: null, sources };
}

const MIT = "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...";
const GPL = "GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n...";

describe("classifyLicenseForkEligibility", () => {
  it("content tier is empty (the deciding signal is a package file)", () => {
    expect(classifyLicenseForkEligibility({} as never, DEF)).toBeNull();
  });
});

describe("licenseForkEligibilityFallback", () => {
  it("MIT header → permissive (declared-metadata)", () => {
    const result = licenseForkEligibilityFallback(makeKb(MIT), DEF);
    expect(result.value).toBe("permissive");
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("GPL header → copyleft", () => {
    expect(licenseForkEligibilityFallback(makeKb(GPL), DEF).value).toBe("copyleft");
  });

  it("license present but off-template → unspecified (never inferred)", () => {
    const result = licenseForkEligibilityFallback(makeKb("Copyright 2026 Someone. See our website."), DEF);
    expect(result.value).toBe("unspecified");
  });

  it("no license file → unspecified", () => {
    const result = licenseForkEligibilityFallback(makeKb(null), DEF);
    expect(result.value).toBe("unspecified");
  });

  it("no readable .kps → unspecified at default-fallback tier", () => {
    const result = licenseForkEligibilityFallback(makeKb(null, null), DEF);
    expect(result.value).toBe("unspecified");
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.analysisOutcome).toBe("fallback-only");
  });
});
