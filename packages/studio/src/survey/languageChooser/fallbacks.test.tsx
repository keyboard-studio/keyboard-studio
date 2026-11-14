// Spec 115 T032: nothing matches, and the author still ends with a code (US6,
// FR-028 to FR-033): the typed-code proposal, the two fallback rows, the unlisted
// panel, and the SC-008 action counts, on EthnoLib's real search.

import { describe, it, expect, afterEach, beforeAll, beforeEach } from "vitest";
import { searchForLanguage } from "@ethnolib/find-language";
import { cleanup, waitFor, fireEvent, screen, configure } from "@testing-library/react";
import { useState } from "react";
import type { LanguageSummary } from "@keyboard-studio/contracts";
import { parseBcp47 } from "@keyboard-studio/contracts";
import { render } from "../../test/renderWithI18n.tsx";
import { QuestionField } from "../QuestionField.tsx";
import { createIdentityResolution } from "../identityResolution.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { loadChooserModifier } from "./chooserSearch.ts";
import { validate as validateCode } from "../questions/a/il_language_code.ts";

configure({ asyncUtilTimeout: 15_000 });

const QUESTION = {
  id: "il_language_english",
  prompt: "What is your language called in English?",
  type: "autocomplete" as const,
  options_source: "@langtags_names" as const,
  required: true,
};

function Harness(props: { resolution: ReturnType<typeof createIdentityResolution>; onAdvance?: () => void }) {
  const [value, setValue] = useState("");
  return (
    <QuestionField
      question={QUESTION}
      value={value}
      onChange={(v) => setValue(v as string)}
      onEntryResolved={(e: LanguageSummary | null) => props.resolution.onEntryResolved("il_language_english", e)}
      onSelectAdvance={() => props.onAdvance?.()}
    />
  );
}

async function mount() {
  const resolution = createIdentityResolution();
  const view = render(<Harness resolution={resolution} />);
  const input = await screen.findByRole<HTMLInputElement>("combobox");
  await waitFor(() => expect(input.placeholder).toMatch(/Search by name, code, or country/));
  return { input, resolution, ...view };
}

/** Counts the author's clicks; typing is not counted (SC-008 counts actions after typing). */
function clicker() {
  let n = 0;
  return {
    pick: (el: HTMLElement) => {
      n++;
      fireEvent.mouseDown(el);
    },
    press: (el: HTMLElement) => {
      n++;
      fireEvent.click(el);
    },
    get count() {
      return n;
    },
  };
}

const decision = (id: string) => useDecisionStore.getState().decisions[id as never];
const code = (): string => String(decision("language-code")?.value ?? "");

beforeAll(async () => {
  searchForLanguage("ab");
  await loadChooserModifier({ glottolog: true });
}, 120_000);

beforeEach(() => {
  useDecisionStore.getState().reset();
});
afterEach(cleanup);

describe("the two fallback rows (FR-029)", () => {
  it("appear below a fuzzy-only result: Ewondoo shows Ewondo, then both fallbacks", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "Ewondoo" } });
    const names = async () => (await screen.findAllByRole("option")).map((o) => o.getAttribute("aria-label") ?? o.textContent ?? "");
    await waitFor(async () => {
      const list = await names();
      expect(list.some((n) => /isn't listed/.test(n))).toBe(true);
      expect(list.some((n) => /^Ewondo/.test(n))).toBe(true);
    });
    const list = await names();
    const ewondo = list.findIndex((n) => /^Ewondo/.test(n));
    const dialect = list.findIndex((n) => /is a dialect/.test(n));
    const unlisted = list.findIndex((n) => /isn't listed/.test(n));
    expect(ewondo).toBeGreaterThanOrEqual(0);
    expect(dialect).toBeGreaterThan(ewondo);
    expect(unlisted).toBeGreaterThan(dialect);
  });

  it("are absent when a result is close, but always reachable through Can't find it?", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "Ewondo" } });
    // Spec 115: pin the PLAIN row (name ends with the code) — a dialect row
    // for Ewondo starts with "Ewondo, " too and would match a bare prefix.
    await screen.findByRole("option", { name: /^Ewondo, .*ewo$/ });
    expect(screen.queryByRole("option", { name: /isn't listed/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Can't find it?" }));
    expect(screen.getByRole("button", { name: /is a dialect: find its language/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "My language isn't listed" })).toBeTruthy();
  });
});

describe("a typed code or tag (FR-028)", () => {
  it("bft is proposed as Balti and resolves to the code", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "bft" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Use the code bft: Balti/ }));
    await waitFor(() => expect(code()).not.toBe(""));
    expect(parseBcp47(code()).ok).toBe(true);
  });
});

describe('"is a dialect" (FR-030)', () => {
  it("keeps the text as the pending dialect name and relabels the search", async () => {
    const { input } = await mount();
    fireEvent.change(input, { target: { value: "Zzyxqw" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /is a dialect/ }));
    expect(decision("language-search-match")?.value).toMatchObject({ name: "Zzyxqw", relation: "dialect", source: "typed" });
    expect(screen.getByText('Which language is "Zzyxqw" a dialect of?')).toBeTruthy();
    expect(input.value).toBe("");
    // Picking the parent keeps the pending name.
    fireEvent.change(input, { target: { value: "Ewondo" } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /^Ewondo, .*ewo$/ }));
    await waitFor(() => expect(code()).not.toBe(""));
    expect(decision("language-search-match")?.value).toMatchObject({ name: "Zzyxqw", source: "typed" });
  });
});

