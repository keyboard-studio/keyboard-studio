// Regression test for the auto-advance async-seed race (km-review PR #1050).
//
// The identity flow auto-advances on a Q1 selection (advanceOnSelect). For a
// language with NO region variants — the ~97% common case — selecting it routes
// STRAIGHT to Q2 (own-language name) in the same tick. The Q2 default comes from
// the resolved langtags entry's local name, which IdentityLite seeds in
// onEntryResolved. If that seed is applied on an async `.then`, it loses the race
// against the auto-advance and Q2 silently falls back to the Q1 English name.
//
// The fix seeds SYNCHRONOUSLY when the langtags module is already loaded
// (getLoadedLangtags), so the seed is set before the advance reads it. This test
// pins the fixed behaviour on the no-region direct path — the case every
// region-ambiguous provenance test skips.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent, screen } from "@testing-library/react";
import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

// "zz" is unambiguous by region (no regionVariants) and carries a recorded
// own-script name distinct from its English name — so a correct seed is visibly
// different from the English fallback.
const ZZ_DEFAULTS: LanguageDefaults = {
  code: "zz",
  iso639_3: "zzz",
  defaultScript: "Latn",
  regions: [],
  autonym: "Ẑeta-lang",
  englishName: "Zeta",
  localNames: ["Ẑeta-lang"],
};

const SUMMARIES: LanguageSummary[] = [
  { code: "zz", englishName: "Zeta", autonym: "Ẑeta-lang", hasRegionVariants: false },
];

// Both loadLangtags and getLoadedLangtags return the same fake module, so the
// synchronous seed path (the fix) is exercised — getLoadedLangtags is non-null.
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

describe("IdentityLite auto-advance seed race (PR #1050 regression)", () => {
  it("no-region language: auto-advance seeds Q2 with the recorded local name, not the English fallback", async () => {
    render(<IdentityLite onComplete={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").placeholder).toMatch(/Type your language/);
    });

    // Pick "Zeta" at Q1. hasRegionVariants:false → no region step → auto-advance
    // lands directly on Q2 (own-language name).
    fireEvent.focus(screen.getByRole("combobox"));
    const option = await screen.findByRole("option", { name: /\(zz\)/ });
    fireEvent.mouseDown(option);

    await waitFor(() => {
      expect(
        screen.getByText(/What is your language called in your own language\?/),
      ).toBeTruthy();
    });

    // The seed must have won the race: Q2 shows the recorded own-script name.
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("Ẑeta-lang");
    });
    // And specifically NOT the English Q1 name (the old racy fallback).
    expect(screen.getByRole<HTMLInputElement>("combobox").value).not.toBe("Zeta");
  });
});
