// Datalist size cap for the langtags-backed autocomplete (il_language_code).
// The full langtags index is ~8,000 entries; rendering them all as <option>
// elements crashes embedded Electron webviews (VS Code Simple Browser) and
// janks real browsers. LangtagsAutocompleteField must never render more than
// MAX_DATALIST_OPTIONS options — neither on mount (pre-populated browse list)
// nor after typing (lookupByName results).

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, waitFor, fireEvent } from "@testing-library/react";
import type { LanguageSummary } from "@keyboard-studio/contracts";

const MANY: LanguageSummary[] = Array.from({ length: 300 }, (_, i) => ({
  code: `l${i.toString().padStart(3, "0")}`,
  englishName: `Language ${i}`,
}));

vi.mock("../lib/langtagsDefaults.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/langtagsDefaults.ts")>();
  return {
    ...original,
    loadLangtags: () =>
      Promise.resolve({
        getLanguageDefaults: () => null,
        listLanguages: () => MANY,
        lookupByName: () => MANY.slice(0, 200),
      }),
  };
});

import { QuestionField } from "./QuestionField.tsx";

const QUESTION = {
  id: "il_language_code",
  prompt: "What language is this keyboard for?",
  type: "autocomplete" as const,
  options_source: "@langtags_iso639" as const,
  required: false,
};

afterEach(() => {
  cleanup();
});

describe("LangtagsAutocompleteField datalist cap", () => {
  it("caps the pre-populated browse list on mount", async () => {
    const { container } = render(
      <QuestionField question={QUESTION} value={undefined} onChange={() => {}} />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll("datalist option").length).toBeGreaterThan(0);
    });
    expect(
      container.querySelectorAll("datalist option").length,
    ).toBeLessThanOrEqual(50);
  });

  it("caps the search results after typing", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuestionField question={QUESTION} value={undefined} onChange={onChange} />,
    );
    await waitFor(() => {
      expect(container.querySelectorAll("datalist option").length).toBeGreaterThan(0);
    });
    const input = container.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Lang" } });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("Lang");
    });
    await waitFor(() => {
      const n = container.querySelectorAll("datalist option").length;
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(50);
    });
  });
});
