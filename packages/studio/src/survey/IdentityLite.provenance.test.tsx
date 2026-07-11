// Q2 (il_language_autonym) own-language-name behaviour (spec 030 US2, author
// request): the field DEFAULTS to the Q1 English name and offers a choice list of
// "[Q1 name] + the resolved entry's / region variant's recorded local names".
// Because the default is the author's own Q1 input — not a langtags value — the
// autonym field carries NO "Suggested from langtags" caption (that caption stays
// on the target-script confirmation, a genuine editable langtags seed; the code
// confirmation is read-only, so it carries no "edit if needed" caption either). This
// also supersedes the PR #1044 region-variant autonym-provenance regression:
// autonym provenance no longer exists, so there is no stale-caption bug to guard.
//
// spec 030 FR-009 flow: the English-name picker (@langtags_names) is first;
// selecting a region-ambiguous language routes to il_language_region, then to
// il_language_autonym. Resolution comes from the picker's onEntryResolved
// side-channel, so the tests SELECT a suggestion rather than type a code.

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
  // English/alternate names (langtags name + names) — offered as extra Q2 choices.
  englishNames: ["Xx Language", "Xy Alt"],
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

// hasRegionVariants: true so getNextOverride routes the English-name pick to
// il_language_region (spec 030 US3). Distinct englishNames so a listbox row can
// be selected unambiguously.
const SUMMARIES: LanguageSummary[] = [
  { code: "xx", englishName: "Xx Language", hasRegionVariants: true },
  { code: "yy", englishName: "Yy Language", hasRegionVariants: true },
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
  // Wait until the name picker has finished its one-time langtags load (its
  // placeholder flips from "Loading languages..." once loaded).
  await waitFor(() => {
    const input = screen.getByRole<HTMLInputElement>("combobox");
    expect(input.placeholder).toMatch(/Type your language/);
  });
  return container;
}

// Select a language by picking its row from the English-name picker's listbox
// (spec 030 US1). Selection — not typing — fires onEntryResolved with the entry.
// The identity flow auto-advances on selection (advanceOnSelect), so picking the
// row routes to the region step with no explicit Next click.
async function selectLanguage(code: string): Promise<void> {
  const input = screen.getByRole<HTMLInputElement>("combobox");
  fireEvent.focus(input); // opens the listbox (populated from listLanguages)
  const option = await screen.findByRole("option", { name: new RegExp(`\\(${code}\\)`) });
  fireEvent.mouseDown(option);
  await waitFor(() => {
    expect(screen.getByText(/Which region is your language from\?/)).toBeTruthy();
  });
}

async function commitRegion(region: string): Promise<void> {
  const input = screen.getByRole<HTMLInputElement>("combobox");
  fireEvent.change(input, { target: { value: region } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  // Region routes straight on to the autonym step (English name is already done).
  await waitFor(() => {
    expect(screen.getByText(/What is your language called in your own language\?/)).toBeTruthy();
  });
}

// The autonym field is the shared StyledCombobox, whose rows render only while
// open — focus it, then read the value of each rendered option row.
function autonymOptionValues(): string[] {
  fireEvent.focus(screen.getByRole<HTMLInputElement>("combobox"));
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (o) => o.getAttribute("data-value") ?? "",
  );
}

describe("IdentityLite Q2 own-language name (spec 030 US2 — langtags-name choices, Q1 fallback)", () => {
  it("defaults to the primary own-script name and offers ONLY own-script names (not the English/alternate names)", async () => {
    await renderReady();
    await selectLanguage("xx"); // englishName "Xx Language"
    await commitRegion("AA"); // variant AA local name: "Variant Autonym"

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("Variant Autonym");
    });
    const values = autonymOptionValues();
    expect(values).toContain("Variant Autonym"); // own-script name (default) is a choice
    // Own-script names exist → the English/alternate names are NOT offered
    // (fallback chain, not concatenation — per author request).
    expect(values).not.toContain("Xy Alt");
    // The default IS a recorded langtags name → the suggestion caption shows.
    expect(screen.getByText(PROVENANCE_CAPTION)).toBeTruthy();
  });

  it("falls back to the Q1 name (no caption) when the language has no own-script name, still offering the English/alternate names", async () => {
    await renderReady();
    await selectLanguage("xx");
    await commitRegion("BB"); // variant BB: no own-script names (englishNames remain)

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("Xx Language");
    });
    // No own-script name → default is the Q1 name (author input) → no caption,
    // but the English/alternate names are still offered as dropdown choices.
    expect(autonymOptionValues()).toContain("Xy Alt");
    expect(screen.queryByText(PROVENANCE_CAPTION)).toBeNull();
  });

  it("with no recorded names at all, defaults to the Q1 name as free text (no dropdown, no caption)", async () => {
    await renderReady();
    await selectLanguage("yy"); // englishName "Yy Language"; no englishNames, BB has no local names
    await commitRegion("BB");

    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("Yy Language");
    });
    expect(autonymOptionValues()).toEqual([]);
    expect(screen.queryByText(PROVENANCE_CAPTION)).toBeNull();
  });
});
