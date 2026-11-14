// identityResolution: region on demand (spec 115 US3, research R9). A region asked
// for in the chooser's Customize panel routes il_language_region for a language
// with a single region; a pick that asks for nothing routes no new screen.

import { beforeAll, describe, expect, it } from "vitest";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import { loadLangtags } from "../lib/langtagsDefaults.ts";
import { createIdentityResolution } from "./identityResolution.ts";
import type { ChosenSummary } from "./chosenLanguage.ts";

describe("identityResolution region routing", () => {
  let hausa: LanguageSummary;
  let french: LanguageSummary;

  beforeAll(async () => {
    const mod = await loadLangtags();
    const pick = (code: string): LanguageSummary => {
      const found = mod.listLanguages().find((l) => l.code === code);
      if (found === undefined) throw new Error(`no summary for ${code}`);
      return found;
    };
    hausa = pick("ha");
    french = pick("ewo");
  });

  it("routes no region question for a single-region language by default", () => {
    const resolution = createIdentityResolution();
    resolution.onEntryResolved("il_language_english", { ...french, hasRegionVariants: false });
    expect(resolution.nextOverride("il_language_english")).toBeUndefined();
  });

  it("routes il_language_region when a region was requested for a single-region language", () => {
    const resolution = createIdentityResolution();
    const asked: ChosenSummary = {
      ...french,
      hasRegionVariants: false,
      extras: { region: { code: "GA", source: "the region you specified" } },
    };
    resolution.onEntryResolved("il_language_english", asked);
    expect(resolution.nextOverride("il_language_english")).toBe("il_language_region");
  });

  it("stops routing once the request is withdrawn", () => {
    const resolution = createIdentityResolution();
    resolution.onEntryResolved("il_language_english", {
      ...hausa,
      hasRegionVariants: false,
      extras: { region: { code: "NE", source: "the region you specified" } },
    } as ChosenSummary);
    expect(resolution.nextOverride("il_language_english")).toBe("il_language_region");
    resolution.onEntryResolved("il_language_english", { ...hausa, hasRegionVariants: false });
    expect(resolution.nextOverride("il_language_english")).toBeUndefined();
  });

  it("a region with no regional variant leaves the autonym and script seeds alone", () => {
    const resolution = createIdentityResolution();
    resolution.onEntryResolved("il_language_english", {
      ...french,
      hasRegionVariants: false,
      extras: { region: { code: "GA", source: "the region you specified" } },
    } as ChosenSummary);
    const before = resolution.localNames();
    resolution.onAnswerCommit("il_language_region", "GA");
    expect(resolution.localNames()).toEqual(before);
  });
});
