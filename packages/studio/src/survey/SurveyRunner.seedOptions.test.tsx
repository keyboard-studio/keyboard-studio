// Component test for SurveyRunner's getSeedOptions plumbing (spec 030 US2):
// dynamic options injected for the current question (e.g. the resolved langtags
// entry's local names for il_language_autonym). The field is the shared
// StyledCombobox, which renders its rows only while open, so the helper focuses
// the input before reading the option values. jsdom render.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef, FlowOption } from "./types.ts";

const FLOW: FlowDef = {
  flow_id: "test-seed-options",
  phase: "A",
  questions: [
    {
      id: "q-autonym",
      type: "autocomplete",
      prompt: "What is it called in your own language?",
      required: false,
      next: null,
    },
  ],
};

afterEach(cleanup);

// Focus the styled combobox (its rows render only while open) and read the
// value of each rendered option row.
function styledOptionValues(container: HTMLElement): string[] {
  const input = container.querySelector<HTMLInputElement>('[role="combobox"]');
  if (input !== null) fireEvent.focus(input);
  return Array.from(container.querySelectorAll('[role="option"]')).map(
    (o) => o.getAttribute("data-value") ?? "",
  );
}

describe("SurveyRunner getSeedOptions — dynamic options (spec 030 US2)", () => {
  it("injects the caller's options as the current field's dropdown choices", () => {
    const opts: FlowOption[] = [
      { value: "Аԥсшәа", label: "Аԥсшәа" },
      { value: "аҧсуа бызшәа", label: "аҧсуа бызшәа" },
    ];
    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => opts} />,
    );
    const values = styledOptionValues(container);
    expect(values).toContain("Аԥсшәа");
    expect(values).toContain("аҧсуа бызшәа");
  });

  it("degrades to a plain field (no options) when getSeedOptions returns undefined", () => {
    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => undefined} />,
    );
    expect(styledOptionValues(container)).toHaveLength(0);
  });

  it("degrades to a plain field when getSeedOptions returns an empty array (the ~60% no-local-name case)", () => {
    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => []} />,
    );
    expect(styledOptionValues(container)).toHaveLength(0);
  });

  it("injects options only for the matching question id", () => {
    const { container } = render(
      <SurveyRunner
        flow={FLOW}
        onComplete={vi.fn()}
        getSeedOptions={(id) => (id === "some-other-id" ? [{ value: "x", label: "x" }] : undefined)}
      />,
    );
    expect(styledOptionValues(container)).toHaveLength(0);
  });

  // NFC/NFD sibling of the getSeedOptions dedup key + resolveTyped comparison
  // fix (IdentityLite.getSeedOptions / QuestionField.resolveTyped): the option
  // filter in StyledOptionsField must NFC-normalize before case-folding too, so
  // typing the NFD-decomposed form of an own-script autonym still matches the
  // NFC-stored option instead of being filtered out.
  it("matches an NFC-stored option when the author types its NFD-decomposed form", () => {
    // "café" precomposed (U+0065 U+0301 vs U+00E9) — the canonical NFC/NFD pair.
    const NFC = "café";
    const NFD = "café";
    expect(NFC).not.toBe(NFD);
    expect(NFC.normalize("NFC")).toBe(NFD.normalize("NFC"));

    const { container } = render(
      <SurveyRunner
        flow={FLOW}
        onComplete={vi.fn()}
        getSeedOptions={() => [{ value: NFC, label: NFC }]}
      />,
    );
    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: NFD } });
    expect(styledOptionValues(container)).toContain(NFC);
  });
});
