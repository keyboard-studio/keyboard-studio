// SurveyPreviewPane tests (mobile adaptation).
//
// The pane always shows the OSK when a base keyboard is picked — there is no
// in-pane show/hide switch. OSK visibility (principle 9) is decided by the
// host: on narrow viewports the pane lives inside a PreviewSheet, which
// mounts it only while open (covered by PreviewSheet's own tests).
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { StartKeyboard } from "@keyboard-studio/contracts";
import { SurveyPreviewPane } from "./SurveyPreviewPane.tsx";
import type { OskMode } from "./OskModeToggle.tsx";

const BASE: StartKeyboard = {
  id: "basic_kbdus",
  displayName: "US",
  // The pane only reads `displayName`; OSKFrame owns the rest.
} as StartKeyboard;

const noop = () => {};

function renderPane(overrides: {
  localStart?: StartKeyboard | null;
  compact?: boolean;
  mode?: OskMode;
  activeStepId?: string | null;
}) {
  const mode: OskMode = overrides.mode ?? "desktop";
  render(
    <SurveyPreviewPane
      localStart={overrides.localStart === undefined ? BASE : overrides.localStart}
      oskMode={mode}
      onOskModeChange={noop}
      stage={{ kind: "idle" }}
      retry={noop}
      showCharacterMap={false}
      activeStepId={overrides.activeStepId === undefined ? null : overrides.activeStepId}
      {...(overrides.compact !== undefined ? { compact: overrides.compact } : {})}
    />,
  );
}

describe("SurveyPreviewPane", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the OSK iframe when a base keyboard is picked", () => {
    renderPane({});
    expect(screen.getByTitle("On-screen keyboard preview")).not.toBeNull();
  });

  it("offers no show/hide switch — visibility is the host's call", () => {
    renderPane({});
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("mounts the OSK in the compact (sheet) layout too", () => {
    renderPane({ compact: true });
    expect(screen.getByTitle("On-screen keyboard preview")).not.toBeNull();
  });

  it("shows the empty hint and no OSK when no base keyboard is picked", () => {
    renderPane({ localStart: null });
    expect(screen.queryByTitle("On-screen keyboard preview")).toBeNull();
    expect(
      screen.getByText(/Choose a starting keyboard/, { exact: false }),
    ).not.toBeNull();
  });

  // #1898: on desktop the OSK spans the full width of the pane exactly as
  // in the compact sheet — the pane carries no side gutter, the title row
  // insets itself by the former 24px pane padding, and the OSK frame is
  // full-bleed (no rounded card).
  it("desktop: no side gutter, title row inset 24px, OSK full-bleed", () => {
    renderPane({});
    const pane = document.querySelector(
      '[aria-label="Keyboard preview"]',
    ) as HTMLElement;
    expect(pane.style.padding).toBe("24px 0px");
    const titleRow = screen.getByText("US").parentElement as HTMLElement;
    expect(titleRow.style.padding).toBe("0px 24px");
    const osk = screen.getByTitle("On-screen keyboard preview")
      .parentElement as HTMLElement;
    expect(osk.style.borderRadius).toBe("");
    expect(osk.style.borderTop).toBe("1px solid var(--app-border)");
  });

  it("compact: no pane padding, title row inset 12px, OSK full-bleed", () => {
    renderPane({ compact: true });
    const pane = document.querySelector(
      '[aria-label="Keyboard preview"]',
    ) as HTMLElement;
    expect(pane.style.padding).toBe("0px");
    const titleRow = screen.getByText("US").parentElement as HTMLElement;
    expect(titleRow.style.padding).toBe("0px 12px");
    const osk = screen.getByTitle("On-screen keyboard preview")
      .parentElement as HTMLElement;
    expect(osk.style.borderRadius).toBe("");
  });

  it("hides the Mobile KB option before the Touch gallery", () => {
    renderPane({ activeStepId: "characters" });
    expect(screen.getByRole("button", { name: "Desktop OSK" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Mobile KB" })).toBeNull();
  });

  it("falls back to desktop before the Touch gallery when 'touch' is stored", () => {
    renderPane({ activeStepId: "characters", mode: "touch" });
    expect(
      screen.getByRole("button", { name: "Desktop OSK" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("offers Mobile KB at the Touch gallery and honours the stored mode", () => {
    renderPane({ activeStepId: "touch", mode: "touch" });
    expect(
      screen.getByRole("button", { name: "Mobile KB" }).getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
