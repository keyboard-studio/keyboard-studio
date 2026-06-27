// Integration smoke test for the Dashboard tab: it must mount from real flow
// YAML (?raw) + the engine's exported rule tables, and switch between sections.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { FlowMapView } from "./DashboardView.tsx";

afterEach(cleanup);

describe("FlowMapView (DashboardView)", () => {
  it("renders the survey-flow section with question ids from the real flows", () => {
    render(<FlowMapView />);
    expect(screen.getByText("Flow Map")).toBeTruthy();
    // The Phase B entry question id should appear as a node card.
    expect(screen.getAllByText("pb_existing_keyboards").length).toBeGreaterThan(0);
  });

  it("switches to the strategy tree and shows a decision rule", () => {
    render(<FlowMapView />);
    fireEvent.click(screen.getByText("Strategy tree (§7.2)"));
    // Rule 1 of the §7.2 table → S-12, rendered from the engine rule table.
    expect(screen.getByText("A1=massive AND A2=logographic")).toBeTruthy();
    expect(screen.getAllByText("S-12").length).toBeGreaterThan(0);
  });

  it("switches to script routing and shows the qwerty-qwertz split", () => {
    render(<FlowMapView />);
    fireEvent.click(screen.getByText("Script routing (§9)"));
    expect(screen.getAllByText("qwerty-qwertz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("non-roman").length).toBeGreaterThan(0);
  });
});
