// GuardStation (spec 104 FR-013 / T013): the contracts §6 question asked
// once per keyboard, the seeded-for-confirmation presentation (Track 2),
// the read-only prior view with a change control, and the compact
// editor-routing prompt (FR-013's tail).

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { GuardSpecification } from "@keyboard-studio/contracts";

import { render } from "../../test/renderWithI18n.tsx";
import { GuardQuestionPrompt, GuardStation } from "./GuardStation.tsx";

afterEach(cleanup);

function record(partial: Partial<GuardSpecification>): GuardSpecification {
  return {
    recordId: "guard-specification:asked:swallow",
    behaviour: "swallow",
    origin: "asked",
    confirmed: true,
    recordedAt: 1,
    supersedes: null,
    ...partial,
  };
}

describe("GuardStation — the question", () => {
  it("asks the contracts §6 question with both behaviours as options", () => {
    const onChange = vi.fn();
    render(<GuardStation value={undefined} onChange={onChange} />);
    const station = screen.getByTestId("guard-station");
    expect(station.textContent).toMatch(/taps a tone mark at the start of a word/);
    expect(station.textContent).toMatch(/the mark appears anyway, or nothing happens/);
    fireEvent.click(screen.getByTestId("guard-option-swallow"));
    expect(onChange).toHaveBeenCalledWith("swallow");
    fireEvent.click(screen.getByTestId("guard-option-emit"));
    expect(onChange).toHaveBeenCalledWith("emit");
  });

  it("shows the seeded note when a Track 2 seed pre-fills the answer", () => {
    render(<GuardStation value="swallow" seededBehaviour="swallow" onChange={vi.fn()} />);
    expect(screen.getByTestId("guard-station").textContent).toMatch(
      /already behaves this way/,
    );
    expect(screen.getByTestId("guard-seeded-note")).toBeTruthy();
    const radio = screen.getByTestId("guard-option-swallow") as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it("a confirmed prior answer is read-only until the author chooses to change it", () => {
    const onChange = vi.fn();
    render(<GuardStation value="emit" prior={record({ behaviour: "emit" })} onChange={onChange} />);
    expect(screen.queryByTestId("guard-option-emit")).toBeNull();
    expect(screen.getByTestId("guard-station").textContent).toMatch(/appears anyway/);
    fireEvent.click(screen.getByTestId("guard-change"));
    expect(screen.getByTestId("guard-option-swallow")).toBeTruthy();
    fireEvent.click(screen.getByTestId("guard-option-swallow"));
    expect(onChange).toHaveBeenCalledWith("swallow");
  });
});

describe("GuardQuestionPrompt — the editor routing (FR-013 tail)", () => {
  it("answers on tap with the same §6 question", () => {
    const onAnswer = vi.fn();
    render(<GuardQuestionPrompt onAnswer={onAnswer} />);
    expect(screen.getByTestId("guard-question-prompt").textContent).toMatch(
      /taps a tone mark at the start of a word/,
    );
    fireEvent.click(screen.getByTestId("guard-prompt-swallow"));
    expect(onAnswer).toHaveBeenCalledWith("swallow");
  });
});
