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

  it("is a Tab stop when mixed content overflows, even with its own controls", async () => {
    // One early control + lengthy read-only tail: Tab would jump from the
    // control straight to the footer, stranding the tail for keyboard users
    // (arrows on a focused control do not scroll the pane). jsdom reports no
    // layout (scrollHeight/clientHeight are 0), so overflow is mocked and a
    // DOM mutation re-runs the check, mirroring a real content change.
    render(
      <SurveyQuestionsPane label="Survey questions" style={{}}>
        <button type="button">Pick</button>
        <p>Long read-only content below the control…</p>
      </SurveyQuestionsPane>,
    );
    const el = pane();
    expect(el.hasAttribute("tabindex")).toBe(false);

    Object.defineProperties(el, {
      scrollHeight: { value: 2000, configurable: true },
      clientHeight: { value: 600, configurable: true },
    });
    await act(async () => {
      el.appendChild(document.createElement("p"));
    });
    expect(el.getAttribute("tabindex")).toBe("0");
  });

  it("stays out of Tab order when its controls fit without scrolling", async () => {
    render(
      <SurveyQuestionsPane label="Survey questions" style={{}}>
        <button type="button">Pick</button>
      </SurveyQuestionsPane>,
    );
    const el = pane();
    Object.defineProperties(el, {
      scrollHeight: { value: 600, configurable: true },
      clientHeight: { value: 600, configurable: true },
    });
    await act(async () => {
      el.appendChild(document.createElement("p"));
    });
    expect(el.hasAttribute("tabindex")).toBe(false);
  });
});
