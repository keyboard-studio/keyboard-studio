// DemoPane likely-host inputs: the community-layout step's pick (the
// `windows-layout` decision since spec 090 T011) must reach the demo's
// host-layout selector — not only the legacy identity-phase
// `layout_family` answer.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { render } from "../../test/renderWithI18n.tsx";
import { DemoPane } from "./DemoPane.tsx";
import type { DemoSimulate } from "./demoSimulation.ts";
import type {
  CompileResult,
  SimKeyInput,
  SimulationResult,
  SimulationStep,
} from "@keyboard-studio/contracts";
import type { RulesDemoArtifact } from "../../stores/rulesDemoArtifactStore.ts";
import { useSurveyAnswerStore } from "../../stores/surveyAnswerStore.ts";
import { useDecisionStore } from "../../stores/decisionStore.ts";
import { saveLayoutFamilyAnswer } from "../../lib/layoutFamily.ts";

/** Record a layout pick the way the gallery host does (spec 090 T011). */
function pickWindowsLayout(layoutId: string): void {
  useDecisionStore.getState().record({
    id: "windows-layout",
    value: { layoutIds: [layoutId], origin: "confirmed" },
    provenance: "asked",
    step: "layout",
  });
}

/** Record several picks the way the multi-select renderer does (#1902). */
function pickWindowsLayouts(layoutIds: string[]): void {
  useDecisionStore.getState().record({
    id: "windows-layout",
    value: { layoutIds, origin: "overturned" },
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

  it("uses every picked reference host in selection order (#1902)", () => {
    pickWindowsLayouts(["basic_kbdfr", "basic_kbdgr"]);
    const select = renderPane();
    expect(select.value).toBe("azerty");
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options.slice(0, 2)).toEqual(["azerty", "qwertz"]);
  });

  it("ignores picks that are not reference hosts, keeping the family fallback", () => {
    pickWindowsLayouts(["basic_kbdhe", "basic_kbdfr"]);
    const select = renderPane();
    expect(select.value).toBe("azerty");
  });
});

describe("DemoPane compile diagnostics", () => {
  const hint = (line: number) => ({
    code: "KM_HINT_KMCMP_3154094" as const,
    severity: "hint" as const,
    layer: "A" as const,
    message: "This rule will never be matched",
    location: { file: "a.kmn", line },
  });
  const readyArtifact: RulesDemoArtifact = {
    ...IDLE,
    status: "ready",
    diagnostics: [
      ...Array.from({ length: 353 }, (_, i) => hint(i + 1)),
      {
        code: "KM_INFO_KMCMP_2125830" as const,
        severity: "info" as const,
        layer: "A" as const,
        message: "min web engine",
      },
      {
        code: "KM_WARN_KMCMP_4222977" as const,
        severity: "warning" as const,
        layer: "A" as const,
        message: "web only",
      },
    ],
  };

  it("collapses 353 identical hints into one curated, counted row; codes stay out of the headline", () => {
    render(
      <DemoPane artifact={readyArtifact} ir={null} jsBytes={null} simulateImpl={() => ({}) as never} />,
    );
    const details = screen.getByTestId("rules-demo-warnings") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    const summary = details.querySelector("summary")?.textContent ?? "";
    expect(summary).toContain("354");
    expect(summary).not.toContain("KMCMP");
    const rows = screen.getAllByTestId("rules-demo-diagnostic-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain("Rules that can never fire");
    expect(rows[0]?.textContent).toContain("353 rules repeat an earlier rule");
    expect(details.textContent).not.toContain("2125830");
  });

  it("renders nothing when only info diagnostics remain", () => {
    render(
      <DemoPane
        artifact={{ ...readyArtifact, diagnostics: readyArtifact.diagnostics.slice(353, 354) }}
        ir={null}
        jsBytes={null}
        simulateImpl={() => ({}) as never}
      />,
    );
    expect(screen.queryByTestId("rules-demo-warnings")).toBeNull();
  });
});

describe("DemoPane output preview (#2384)", () => {
  const READY: RulesDemoArtifact = {
    status: "ready",
    jsBlobUrl: null,
    keyboardId: "demo",
    diagnostics: [],
    errorStep: null,
    errorMessage: null,
  };
  const BYTES = new TextEncoder().encode("// compiled keyboard");

  /** The typed US-key name back to the typed char (K_A -> "a"). */
  function charOfKey(key: SimKeyInput): string {
    return key.vkey.startsWith("K_") && key.vkey.length === 3
      ? key.vkey.slice(2).toLowerCase()
      : "";
  }

  /** Fake simulate: Greek vowels stand in for rule-transformed output. */
  function transformingSimulate(): DemoSimulate {
    const greek: Record<string, string> = { a: "α", b: "β", c: "γ" };
    return (_compiled: CompileResult, keys: SimKeyInput[]): SimulationResult => {
      let out = "";
      const trace: SimulationStep[] = keys.map((input) => {
        out += greek[charOfKey(input)] ?? "";
        return { input, outputAfter: out, pendingDeadkeys: [], beep: false };
      });
      return { finalOutput: out, trace };
    };
  }

  /** Fake simulate: every keystroke is swallowed — the keyboard emits nothing. */
  function swallowingSimulate(): DemoSimulate {
    return (_compiled: CompileResult, keys: SimKeyInput[]): SimulationResult => ({
      finalOutput: "",
      trace: keys.map((input) => ({
        input,
        outputAfter: "",
        pendingDeadkeys: [],
        beep: false,
      })),
    });
  }

  function renderPreviewPane(simulateImpl: DemoSimulate) {
    render(
      <DemoPane artifact={READY} ir={null} jsBytes={BYTES} simulateImpl={simulateImpl} />,
    );
    return screen.getByTestId("rules-demo-input") as HTMLInputElement;
  }

  it("shows the transformed output in a preview box while the typing box keeps the raw keystrokes", () => {
    const input = renderPreviewPane(transformingSimulate());
    fireEvent.change(input, { target: { value: "ab" } });
    // The typing box is untouched: it still shows the raw keystrokes.
    expect(input.value).toBe("ab");
    const preview = screen.getByTestId("rules-demo-output-preview");
    expect(preview.textContent).toBe("αβ");
    // The preview and the play-by-play trace agree on the same run.
    expect(screen.getByTestId("rules-demo-trace")).not.toBeNull();
    const lastRow = screen.getByTestId("rules-demo-row-1");
    expect(lastRow.textContent).toContain("β");
  });

  it("updates the preview as each keystroke lands", () => {
    const input = renderPreviewPane(transformingSimulate());
    fireEvent.change(input, { target: { value: "a" } });
    expect(screen.getByTestId("rules-demo-output-preview").textContent).toBe("α");
    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.getByTestId("rules-demo-output-preview").textContent).toBe("αβγ");
  });

  it("shows the empty-output marker when the keyboard emits nothing", () => {
    const input = renderPreviewPane(swallowingSimulate());
    fireEvent.change(input, { target: { value: "a" } });
    expect(input.value).toBe("a");
    expect(screen.getByTestId("rules-demo-output-preview").textContent).toBe("—");
  });

  it("renders no preview box before anything is typed", () => {
    renderPreviewPane(transformingSimulate());
    expect(screen.queryByTestId("rules-demo-output-preview")).toBeNull();
  });

  it("renders no preview box while the artifact is not ready", () => {
    render(
      <DemoPane artifact={IDLE} ir={null} jsBytes={null} simulateImpl={transformingSimulate()} />,
    );
    const input = screen.getByTestId("rules-demo-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "ab" } });
    expect(screen.queryByTestId("rules-demo-output-preview")).toBeNull();
  });
});
