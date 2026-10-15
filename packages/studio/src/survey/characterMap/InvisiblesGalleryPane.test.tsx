// Tests for InvisiblesGalleryPane — the Invisible characters step's
// right-pane gallery (#1794), rendered through CharacterMapPane's
// scope="invisibles" dispatch.
//
// What matters here: every cell carries its name, notation and need
// statement (a bare cell says nothing for a glyph-less character);
// toggling a cell writes the same `invisibleDecisions` the in-step rows
// toggle, in both directions; the Direction controls section is expanded
// for RTL authors and collapsed-but-reachable for everyone else; a
// format character handed off from the punctuation scope (FR-021)
// appears pre-selected.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, cleanup } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { CharacterMapPane } from "../CharacterMapPane.tsx";
import {
  getInvisiblesInventoryValue,
  inventoryOps,
  resetInventoryDecisions,
} from "../useInventoryDraft.ts";
import { invisibleDecisionsOf } from "../phaseBDraftOps.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";

function renderGallery() {
  return render(<CharacterMapPane scope="invisibles" />);
}

function markRtl(): void {
  // Same signal the step reads: the Phase B rtl-confirm answer recorded
  // as a decision.
  useDecisionStore.getState().record({
    id: "rtl-direction-confirm",
    value: "true",
    provenance: "asked",
    step: "characters",
  });
}

function cell(hex: string): HTMLElement {
  return screen.getByTestId(`invisible-gallery-cell-${hex}`);
}

beforeEach(() => {
  resetInventoryDecisions();
});

afterEach(() => {
  cleanup();
});

describe("InvisiblesGalleryPane — gallery content", () => {
  it("renders block sections with fully-described cells", () => {
    renderGallery();
    expect(screen.getByTestId("invisible-gallery")).toBeTruthy();
    // Block sections present…
    expect(screen.getByText("Latin-1 Supplement")).toBeTruthy();
    expect(screen.getByText("General Punctuation")).toBeTruthy();
    // …and a cell carries its abbreviation, name, notation and need statement.
    const zwj = cell("200d");
    expect(zwj.textContent).toContain("ZWJ");
    expect(zwj.textContent).toContain("ZERO WIDTH JOINER");
    expect(zwj.textContent).toContain("U+200D");
    expect(zwj.textContent).toContain("Joins two letters into a ligature");
    // A cell without a standard abbreviation shows its hex instead.
    expect(cell("0600").textContent).toContain("0600");
    expect(cell("0600").textContent).toContain("ARABIC NUMBER SIGN");
  });

  it("no rendered cell has an empty accessible name", () => {
    const { container } = renderGallery();
    const cells = container.querySelectorAll('[data-testid^="invisible-gallery-cell-"]');
    expect(cells.length).toBeGreaterThan(0);
    for (const el of cells) {
      const labelledBy = el.getAttribute("aria-labelledby");
      const labelEl = labelledBy !== null ? container.querySelector(`[id="${labelledBy}"]`) : null;
      expect(labelEl?.textContent?.trim().length).toBeGreaterThan(0);
    }
  });

  it("an unlisted character shows the generic fallback statement, not an empty one", () => {
    renderGallery();
    expect(cell("2062").textContent).toContain("INVISIBLE TIMES");
    expect(cell("2062").textContent).toContain("no usage note yet");
  });
});

describe("InvisiblesGalleryPane — selection sync", () => {
  it("toggling a cell accepts then declines the same invisibleDecisions entry the step toggles", () => {
    renderGallery();
    fireEvent.click(cell("200d"));
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200D"]).toBe("accepted");
    expect(cell("200d").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(cell("200d"));
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+200D"]).toBe("declined");
    expect(cell("200d").getAttribute("aria-checked")).toBe("false");
  });

  it("a decision made outside the gallery (e.g. the in-step list) shows as checked", () => {
    inventoryOps("invisibles").acceptInvisible("U+200C");
    renderGallery();
    expect(cell("200c").getAttribute("aria-checked")).toBe("true");
  });

  it("FR-021: a format character handed off from the punctuation scope appears pre-selected", () => {
    // The punctuation scope's raw code-point field calls acceptInvisible
    // for format characters; the gallery must show that pick selected.
    inventoryOps("punctuation").acceptInvisible("U+2060");
    renderGallery();
    expect(cell("2060").getAttribute("aria-checked")).toBe("true");
  });
});

describe("InvisiblesGalleryPane — direction controls", () => {
  it("is collapsed for LTR authors but reachable via the expand button", () => {
    renderGallery();
    expect(screen.getByTestId("invisible-gallery-bidi-expand")).toBeTruthy();
    expect(screen.queryByTestId("invisible-gallery-cell-200e")).toBeNull();
    fireEvent.click(screen.getByTestId("invisible-gallery-bidi-expand"));
    expect(cell("200e")).toBeTruthy();
    expect(cell("200e").textContent).toContain("LEFT-TO-RIGHT MARK");
  });

  it("is expanded for RTL authors", () => {
    markRtl();
    renderGallery();
    expect(screen.queryByTestId("invisible-gallery-bidi-expand")).toBeNull();
    expect(cell("061c")).toBeTruthy();
    expect(cell("061c").textContent).toContain("ARABIC LETTER MARK");
  });

  it("a collapsed section still yields its matches to search", () => {
    renderGallery();
    fireEvent.change(screen.getByLabelText("Search the character map"), {
      target: { value: "lrm" },
    });
    expect(cell("200e")).toBeTruthy();
  });
});

describe("InvisiblesGalleryPane — search and code-point entry", () => {
  it("search narrows cells by abbreviation, name and notation", () => {
    renderGallery();
    fireEvent.change(screen.getByLabelText("Search the character map"), {
      target: { value: "zwj" },
    });
    expect(cell("200d")).toBeTruthy();
    expect(screen.queryByTestId("invisible-gallery-cell-200c")).toBeNull();
  });

  it("the raw code-point field accepts a format character", () => {
    renderGallery();
    fireEvent.change(screen.getByLabelText("Add a character by Unicode code point"), {
      target: { value: "U+2061" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+2061"]).toBe("accepted");
  });

  it("the raw code-point field leaves a non-format character alone", () => {
    renderGallery();
    fireEvent.change(screen.getByLabelText("Add a character by Unicode code point"), {
      target: { value: "U+0041" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(invisibleDecisionsOf(getInvisiblesInventoryValue())["U+0041"]).toBeUndefined();
  });
});
