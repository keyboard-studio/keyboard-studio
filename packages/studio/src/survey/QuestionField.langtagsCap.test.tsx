// Dropdown size cap for the langtags-backed code picker (il_language_code, Q3,
// @langtags_iso639). The full langtags index is ~8,000 entries; rendering them
// all crashes embedded Electron webviews (VS Code Simple Browser) and janks real
// browsers. The shared LangtagsComboboxField must never render more than
// MAX_DATALIST_OPTIONS rows — neither on mount (pre-populated browse list) nor
// after typing (lookupByName results). Q3 now uses the same StyledCombobox as Q1,
// whose rows render only while the dropdown is open, so each case opens it first.

import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, waitFor, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
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

function optionCount(container: HTMLElement): number {
  return container.querySelectorAll('[role="option"]').length;
}

describe("LangtagsComboboxField (code mode) dropdown cap", () => {
  it("caps the pre-populated browse list when opened", async () => {
    const { container } = render(
      <QuestionField question={QUESTION} value={undefined} onChange={() => {}} />,
    );
    // Wait for the one-time langtags load to settle (placeholder flips).
    await waitFor(() => {
      expect(
        (container.querySelector('[role="combobox"]') as HTMLInputElement).placeholder,
      ).toMatch(/Search by name/);
    });
    // Rows render only while open — focus to open the list.
    fireEvent.focus(container.querySelector('[role="combobox"]') as HTMLInputElement);
    await waitFor(() => {
      expect(optionCount(container)).toBeGreaterThan(0);
    });
    expect(optionCount(container)).toBeLessThanOrEqual(50);
  });

  it("caps the search results after typing", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <QuestionField question={QUESTION} value={undefined} onChange={onChange} />,
    );
    await waitFor(() => {
      expect(
        (container.querySelector('[role="combobox"]') as HTMLInputElement).placeholder,
      ).toMatch(/Search by name/);
    });
    const input = container.querySelector('[role="combobox"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Lang" } });
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("Lang");
    });
    await waitFor(() => {
      const n = optionCount(container);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(50);
    });
  });
});
