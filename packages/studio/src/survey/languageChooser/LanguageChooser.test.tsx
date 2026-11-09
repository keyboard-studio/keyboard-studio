// Spec 115 T022: the language chooser keeps today's autosuggest, auto-resolve and
// auto-fill behaviour (FR-038), on EthnoLib's real search and the real langtags
// data. Ports the behaviours of the retired name-picker tests (homonyms, free
// text, NFD typing, alias resolution, the row cap, the pre-load race).

import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from "vitest";
import { searchForLanguage } from "@ethnolib/find-language";
import { cleanup, waitFor, fireEvent, screen, act, configure } from "@testing-library/react";
import { useState } from "react";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { QuestionField } from "../QuestionField.tsx";
import { createIdentityResolution } from "../identityResolution.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { loadLangtags } from "../../lib/langtagsDefaults.ts";
import { loadChooserModifier, summaryFor } from "./chooserSearch.ts";
import { languageResultsFor, resolveTypedLanguage } from "../resolveTypedLanguage.ts";

// The real fuzzy search is CPU-heavy, and an earlier test's search keeps running
// after its unmount; give each async query room.
configure({ asyncUtilTimeout: 10_000 });

const QUESTION = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  type: "autocomplete" as const,
  options_source: "@langtags_names" as const,
  required: true,
};

function Harness(props: {
  onEntryResolved?: (e: LanguageSummary | null) => void;
  onSelectAdvance?: (v: string) => void;
  initial?: string;
  onChange?: (v: string) => void;
}) {
  const [value, setValue] = useState(props.initial ?? "");
  return (
    <QuestionField
      question={QUESTION}
      value={value}
      onChange={(v) => {
        setValue(v as string);
        props.onChange?.(v as string);
      }}
      {...(props.onEntryResolved !== undefined ? { onEntryResolved: props.onEntryResolved } : {})}
      {...(props.onSelectAdvance !== undefined ? { onSelectAdvance: props.onSelectAdvance } : {})}
    />
  );
}

async function renderChooser(props: Parameters<typeof Harness>[0] = {}) {
  const view = render(<Harness {...props} />);
  const input = await screen.findByRole<HTMLInputElement>("combobox");
  await waitFor(() => expect(input.placeholder).toMatch(/Search by name, code, or country/));
  return { input, ...view };
}

const lastCode = (fn: ReturnType<typeof vi.fn>): string | null => {
  const arg = fn.mock.calls.at(-1)?.[0] as LanguageSummary | null | undefined;
  return arg === undefined || arg === null ? null : arg.code;
};

// EthnoLib builds its search indexes on first use (seconds); do it once up front.
beforeAll(async () => {
  searchForLanguage("ab");
  await loadChooserModifier({ glottolog: true });
}, 60_000);

beforeEach(() => {
  useDecisionStore.getState().reset();
});
afterEach(cleanup);

describe("autosuggest (FR-038)", () => {
  it("suggestions update as the author types", async () => {
    const { input } = await renderChooser();
    fireEvent.change(input, { target: { value: "Ewon" } });
    await screen.findByRole("option", { name: /^Ewondo, / });
    fireEvent.change(input, { target: { value: "Bafut" } });
    await screen.findByRole("option", { name: /Bafut/ });
    await waitFor(() => expect(screen.queryByRole("option", { name: /Ewondo/ })).toBeNull());
  });

  it("never lists more than 50 rows", async () => {
    const { input } = await renderChooser();
    fireEvent.change(input, { target: { value: "an" } });
    await waitFor(() => expect(screen.getAllByRole("option").length).toBeGreaterThan(10));
    // The row cap is on language rows: a typed code ("an" is Aragonese's) is proposed above them.
    const languageRows = screen.getAllByRole("option").filter((o) => !/^Use the (private-use )?code /.test(o.getAttribute("aria-label") ?? ""));
    expect(languageRows.length).toBeLessThanOrEqual(50);
  });

  it("announces the number of suggestions politely", async () => {
    const { input } = await renderChooser();
    fireEvent.change(input, { target: { value: "Ewondo" } });
    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/suggestion/));
  });
});

