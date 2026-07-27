// Regression test for the NFC/NFD dedup fix in IdentityLite.getSeedOptions
// (km-review PR #1055 comment). The autonym (il_language_autonym) choice list
// is built from the resolved entry's recorded own-script names, deduplicated
// case-insensitively by `trimmed.normalize("NFC").toLowerCase()`. Before the
// fix the dedup key was not NFC-normalized first, so an NFC-composed and an
// NFD-decomposed spelling of the SAME name (byte-different, NFC-equal) produced
// two separate rows instead of one.
//
// "zz" mirrors IdentityLite.autoAdvance.test.tsx's no-region-variant fixture
// (hasRegionVariants: false → Q1 selection auto-advances straight to Q2), kept
// deliberately simple since this test only needs to reach Q2 and read its
// options — not exercise the region-variant reseed path.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, waitFor, fireEvent, screen } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

// NFC-composed and NFD-decomposed spellings of the same Vietnamese name.
// Confirmed byte-different-but-NFC-equal in the test body below.
const NFC_NAME = "Tiếng Việt";
const NFD_NAME = NFC_NAME.normalize("NFD");

const ZZ_DEFAULTS: LanguageDefaults = {
  code: "zz",
  iso639_3: "zzz",
  defaultScript: "Latn",
  regions: [],
  autonym: NFC_NAME,
  englishName: "Zeta",
  // The SAME own-script name recorded twice, once NFC and once NFD — the
  // dedup fix must collapse these into a single dropdown row.
  localNames: [NFC_NAME, NFD_NAME],
};

const SUMMARIES: LanguageSummary[] = [
  { code: "zz", englishName: "Zeta", autonym: NFC_NAME, hasRegionVariants: false },
];

const FAKE_MODULE = {
  getLanguageDefaults: (code: string) => (code === "zz" ? ZZ_DEFAULTS : null),
  listLanguages: () => SUMMARIES,
  lookupByName: () => SUMMARIES,
};

vi.mock("../lib/langtagsDefaults.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/langtagsDefaults.ts")>();
  return {
    ...original,
    loadLangtags: () => Promise.resolve(FAKE_MODULE),
    getLoadedLangtags: () => FAKE_MODULE,
  };
});

import { IdentityLite } from "./IdentityLite.tsx";

afterEach(cleanup);

// The autonym field is the shared StyledCombobox, whose rows render only while
// open — focus it, then read the value of each rendered option row.
function autonymOptionValues(): string[] {
  fireEvent.focus(screen.getByRole<HTMLInputElement>("combobox"));
  return Array.from(document.querySelectorAll('[role="option"]')).map(
    (o) => o.getAttribute("data-value") ?? "",
  );
}

describe("IdentityLite getSeedOptions autonym dedup (PR #1055 regression)", () => {
  it("NFC and NFD spellings of the same name are byte-different but NFC-equal (fixture sanity)", () => {
    expect(NFD_NAME).not.toBe(NFC_NAME);
    expect(NFD_NAME.normalize("NFC")).toBe(NFC_NAME);
  });

  it("dedups an NFC-composed and NFD-decomposed recorded local name into a single dropdown row", async () => {
    render(<IdentityLite onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").placeholder).toMatch(
        /Type your language/,
      );
    });

    // Q1: pick "Zeta" → auto-advance to Q2 (no region variants).
    fireEvent.focus(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /\(zz\)/ });
    fireEvent.mouseDown(option);
    await waitFor(() => {
      expect(
        screen.getByText(/What is your language called in your own language\?/),
      ).toBeTruthy();
    });

    const values = autonymOptionValues();
    // Only ONE row for the name, despite two recorded spellings (NFC + NFD).
    expect(values.filter((v) => v.normalize("NFC") === NFC_NAME)).toHaveLength(1);
    expect(values).toHaveLength(1);
  });
});
