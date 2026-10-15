// Render tests: the three error surfaces route through the plain-language
// translation layer — plain copy up front, raw code/message only inside the
// technical-details disclosure.

import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { CompilerDiagnostic } from "@keyboard-studio/contracts";
import type { Stage } from "../hooks/useKeyboardArtifact.ts";
import { DiagnosticsPanel } from "./DiagnosticsPanel.tsx";
import { PreviewPaneOverlay } from "./PreviewPaneOverlay.tsx";

afterEach(() => cleanup());

const MISSING_STORE: CompilerDiagnostic = {
  code: "KM_ERROR_KMCMP_5251101",
  severity: "error",
  layer: "A",
  message: "Store 'nosuch' does not exist.",
  location: { file: "source/probe.kmn", line: 7 },
};

describe("DiagnosticsPanel — plain diagnostics", () => {
  it("renders plain copy for a mapped diagnostic, raw text only in the disclosure", () => {
    const { container } = render(<DiagnosticsPanel diagnostics={[MISSING_STORE]} />);
    expect(screen.getByText(/refers to something that isn't there anymore/i)).toBeTruthy();
    expect(screen.getByText(/undo the change that removed it/i)).toBeTruthy();
    const details = container.querySelector("details");
    expect(details?.textContent).toContain("KM_ERROR_KMCMP_5251101");
    expect(details?.textContent).toContain("Store 'nosuch' does not exist.");
    expect(details?.textContent).toContain("source/probe.kmn:7");
    // The raw message is not front-and-center outside the disclosure.
    const outside = container.textContent?.replace(details?.textContent ?? "", "") ?? "";
    expect(outside).not.toContain("KM_ERROR_KMCMP_5251101");
  });

  it("falls back to generic copy for an unmapped diagnostic", () => {
    render(
      <DiagnosticsPanel
        diagnostics={[
          {
            code: "KM_ERROR_KMCMP_5251999",
            severity: "error",
            layer: "A",
            message: "Obscure raw text.",
          },
        ]}
      />,
    );
    expect(screen.getByText("Something in the keyboard couldn't be built.")).toBeTruthy();
    expect(screen.getByText("Try undoing your last change.")).toBeTruthy();
  });
});

describe("PreviewPaneOverlay — plain diagnostics", () => {
  it("shows plain copy and a technical disclosure on compile failure", () => {
    const stage: Stage = {
      kind: "error",
      step: "compile",
      message: "compile failed",
      compileResult: {
        success: false,
        artifacts: [],
        diagnostics: [MISSING_STORE],
        compileMs: 1,
        isWarmCompile: true,
      },
    };
    const { container } = render(<PreviewPaneOverlay stage={stage} onRetry={() => {}} />);
    expect(screen.getByText(/refers to something that isn't there anymore/i)).toBeTruthy();
    const details = container.querySelector("details");
    expect(details?.textContent).toContain("KM_ERROR_KMCMP_5251101: Store 'nosuch' does not exist.");
  });

  it("uses user copy for progress stages, with no compiler internals", () => {
    const { container } = render(
      <PreviewPaneOverlay stage={{ kind: "compiling", isWarmCompile: false }} onRetry={() => {}} />,
    );
    expect(screen.getByText("Building your keyboard...")).toBeTruthy();
    expect(container.textContent).not.toMatch(/kmcmplib|WASM|VFS/i);
  });

  it("uses user copy for the fetching stage", () => {
    const { container } = render(
      <PreviewPaneOverlay stage={{ kind: "fetching" }} onRetry={() => {}} />,
    );
    expect(screen.getByText("Loading your keyboard...")).toBeTruthy();
    expect(container.textContent).not.toMatch(/kbd-proxy|\.kmn/i);
  });
});