describe("picking and auto-resolve (FR-038)", () => {
  it("picking a row writes the NAME, resolves its entry and advances", async () => {
    const onEntryResolved = vi.fn();
    const onSelectAdvance = vi.fn();
    const onChange = vi.fn();
    const { input } = await renderChooser({ onEntryResolved, onSelectAdvance, onChange });
    fireEvent.change(input, { target: { value: "Ewon" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /^Ewondo, / }));
    expect(onChange).toHaveBeenLastCalledWith("Ewondo");
    expect(lastCode(onEntryResolved)).toBe("ewo");
    expect(onSelectAdvance).toHaveBeenCalledWith("Ewondo");
  });

  it("typing a uniquely-matching name resolves it without a click", async () => {
    const onEntryResolved = vi.fn();
    const { input } = await renderChooser({ onEntryResolved });
    fireEvent.change(input, { target: { value: "Ewondo" } });
    await waitFor(() => expect(lastCode(onEntryResolved)).toBe("ewo"));
  });

  it("typing an NFD-decomposed name resolves against the NFC name", async () => {
    const onEntryResolved = vi.fn();
    const { input } = await renderChooser({ onEntryResolved });
    const nfd = "Māori".normalize("NFD");
    expect(nfd).not.toBe("Māori");
    fireEvent.change(input, { target: { value: nfd } });
    await waitFor(() => expect(lastCode(onEntryResolved)).toBe("mi"));
  });

  it("free text that matches nothing resolves to null", async () => {
    const onEntryResolved = vi.fn();
    const onChange = vi.fn();
    const { input } = await renderChooser({ onEntryResolved, onChange });
    fireEvent.change(input, { target: { value: "Nooteka" } });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("Nooteka"));
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(null));
  });

  it("a homonym name does not auto-resolve; each row resolves to its own code when picked", async () => {
    const onEntryResolved = vi.fn();
    const { input } = await renderChooser({ onEntryResolved });
    fireEvent.change(input, { target: { value: "Ainu" } });
    const rows = await screen.findAllByRole("option", { name: /^Ainu/ });
    expect(rows.length).toBeGreaterThanOrEqual(2);
    await waitFor(() => expect(onEntryResolved).toHaveBeenLastCalledWith(null));
    fireEvent.mouseDown(rows[1]!);
    const picked = onEntryResolved.mock.calls.at(-1)?.[0] as LanguageSummary;
    expect(["ain", "aib"]).toContain(picked.code);
    // The explicit pick is not overridden by the ambiguous typed text.
    await new Promise((r) => setTimeout(r, 50));
    expect(onEntryResolved.mock.calls.at(-1)?.[0]).toBe(picked);
  });

  it("resolves a value present before the chooser chunk loads, with the current handler", async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const { rerender } = render(<Harness initial="Ewondo" onEntryResolved={cb1} />);
    // Swap the handler before the lazy chunk has resolved.
    rerender(<Harness initial="Ewondo" onEntryResolved={cb2} />);
    await waitFor(() => expect(lastCode(cb2)).toBe("ewo"));
    expect(cb1).not.toHaveBeenCalledWith(expect.objectContaining({ code: "ewo" }));
  });
});

describe("default-provenance seeds and the headless author (FR-038)", () => {
  it("resolving Ewondo records code, script and autonym seeds with default provenance", async () => {
    const langtags = await loadLangtags();
    const modifier = await loadChooserModifier();
    const hit = resolveTypedLanguage("Ewondo", languageResultsFor("Ewondo", modifier));
    expect(hit).not.toBeNull();
    const summary = summaryFor(hit!, langtags);
    expect(summary?.code).toBe("ewo");
    createIdentityResolution().onEntryResolved("il_language_english", summary);
    const d = useDecisionStore.getState().decisions;
    expect(d["language-code"]).toMatchObject({ value: "ewo", provenance: "default" });
    expect(d["target-script"]?.provenance).toBe("default");
    expect(d["language-autonym"]?.provenance).toBe("default");
  });

  it("the headless author resolves Ewondo to the same summary as the UI path", async () => {
    const langtags = await loadLangtags();
    const modifier = await loadChooserModifier({ glottolog: true });
    const hit = resolveTypedLanguage("Ewondo", languageResultsFor("Ewondo", modifier));
    const onEntryResolved = vi.fn();
    const { input } = await renderChooser({ onEntryResolved });
    fireEvent.change(input, { target: { value: "Ewondo" } });
    await waitFor(() => expect(onEntryResolved).toHaveBeenCalled());
    const ui = onEntryResolved.mock.calls.at(-1)?.[0] as LanguageSummary;
    expect(summaryFor(hit!, langtags)).toEqual(ui);
  });
});

describe("accents (FR-005)", () => {
  it("Arbereshe and Arbëreshë both find aae; catala finds ca", async () => {
    const modifier = await loadChooserModifier();
    const codes = (q: string): string[] => languageResultsFor(q, modifier).map((r) => r.languageSubtag);
    expect(codes("Arbereshe")).toContain("aae");
    expect(codes("Arbëreshë")).toContain("aae");
    expect(codes("catala")).toContain("ca");
  });

  it("Gascón finds Occitan through the dialect searcher", async () => {
    const modifier = await loadChooserModifier({ glottolog: true });
    const oc = languageResultsFor("Gascón", modifier).find((r) => r.languageSubtag === "oc");
    expect(oc?.match?.glottocode).toBe("gasc1240");
  });
});

describe("why-it-matched line (FR-002) and the match decision", () => {
  it("a dialect row names its language in its accessible name; picking records language-search-match", async () => {
    const onEntryResolved = vi.fn();
    const { input } = await renderChooser({ onEntryResolved });
    fireEvent.change(input, { target: { value: "Gascon" } });
    const row = await screen.findByRole("option", { name: /a dialect of Occitan/ });
    expect(row.textContent).toMatch(/Gascon: a dialect of Occitan \(oc\)/);
    fireEvent.mouseDown(row);
    const summary = onEntryResolved.mock.calls.at(-1)?.[0] as LanguageSummary;
    expect(summary.code).toBe("oc");
    expect(summary.match?.glottocode).toBe("gasc1240");
    createIdentityResolution().onEntryResolved("il_language_english", summary);
    expect(useDecisionStore.getState().decisions["language-search-match"]?.value).toMatchObject({
      relation: "dialect",
      glottocode: "gasc1240",
    });
  });

  it("a direct hit carries no match and clears a previous one", async () => {
    const langtags = await loadLangtags();
    const modifier = await loadChooserModifier({ glottolog: true });
    const resolution = createIdentityResolution();
    const gascon = languageResultsFor("Gascon", modifier).find((r) => r.languageSubtag === "oc")!;
    act(() => resolution.onEntryResolved("il_language_english", summaryFor(gascon, langtags)));
    expect(useDecisionStore.getState().decisions["language-search-match"]).toBeDefined();
    const ewo = resolveTypedLanguage("Ewondo", languageResultsFor("Ewondo", modifier))!;
    act(() => resolution.onEntryResolved("il_language_english", summaryFor(ewo, langtags)));
    expect(useDecisionStore.getState().decisions["language-search-match"]).toBeUndefined();
  });
});
