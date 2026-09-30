// SurveyPreviewPane tests (mobile adaptation).
//
// The pane always shows the OSK when a base keyboard is picked — there is no
// in-pane show/hide switch. OSK visibility (principle 9) is decided by the
// host: on narrow viewports the pane lives inside a PreviewSheet, which
// mounts it only while open (covered by PreviewSheet's own tests).
import { describe, it, expect, afterEach } from "vitest";
import { screen, cleanup } from "@testing-library/react";
import { render } from "../test/renderWithI18n.tsx";
import type { BaseKeyboard } from "@keyboard-studio/contracts";
import { SurveyPreviewPane } from "./SurveyPreviewPane.tsx";
import type { OskMode } from "./OskModeToggle.tsx";

const BASE: BaseKeyboard = {
  id: "basic_kbdus",
  displayName: "US",
  // The pane only reads `displayName`; OSKFrame owns the rest.
} as BaseKeyboard;

const noop = () => {};

function renderPane(overrides: {
  localBase?: BaseKeyboard | null;
  compact?: boolean;
}) {
  const mode: OskMode = "desktop";
  render(
    <SurveyPreviewPane
      localBase={overrides.localBase === undefined ? BASE : overrides.localBase}
      oskMode={mode}
      onOskModeChange={noop}
      stage={{ kind: "idle" }}
      retry={noop}
      showCharacterMap={false}
      activeStepId={null}
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
    renderPane({ localBase: null });
    expect(screen.queryByTitle("On-screen keyboard preview")).toBeNull();
    expect(
      screen.getByText(/Choose a base keyboard/, { exact: false }),
    ).not.toBeNull();
  });
});
