// Spec 115 T067: readings of typed text in the language field, end to end through
// the chooser, the remainder chooser and the identity resolution (FR-039 to FR-042,
// FR-047).

import { describe, it, expect, afterEach, beforeAll, beforeEach } from "vitest";
import { searchForLanguage } from "@ethnolib/find-language";
import { cleanup, waitFor, fireEvent, screen, configure, within } from "@testing-library/react";
import { useState } from "react";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { QuestionField } from "../QuestionField.tsx";
import { createIdentityResolution } from "../identityResolution.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { loadChooserModifier, resolveTypedEntry } from "./chooserSearch.ts";

configure({ asyncUtilTimeout: 15_000 });

const QUESTION = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  type: "autocomplete" as const,
  options_source: "@langtags_names" as const,
  required: true,
};

function Harness(props: { resolution: ReturnType<typeof createIdentityResolution> }) {
  const [value, setValue] = useState("");
  return (
    <QuestionField
      question={QUESTION}
      value={value}
      onChange={(v) => setValue(v as string)}
      onEntryResolved={(e: LanguageSummary | null) => props.resolution.onEntryResolved("il_language_english", e)}
      onSelectAdvance={() => {}}
    />
  );
}

async function mount() {
  const resolution = createIdentityResolution();
  render(<Harness resolution={resolution} />);
  const input = await screen.findByRole<HTMLInputElement>("combobox");
  await waitFor(() => expect(input.placeholder).toMatch(/Search by name, code, or country/));
  return { input, resolution };
}

const decision = (id: string) => useDecisionStore.getState().decisions[id as never];

beforeAll(async () => {
  searchForLanguage("ab");
  await loadChooserModifier({ glottolog: true });
}, 120_000);

beforeEach(() => {
  useDecisionStore.getState().reset();
});
afterEach(cleanup);

describe("a resolved reading", () => {
  it("shows the labelled reading first, and picking it records the dialect match", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "Gascon Occitan" } });
    const options = await screen.findAllByRole("option");
    await waitFor(async () => expect((await screen.findAllByRole("option"))[0]?.getAttribute("aria-label")).toMatch(/^Occitan, dialect: Gascon/));
    void options;
    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]!);
    await waitFor(() => expect(decision("language-search-match")?.value).toMatchObject({ name: "Gascon" }));
    expect(decision("language-code")?.value).toBeTruthy();
  });

  it("French Switzerland routes the region question with Switzerland proposed, and writes no region answer", async () => {
    const { input, resolution } = await mount();
    fireEvent.change(input, { target: { value: "French Switzerland" } });
    await waitFor(async () => expect((await screen.findAllByRole("option"))[0]?.getAttribute("aria-label")).toMatch(/^French, region: Switzerland/));
    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]!);
    await waitFor(() => expect(decision("language-region")?.value).toBe("CH"));
    expect(decision("language-region")?.provenance).toBe("default");
    expect(resolution.nextOverride("il_language_english")).toBe("il_language_region");
  });
});

describe("an unresolved reading", () => {
  it("opens the remainder chooser; nothing is written until the author chooses", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "Swiss French" } });
    await waitFor(async () => expect((await screen.findAllByRole("option"))[0]?.getAttribute("aria-label")).toMatch(/^French, plus “Swiss”/));
    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]!);
    const group = await screen.findByRole("group", { name: /French, plus "Swiss"/ });
    expect(decision("language-code")).toBeUndefined();
    const select = within(group).getByLabelText("It's a place") as HTMLSelectElement;
    expect(select.options[0]?.textContent).toBe("Switzerland");
    fireEvent.click(within(group).getByRole("button", { name: "Use this place" }));
    await waitFor(() => expect(decision("language-region")?.value).toBe("CH"));
  });

  it("'It's a dialect name' keeps the words as the pending dialect (typed)", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "Ewondo Mvog-Ada" } });
    await waitFor(async () => expect((await screen.findAllByRole("option"))[0]?.getAttribute("aria-label")).toMatch(/plus “Mvog-Ada”/));
    fireEvent.mouseDown((await screen.findAllByRole("option"))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "It's a dialect name" }));
    await waitFor(() => expect(decision("language-search-match")?.value).toMatchObject({ name: "Mvog-Ada", source: "typed", relation: "dialect" }));
  });

  it("never resolves without a click (FR-042), while a resolved reading does (headless rule)", async () => {
    expect(await resolveTypedEntry("Swiss French")).toBeNull();
    const resolved = await resolveTypedEntry("Gascon Occitan", { glottolog: true });
    expect(resolved?.code).toBe("oc");
    expect(resolved?.match?.name).toBe("Gascon");
  });
});
