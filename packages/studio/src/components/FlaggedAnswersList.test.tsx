// FlaggedAnswersList.test.tsx — spec 079 US3 T057.

import { afterEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { FlaggedAnswersList } from "./FlaggedAnswersList.tsx";
import { JumpContext } from "../lib/jumpContext.ts";

const REASON = { code: "evidence-added" as const, subject: "b", sourceStepId: "characters" };

afterEach(cleanup);

describe("FlaggedAnswersList", () => {
  it("renders nothing when there are no items", () => {
    render(<FlaggedAnswersList stepId="marks" items={[]} />);
    expect(screen.queryByTestId("flagged-answers-list")).toBeNull();
  });

  it("renders one keyboard-operable button per item with its reason", () => {
    render(
      <FlaggedAnswersList
        stepId="marks"
        items={[{ answerId: "marks_attachment.a|b", screenId: "marks_attachment", reason: REASON }]}
      />,
    );
    const list = screen.getByTestId("flagged-answers-list");
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(list.textContent).toContain("You added b");
  });

  it("activating an item calls the jump context with the step and screen", () => {
    const jump = vi.fn();
    render(
      <JumpContext.Provider value={jump}>
        <FlaggedAnswersList
          stepId="marks"
          items={[{ answerId: "marks_attachment.a|b", screenId: "marks_attachment", reason: REASON }]}
        />
      </JumpContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button"));
    expect(jump).toHaveBeenCalledWith("marks", "marks_attachment");
  });
});
