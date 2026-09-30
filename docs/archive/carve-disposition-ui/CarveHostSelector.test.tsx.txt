// T018 — CarveHostSelector: test-pane host-layout selector for carved
// combinations (spec 076 FR-023, amendment A3).

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { setLikelyHostDeps } from "../../lib/layoutFamily.ts";
import { HOST_GUESS_CAPTION } from "../../lib/referenceHostLayouts.ts";
import { CarveHostSelector } from "./CarveHostSelector.tsx";

const ALTGR_4 = { key: "K_4", modifiers: ["RALT"], label: "AltGr+4" };

function selectHost(value: string) {
  fireEvent.change(screen.getByTestId("carve-host-select"), { target: { value } });
}

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  setLikelyHostDeps(undefined);
});

afterEach(() => {
  cleanup();
});

describe("CarveHostSelector", () => {
  it("populates the selector with the keyboard's likely hosts plus blocked", () => {
    // de-DE → QWERTZ via the real T011 region mapping (no answer stored).
    render(<CarveHostSelector combo={ALTGR_4} bcp47="de-DE" />);
    const select = screen.getByTestId("carve-host-select") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.text);
    expect(options).toContain("QWERTZ (German)");
    expect(options.some((t) => /blocked/i.test(t))).toBe(true);
  });

  it("shows all five reference hosts when there is no language signal", () => {
    render(<CarveHostSelector combo={ALTGR_4} />);
    const select = screen.getByTestId("carve-host-select") as HTMLSelectElement;
    const options = [...select.options].map((o) => o.text);
    for (const label of ["US English", "US International", "AZERTY (French)", "QWERTZ (German)", "UK English"]) {
      expect(options).toContain(label);
    }
  });

  it("switching host updates the demonstrated output (UK AltGr+4 = €)", () => {
    render(<CarveHostSelector combo={ALTGR_4} />);
    selectHost("uk");
    const result = screen.getByTestId("carve-host-result");
    expect(result.textContent).toContain("UK English");
    expect(result.textContent).toContain("€");
  });

  it("blocked shows uniform nothing", () => {
    render(<CarveHostSelector combo={ALTGR_4} />);
    selectHost("blocked");
    const result = screen.getByTestId("carve-host-result");
    expect(result.textContent).toMatch(/produces nothing/i);
    expect(result.textContent).not.toContain("€");
  });

  it("renders the honesty caption", () => {
    render(<CarveHostSelector combo={ALTGR_4} />);
    expect(screen.getByTestId("carve-host-caption").textContent).toBe(HOST_GUESS_CAPTION);
  });

  it("renders unknown cells as unknown, never guessed", () => {
    // K_F1 is not in the reference maps.
    render(<CarveHostSelector combo={{ key: "K_F1", modifiers: [], label: "F1" }} />);
    selectHost("us");
    expect(screen.getByTestId("carve-host-result").textContent).toMatch(/unknown/i);
  });

  it("renders host deadkey cells as deadkey, not a character", () => {
    // US-International ' is a deadkey on the base layer.
    render(<CarveHostSelector combo={{ key: "K_QUOTE", modifiers: [], label: "'" }} bcp47="en" />);
    selectHost("us-intl");
    expect(screen.getByTestId("carve-host-result").textContent).toMatch(/deadkey/i);
  });

  it("loud block renders the flash stub (KeymanWeb hook point)", () => {
    render(<CarveHostSelector combo={ALTGR_4} loud />);
    selectHost("blocked");
    expect(screen.getByTestId("carve-host-flash")).toBeTruthy();
  });

  it("soft block renders no flash stub", () => {
    render(<CarveHostSelector combo={ALTGR_4} />);
    selectHost("blocked");
    expect(screen.queryByTestId("carve-host-flash")).toBeNull();
  });
});
