// LangtagsNamePickerField — the English-name-first language picker (spec 030
// US1). Unlike the code-valued datalist picker, this field holds the English
// NAME as its value and reports the resolved entry via onEntryResolved so
// homonyms (same English name, different code) are told apart at selection.
//
// These tests pin the headline behaviors the user asked for:
//   - selecting a suggestion writes the NAME (not the code) into the answer;
//   - two languages that share an English name each resolve to their OWN code;
//   - free text that matches nothing resolves to null (graceful degradation);
//   - the suggestion list is capped (no full ~8k-row datalist).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent, screen } from "@testing-library/react";
import type { LanguageDefaults, LanguageSummary } from "@keyboard-studio/contracts";

// Two distinct languages sharing the English name "Ainu" (ain / aib) — the
// canonical homonym case — plus an unambiguous one.
const AINU_JP: LanguageSummary = {
  code: "ain",
  englishName: "Ainu",
  regionName: "Japan",
  autonym: "アイヌ・イタㇰ",
  hasRegionVariants: false,
};
const AINU_CN: LanguageSummary = {
  code: "aib",
  englishName: "Ainu",
  regionName: "China",
  hasRegionVariants: false,
};
const SWAHILI: LanguageSummary = { code: "sw", englishName: "Swahili", autonym: "Kiswahili" };

// NFC-composed name (km-review PR #1055 comment: resolveTyped must compare
// NFC-normalized forms so an NFD-typed value still matches). Real langtags
// "mri" carries englishName "Māori" (the autonym is "Reo Māori" / "Te Reo
// Māori", kept out of this field per the IdentityLite.autonymDedup.test.tsx
// convention of not conflating englishName with autonym). "Māori" here is
// stored precomposed (the macron is a single NFC codepoint).
const MAORI: LanguageSummary = { code: "mri", englishName: "Māori" };

const ALL: LanguageSummary[] = [AINU_JP, AINU_CN, SWAHILI, MAORI];

// A large list to prove the option cap.
const MANY: LanguageSummary[] = Array.from({ length: 300 }, (_, i) => ({
  code: `l${i.toString().padStart(3, "0")}`,
  englishName: `Language ${i}`,
}));

let searchImpl: (q: string) => LanguageSummary[] = (q) =>
  ALL.filter(
    (l) =>
      l.englishName.toLowerCase().includes(q.toLowerCase()) ||
      l.code.toLowerCase().includes(q.toLowerCase()),
  );
let listImpl: () => LanguageSummary[] = () => ALL;
// Alternate English names live on LanguageDefaults, not the summary row, so the
// alt-name resolution path (spec 030) reads them through getLanguageDefaults.
// Default: no defaults (matches the pre-alt-name behavior); overridden per test.
let defaultsImpl: (code: string) => LanguageDefaults | null = () => null;

vi.mock("../lib/langtagsDefaults.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/langtagsDefaults.ts")>();
  return {
    ...original,
    loadLangtags: () =>
      Promise.resolve({
        getLanguageDefaults: (code: string) => defaultsImpl(code),
        listLanguages: () => listImpl(),
        lookupByName: (q: string) => searchImpl(q),
      }),
  };
});

import { QuestionField } from "./QuestionField.tsx";

const QUESTION = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  type: "autocomplete" as const,
  options_source: "@langtags_names" as const,
  required: true,
};

afterEach(() => {
  cleanup();
  searchImpl = (q) =>
    ALL.filter(
      (l) =>
        l.englishName.toLowerCase().includes(q.toLowerCase()) ||
        l.code.toLowerCase().includes(q.toLowerCase()),
    );
  listImpl = () => ALL;
  defaultsImpl = () => null;
});

async function renderPicker() {
  const onChange = vi.fn();
  const onEntryResolved = vi.fn();
  render(
    <QuestionField
      question={QUESTION}
      value=""
      onChange={onChange}
      onEntryResolved={onEntryResolved}
    />,
  );
  const input = await screen.findByRole<HTMLInputElement>("combobox");
  await waitFor(() => expect(input.placeholder).toMatch(/Type your language/));
  return { input, onChange, onEntryResolved };
}

