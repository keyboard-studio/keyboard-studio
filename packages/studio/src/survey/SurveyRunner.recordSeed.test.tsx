// SurveyRunner — decision-record seeds (spec 092 T031, FR-003).
//
// The runner's first seed source is now the decision store: a record the
// extraction pass seeded renders as the field's pre-fill with its source
// labelled, and an answered record's `offered` value renders beside the
// author's answer — with NO seed props passed by the host at all.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import React from "react";

import { SurveyRunner } from "./SurveyRunner.tsx";
import type { FlowDef } from "./types.ts";
import { useDecisionStore } from "../stores/decisionStore.ts";
import { useSurveyAnswerStore } from "../stores/surveyAnswerStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";

const FLOW: FlowDef = {
  flow_id: "record-seed-test",
  phase: "A",
  questions: [
    {
      id: "il_copyright_holder",
      type: "short_text",
      prompt: "Copyright holder",
      required: false,
      next: null,
    },
  ],
};

function field(): HTMLInputElement | HTMLTextAreaElement {
  return screen.getByRole("textbox") as HTMLInputElement | HTMLTextAreaElement;
}

beforeEach(() => {
  useDecisionStore.getState().reset();
  useSurveyAnswerStore.getState().reset();
  useSurveySessionStore.setState({ activeStepId: "identity" });
});

afterEach(() => {
  cleanup();
});

describe("SurveyRunner — record-driven seeds (spec 092 T031)", () => {
  it("an extracted record pre-fills the field and labels its source, with no seed props", () => {
    useDecisionStore.getState().record({
      id: "copyright-holder",
      value: "(c) 2009-2019 SIL International",
      provenance: "extracted",
      source: "basic_kbdfr",
    });
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />, { withStepNav: true });
    expect(field().value).toBe("(c) 2009-2019 SIL International");
    expect(screen.getByText("from basic_kbdfr")).toBeTruthy();
  });

  it("an answered record keeps the author's value and shows the offered value beside it", () => {
    useDecisionStore.getState().record({
      id: "base-keyboard",
      value: { id: "basic_kbdfr" },
      provenance: "asked",
    });
    useDecisionStore.getState().record({
      id: "copyright-holder",
      value: "My Own Holder",
      provenance: "asked",
      offered: "(c) 2009-2019 SIL International",
    });
    useSurveyAnswerStore.getState().saveAnswer("identity", "il_copyright_holder", {
      value: "My Own Holder",
    });
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />, { withStepNav: true });
    expect(field().value).toBe("My Own Holder");
    expect(
      screen.getByText("from basic_kbdfr: (c) 2009-2019 SIL International"),
    ).toBeTruthy();
  });

  it("no record → no seed and no caption (the pre-092 behaviour)", () => {
    render(<SurveyRunner flow={FLOW} onComplete={vi.fn()} />, { withStepNav: true });
    expect(field().value).toBe("");
    expect(screen.queryByText(/^from /)).toBeNull();
  });
});
