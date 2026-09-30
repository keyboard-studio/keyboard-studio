// T019 — CarvedHostConsequences: expanded host-consequence row for one
// carved combination (spec 076 FR-023, amendments A1/A2/A3).
//
// Coverage:
//   1. hostOutcomeText: undefined key -> "unknown"; missing cell -> "unknown"
//      (never guessed); DEADKEY sentinel -> "deadkey"; real char passes through.
//   2. The block renders one row per likely host with the real host output
//      (UK AltGr+4 = €).
//   3. Renders HOST_GUESS_CAPTION verbatim.
//   4. Renders the expectation prompt and each option's own risk verbatim
//      from DISPOSITION_COPY (reused, not duplicated).
//   5. The retired slogan appears nowhere.

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { setLikelyHostDeps } from "../../lib/layoutFamily.ts";
import { HOST_GUESS_CAPTION } from "../../lib/referenceHostLayouts.ts";
import { DISPOSITION_COPY } from "./carveDispositionCopy.ts";
import { RETIRED_SLOGAN } from "./ReviewRemovedKeys.tsx";
import {
  CarvedHostConsequences,
  hostOutcomeText,
} from "./CarvedHostConsequences.tsx";
import type { CarvedCombo } from "./ReviewRemovedKeys.tsx";

const ALTGR_4: CarvedCombo = {
  comboId: "rule#1",
  label: "RALT + 4",
  key: "K_4",
  modifiers: ["RALT"],
  disposition: "block",
  provenance: "bulk-default",
  isStoreSlot: false,
};

const NO_KEY: CarvedCombo = {
  ...ALTGR_4,
  comboId: "rule#2",
  key: undefined,
  modifiers: [],
};

const DEADKEY_COMBO: CarvedCombo = {
  ...ALTGR_4,
  comboId: "rule#3",
  label: "'",
  key: "K_QUOTE",
  modifiers: [],
};

function resetLikelyHosts() {
  useSurveyAnswerStore.getState().reset();
  setLikelyHostDeps(undefined);
}

afterEach(() => {
  cleanup();
  resetLikelyHosts();
});

describe("hostOutcomeText", () => {
  it("returns unknown when no key resolves", () => {
    expect(hostOutcomeText("uk", NO_KEY)).toBe("unknown");
  });

  it("returns unknown for a cell the reference data does not have, never a guess", () => {
    // K_F1 is not in the reference maps.
    const f1: CarvedCombo = { ...ALTGR_4, comboId: "rule#4", key: "K_F1", modifiers: [] };
    expect(hostOutcomeText("us", f1)).toBe("unknown");
  });

  it("renders the deadkey sentinel as deadkey", () => {
    // US-International ' is a deadkey.
    expect(hostOutcomeText("us-intl", DEADKEY_COMBO)).toBe("deadkey");
  });

  it("passes a real host character through", () => {
    expect(hostOutcomeText("uk", ALTGR_4)).toBe("€");
  });
});

describe("CarvedHostConsequences", () => {
  it("renders one row per likely host with the real host output", () => {
    // No language signal -> the default five reference hosts.
    const { container } = render(<CarvedHostConsequences combo={ALTGR_4} />);
    const section = screen.getByTestId("carve-host-consequences-rule#1");
    for (const label of ["US English", "US International", "AZERTY (French)", "QWERTZ (German)", "UK English"]) {
      expect(section.textContent).toContain(label);
    }
    // UK AltGr+4 is € in the real reference data.
    expect(section.textContent).toContain("€");
    expect(container.textContent).not.toContain(RETIRED_SLOGAN);
  });

  it("renders unknown cells as unknown, never guessed", () => {
    render(<CarvedHostConsequences combo={NO_KEY} />);
    const section = screen.getByTestId("carve-host-consequences-rule#2");
    expect(section.textContent).toMatch(/unknown/);
  });

  it("renders the honesty caption verbatim", () => {
    render(<CarvedHostConsequences combo={ALTGR_4} />);
    const section = screen.getByTestId("carve-host-consequences-rule#1");
    expect(section.textContent).toContain(HOST_GUESS_CAPTION);
  });

  it("asks the expectation prompt and states each option's own risk verbatim", () => {
    render(<CarvedHostConsequences combo={ALTGR_4} />);
    const section = screen.getByTestId("carve-host-consequences-rule#1");
    const text = section.textContent ?? "";
    expect(text).toContain(DISPOSITION_COPY.prompt);
    expect(text).toContain(DISPOSITION_COPY.allowRisk);
    expect(text).toContain(DISPOSITION_COPY.blockRisk);
    // Both labels present, each with its own risk — symmetric, not one-sided.
    expect(text).toContain("Allow:");
    expect(text).toContain("Block:");
  });

  it("never carries the retired allow/block slogan", () => {
    const { container } = render(<CarvedHostConsequences combo={ALTGR_4} />);
    expect(container.textContent ?? "").not.toContain(RETIRED_SLOGAN);
    expect(container.textContent ?? "").not.toMatch(/allow means unpredictable/i);
  });
});