describe("the unlisted panel (FR-031, FR-032)", () => {
  async function openPanel(text: string) {
    const view = await mount();
    fireEvent.change(view.input, { target: { value: text } });
    fireEvent.mouseDown(await screen.findByRole("option", { name: /isn't listed/ }));
    const panel = await screen.findByRole("group", { name: "My language isn't listed" });
    return { ...view, panel };
  }

  it("pre-fills the name, and with no code proposes qaa-x- with the explanation and request link", async () => {
    const { panel } = await openPanel("Zzyxqw");
    expect((screen.getByLabelText("Language name") as HTMLInputElement).value).toBe("Zzyxqw");
    expect(panel.textContent).toContain("qaa-x-zzyxqw");
    const link = screen.getByRole("link", { name: /request an ISO 639-3 code/ }) as HTMLAnchorElement;
    expect(link.href).toMatch(/iso639-3\.sil\.org/);
    expect(panel.querySelector('[data-testid="unlisted-script"]')?.textContent).toMatch(/Proposed script: [A-Z][a-z]{3}/);
  });

  it("checks the code: ill-formed blocks, unregistered warns, registered shows its name", async () => {
    await openPanel("Zzyxqw");
    const codeInput = screen.getByLabelText(/I know its code/);
    const confirm = screen.getByRole("button", { name: "Use this language" }) as HTMLButtonElement;
    fireEvent.change(codeInput, { target: { value: "12" } });
    expect(screen.getByRole("status").textContent).toMatch(/not a valid language code/);
    expect(confirm.disabled).toBe(true);
    fireEvent.change(codeInput, { target: { value: "zzz" } });
    expect(screen.getByRole("status").textContent).toMatch(/not in the ISO 639-3 registry/);
    expect(confirm.disabled).toBe(false);
    fireEvent.change(codeInput, { target: { value: "bft" } });
    expect(screen.getByRole("status").textContent).toMatch(/Registered as Balti/);
    fireEvent.change(codeInput, { target: { value: "qab" } });
    expect(screen.getByRole("status").textContent).toMatch(/private-use/);
  });
});

describe("il_language_code takes no unchecked free text (FR-033)", () => {
  it("rejects text that is not a well-formed code", () => {
    expect(validateCode("not a code!").ok).toBe(false);
    expect(validateCode("12").ok).toBe(false);
    expect(validateCode("bft").ok).toBe(true);
    expect(validateCode("zzz").ok).toBe(true);
    expect(validateCode("qaa").ok).toBe(true);
  });
});

describe("SC-008: each input reaches a confirmed code within four actions", () => {
  const confirmed = async () => {
    await waitFor(() => expect(code()).not.toBe(""));
    expect(parseBcp47(code()).ok).toBe(true);
  };

  it("a listed name", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "Ewondo" } });
    c.pick(await screen.findByRole("option", { name: /^Ewondo, .*ewo$/ }));
    await confirmed();
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("a dialect name", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "Gascon" } });
    // "Gascon" yields exactly one Occitan row, carrying the dialect match
    // (dialectSearch: "Gascon -> Occitan once, with the Glottolog match") —
    // its name ends with the countries, not the code, so pin the match line.
    c.pick(await screen.findByRole("option", { name: /Gascon: a dialect of Occitan/ }));
    await confirmed();
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("a code", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "bft" } });
    c.pick(await screen.findByRole("option", { name: /Use the code bft/ }));
    await confirmed();
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("a tag", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "oc-gascon" } });
    c.pick(await screen.findByRole("option", { name: /Use the code oc/ }));
    await confirmed();
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("a misspelled name", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "Ewondoo" } });
    c.pick((await screen.findAllByRole("option", { name: /^Ewondo/ }))[0]!);
    await confirmed();
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("an unlisted dialect", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "Zzyxqw" } });
    c.pick(await screen.findByRole("option", { name: /is a dialect/ }));
    fireEvent.change(input, { target: { value: "Ewondo" } });
    c.pick(await screen.findByRole("option", { name: /^Ewondo, .*ewo$/ }));
    await confirmed();
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("an unlisted language with no code", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "Zzyxqw" } });
    c.pick(await screen.findByRole("option", { name: /isn't listed/ }));
    c.press(await screen.findByRole("button", { name: "Use this language" }));
    await confirmed();
    expect(code()).toBe("qaa");
    expect(c.count).toBeLessThanOrEqual(4);
  });

  it("an unlisted language with a code", async () => {
    const { input } = await mount();
    const c = clicker();
    fireEvent.change(input, { target: { value: "Zzyxqw" } });
    c.pick(await screen.findByRole("option", { name: /isn't listed/ }));
    fireEvent.change(await screen.findByLabelText(/I know its code/), { target: { value: "zzz" } });
    c.press(screen.getByRole("button", { name: "Use this language" }));
    await confirmed();
    expect(code()).toBe("zzz");
    expect(c.count).toBeLessThanOrEqual(4);
  });
});
