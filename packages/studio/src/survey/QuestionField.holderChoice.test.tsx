// il_copyright_holder's starting-point holder selector (beneath the text box).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { I18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { QuestionField } from "./QuestionField.tsx";
import { definition } from "./questions/a/il_copyright_holder.ts";
import type { FlowQuestion } from "./types.ts";

afterEach(cleanup);

const HOLDER = "SIL  International"; // double space: must round-trip verbatim

function renderQ(q: FlowQuestion, value: string | undefined, onChange = vi.fn()) {
  const i18n = new I18n({ locale: "en", messages: {} });
  render(
    <I18nProvider i18n={i18n}>
      <QuestionField question={q} value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return onChange;
}

const base: FlowQuestion = definition as FlowQuestion;
const withOptions: FlowQuestion = {
  ...base,
  options: [{ value: HOLDER, label: HOLDER }],
};

function box(): HTMLInputElement {
  return document.getElementById(definition.id) as HTMLInputElement;
}

describe("il_copyright_holder holder selector", () => {
  it("is hidden when the starting point has no parseable holder", () => {
    renderQ(base, "");
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("renders a labelled, keyboard-operable radio group beneath the box", () => {
    renderQ(withOptions, "");
    const group = screen.getByRole("radiogroup");
    expect(group.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("records the exact extracted string when an entry is chosen", () => {
    const onChange = renderQ(withOptions, "");
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    expect(onChange).toHaveBeenCalledWith(HOLDER);
  });

  it("shows the seeded holder as preselected (adapt) and leaves the box blank", () => {
    renderQ(withOptions, HOLDER);
    expect((screen.getAllByRole("radio")[0]! as HTMLInputElement).checked).toBe(true);
    expect(box().value).toBe("");
  });

  it("copy: blank value preselects no holder (D1 author default stays)", () => {
    renderQ(withOptions, "");
    expect((screen.getAllByRole("radio")[0]! as HTMLInputElement).checked).toBe(false);
  });

  it("a persisted free-text answer still shows in the box, no holder selected", () => {
    renderQ(withOptions, "Someone Else Ltd");
    expect(box().value).toBe("Someone Else Ltd");
    expect((screen.getAllByRole("radio")[0]! as HTMLInputElement).checked).toBe(false);
  });

  it("the someone-else choice clears the recorded holder", () => {
    const onChange = renderQ(withOptions, HOLDER);
    fireEvent.click(screen.getAllByRole("radio")[1]!);
    expect(onChange).toHaveBeenCalledWith("");
  });
});
