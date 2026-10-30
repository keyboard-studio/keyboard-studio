// AttachmentStation's space column (spec 106 FR-013): every mark row offers an
// "after a space" box, unticked by default, that toggles the space key.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { AttachmentProposal } from "@keyboard-studio/engine";

import { render } from "../../test/renderWithI18n.tsx";
import { AttachmentStation } from "./AttachmentStation.tsx";
import { ATTACHMENT_SPACE } from "./marksViews.ts";

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
