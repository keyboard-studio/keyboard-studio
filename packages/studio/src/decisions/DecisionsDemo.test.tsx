// Render tests for the spike demo page (km/decisions-spike).
// Guards the demo against import/render regressions; the parity badge itself
// is proven by orderParity.test.ts, this only checks the page mounts and
// the interactive sections respond.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DecisionsDemo } from "./DecisionsDemo.tsx";

afterEach(cleanup);

describe("DecisionsDemo smoke", () => {
  it("renders all four sections with parity badge", () => {
    render(<DecisionsDemo />);
    expect(screen.getByText(/SPIKE DEMO — not product UI/)).toBeTruthy();
    expect(screen.getByText("1. Derived order vs legacy YAML order")).toBeTruthy();
    expect(screen.getByText("2. Extract — base keyboard pre-fills decisions")).toBeTruthy();
    expect(screen.getByText("3. Adapt diff — change an extracted decision")).toBeTruthy();
    expect(screen.getByText(/4\. Add \/ remove \/ reorder/)).toBeTruthy();
    expect(screen.getByText("PARITY: MATCH")).toBeTruthy();
  });

  it("switching fixtures changes extracted values", () => {
    render(<DecisionsDemo />);
    // full fixture: language-code extracted as "bam" (JSON-quoted in the UI)
    expect(screen.getAllByText('"bam"').length).toBeGreaterThan(0);
    expect(screen.getAllByText("from sil_cameroon_qwerty").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("mystery_keyboard (no BCP47)"));
    // sparse fixture: nothing extractable — the sil_cameroon_qwerty
    // provenance chips are gone (all decisions fall back to default)
    expect(screen.queryAllByText("from sil_cameroon_qwerty").length).toBe(0);
  });

  it("typing an override flips the diff to changed", () => {
    render(<DecisionsDemo />);
    const inputs = screen.getAllByPlaceholderText("(keep extracted)");
    expect(inputs.length).toBe(3);
    fireEvent.change(inputs[1]!, { target: { value: "xyz" } });
    expect(screen.getAllByText("changed").length).toBeGreaterThan(0);
  });
});
