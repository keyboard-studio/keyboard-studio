// Regression test for the pre-load race in LangtagsComboboxField (km-review
// PR #1055 comment). Before the fix, handleType() early-returned whenever
// modRef.current was still null (loadLangtags() hadn't resolved yet) and never
// re-ran the lookup once the module landed — so a value typed BEFORE the async
// langtags module resolved never fired onEntryResolved, even for an exact
// match. The fix holds latestValueRef and, in the load-.then callback, re-runs
// resolveTyped against whatever is currently typed once the module resolves.
//
// The sibling QuestionField.namePicker.test.tsx / QuestionField.langtagsCap
// specs mock loadLangtags with an ALREADY-RESOLVED promise, so they can never
// exercise this race — the module is present before the first keystroke in
// every one of those tests. This file mocks loadLangtags with a promise this
// test controls manually (captures its `resolve`) so it can type a value while
// the load is still pending, then resolve it afterwards.

import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, cleanup, waitFor, fireEvent, screen } from "@testing-library/react";
import type { LanguageSummary } from "@keyboard-studio/contracts";

const SWAHILI: LanguageSummary = { code: "sw", englishName: "Swahili", autonym: "Kiswahili" };
const ALL: LanguageSummary[] = [SWAHILI];

interface FakeLangtagsModule {
  getLanguageDefaults: (code: string) => null;
  listLanguages: () => LanguageSummary[];
  lookupByName: (q: string) => LanguageSummary[];
}

// Captured by the mocked loadLangtags() below so the test can resolve the
// module load at a moment of its own choosing (after typing).
let resolveLoad: ((mod: FakeLangtagsModule) => void) | null = null;

vi.mock("../lib/langtagsDefaults.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/langtagsDefaults.ts")>();
  return {
    ...original,
    loadLangtags: () =>
      new Promise<FakeLangtagsModule>((resolve) => {
        resolveLoad = resolve;
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
  resolveLoad = null;
});

// A thin controlled wrapper: QuestionField itself is stateless re: `value`, so
// a static value="" prop would never reflect what was typed and the fix's
// latestValueRef (which mirrors the `value` PROP, not the DOM input) would
// never see it. Real callers (SurveyRunner) always feed onChange back into
// state, so this harness reproduces that — not a workaround for the test.
function Harness({ onEntryResolved }: { onEntryResolved: (e: LanguageSummary | null) => void }) {
  const [value, setValue] = useState("");
  return (
    <QuestionField
      question={QUESTION}
      value={value}
      onChange={(v) => setValue(typeof v === "string" ? v : "")}
      onEntryResolved={onEntryResolved}
    />
  );
}

describe("LangtagsComboboxField pre-load race (PR #1055 regression)", () => {
  it("resolves a value typed BEFORE the langtags module loads, once it resolves", async () => {
    const onEntryResolved = vi.fn();
    render(<Harness onEntryResolved={onEntryResolved} />);

    // The module load is still pending — the field shows the loading placeholder,
    // proving handleType will hit modRef.current === null below.
    const input = await screen.findByRole<HTMLInputElement>("combobox");
    expect(input.placeholder).toBe("Loading languages…");

    // Type the exact English name while the module is still unresolved. Before
    // the fix this never resolves: handleType returns before calling
    // resolveTyped whenever modRef.current is null.
    fireEvent.change(input, { target: { value: "Swahili" } });
    await waitFor(() => expect(input.value).toBe("Swahili"));
    expect(onEntryResolved).not.toHaveBeenCalled();

    // Now let the langtags module resolve.
    expect(resolveLoad).not.toBeNull();
    resolveLoad!({
      getLanguageDefaults: () => null,
      listLanguages: () => ALL,
      lookupByName: (q: string) =>
        ALL.filter((l) => l.englishName.toLowerCase().includes(q.toLowerCase())),
    });

    // The fix re-runs resolveTyped against the pre-load value once the module
    // lands — the previously-typed exact match must now resolve.
    await waitFor(() => expect(onEntryResolved).toHaveBeenCalledWith(SWAHILI));
  });
});
