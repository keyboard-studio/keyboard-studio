// CurrentKeyboardIndicator.a11y — keyboard-only operability + screen-reader
// wiring of the current-keyboard NavBar control (docs/accessibility.md).
//
// The trigger/list mechanics themselves (roving arrow keys, Escape/Tab
// close-and-refocus, click-outside, aria-activedescendant) are `SelectMenu`'s
// own contract and are covered by its own tests — this file proves this
// component wires `SelectMenu` correctly (a real labelled trigger reachable
// by Tab, real listbox/option roles, a working keyboard round trip end to
// end through THIS component's own state), not that `SelectMenu` itself
// works. Same split of responsibility as `LocaleSwitcher.test.tsx` vs.
// `SelectMenu`'s own suite.
//
// The axe-scan half of a11y conformance is E2E-only (@axe-core/playwright
// needs a live page); this file covers what a component test can prove
// directly, matching `StudioFooter.a11y.test.tsx`'s split.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "../test/renderWithI18n.tsx";
import { createVirtualFS, makeBaseKeyboard } from "@keyboard-studio/contracts";
import type { KeyboardIR } from "@keyboard-studio/contracts";
import { CurrentKeyboardIndicator } from "./CurrentKeyboardIndicator.tsx";
import { navigateTo } from "../lib/navigate.ts";
import { useWorkingCopyStore } from "../stores/workingCopyStore.ts";
import { useSurveySessionStore } from "../stores/surveySessionStore.ts";
import { usePhaseBDraftStore } from "../stores/phaseBDraftStore.ts";

vi.mock("../lib/navigate.ts", () => ({ navigateTo: vi.fn() }));

const mockedNavigateTo = vi.mocked(navigateTo);

function makeMinimalIr(): KeyboardIR {
  return {
    origin: "scaffolded" as const,
    header: {
      keyboardId: "test",
      name: "test",
      bcp47: [],
      copyright: "",
      version: "10.0",
      targets: [],
      storeDirectives: [],
    },
    stores: [],
    groups: [],
    comments: [],
    raw: [],
    recognizedPatterns: [],
  } as unknown as KeyboardIR;
}

function seedCurrent(): void {
  const base = makeBaseKeyboard({
    id: "current-kbd",
    path: "release/current-kbd",
    script: "Latn",
    targets: ["windows"],
    displayName: "French",
    version: "1.0",
  });
  useWorkingCopyStore
    .getState()
    .instantiateFromBase(base, { vfs: createVirtualFS([]), ir: makeMinimalIr() });
}

beforeEach(() => {
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
  seedCurrent();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  useWorkingCopyStore.getState().reset();
  useSurveySessionStore.getState().reset();
  usePhaseBDraftStore.getState().reset();
});

describe("CurrentKeyboardIndicator — a11y wiring", () => {
  it("the trigger is a real, Tab-reachable button with a programmatic name", async () => {
    const user = userEvent.setup();
    render(<CurrentKeyboardIndicator />);

    await user.tab();
    const trigger = screen.getByRole("button");
    expect(document.activeElement).toBe(trigger);
    expect(trigger.tagName).toBe("BUTTON");
    // Named via aria-labelledby -> the "Keyboard" label span, not a bare
    // unlabelled control — testing-library resolves the accessible name the
    // same way assistive tech does.
    expect(screen.getByRole("button", { name: /^Keyboard/ })).toBe(trigger);
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens with Enter, exposes a real listbox, and closes back to the trigger on Escape", async () => {
    const user = userEvent.setup();
    render(<CurrentKeyboardIndicator />);

    const trigger = screen.getByRole("button", { name: /^Keyboard/ });
    trigger.focus();
    await user.keyboard("{Enter}");

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const listbox = screen.getByRole("listbox");
    expect(listbox).toBeTruthy();
    expect(screen.getAllByRole("option").length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    // Escape returns focus to the trigger — a keyboard-only author is never
    // stranded with focus on a now-invisible list.
    expect(document.activeElement).toBe(trigger);
  });

  it('ArrowDown moves the highlight only — no navigation — until Enter commits (commitMode="onExplicitSelect")', async () => {
    // UPDATED: this test previously asserted the opposite — that a single
    // ArrowDown commits immediately, per SelectMenu's default
    // selection-follows-focus contract. That was the shipped defect this
    // component now fixes: a keyboard-only user arrowing through the list
    // would resume a different project and navigate out from under the
    // still-open menu on every keypress. CurrentKeyboardIndicator now opts
    // into SelectMenu's `commitMode="onExplicitSelect"` (see
    // CurrentKeyboardIndicator.tsx and SelectMenu.tsx's commitMode doc
    // comment), so arrow keys move the highlight and only Enter/Space/click
    // commits.
    const user = userEvent.setup();
    render(<CurrentKeyboardIndicator />);

    const trigger = screen.getByRole("button", { name: /^Keyboard/ });
    trigger.focus();
    await user.keyboard("{Enter}"); // open
    // Options are: [current keyboard, ...other drafts, manage-all]. With no
    // other drafts seeded, one ArrowDown from the current selection reaches
    // "Manage all keyboards…" on the highlight only — it must NOT navigate
    // yet.
    await user.keyboard("{ArrowDown}");
    expect(mockedNavigateTo).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    // Enter on the now-highlighted "Manage all keyboards…" row commits and
    // closes.
    await user.keyboard("{Enter}");
    expect(mockedNavigateTo).toHaveBeenCalledWith("profile");
    expect(mockedNavigateTo).toHaveBeenCalledTimes(1);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("Escape abandons arrow-key traversal without navigating or resuming anything", async () => {
    const user = userEvent.setup();
    render(<CurrentKeyboardIndicator />);

    const trigger = screen.getByRole("button", { name: /^Keyboard/ });
    trigger.focus();
    await user.keyboard("{Enter}"); // open
    await user.keyboard("{ArrowDown}"); // highlight moves to "Manage all keyboards…"
    await user.keyboard("{Escape}");

    expect(mockedNavigateTo).not.toHaveBeenCalled();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("every option has a non-empty accessible name (screen-reader announceable)", async () => {
    const user = userEvent.setup();
    render(<CurrentKeyboardIndicator />);
    await user.click(screen.getByRole("button", { name: /^Keyboard/ }));

    for (const option of screen.getAllByRole("option")) {
      expect(option.textContent?.trim()).toBeTruthy();
    }
  });
});
