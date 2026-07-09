// Component test for SurveyRunner's getSeedOptions plumbing (spec 030 US2):
// dynamic datalist options injected for the current question (e.g. the resolved
// langtags entry's local names for il_language_autonym). jsdom render.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
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

function datalistOptionValues(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("datalist option")).map(
    (o) => o.getAttribute("value") ?? "",
  );
}

describe("SurveyRunner getSeedOptions — dynamic datalist options (spec 030 US2)", () => {
  it("injects the caller's options as the current field's datalist choices", () => {
    const opts: FlowOption[] = [
      { value: "Аԥсшәа", label: "Аԥсшәа" },
      { value: "аҧсуа бызшәа", label: "аҧсуа бызшәа" },
    ];
    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => opts} />,
    );
    const values = datalistOptionValues(container);
    expect(values).toContain("Аԥсшәа");
    expect(values).toContain("аҧсуа бызшәа");
  });

  it("degrades to a plain field (no options) when getSeedOptions returns undefined", () => {
    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => undefined} />,
    );
    expect(datalistOptionValues(container)).toHaveLength(0);
  });

  it("degrades to a plain field when getSeedOptions returns an empty array (the ~60% no-local-name case)", () => {
    const { container } = render(
      <SurveyRunner flow={FLOW} onComplete={vi.fn()} getSeedOptions={() => []} />,
    );
    expect(datalistOptionValues(container)).toHaveLength(0);
  });

  it("injects options only for the matching question id", () => {
    const { container } = render(
      <SurveyRunner
        flow={FLOW}
        onComplete={vi.fn()}
        getSeedOptions={(id) => (id === "some-other-id" ? [{ value: "x", label: "x" }] : undefined)}
      />,
    );
    expect(datalistOptionValues(container)).toHaveLength(0);
  });
});
