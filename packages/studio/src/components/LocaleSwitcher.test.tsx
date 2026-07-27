// LocaleSwitcher tests (spec 045 P1).
//
// NOTE: these exercise localStorage. On local Node >= 22 the native localStorage
// shadows jsdom's and is unavailable without --localstorage-file, so this file
// fails at setup locally unless you run e.g.
//   NODE_OPTIONS="--localstorage-file=.ls-tmp.db" pnpm exec vitest run <file>
// CI (Node 22, no flag) is unaffected — see docs/i18n-spike.md.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { render, i18n } from "../test/renderWithI18n.tsx";
import { LocaleSwitcher } from "./LocaleSwitcher.tsx";
import { loadSavedLocale, resolveInitialLocale } from "../lib/i18n.ts";

/**
 * Why these two waits get a 10s window instead of RTL's 1s default.
 *
 * They began failing intermittently in the FULL suite (never in isolation, and
 * never with the component changed) once spec 044's tests joined it. The
 * obvious suspect was the fr catalog's dynamic import — `activateLocale("fr")`
 * pulls the Lingui chrome catalog plus three content-i18n sidecars, and
 * `localeReady` in main.tsx awaits that same function BEFORE first render, so a
 * genuinely slow import there would be a real first-paint cost for every
 * non-English visitor.
 *
 * Measured, it is not: a cold `activateLocale("fr")` is ~32ms run alone and
 * ~7ms with the whole suite running around it (warm, ~3ms). The import path is
 * not what these tests are waiting on — the overrun is vitest worker-pool CPU
 * contention starving `waitFor`'s poll loop and React's scheduler. So the wide
 * window is the right instrument (it costs nothing when things are fast, and
 * only absorbs scheduling jitter), and there is no hidden latency behind
 * `localeReady` to chase.
 */
const WIDE_TIMEOUT = 10_000;

function renderSwitcher() {
  return render(<LocaleSwitcher />);
}

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    localStorage.clear();
    i18n.activate("en");
  });

  afterEach(() => {
    cleanup();
    // Reset shared state so nothing leaks into other suites (matters under the
    // local --localstorage-file workaround, where the store is process-wide).
    localStorage.clear();
    i18n.activate("en");
  });

  it("shows the active locale and lists every supported locale", () => {
    renderSwitcher();
    const trigger = screen.getByRole("button");
    expect(trigger.textContent).toContain("English");
    fireEvent.click(trigger);
    expect(screen.getByRole("option", { name: "English" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Français" })).toBeTruthy();
  });

  it("persists the choice and activates the locale on selection", async () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Français" }));

    // Persisted synchronously…
    expect(loadSavedLocale()).toBe("fr");
    // …and the (async) catalog load flips the active locale. See WIDE_TIMEOUT.
    await waitFor(() => expect(i18n.locale).toBe("fr"), { timeout: WIDE_TIMEOUT });
  });

  it("renders the field label translated once French is active", async () => {
    renderSwitcher();
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("option", { name: "Français" }));
    await waitFor(() => expect(i18n.locale).toBe("fr"), { timeout: WIDE_TIMEOUT });
    // "Language" -> "Langue" from the fr catalog.
    expect(screen.getByText("Langue")).toBeTruthy();
  });

  it("resolveInitialLocale prefers the saved choice", () => {
    localStorage.setItem("ks.locale", "fr");
    expect(resolveInitialLocale()).toBe("fr");
  });
});
