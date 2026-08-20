/**
 * Lens-vocabulary lockstep test (spec 045 US2, T009).
 *
 * `content/keyboard-facets/added-char-count.yaml`'s and
 * `diacritic-mechanism.yaml`'s `limits.values` are the facet index's own
 * declared value domains for axes A1/A4. Since spec 045 aliased the
 * classifiers' TS types to the canonical `Scale`/`DiacriticBehavior` from
 * `@keyboard-studio/contracts` (rather than leaving each with its own
 * hand-restated union), a compile-time guard alone would not catch a future
 * divergence introduced by editing the YAML alone — this test is the runtime
 * half of that safety net.
 *
 * Shared-core, extension-tolerant: a YAML `limits.values` set must be a SUBSET
 * of the contracts type's members (every YAML value must be a real contracts
 * member), matching the facet-only measurement-value model's core+extension
 * design. A1/A4 are declared `open: false`, so today the two sets are also
 * expected to be exactly equal — this test asserts the stronger equality and
 * will fail loudly (not silently degrade) if a future edit narrows this
 * expectation without updating the comment.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { parse as parseYaml } from "yaml";
import { describe, it, expect } from "vitest";

import type { DiacriticBehavior, Scale } from "@keyboard-studio/contracts";

const HERE = dirname(fileURLToPath(import.meta.url));
const FACETS_DIR = join(HERE, "..", "..", "content", "keyboard-facets");

const SCALE_MEMBERS: readonly Scale[] = ["tiny", "small", "medium", "large", "massive"];
const DIACRITIC_BEHAVIOR_MEMBERS: readonly DiacriticBehavior[] = [
  "none",
  "stacking-combining",
  "replacing-cycling",
  "multi-family",
];

function loadFacetValues(fileName: string): string[] {
  const text = readFileSync(join(FACETS_DIR, fileName), "utf8");
  const doc = parseYaml(text) as { limits?: { values?: string[] } };
  const values = doc.limits?.values;
  if (!values) throw new Error(`${fileName}: limits.values is missing`);
  return values;
}

describe("lens-vocabulary lockstep (spec 045)", () => {
  it("added-char-count.yaml's limits.values equals Scale's member set (axis A1)", () => {
    const declared = loadFacetValues("added-char-count.yaml");
    expect(new Set(declared)).toEqual(new Set(SCALE_MEMBERS));
  });

  it("diacritic-mechanism.yaml's limits.values equals DiacriticBehavior's member set (axis A4)", () => {
    const declared = loadFacetValues("diacritic-mechanism.yaml");
    expect(new Set(declared)).toEqual(new Set(DIACRITIC_BEHAVIOR_MEMBERS));
  });
});
