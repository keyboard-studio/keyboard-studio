// AttachmentStation's space column (spec 106 FR-013): every mark row offers an
// "after a space" box, unticked by default, that toggles the space key.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { AttachmentProposal } from "@keyboard-studio/engine";

import { render } from "../../test/renderWithI18n.tsx";
import { AttachmentStation } from "./AttachmentStation.tsx";
import { ATTACHMENT_SPACE, ATTACHMENT_START_OF_LINE } from "./marksViews.ts";

afterEach(cleanup);

const ACUTE = "́";
const PROPOSALS: AttachmentProposal[] = [
  { mark: ACUTE, states: { a: "attested", k: "blocked" }, autoConfirmed: false },
];

function renderStation(checked: Record<string, Record<string, boolean>>, onToggle = vi.fn()) {
  render(
    <AttachmentStation
      proposals={PROPOSALS}
      bases={["a", "k"]}
      checked={checked}
      onToggle={onToggle}
      casePairCount={0}
    />,
  );
  return onToggle;
}

describe("AttachmentStation — space column (spec 106 FR-013)", () => {
  it("offers an unticked, labelled space box on every mark row", () => {
    renderStation({ [ACUTE]: { a: true, k: false, [ATTACHMENT_SPACE]: false } });
    const box = screen.getByRole("checkbox", { name: /can follow a space/ });
    expect((box as HTMLInputElement).checked).toBe(false);
  });

  it("toggles the space key", () => {
    const onToggle = renderStation({ [ACUTE]: { a: true, k: false } });
    fireEvent.click(screen.getByRole("checkbox", { name: /can follow a space/ }));
    expect(onToggle).toHaveBeenCalledWith(ACUTE, ATTACHMENT_SPACE, true);
  });

  it("shows a saved tick", () => {
    renderStation({ [ACUTE]: { a: true, k: false, [ATTACHMENT_SPACE]: true } });
    expect((screen.getByRole("checkbox", { name: /can follow a space/ }) as HTMLInputElement).checked).toBe(true);
  });
});

describe("AttachmentStation — start-of-line column (issue #2374)", () => {
  it("offers an unticked, labelled start-of-line box AFTER the space box on every mark row", () => {
    renderStation({ [ACUTE]: { a: true, k: false, [ATTACHMENT_SPACE]: false, [ATTACHMENT_START_OF_LINE]: false } });
    const boxes = screen.getAllByRole("checkbox");
    const names = boxes.map((b) => b.getAttribute("aria-label") ?? "");
    const spaceIdx = names.findIndex((n) => /can follow a space/.test(n));
    const solIdx = names.findIndex((n) => /can appear at the start of a line/.test(n));
    expect(spaceIdx).toBeGreaterThanOrEqual(0);
    expect(solIdx).toBeGreaterThan(spaceIdx);
    expect((boxes[solIdx] as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText("at the start of a line")).toBeTruthy();
  });

  it("states the unchecked-blocks semantics explicitly (not by analogy with the letter help)", () => {
    renderStation({ [ACUTE]: { a: true, k: false } });
    expect(screen.getByText(/blocked with no letter before it/)).toBeTruthy();
  });

  it("toggles the sentinel key, never a real character", () => {
    const onToggle = renderStation({ [ACUTE]: { a: true, k: false } });
    fireEvent.click(screen.getByRole("checkbox", { name: /can appear at the start of a line/ }));
    expect(onToggle).toHaveBeenCalledWith(ACUTE, ATTACHMENT_START_OF_LINE, true);
    expect(ATTACHMENT_START_OF_LINE).not.toBe("");
    expect(ATTACHMENT_START_OF_LINE).not.toMatch(/^\p{L}$/u);
  });

  it("shows a saved tick", () => {
    renderStation({ [ACUTE]: { a: true, k: false, [ATTACHMENT_START_OF_LINE]: true } });
    expect(
      (screen.getByRole("checkbox", { name: /can appear at the start of a line/ }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("excludes the sentinel from the FR-008 confirmed-on summary", () => {
    const confirmed: AttachmentProposal[] = [
      { mark: ACUTE, states: { a: "attested" }, autoConfirmed: true },
    ];
    render(
      <AttachmentStation
        proposals={confirmed}
        bases={["a"]}
        checked={{ [ACUTE]: { a: true, [ATTACHMENT_START_OF_LINE]: true } }}
        onToggle={vi.fn()}
        casePairCount={0}
      />,
    );
    const summary = screen.getByTestId("attachment-row-U+0301");
    expect(summary.textContent).not.toContain(ATTACHMENT_START_OF_LINE);
    expect(summary.textContent).toContain("confirmed on");
  });
});
