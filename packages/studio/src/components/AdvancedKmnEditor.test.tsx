// AdvancedKmnEditor — the raw .kmn editor is opt-in.
//
// By default the editable source is not on screen: only the
// "Advanced: view source" toggle shows. The toggle reveals the editor plus
// the bypass caution; the dev/E2E flag (VITE_E2E / ?e2e=1, via lib/envFlag)
// reveals it up front.

import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS } from "@keyboard-studio/contracts";
import { AdvancedKmnEditor } from "./AdvancedKmnEditor.tsx";

vi.mock("./KmnEditor.tsx", () => ({
  KmnEditor: () => <div data-testid="kmn-editor-stub" />,
}));

const vfs = createVirtualFS([]);

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("AdvancedKmnEditor", () => {
  it("hides the raw editor by default, showing only the advanced toggle", () => {
    render(<AdvancedKmnEditor vfs={vfs} onRecompile={vi.fn()} />);

    expect(screen.queryByTestId("kmn-editor-stub")).toBeNull();
    const toggle = screen.getByTestId("advanced-view-source-toggle");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toContain("Advanced: view source");
  });

  it("the toggle reveals the editor with the bypass caution, and hides it again", () => {
    render(<AdvancedKmnEditor vfs={vfs} onRecompile={vi.fn()} />);

    fireEvent.click(screen.getByTestId("advanced-view-source-toggle"));

    expect(screen.getByTestId("kmn-editor-stub")).toBeTruthy();
    expect(screen.getByTestId("advanced-view-source-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("advanced-view-source-caution").textContent).toContain(
      "bypasses the guided flow",
    );

    fireEvent.click(screen.getByTestId("advanced-view-source-toggle"));
    expect(screen.queryByTestId("kmn-editor-stub")).toBeNull();
  });

  it("the ?e2e=1 flag reveals the editor up front", () => {
    window.history.replaceState({}, "", "/?e2e=1");
    render(<AdvancedKmnEditor vfs={vfs} onRecompile={vi.fn()} />);

    expect(screen.getByTestId("kmn-editor-stub")).toBeTruthy();
    expect(screen.getByTestId("advanced-view-source-toggle").getAttribute("aria-expanded")).toBe("true");
  });
});
