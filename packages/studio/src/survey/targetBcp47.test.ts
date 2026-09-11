// buildTargetBcp47 — the suppress-script rule, against the REAL langtags data.
//
// The claim being tested is a claim about that data ("Latn is Ewondo's default
// script", "Cyrl is Serbian's"), so a fixture module could make every case pass
// by fiat. `loadLangtags()` here resolves the shipped slim index.
//
// THE TWO DESCRIBES ARE ORDERED, DELIBERATELY
//
// `getLoadedLangtags()` is a one-way latch — the module memo cannot be unloaded
// once resolved — so the not-yet-loaded branch has to be asserted BEFORE the
// load, and the loaded one after. Vitest runs a file's tests in declaration
// order, and that order is the only coupling between these two blocks.
//
// The pre-elision cases (a plain `ha-Latn`, `hi-Deva`, region folding, fonipa)
// stay where they were, in IdentityLite.test.ts / .us3 / .langtags — those files
// never load langtags, so they now also pin the fallback path.

import { describe, it, expect, beforeAll } from "vitest";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import { buildTargetBcp47 } from "./targetBcp47.ts";

describe("before langtags resolves — composes exactly as it did before", () => {
  it("keeps the script subtag it cannot yet know is redundant", () => {
    // No blocking, no async seam, no throw: an uncanonical tag is the degraded
    // answer, and it is the same tag this composer has always produced (FR-009).
    expect(buildTargetBcp47("ewo", "Latn")).toBe("ewo-Latn");
    expect(buildTargetBcp47("sr", "Cyrl")).toBe("sr-Cyrl");
  });
});

describe("with langtags resolved — the default script is elided", () => {
  beforeAll(async () => {
    await loadLangtags();
  });

  // Matt's case: Latin is the Unicode default for Ewondo's writing system, so a
  // Latin Ewondo keyboard declares `ewo` and the .kps needs no script subtag.
  it("elides a script that IS the language's default", () => {
    expect(buildTargetBcp47("ewo", "Latn")).toBe("ewo");
    expect(buildTargetBcp47("sr", "Cyrl")).toBe("sr");
  });

  // And the other half of the same rule: a non-default script is the whole
  // reason the subtag position exists, so it stays.
  it("keeps a script that is NOT the language's default", () => {
    expect(buildTargetBcp47("ewo", "Arab")).toBe("ewo-Arab");
    expect(buildTargetBcp47("ha", "Arab")).toBe("ha-Arab");
    expect(buildTargetBcp47("sr", "Latn")).toBe("sr-Latn");
  });

  it("keeps the script for a language langtags does not know", () => {
    // No `defaultScript` to compare against is not "the script is redundant".
    expect(buildTargetBcp47("xyz-made-up", "Latn")).toBe("xyz-made-up-Latn");
  });

  it("elides the script while still folding in the region", () => {
    // Region elision is a separate question and deliberately not done here.
    expect(buildTargetBcp47("ewo", "Latn", "CM")).toBe("ewo-CM");
    expect(buildTargetBcp47("ewo", "Arab", "CM")).toBe("ewo-Arab-CM");
  });

  it("leaves the romanization and fonipa forms alone", () => {
    // Both bypass the script position on their own terms (see the composer's
    // rules); neither is in scope for the suppress-script rule.
    expect(buildTargetBcp47("ewo", "romanization-Latn")).toBe("ewo-Latn");
    expect(buildTargetBcp47("ewo", "fonipa")).toBe("ewo-fonipa");
  });

  it("still drops a malformed script subtag rather than eliding it", () => {
    expect(buildTargetBcp47("ewo", "other")).toBe("ewo");
    expect(buildTargetBcp47("ewo", "")).toBe("ewo");
    expect(buildTargetBcp47("", "Latn")).toBe("");
  });
});
