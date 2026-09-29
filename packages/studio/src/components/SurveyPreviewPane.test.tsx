// SurveyPreviewPane tests (mobile adaptation #1853, Phase 2).
//
// The principle-9 proof: hiding the OSK via the visibility switch must
// unmount the OSK iframe (unloading KeymanWeb), and showing it must remount
// through the normal init path. `useOskChannel` posts SET_KEYBOARD on engine
// ready — here we assert the structural part: the iframe element exists iff
// the preview is visible.
import { describe, it, expect, afterEach, vi } from "vitest";
import { screen, cleanup, fireEvent } from "@testing-library/react";
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
  oskVisible?: boolean;
  localBase?: BaseKeyboard | null;
  onOskVisibleChange?: (visible: boolean) => void;
  showCharacterMap?: boolean;
}) {
  const onOskVisibleChange = overrides.onOskVisibleChange ?? noop;
  const mode: OskMode = "desktop";
  render(
    <SurveyPreviewPane
      localBase={overrides.localBase === undefined ? BASE : overrides.localBase}
      oskMode={mode}
      onOskModeChange={noop}
      oskVisible={overrides.oskVisible ?? true}
      onOskVisibleChange={onOskVisibleChange}
      stage={{ kind: "idle" }}
      retry={noop}
      showCharacterMap={overrides.showCharacterMap ?? false}
      activeStepId={null}
    />,
  );
  return { onOskVisibleChange };
}

describe("SurveyPreviewPane OSK visibility (principle 9)", () => {
  afterEach(() => {
    cleanup();
  });

  it("mounts the OSK iframe while the preview is visible", () => {
    renderPane({ oskVisible: true });
    expect(screen.getByTitle("On-screen keyboard preview")).not.toBeNull();
  });

  it("does NOT mount the OSK iframe while the preview is hidden", () => {
    renderPane({ oskVisible: false });
    expect(screen.queryByTitle("On-screen keyboard preview")).toBeNull();
  });

  it("keeps the visibility switch visible while hidden so the author can bring the preview back", () => {
    renderPane({ oskVisible: false });
    expect(
      screen.getByRole("switch", { name: "Show keyboard preview" }),
    ).not.toBeNull();
  });

  it("shows the hidden hint instead of the iframe", () => {
    renderPane({ oskVisible: false });
    expect(
      screen.getByText(/Keyboard preview hidden/, { exact: false }),
    ).not.toBeNull();
  });

  it("forwards the switch toggle to onOskVisibleChange", () => {
    const onOskVisibleChange = vi.fn();
    renderPane({ oskVisible: true, onOskVisibleChange });
    fireEvent.click(
      screen.getByRole("switch", { name: "Show keyboard preview" }),
    );
    expect(onOskVisibleChange).toHaveBeenCalledTimes(1);
    expect(onOskVisibleChange).toHaveBeenCalledWith(false);
  });

  it("remounts the iframe when the preview becomes visible again", () => {
    const pane = (oskVisible: boolean) => (
      <SurveyPreviewPane
        localBase={BASE}
        oskMode="desktop"
        onOskModeChange={noop}
        oskVisible={oskVisible}
        onOskVisibleChange={noop}
        stage={{ kind: "idle" }}
        retry={noop}
        showCharacterMap={false}
        activeStepId={null}
      />
    );
    const { rerender } = render(pane(false));
    expect(screen.queryByTitle("On-screen keyboard preview")).toBeNull();
    rerender(pane(true));
    // A fresh iframe element — not a hidden one — so the normal init path
    // (onLoad → SET_STRINGS → SET_KEYBOARD) runs again cleanly.
    expect(screen.getByTitle("On-screen keyboard preview")).not.toBeNull();
  });

  it("shows no visibility switch when no base keyboard is picked (no OSK shown)", () => {
    renderPane({ localBase: null });
    expect(screen.queryByTitle("On-screen keyboard preview")).toBeNull();
    expect(
      screen.queryByRole("switch", { name: "Show keyboard preview" }),
    ).toBeNull();
  });
});
