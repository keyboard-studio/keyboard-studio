// Soft mismatch warning for il_language_code: when the typed/selected code
// reverse-resolves to a DIFFERENT language than the one picked at
// il_language_english, IdentityLite/SurveyRunner surface a non-blocking
// caption (getFieldWarning). Nothing in the validator layers catches this —
// Layer A' only checks that a bcp47 tag is present, never that it matches the
// author's actual language — so this is the only guard against it.
//
// Drives the REAL identity-lite flow through the langtags name picker (like
// QuestionField.namePicker.test.tsx) rather than `resume`, because the
// mismatch check depends on resolvedEntryRef — populated only by an actual
// selection at il_language_english, never by replaying committed answers.

import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

const HAUSA_SUMMARY: LanguageSummary = { code: "ha", englishName: "Hausa", hasRegionVariants: false };
const HAUSA_DEFAULTS: LanguageDefaults = {
  code: "ha",
  iso639_3: "hau",
  defaultScript: "Latn",
  regions: [],
  englishName: "Hausa",
  englishNames: ["Hausa"],
  autonym: "Hausa",
};
const HINDI_DEFAULTS: LanguageDefaults = {
  code: "hi",
  iso639_3: "hin",
  defaultScript: "Deva",
  regions: [],
  englishName: "Hindi",
  englishNames: ["Hindi"],
};

function defaultsImpl(code: string): LanguageDefaults | null {
  const key = code.toLowerCase();
  if (key === "ha" || key === "hau") return HAUSA_DEFAULTS;
  if (key === "hi" || key === "hin") return HINDI_DEFAULTS;
  return null;
}

// `getLoadedLangtags` returns the same fixture module synchronously, matching
// the real invariant this feature relies on: by the time il_language_english
// has resolved a selection, the module IS loaded (the picker cannot present a
// selectable row otherwise) — see IdentityLite.tsx's handleEntryResolved.
const MOCK_MOD = {
  getLanguageDefaults: defaultsImpl,
  listLanguages: () => [HAUSA_SUMMARY],
  lookupByName: (q: string) =>
    [HAUSA_SUMMARY].filter((l) => l.englishName.toLowerCase().includes(q.toLowerCase())),
};

vi.mock("../lib/langtagsDefaults.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/langtagsDefaults.ts")>();
  return {
    ...original,
    loadLangtags: () => Promise.resolve(MOCK_MOD),
    getLoadedLangtags: () => MOCK_MOD,
  };
});

import { IdentityLite } from "./IdentityLite.tsx";

afterEach(cleanup);

/** Select Hausa at Q1 and click through Q2 (autonym) to land on il_language_code. */
async function reachLanguageCode(): Promise<void> {
  render(<IdentityLite onComplete={vi.fn()} />);

  const q1 = await screen.findByRole<HTMLInputElement>("combobox");
  fireEvent.focus(q1);
  const option = await screen.findByRole("option", { name: /Hausa/ });
  fireEvent.mouseDown(option); // resolves Hausa + auto-advances (advanceOnSelect)

  // il_language_autonym: accept whatever seeded default is pre-filled.
  await waitFor(() => expect(screen.getByTestId("survey-advance")).toBeTruthy());
  fireEvent.click(screen.getByTestId("survey-advance"));

  // Now on il_language_code, seeded with Hausa's own code ("hau").
  await waitFor(() => {
    const input = screen.getByRole<HTMLInputElement>("combobox");
    expect(input.value).toBe("hau");
  });
}

describe("il_language_code mismatch warning", () => {
  it("shows no warning for the seeded (correct) code", async () => {
    await reachLanguageCode();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("warns when the typed code resolves to a different language", async () => {
    await reachLanguageCode();
    const input = screen.getByRole<HTMLInputElement>("combobox");
    fireEvent.change(input, { target: { value: "hin" } });

    const warning = await screen.findByRole("status");
    expect(warning.textContent).toContain("hin");
    expect(warning.textContent).toContain("Hindi");
    expect(warning.textContent).toContain("Hausa");
  });

  it("clears the warning once the code is fixed back to a match", async () => {
    await reachLanguageCode();
    const input = screen.getByRole<HTMLInputElement>("combobox");
    fireEvent.change(input, { target: { value: "hin" } });
    await screen.findByRole("status");

    fireEvent.change(input, { target: { value: "hau" } });
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });

  it("does not warn on a code that resolves to nothing (unlisted-language escape hatch, spec 030 FR-003)", async () => {
    await reachLanguageCode();
    const input = screen.getByRole<HTMLInputElement>("combobox");
    fireEvent.change(input, { target: { value: "bft" } });
    // "bft" is not in the mocked dataset — getLanguageDefaults returns null,
    // so there is nothing to compare against and no warning fires.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
