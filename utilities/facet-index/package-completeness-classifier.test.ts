/**
 * Package-completeness classifier unit tests (spec 043 US3; FR-034; AS #5). The
 * classifier absorbs OSK/help/predictive/icon presence into one checklist set.
 */

import { describe, it, expect } from "vitest";

import { classifyPackageCompleteness, packageCompletenessFallback } from "./package-completeness-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "package-completeness",
  title: "Package completeness",
  description: "Checklist of optional package components present.",
  valueType: "set",
  limits: { values: ["osk", "help", "predictive", "icon"], open: false },
  likelihoodSemantics: "set membership per present component",
  derivation: { archetype: "declared-metadata", classifierId: "package-completeness-classifier", fallbackChain: ["declared-metadata", "default-fallback"] },
  feedsSessionFacets: ["source.package-completeness"],
  schemaVersion: 1,
};

const KPS_PATH = "release/t/test/source/test.kps";
function makeKb(kpsXml: string | null): ScannedKeyboard {
  const sources: ScannedSource[] = [];
  if (kpsXml !== null) sources.push({ path: KPS_PATH, bytes: Buffer.from(kpsXml, "utf8") });
  return { id: "test", kpsPath: KPS_PATH, kmnPath: null, kmnText: null, sources };
}

const FULL = `<?xml version="1.0"?><Package><Options><WelcomeFile>welcome.htm</WelcomeFile></Options><Files>
  <File><Name>test.kvk</Name><FileType>.kvk</FileType></File>
  <File><Name>welcome.htm</Name><FileType>.htm</FileType></File>
  <File><Name>test.model.ts</Name><FileType>.ts</FileType></File>
  <File><Name>test.ico</Name><FileType>.ico</FileType></File>
</Files></Package>`;

describe("classifyPackageCompleteness", () => {
  it("content tier is empty (deciding signal is package metadata)", () => {
    expect(classifyPackageCompleteness({} as never, DEF)).toBeNull();
  });
});

describe("packageCompletenessFallback", () => {
  it("absorbs osk/help/predictive/icon presence into one sorted set", () => {
    const result = packageCompletenessFallback(makeKb(FULL), DEF);
    expect(result.value).toEqual(["help", "icon", "osk", "predictive"]);
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("empty package → empty set (still declared-metadata when .kps present)", () => {
    const result = packageCompletenessFallback(makeKb(`<?xml version="1.0"?><Package><Files></Files></Package>`), DEF);
    expect(result.value).toEqual([]);
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("no readable .kps → empty set at default-fallback", () => {
    const result = packageCompletenessFallback(makeKb(null), DEF);
    expect(result.value).toEqual([]);
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.analysisOutcome).toBe("fallback-only");
  });
});
