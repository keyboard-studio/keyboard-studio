// Integration smoke test for the Dashboard tab: it must mount from real flow
// YAML (?raw) + the engine's exported rule tables, and switch between sections.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { i18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { FlowMapView } from "./DashboardView.tsx";
import { messages as enMessages } from "../locales/en/messages.json?lingui";

i18n.load("en", enMessages);
i18n.activate("en");

/** Render helper — FlowMapView now uses Lingui Trans/t macros, which require
 * an I18nProvider ancestor (see docs/i18n-spike.md). */
function renderFlowMap(props: Parameters<typeof FlowMapView>[0] = {}) {
  return render(
    <I18nProvider i18n={i18n}>
      <FlowMapView {...props} />
    </I18nProvider>,
  );
}

afterEach(cleanup);

describe("FlowMapView (DashboardView)", () => {
  it("renders the survey-flow section with question ids from the real flows", () => {
    renderFlowMap();
    expect(screen.getByText("Flow Map")).toBeTruthy();
    // The Phase B entry question id should appear as a node card.
    expect(screen.getAllByText("pb_existing_keyboards").length).toBeGreaterThan(0);
  });

  it("switches to the strategy tree and shows a decision rule", () => {
    renderFlowMap();
    fireEvent.click(screen.getByText("Strategy tree (§7.2)"));
    // Rule 1 of the §7.2 table → S-12, rendered from the engine rule table.
    expect(screen.getByText("A1=massive AND A2=logographic")).toBeTruthy();
    expect(screen.getAllByText("S-12").length).toBeGreaterThan(0);
  });

  it("switches to script routing and shows the qwerty-qwertz split", () => {
    renderFlowMap();
    fireEvent.click(screen.getByText("Script routing (§9)"));
    expect(screen.getAllByText("qwerty-qwertz").length).toBeGreaterThan(0);
    expect(screen.getAllByText("non-roman").length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DOM-render test: manifest-spine node cards paint writes/inputs/lock metadata
// (Fix 4 — coverage gap: a JSX typo would be invisible without a DOM assertion)
// ---------------------------------------------------------------------------

describe("FlowMapView — manifest-spine step metadata rendering", () => {
  it("paints writes/inputs/lock metadata on projected manifest-spine node cards", () => {
    renderFlowMap();

    // The survey-flow section (default tab) renders the manifest spine.
    // carve writes groups[]/stores[]/raw[] — assert at least one path fragment
    // from CARVE_WRITES appears in the rendered output (groups[], stores[]).
    const writeLabels = screen.getAllByText("writes:");
    expect(writeLabels.length).toBeGreaterThan(0);

    // The carve node card must include a recognizable write path fragment.
    // CARVE_WRITES formats to "groups[]", "stores[]", "raw[]".
    // We look for the formatted text inside any rendered node card.
    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toMatch(/groups\[\]/);
    expect(bodyText).toMatch(/stores\[\]/);

    // inputs: lines must always render (symmetric contract — Fix 1).
    // carve has inputs:[] → should render "inputs: —" (the em dash placeholder).
    const inputLabels = screen.getAllByText("inputs:");
    expect(inputLabels.length).toBeGreaterThan(0);

    // mechanisms node must paint the lock·physical badge (lock="physical").
    // getAllByText to handle multiple nodes.
    const lockPhysical = screen.queryAllByText("lock·physical");
    expect(lockPhysical.length).toBeGreaterThan(0);

    // touch node must paint the lock·touch badge (lock="touch").
    const lockTouch = screen.queryAllByText("lock·touch");
    expect(lockTouch.length).toBeGreaterThan(0);

    // A Form-3 node (track or project_name) must paint a non-empty inputs: line.
    // track reads header.bcp47 and header.name; project_name reads header.bcp47.
    // "header" appears in the formatted IRPath for both (e.g. "header.bcp47").
    expect(bodyText).toMatch(/header\./);
  });
});

// ---------------------------------------------------------------------------
// DOM-render test: Phase G drill-down sections render under their manifest steps
// ---------------------------------------------------------------------------

describe("FlowMapView — Phase G drill-down sections (track / project_name)", () => {
  it("renders a drill-down section under the 'track' manifest step", () => {
    renderFlowMap();
    const bodyText = document.body.textContent ?? "";
    // The drill-down heading for the "track" manifest step must appear.
    expect(bodyText).toMatch(/Drill-downs under\s*track/);
    // track_choice is the question id in the track flow — its node must render.
    expect(bodyText).toContain("track_choice");
  });

  it("renders a drill-down section under the 'project_name' manifest step", () => {
    renderFlowMap();
    const bodyText = document.body.textContent ?? "";
    // The drill-down heading for the "project_name" manifest step must appear.
    expect(bodyText).toMatch(/Drill-downs under\s*project_name/);
    // project_display_name and project_keyboard_id are the question ids — both must render.
    expect(bodyText).toContain("project_display_name");
    expect(bodyText).toContain("project_keyboard_id");
  });
});
