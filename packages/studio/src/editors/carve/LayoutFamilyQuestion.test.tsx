// T025 — LayoutFamilyQuestion: the existing layout_family question surfaced
// in the main flow (carve gallery). Renders the definition's prompt/options
// unchanged, persists answers, stays editable, and shows the resolved likely
// hosts.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { LayoutFamilyQuestion } from "./LayoutFamilyQuestion.tsx";
import {
  getLayoutFamilyAnswer,
  saveLayoutFamilyAnswer,
  setLikelyHostDeps,
} from "../../lib/layoutFamily.ts";

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  setLikelyHostDeps(undefined);
});

afterEach(() => {
  cleanup();
});

describe("LayoutFamilyQuestion", () => {
  it("renders the existing question's prompt and four options unchanged", () => {
    render(<LayoutFamilyQuestion />);
    expect(
      screen.getByText("Which physical keyboard layout does your community use?"),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: /QWERTY \(used in most English-speaking countries/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /QWERTZ \(used in Germany/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /AZERTY \(used in France/ })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /non-Roman script/ })).toBeTruthy();
  });

  it("answering persists the value to the survey answer store", () => {
    render(<LayoutFamilyQuestion />);
    fireEvent.click(screen.getByRole("radio", { name: /QWERTZ \(used in Germany/ }));
    expect(getLayoutFamilyAnswer()).toBe("qwertz");
  });

  it("a stored answer renders selected and changing it updates the stored value", () => {
    saveLayoutFamilyAnswer("qwerty");
    render(<LayoutFamilyQuestion />);
    expect(
      (screen.getByRole("radio", { name: /QWERTY \(used in most English-speaking countries/ }) as HTMLInputElement).checked,
    ).toBe(true);
    fireEvent.click(screen.getByRole("radio", { name: /AZERTY \(used in France/ }));
    expect(getLayoutFamilyAnswer()).toBe("azerty");
  });

  it("shows the default five-host set when unanswered", () => {
    render(<LayoutFamilyQuestion />);
    const line = screen.getByTestId("layout-family-likely-hosts");
    for (const label of ["US English", "US International", "AZERTY (French)", "QWERTZ (German)", "UK English"]) {
      expect(line.textContent).toContain(label);
    }
    expect(line.textContent).toContain("default set");
  });

  it("reads the stored answer first (override-deps seam)", () => {
    setLikelyHostDeps({
      likelyHostLayouts: () => [{ id: "x", label: "Should not appear" }],
      layoutFamilyHosts: (answer) => [{ id: `lf-${answer}`, label: `Hosts for ${answer}` }],
    });
    saveLayoutFamilyAnswer("qwertz");
    render(<LayoutFamilyQuestion bcp47="de" />);
    const line = screen.getByTestId("layout-family-likely-hosts");
    expect(line.textContent).toContain("Hosts for qwertz");
    expect(line.textContent).toContain("from your answer");
  });

  it("resolves through the real T011 table: qwerty + en-GB → UK English", () => {
    saveLayoutFamilyAnswer("qwerty");
    render(<LayoutFamilyQuestion bcp47="en-GB" />);
    const line = screen.getByTestId("layout-family-likely-hosts");
    expect(line.textContent).toContain("UK English");
    expect(line.textContent).toContain("from your answer");
  });
});
