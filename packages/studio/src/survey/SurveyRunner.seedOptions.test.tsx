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

  // Sibling of the test above, but pinning the OTHER half of the fix. The test
  // above types the full NFD form of an option's value, so `exact` (the
  // whole-value NFC comparison) is true and `shown` short-circuits to
  // `allOptions` — `.filter()` is never reached, so that test alone does not
  // guard StyledOptionsField's filter-branch `.normalize("NFC")` calls.
  // Reverting only those two filter-branch calls (leaving the exact-match
  // fix intact) still passes the test above but must fail this one.
  //
  // To reach `.filter()`, `exact` must be false (typed value must NOT equal
  // any option's full value) and `q` must be non-empty. So here we type only
  // an NFC-composed SUBSTRING of an NFD-decomposed option label/value.
  it("matches the filter() branch when the author types an NFC-composed substring of an NFD-decomposed option", () => {
    // Decomposed literal, built explicitly from base + combining acute
    // (U+0065 U+0301) rather than a source-file "é", so the byte difference
    // from the composed form below is unambiguous and not an artifact of
    // editor/file normalization.
    const NFD_LABEL = "Café Music"; // decomposed: e (U+0065) + combining acute (U+0301)
    const NFC_LABEL = "Café Music"; // composed: single U+00e9 codepoint
    expect(NFD_LABEL).not.toBe(NFC_LABEL);
    expect(NFD_LABEL.normalize("NFC")).toBe(NFC_LABEL);

    // The typed substring: NFC-composed "café", genuinely byte-different from
    // the "café" embedded (decomposed) inside NFD_LABEL.
    const typedSubstring = "café";
    expect(typedSubstring.normalize("NFC")).toBe(typedSubstring);

    const opts: FlowOption[] = [
      { value: NFD_LABEL, label: NFD_LABEL },
      // A second, unrelated option: proves (a) the typed substring equals no
      // option's full value, so `exact` stays false and the filter really
      // runs, and (b) the filter genuinely narrows the list rather than
      // `shown` having fallen back to `allOptions`.
      { value: "Jazz Ensemble", label: "Jazz Ensemble" },
    ];

    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => opts} />,
    );
    const input = container.querySelector<HTMLInputElement>('[role="combobox"]')!;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: typedSubstring } });

    const values = styledOptionValues(container);
    expect(values).toContain(NFD_LABEL);
    expect(values).not.toContain("Jazz Ensemble");
  });
});
