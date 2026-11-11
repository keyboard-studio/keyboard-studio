// ReviewScreen language switcher.
//
// /review renders standalone WITHOUT the NavBar (StudioShell returns it
// before StudioShellContent), and the NavBar is the only place the
// LocaleSwitcher lived — so a visitor whose browser detected as French
// landed on a fully French page with no way back to English. These tests
// pin the escape hatch: the switcher renders on /review, and picking a
// language re-localizes the whole page and persists the choice.
//
// NOTE: exercises localStorage. On local Node >= 22 the native localStorage
// shadows jsdom's and is unavailable without --localstorage-file, so run e.g.
//   NODE_OPTIONS="--localstorage-file=.ls-tmp.db" pnpm exec vitest run <file>
// CI (Node 22, no flag) is unaffected — see docs/i18n-spike.md.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { render, i18n } from "../test/renderWithI18n.tsx";
import { ReviewScreen } from "./ReviewScreen.tsx";
import { loadSavedLocale } from "../lib/i18n.ts";

// Wide window for the async fr catalog load — same reasoning as
// LocaleSwitcher.test.tsx's WIDE_TIMEOUT (vitest worker-pool contention
// starves waitFor's poll loop in the full suite, not a slow import).
const WIDE_TIMEOUT = 10_000;

describe("ReviewScreen language switcher", () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.activate("en");
    // The index fetch is irrelevant here and must not touch the network:
    // reject immediately so the screen settles on its index-error path,
    // with the switcher (rendered unconditionally) still on screen.
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network in test"))));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    i18n.activate("en");
  });

  it("renders the language switcher above the banner", () => {
    render(<ReviewScreen />);
    expect(screen.getByText("Language")).toBeTruthy();
    expect(screen.getByText("Keyboard Health Check")).toBeTruthy();
    // The trigger shows the active locale — English on a fresh boot.
    expect(screen.getByRole("button").textContent).toContain("English");
  });

  it("switching to Français re-localizes the page and persists the choice", async () => {
    render(<ReviewScreen />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Français" }));

    expect(loadSavedLocale()).toBe("fr");
    await waitFor(() => expect(i18n.locale).toBe("fr"), { timeout: WIDE_TIMEOUT });
    // The page itself flips — not just the switcher label.
    expect(screen.getByText("Vérification de santé du clavier")).toBeTruthy();
    expect(screen.getByText("Langue")).toBeTruthy();
  });
});
