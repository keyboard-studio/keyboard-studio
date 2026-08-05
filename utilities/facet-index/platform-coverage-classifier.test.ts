/**
 * Platform-coverage classifier unit tests (spec 043 US1; FR-012; AS #3).
 *
 * The content tier is empty (modality is bundled-file metadata), so all work is
 * in `platformCoverageFallback(kb, def)`, exercised with synthetic
 * `ScannedKeyboard` inputs — a `.kps` `<Files>` list, optional touch-layout
 * sibling. No `<Targets>` element is ever read; no OS-level label is emitted.
 */

import { describe, it, expect } from "vitest";

import { classifyPlatformCoverage, platformCoverageFallback } from "./platform-coverage-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "platform-coverage",
  title: "Platform coverage",
  description: "Modality set inferred from bundled file types.",
  valueType: "set",
  limits: { values: ["desktop", "web", "touch"], open: false },
  likelihoodSemantics: "modality membership from bundled file types",
  derivation: { archetype: "declared-metadata", classifierId: "platform-coverage-classifier", fallbackChain: ["declared-metadata", "default-fallback"] },
  feedsSessionFacets: ["source.platform-coverage"],
  schemaVersion: 1,
};

const KPS_PATH = "release/t/test/source/test.kps";

function filesXml(names: string[]): string {
  const entries = names.map((n) => `<File><Name>${n}</Name></File>`).join("");
  return `<?xml version="1.0"?><Package><Files>${entries}</Files></Package>`;
}

function makeKb(opts: { kps?: string | null; touchSibling?: boolean }): ScannedKeyboard {
  const sources: ScannedSource[] = [];
  if (opts.kps != null) sources.push({ path: KPS_PATH, bytes: Buffer.from(opts.kps, "utf8") });
  if (opts.touchSibling) {
    sources.push({ path: "release/t/test/source/test.keyman-touch-layout", bytes: Buffer.from("{}", "utf8") });
  }
  return { id: "test", kpsPath: KPS_PATH, kmnPath: null, kmnText: null, sources };
}

describe("classifyPlatformCoverage", () => {
  it("has no content tier — always returns null", () => {
    expect(classifyPlatformCoverage({} as never, DEF)).toBeNull();
  });
});

describe("platformCoverageFallback", () => {
  it(".kmx + .js -> [desktop, web], declared-metadata", () => {
    const kb = makeKb({ kps: filesXml(["..\\build\\test.kmx", "..\\build\\test.js"]) });
    const result = platformCoverageFallback(kb, DEF);
    expect(result.value).toEqual(["desktop", "web"]);
    expect(result.provenanceTier).toBe("declared-metadata");
    expect(result.confidenceClass).toBe("confident");
  });

  it("touch-layout sibling adds 'touch' even without a .keyman-touch-layout in <Files>", () => {
    const kb = makeKb({ kps: filesXml(["..\\build\\test.kmx"]), touchSibling: true });
    const result = platformCoverageFallback(kb, DEF);
    expect(result.value).toEqual(["desktop", "touch"]);
  });

  it("never emits OS-level labels — only the modality subset", () => {
    const kb = makeKb({ kps: filesXml(["..\\build\\test.kmx", "..\\build\\test.js"]) });
    const result = platformCoverageFallback(kb, DEF);
    for (const v of result.value as string[]) {
      expect(["desktop", "web", "touch"]).toContain(v);
    }
  });

  it("missing .kps -> empty modality set, default-fallback", () => {
    const kb = makeKb({ kps: null });
    const result = platformCoverageFallback(kb, DEF);
    expect(result.value).toEqual([]);
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.analysisOutcome).toBe("fallback-only");
  });
});
