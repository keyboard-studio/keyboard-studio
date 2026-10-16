// FontSwitcher tests (#1895).
//
// The switcher is a NavBar door onto the character-inventory decision's
// `selectedFont` — these tests pin the two halves of that contract: the
// control shows and changes the decision value (nothing is stored in the
// component), and it carries the relocated `phase-b-font-select` anchor plus
// the same accessible name the Characters-step picker had.
import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render, i18n } from "../test/renderWithI18n.tsx";
import { FontSwitcher } from "./FontSwitcher.tsx";
import {
  getCharacterInventoryValue,
  inventoryOps,
} from "../survey/useInventoryDraft.ts";
import { DEFAULT_PHASE_B_FONT } from "../survey/surveyStyles.ts";

function renderSwitcher() {
  return render(<FontSwitcher />);
}

/** The SelectMenu trigger carries the picker's id (not a test id). */
function trigger(): HTMLElement {
  const el = document.getElementById("phase-b-font-select-control");
  if (!el) throw new Error("font select trigger not rendered");
  return el;
}

describe("FontSwitcher", () => {
  afterEach(() => {
    cleanup();
    inventoryOps("characters").setSelectedFont(DEFAULT_PHASE_B_FONT);
    i18n.activate("en");
  });

  it("is labelled 'Font for characters' and shows the current font", () => {
    renderSwitcher();
    expect(screen.getByText("Font for characters")).toBeTruthy();
    expect(trigger().textContent).toContain("Noto Sans");
  });

  it("lists every font option", () => {
    renderSwitcher();
    fireEvent.click(trigger());
    expect(screen.getByRole("option", { name: "Noto Sans" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Charis SIL" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Andika" })).toBeTruthy();
  });

  it("writes the choice to the character-inventory decision value", () => {
    renderSwitcher();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole("option", { name: "Charis SIL" }));
    expect(getCharacterInventoryValue().selectedFont).toBe("charis-sil");
    expect(
      trigger().textContent,
    ).toContain("Charis SIL");
  });

  it("reflects a font already chosen elsewhere (the decision is the source)", () => {
    inventoryOps("characters").setSelectedFont("andika");
    renderSwitcher();
    expect(
      trigger().textContent,
    ).toContain("Andika");
  });
});
