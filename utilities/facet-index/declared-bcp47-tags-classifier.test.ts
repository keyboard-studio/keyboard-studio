/**
 * Declared-BCP47-tags classifier unit tests (spec 043 US3; FR-033; AS #4). The
 * declared `<Languages>` tags surface as the value; an explicit script subtag
 * disagreeing with the produced dominant script is flagged claim-vs-actual.
 */

import { describe, it, expect } from "vitest";

import { parse } from "../../packages/engine/src/codec/index.js";
import { classifyDeclaredBcp47Tags, declaredBcp47TagsFallback } from "./declared-bcp47-tags-classifier.js";
import type { FacetDefinition } from "./types.js";
import type { ScannedKeyboard, ScannedSource } from "./scan.js";

const DEF: FacetDefinition = {
  id: "declared-bcp47-tags",
  title: "Declared BCP47 tags",
  description: "Declared language tags with a claim-vs-actual cross-check.",
  valueType: "set",
  limits: { values: ["_"], open: true },
  likelihoodSemantics: "the declared tag set; mismatch flagged in notes",
  derivation: { archetype: "declared-metadata", classifierId: "declared-bcp47-tags-classifier", fallbackChain: ["declared-metadata", "undetermined"] },
  feedsSessionFacets: ["source.declared-bcp47-tags"],
  schemaVersion: 1,
};

const HEADER = `store(&VERSION) '10.0'
store(&NAME) 'Test'
store(&TARGETS) 'any'

begin Unicode > use(main)

group(main) using keys
`;
const KPS_PATH = "release/t/test/source/test.kps";

function kbWithTags(tags: string[]): ScannedKeyboard {
  const langs = tags.map((t) => `<Language ID="${t}">L</Language>`).join("");
  const xml = `<?xml version="1.0"?><Package><Keyboards><Keyboard><ID>test</ID><Languages>${langs}</Languages></Keyboard></Keyboards></Package>`;
  const sources: ScannedSource[] = [{ path: KPS_PATH, bytes: Buffer.from(xml, "utf8") }];
  return { id: "test", kpsPath: KPS_PATH, kmnPath: null, kmnText: null, sources };
}

describe("classifyDeclaredBcp47Tags", () => {
  it("surfaces the declared tags as a sorted set", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > 'a'\n`, "tags");
    const result = classifyDeclaredBcp47Tags(ir, DEF, kbWithTags(["fr", "bm"]))!;
    expect(result.value).toEqual(["bm", "fr"]);
    expect(result.provenanceTier).toBe("declared-metadata");
  });

  it("flags a claim-vs-actual script mismatch (hi-Deva claimed, Latin produced)", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > 'a'\n`, "mismatch");
    const result = classifyDeclaredBcp47Tags(ir, DEF, kbWithTags(["hi-Deva"]))!;
    expect(result.notes).toMatch(/mismatch/i);
  });

  it("no declared tags → null (fall through)", () => {
    const { ir } = parse(`${HEADER}\n+ [K_A] > 'a'\n`, "notags");
    expect(classifyDeclaredBcp47Tags(ir, DEF, kbWithTags([]))).toBeNull();
  });
});

describe("declaredBcp47TagsFallback", () => {
  it("surfaces declared tags even with no .kmn (no mismatch flag)", () => {
    const result = declaredBcp47TagsFallback(kbWithTags(["en"]), DEF);
    expect(result.value).toEqual(["en"]);
    expect(result.notes).not.toMatch(/mismatch/i);
  });

  it("no declared tags → undetermined", () => {
    const result = declaredBcp47TagsFallback(kbWithTags([]), DEF);
    expect(result.analysisOutcome).toBe("fallback-only");
  });
});
