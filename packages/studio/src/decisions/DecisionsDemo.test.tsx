// Render tests for the spike demo page (km/decisions-spike).
// Guards the demo against import/render regressions; the parity badge itself
// is proven by orderParity.test.ts, this only checks the page mounts and
// the interactive sections respond.
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
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

describe("DecisionsDemo manage questions", () => {
  it("adding a question with a satisfied requirement appears in derived order", () => {
    render(<DecisionsDemo />);
    fireEvent.change(screen.getByLabelText("New question id"), { target: { value: "q_demo_extra" } });
    fireEvent.change(screen.getByLabelText("New question requires"), { target: { value: "language-name" } });
    fireEvent.click(screen.getByText("Add question"));
    const list = within(screen.getByTestId("managed-order-list"));
    const rows = list.getAllByText(/^\d+\. /).map((el) => el.textContent ?? "");
    const idxNew = rows.findIndex((t) => t.includes("q_demo_extra"));
    const idxProvider = rows.findIndex((t) => t.includes("il_language_english"));
    expect(idxNew).toBeGreaterThan(-1);
    expect(idxProvider).toBeGreaterThan(-1);
    // The new module sorts after its requirement's provider, not at list end by fiat.
    expect(idxNew).toBeGreaterThan(idxProvider);
    // In-memory modules are marked so they are distinguishable from shipped ones.
    expect(screen.getAllByText("custom").length).toBeGreaterThan(0);
  });

  it("rejects a duplicate question id in the form", () => {
    render(<DecisionsDemo />);
    fireEvent.change(screen.getByLabelText("New question id"), { target: { value: "il_language_code" } });
    fireEvent.click(screen.getByText("Add question"));
    expect(screen.getByText(/already exists/)).toBeTruthy();
  });

  it("editing requires to a nonexistent id surfaces the unresolved error", () => {
    render(<DecisionsDemo />);
    const input = screen.getByLabelText("requires for il_target_script");
    fireEvent.change(input, { target: { value: "no-such-decision" } });
    fireEvent.blur(input);
    const err = screen.getByTestId("managed-order-error");
    expect(err.textContent).toContain("unresolved decision");
    expect(err.textContent).toContain("no-such-decision");
    expect(err.textContent).toContain("il_target_script");
  });

  it("deleting a provider surfaces the unresolved error in the managed order", () => {
    render(<DecisionsDemo />);
    fireEvent.click(screen.getByLabelText("delete il_language_english"));
    // il_language_code requires language-name, whose only provider is gone.
    const err = screen.getByTestId("managed-order-error");
    expect(err.textContent).toContain("unresolved decision");
    expect(err.textContent).toContain("language-name");
  });

  it("selecting a module shows its dependency inspector", () => {
    render(<DecisionsDemo />);
    fireEvent.click(screen.getByLabelText("inspect il_language_code"));
    const inspector = within(screen.getByTestId("dependency-inspector"));
    expect(inspector.getByText("language-name")).toBeTruthy();
    expect(inspector.getByText(/il_language_english/)).toBeTruthy();
  });
});
