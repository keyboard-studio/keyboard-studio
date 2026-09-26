import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import { useState } from "react";
import { render } from "../test/renderWithI18n.tsx";
import { SurveyQuestionsPane } from "./SurveyQuestionsPane.tsx";

const pane = () => screen.getByRole("region", { name: "Survey questions" });

describe("SurveyQuestionsPane", () => {
  afterEach(() => cleanup());

  it("is a Tab stop when its content has nothing focusable", () => {
    render(
      <SurveyQuestionsPane label="Survey questions" style={{}}>
        <p>Read-only summary</p>
      </SurveyQuestionsPane>,
    );
    expect(pane().getAttribute("tabindex")).toBe("0");
  });

  it("is not a Tab stop when its content has its own controls", () => {
    render(
      <SurveyQuestionsPane label="Survey questions" style={{}}>
        <input aria-label="Name" />
      </SurveyQuestionsPane>,
    );
    expect(pane().hasAttribute("tabindex")).toBe(false);
  });

  it("follows the content as the step changes", async () => {
    let setHasControl: (v: boolean) => void = () => {};
    function Harness() {
      const [hasControl, set] = useState(true);
      setHasControl = set;
      return (
        <SurveyQuestionsPane label="Survey questions" style={{}}>
          {hasControl ? <button type="button">Pick</button> : <p>Summary</p>}
        </SurveyQuestionsPane>
      );
    }
    render(<Harness />);
    expect(pane().hasAttribute("tabindex")).toBe(false);

    await act(async () => setHasControl(false));
    expect(pane().getAttribute("tabindex")).toBe("0");

    await act(async () => setHasControl(true));
    expect(pane().hasAttribute("tabindex")).toBe(false);
  });

  it("does not count a disabled control as focusable", () => {
    render(
      <SurveyQuestionsPane label="Survey questions" style={{}}>
        <button type="button" disabled>
          Pick
        </button>
      </SurveyQuestionsPane>,
    );
    expect(pane().getAttribute("tabindex")).toBe("0");
  });
});
