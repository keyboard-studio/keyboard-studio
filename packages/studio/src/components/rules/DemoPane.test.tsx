// DemoPane likely-host inputs: the community-layout step's pick (the
// `windows-layout` decision since spec 090 T011) must reach the demo's
// host-layout selector — not only the legacy identity-phase
// `layout_family` answer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { DemoPane } from "./DemoPane.tsx";
import type { RulesDemoArtifact } from "../../stores/rulesDemoArtifactStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { saveLayoutFamilyAnswer } from "../../lib/layoutFamily.ts";

/** Record a layout pick the way the gallery host does (spec 090 T011). */
function pickWindowsLayout(layoutId: string): void {
  useDecisionStore.getState().record({
    id: "windows-layout",
    value: { layoutId, origin: "confirmed" },
    provenance: "asked",
    step: "layout",
  });
}

const IDLE: RulesDemoArtifact = {
  status: "idle",
  jsBlobUrl: null,
  keyboardId: null,
  diagnostics: [],
  errorStep: null,
  errorMessage: null,
};

function renderPane() {
  render(<DemoPane artifact={IDLE} ir={null} jsBytes={null} simulateImpl={() => ({}) as never} />);
  return screen.getByTestId("rules-demo-host-layout") as HTMLSelectElement;
}

beforeEach(() => {
  useSurveyAnswerStore.getState().reset();
  useDecisionStore.getState().reset();
});
afterEach(cleanup);

describe("DemoPane host layout follows the layout step", () => {
  it("preselects the picked reference layout (French AZERTY)", () => {
    pickWindowsLayout("basic_kbdfr");
    expect(renderPane().value).toBe("azerty");
  });

  it("maps the US-International pick onto the demo's intl id", () => {
    pickWindowsLayout("basic_kbdusx");
    expect(renderPane().value).toBe("intl");
  });

  it("uses a pick's derived family when the pick is not a reference host", () => {
    pickWindowsLayout("basic_kbdgr");
    expect(renderPane().value).toBe("qwertz");
  });

  it("uses a stored layout_family answer when no layout is picked", () => {
    saveLayoutFamilyAnswer("azerty");
    expect(renderPane().value).toBe("azerty");
  });
});
