/**
 * Has-icon classifier unit tests.
 *
 * `present` iff the `.kmn` declares a `&BITMAP` store OR the `.kps` bundles a
 * `.ico`/`.bmp`; `absent` otherwise. `classifyHasIcon` runs when the `.kmn`
 * parsed (it reads the `&BITMAP` store off the IR); `hasIconFallback` runs when
 * there is no IR and can only see a `.kps`-bundled icon. The IR is built with the
 * real codec `parse`, exactly as the build orchestrator does.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyHasIcon, hasIconFallback } from "./has-icon-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "has-icon",
  title: "Has icon",
  description: "Whether the keyboard declares an icon bitmap.",
  valueType: "enum",
  limits: { values: ["present", "absent"], open: false },
  likelihoodSemantics: "single keyboard-level icon-presence determination",
  derivation: {
    archetype: "declared-metadata",
    classifierId: "has-icon-classifier",
    fallbackChain: ["declared-metadata", "default-fallback"],
  },
  feedsSessionFacets: ["source.package-completeness"],
  schemaVersion: 1,
};

const KPS_PATH = "release/t/test/source/test.kps";
const KMN_PATH = "release/t/test/source/test.kmn";

function makeKb(opts: { kps?: string | null; kmn?: string | null }): ScannedKeyboard {
  const sources: ScannedSource[] = [];
  if (opts.kps != null) sources.push({ path: KPS_PATH, bytes: Buffer.from(opts.kps, "utf8") });
  return {
    id: "test",
    kpsPath: KPS_PATH,
    kmnPath: opts.kmn != null ? KMN_PATH : null,
    kmnText: opts.kmn ?? null,
    sources,
  };
}

/** Parse `.kmn` text to an IR the way build-index.ts does. */
function ir(kmn: string) {
  return parse(kmn, "test").ir;
}

const KMN_WITH_BITMAP = "store(&BITMAP) 'test.ico'\nbegin Unicode > use(main)\ngroup(main) using keys\n+ 'a' > 'b'\n";
const KMN_NO_BITMAP = "begin Unicode > use(main)\ngroup(main) using keys\n+ 'a' > 'b'\n";

function filesKps(...files: string[]): string {
  const entries = files.map((n) => `<File><Name>${n}</Name></File>`).join("");
  return `<?xml version="1.0"?><Package><Files>${entries}</Files></Package>`;
}

describe("classifyHasIcon", () => {
  it("declares a &BITMAP store -> present, declared-metadata", () => {
    const result = classifyHasIcon(ir(KMN_WITH_BITMAP), DEF, makeKb({ kmn: KMN_WITH_BITMAP }));
    expect(result?.value).toBe("present");
    expect(result?.provenanceTier).toBe("declared-metadata");
    expect(result?.notes).toMatch(/&BITMAP/);
  });

  it("no &BITMAP but the .kps bundles a .ico -> present", () => {
    const kps = filesKps("test.ico", "..\\build\\test.kmx");
    const result = classifyHasIcon(ir(KMN_NO_BITMAP), DEF, makeKb({ kmn: KMN_NO_BITMAP, kps }));
    expect(result?.value).toBe("present");
    expect(result?.notes).toMatch(/\.ico/);
  });

  it("no &BITMAP but the .kps bundles a .bmp -> present (broader than the .ico-only package slot)", () => {
    const kps = filesKps("icon.bmp");
    const result = classifyHasIcon(ir(KMN_NO_BITMAP), DEF, makeKb({ kmn: KMN_NO_BITMAP, kps }));
    expect(result?.value).toBe("present");
  });

  it("no &BITMAP and a readable .kps with no icon -> absent, declared-metadata", () => {
    const kps = filesKps("..\\build\\test.kmx");
    const result = classifyHasIcon(ir(KMN_NO_BITMAP), DEF, makeKb({ kmn: KMN_NO_BITMAP, kps }));
    expect(result?.value).toBe("absent");
    expect(result?.provenanceTier).toBe("declared-metadata");
  });

  it("no &BITMAP and no readable .kps -> absent (read from the .kmn header), declared-metadata", () => {
    const result = classifyHasIcon(ir(KMN_NO_BITMAP), DEF, makeKb({ kmn: KMN_NO_BITMAP }));
    expect(result?.value).toBe("absent");
    expect(result?.provenanceTier).toBe("declared-metadata");
    expect(result?.notes).toMatch(/no readable \.kps/i);
  });
});

describe("hasIconFallback", () => {
  it("no .kmn but the .kps bundles a .ico -> present, declared-metadata", () => {
    const kps = filesKps("test.ico");
    const result = hasIconFallback(makeKb({ kps, kmn: null }), DEF);
    expect(result.value).toBe("present");
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("no .kmn and a readable .kps with no icon -> absent, declared-metadata", () => {
    const kps = filesKps("..\\build\\test.kmx");
    const result = hasIconFallback(makeKb({ kps, kmn: null }), DEF);
    expect(result.value).toBe("absent");
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("no readable .kps at all -> absent, default-fallback, fallback-only", () => {
    const result = hasIconFallback(makeKb({ kps: null, kmn: null }), DEF);
    expect(result.value).toBe("absent");
    expect(result.provenanceTier).toBe("default-fallback");
    expect(result.analysisOutcome).toBe("fallback-only");
  });
});
