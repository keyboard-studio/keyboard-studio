// Regression test for the km-review (PR #1044) finding: the il_language_region
// branch of IdentityLite's handleAnswerCommit reseeded autonym/script from the
// chosen RegionVariant but never updated provenanceRef, so the "Suggested from
// langtags" caption (FR-010) could go stale — missing when a variant supplies a
// value the primary entry lacked, or left behind when a variant lacks one the
// primary entry had. Component-level jsdom render; no existing test exercised
// il_language_region + getSeedProvenance together (the gap both km-qc and
// km-domain flagged).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent, screen } from "@testing-library/react";
import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

const PROVENANCE_CAPTION = "Suggested from langtags — edit if needed";

// "xx" resolves to a region-ambiguous entry (2 regionVariants) whose PRIMARY
// defaults have NO autonym. Region AA's variant supplies one (case: a variant
// grants a value the primary lacked — must gain a caption); region BB's variant
// has none (case: a variant that grants nothing must stay uncaptioned).
const XX_DEFAULTS: LanguageDefaults = {
  code: "xx",
  defaultScript: "Latn",
  regions: [],
  autonym: undefined,
  englishName: "Xx Language",
  regionVariants: [
    {
      region: "AA",
      regionName: "Alandia",
      defaultScript: "Latn",
      autonym: "Variant Autonym",
      localNames: ["Variant Autonym"],
    },
    {
      region: "BB",
      regionName: "Blandia",
      defaultScript: "Latn",
      autonym: undefined,
      localNames: [],
    },
  ],
};

// "yy" resolves to a region-ambiguous entry whose PRIMARY defaults DO have an
// autonym (case: a variant that lacks an autonym must clear a stale caption).
const YY_DEFAULTS: LanguageDefaults = {
  code: "yy",
  defaultScript: "Latn",
  regions: [],
  autonym: "Primary Autonym",
  englishName: "Yy Language",
  regionVariants: [
    {
      region: "AA",
      regionName: "Alandia",
      defaultScript: "Latn",
      autonym: "Primary Autonym",
      localNames: ["Primary Autonym"],
    },
    {
      region: "BB",
      regionName: "Blandia",
      defaultScript: "Latn",
      autonym: undefined,
      localNames: [],
    },
  ],
};

const SUMMARIES: LanguageSummary[] = [
  { code: "xx", englishName: "Xx Language" },
  { code: "yy", englishName: "Yy Language" },
];

vi.mock("../lib/langtagsDefaults.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/langtagsDefaults.ts")>();
  return {
    ...original,
    loadLangtags: () =>
      Promise.resolve({
        getLanguageDefaults: (code: string) => {
          if (code === "xx") return XX_DEFAULTS;
          if (code === "yy") return YY_DEFAULTS;
          return null;
        },
        listLanguages: () => SUMMARIES,
        lookupByName: () => SUMMARIES,
      }),
  };
});

import { IdentityLite } from "./IdentityLite.tsx";

afterEach(cleanup);

async function renderReady(): Promise<HTMLElement> {
  const { container } = render(<IdentityLite onComplete={vi.fn()} />);
  // Synchronizes on the SAME loadLangtags() resolution IdentityLite's own mount
  // effect awaits (both are triggered in the same render pass), guaranteeing
  // langtagsModRef is populated before the first interaction below.
  await waitFor(() => {
    expect(container.querySelectorAll("datalist option").length).toBeGreaterThan(0);
  });
  return container;
}

async function commitLanguageCode(code: string): Promise<void> {
  const input = screen.getByRole<HTMLInputElement>("combobox");
  fireEvent.change(input, { target: { value: code } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => {
    expect(screen.getByText(/Which region is your language from\?/)).toBeTruthy();
  });
}

async function commitRegion(region: string): Promise<void> {
  const input = screen.getByRole<HTMLInputElement>("combobox");
  fireEvent.change(input, { target: { value: region } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => {
    expect(screen.getByText(/What is your language called in English\?/)).toBeTruthy();
  });
  // il_language_english is pre-filled from the primary entry's englishName
  // (seeded, required) — advance past it without typing.
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => {
    expect(screen.getByText(/What is your language called in your own language\?/)).toBeTruthy();
  });
}

describe("IdentityLite region provenance (spec 030 US3, FR-010 regression)", () => {
  it("adds a provenance caption when the chosen region variant supplies an autonym the primary entry lacked", async () => {
    await renderReady();
    await commitLanguageCode("xx");
    await commitRegion("AA");

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("Variant Autonym");
    });
    expect(screen.getByText(PROVENANCE_CAPTION)).toBeTruthy();
  });

  it("does not caption the autonym confirmation when the chosen region variant has none", async () => {
    await renderReady();
    await commitLanguageCode("xx");
    await commitRegion("BB");

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("");
    });
    expect(screen.queryByText(PROVENANCE_CAPTION)).toBeNull();
  });

  it("clears a stale caption when the chosen region variant lacks an autonym the primary entry had", async () => {
    await renderReady();
    await commitLanguageCode("yy");
    await commitRegion("BB");

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("");
    });
    // Before the fix: the code-commit branch had recorded a caption for
    // il_language_autonym (primary entry's "Primary Autonym"); the region
    // branch reset the seed to undefined but left that caption in place.
    expect(screen.queryByText(PROVENANCE_CAPTION)).toBeNull();
  });
});