describe("LangtagsNamePickerField (spec 030 US1)", () => {
  it("selecting a suggestion writes the English NAME, not the code", async () => {
    const { input, onChange, onEntryResolved } = await renderPicker();
    fireEvent.focus(input);
    const option = await screen.findByRole("option", { name: /\(ain\)/ });
    fireEvent.mouseDown(option);
    expect(onChange).toHaveBeenLastCalledWith("Ainu");
    expect(onEntryResolved).toHaveBeenLastCalledWith(AINU_JP);
  });

  it("homonyms are distinct rows and each resolves to its own code", async () => {
    const { input, onEntryResolved } = await renderPicker();
    fireEvent.focus(input);
    // Both "Ainu" rows are present, disambiguated by region + code.
    const jp = await screen.findByRole("option", { name: /Japan.*\(ain\)/ });
    const cn = await screen.findByRole("option", { name: /China.*\(aib\)/ });
    expect(jp).toBeTruthy();
    expect(cn).toBeTruthy();
    fireEvent.mouseDown(cn);
    expect(onEntryResolved).toHaveBeenLastCalledWith(AINU_CN);
  });

  it("free text that matches nothing resolves to null (graceful degradation)", async () => {
    const { input, onChange, onEntryResolved } = await renderPicker();
    fireEvent.change(input, { target: { value: "Nooteka" } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Nooteka"));
    expect(onEntryResolved).toHaveBeenLastCalledWith(null);
  });

  it("typing a uniquely-matching name resolves it without a click", async () => {
    const { input, onEntryResolved } = await renderPicker();
    fireEvent.change(input, { target: { value: "Swahili" } });
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(SWAHILI));
  });

  it("typing an NFD-decomposed name resolves against an NFC-composed englishName (PR #1055 comment)", async () => {
    // Confirm the fixture is genuinely byte-different-but-NFC-equal before
    // relying on it: NFD decomposes each precomposed diacritic into base +
    // combining marks, so the two forms differ codepoint-for-codepoint.
    const nfc = MAORI.englishName;
    const nfd = nfc.normalize("NFD");
    expect(nfd).not.toBe(nfc);
    expect(nfd.normalize("NFC")).toBe(nfc);

    // lookupByName's own matching is a separate concern (real langtags search);
    // here it just needs to surface the candidate so resolveTyped's NFC
    // comparison — the fix under test — is what decides the match.
    searchImpl = () => [MAORI];
    const { input, onEntryResolved } = await renderPicker();
    fireEvent.change(input, { target: { value: nfd } });
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(MAORI));
  });

  it("typing an ambiguous name does NOT auto-resolve (must pick a row)", async () => {
    const { input, onEntryResolved } = await renderPicker();
    fireEvent.change(input, { target: { value: "Ainu" } });
    // Two exact "Ainu" matches → ambiguous → null until the author picks one.
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(null));
  });

  it("typing an alternate English name resolves the entry (spec 030 alt-name)", async () => {
    // Ghotuo (aaa) is resolvable only by its alias "Otuo" — the primary name is
    // "Ghotuo". lookupByName surfaces it; resolveTyped matches the alias via
    // getLanguageDefaults(code).englishNames.
    const GHOTUO: LanguageSummary = { code: "aaa", englishName: "Ghotuo" };
    searchImpl = () => [GHOTUO];
    defaultsImpl = (code) =>
      code === "aaa" ? ({ code: "aaa", englishNames: ["Ghotuo", "Otuo"] } as LanguageDefaults) : null;
    const { input, onEntryResolved } = await renderPicker();
    fireEvent.change(input, { target: { value: "Otuo" } });
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(GHOTUO));
  });

  it("an alternate name shared by two entries stays ambiguous (null until pick)", async () => {
    // Both entries list "Shared" among their alternate names → >1 match → null.
    const ALPHA: LanguageSummary = { code: "xxa", englishName: "Alpha" };
    const BETA: LanguageSummary = { code: "xxb", englishName: "Beta" };
    searchImpl = () => [ALPHA, BETA];
    defaultsImpl = (code) =>
      code === "xxa"
        ? ({ code, englishNames: ["Alpha", "Shared"] } as LanguageDefaults)
        : code === "xxb"
          ? ({ code, englishNames: ["Beta", "Shared"] } as LanguageDefaults)
          : null;
    const { input, onEntryResolved } = await renderPicker();
    fireEvent.change(input, { target: { value: "Shared" } });
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(null));
  });

  it("caps the suggestion list (never renders the full index)", async () => {
    listImpl = () => MANY;
    searchImpl = () => MANY;
    const { input } = await renderPicker();
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByRole("option").length).toBeLessThanOrEqual(50);
  });
});
