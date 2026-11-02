// identity → characters (#2396): a non-default target script must not seed
// exemplars from the bare language's (wrong-script) locale.
//
// End-to-end at the lookup seam, with the REAL exemplar sourcing path (no
// service mocks): the identity step's tag for Chechen + Latn goes through
// resolveSourcedExemplars, and the intro chooser must not pre-select
// "exemplars" for it. The bare-Chechen case guards against a vacuous pass —
// if the engine failed to load, the second test fails loudly instead of the
// first passing for the wrong reason.
import { beforeAll, describe, expect, it } from "vitest";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import type { ExemplarInventory } from "../lib/services.ts";
import { buildTargetBcp47 } from "./targetBcp47.ts";
import { resolveSourcedExemplars } from "./sourcedExemplarsLookup.ts";
import { resolveIntroSelection } from "./charactersStepRules.ts";

beforeAll(async () => {
  await loadLangtags();
});

function introPreselectFor(inventory: ExemplarInventory | null): string {
  return resolveIntroSelection({
    authorChoice: null,
    loading: false,
    offerExemplars: inventory !== null,
    declinedBefore: false,
  });
}

describe("identity → characters (#2396)", () => {
  it("does not pre-select exemplars for Latin Chechen", async () => {
    // The identity step canonicalises che → ce and keeps the explicit script.
    const tag = buildTargetBcp47("che", "Latn");
    expect(tag).toBe("ce-Latn");
    // The engine's #2396 rule: ce is the Cyrillic locale, so nothing serves
    // ce-Latn — the offer is omitted and the chooser falls back to build-list.
    const inventory = await resolveSourcedExemplars(tag);
    expect(inventory).toBeNull();
    expect(introPreselectFor(inventory)).toBe("build-list");
  });

  it("still pre-selects exemplars for bare Chechen (Cyrillic)", async () => {
    // Cyrl is Chechen's default script, so the canonical tag drops it.
    const tag = buildTargetBcp47("che", "Cyrl");
    expect(tag).toBe("ce");
    const inventory = await resolveSourcedExemplars(tag);
    expect(inventory).not.toBeNull();
    expect(inventory!.resolvedTag).toBe("ce");
    expect(introPreselectFor(inventory)).toBe("exemplars");
  });
});
